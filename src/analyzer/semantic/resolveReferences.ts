/**
 * Resolução de referências: transforma símbolos extraídos em arestas com alvo
 * resolvido e confiança explícita.
 *
 *   - import (TS/Java)         → arquivo de destino
 *   - extends / implements     → arquivo do supertipo
 *   - call (Java)              → arquivo que implementa o método chamado,
 *                                resolvendo interface→implementador (DI)
 *
 * `confidence: 'resolved'` quando o alvo é único e conhecido; `'inferred'`
 * quando ambíguo (homônimos, interface com vários implementadores). Isso é o que
 * separa esta camada da heurística regex anterior: em engenharia reversa o
 * consumidor precisa saber em que confiar.
 */
import type { FileSymbols } from './extractSymbols';
import { SymbolTable } from './symbolTable';

export type EdgeKind = 'import' | 'call' | 'extends' | 'implements';
export type Confidence = 'resolved' | 'inferred';

export interface SemanticEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  confidence: Confidence;
}

export interface ClassInfoLite {
  name: string;
  file: string;
  line: number;
  extends?: string;
  implements: string[];
  isAbstract: boolean;
  isInterface: boolean;
}

export interface SemanticResult {
  edges: SemanticEdge[];
  externalDeps: string[];
  classes: ClassInfoLite[];
}

/** Resolve um módulo TS para um arquivo do projeto (com extensões/index). */
export type ModuleResolver = (source: string, fromFile: string) => string | null;

export function resolveReferences(
  allSymbols: FileSymbols[],
  resolveTsModule: ModuleResolver,
  fileSet: Set<string>
): SemanticResult {
  const table = SymbolTable.build(allSymbols);
  const edges = new EdgeSet();
  const externalDeps = new Set<string>();
  const classes: ClassInfoLite[] = [];

  for (const sym of allSymbols) {
    if (sym.failed) continue;

    for (const decl of sym.types) {
      classes.push({
        name: decl.simpleName,
        file: sym.file,
        line: decl.line,
        extends: decl.extendsName,
        implements: decl.implementsNames,
        isAbstract: decl.isAbstract,
        isInterface: decl.kind === 'interface'
      });
    }

    if (sym.lang === 'java') resolveJavaFile(sym, table, edges, externalDeps);
    else resolveTsFile(sym, resolveTsModule, table, edges, externalDeps, fileSet, allSymbols);
  }

  return { edges: edges.toArray(), externalDeps: [...externalDeps].sort().slice(0, 100), classes };
}

// ── Java ──────────────────────────────────────────────────────────────────────

function resolveJavaFile(sym: FileSymbols, table: SymbolTable, edges: EdgeSet, externalDeps: Set<string>): void {
  // imports
  for (const imp of sym.imports) {
    if (imp.isWildcard) continue;
    const target = table.byFqn.get(imp.source);
    if (target && target.file !== sym.file) edges.add(sym.file, target.file, 'import', 'resolved');
    else if (!target) externalDeps.add(rootPackage(imp.source));
  }

  // extends / implements
  for (const decl of sym.types) {
    if (decl.extendsName) addTypeRefEdges(sym, decl.extendsName, 'extends', table, edges);
    for (const impl of decl.implementsNames) addTypeRefEdges(sym, impl, 'implements', table, edges);
  }

  // chamadas com receptor tipado por campo da classe envolvente
  const fieldsByType = new Map<string, Map<string, string>>();
  for (const decl of sym.types) {
    const m = new Map<string, string>();
    for (const f of decl.fields) m.set(f.name, f.type);
    fieldsByType.set(decl.simpleName, m);
  }

  for (const call of sym.calls) {
    if (!call.receiver || !call.enclosingType) continue;
    const fieldType = fieldsByType.get(call.enclosingType)?.get(call.receiver);
    if (!fieldType) continue; // local/param — fora do escopo da Fase 1
    resolveCallEdges(sym, fieldType, table, edges);
  }
}

function addTypeRefEdges(sym: FileSymbols, simpleName: string, kind: EdgeKind, table: SymbolTable, edges: EdgeSet): void {
  const candidates = table.resolveTypeName(simpleName, sym);
  const confidence: Confidence = candidates.length === 1 ? 'resolved' : 'inferred';
  for (const fqn of candidates) {
    const t = table.byFqn.get(fqn);
    if (t && t.file !== sym.file) edges.add(sym.file, t.file, kind, confidence);
  }
}

function resolveCallEdges(sym: FileSymbols, fieldType: string, table: SymbolTable, edges: EdgeSet): void {
  const candidates = table.resolveTypeName(fieldType, sym);
  const homonymAmbiguous = candidates.length > 1;

  for (const fqn of candidates) {
    const entry = table.byFqn.get(fqn);
    if (!entry) continue;
    const isAbstractLike = entry.decl.kind === 'interface' || entry.decl.isAbstract;

    if (isAbstractLike) {
      const impls = table.implementorsByInterface.get(fqn) ?? [];
      if (impls.length === 1 && !homonymAmbiguous) {
        const implFile = table.byFqn.get(impls[0])?.file;
        if (implFile && implFile !== sym.file) edges.add(sym.file, implFile, 'call', 'resolved');
      } else if (impls.length > 1) {
        for (const impl of impls) {
          const implFile = table.byFqn.get(impl)?.file;
          if (implFile && implFile !== sym.file) edges.add(sym.file, implFile, 'call', 'inferred');
        }
      } else if (entry.file !== sym.file) {
        // sem implementador conhecido: aponta para o contrato (interface)
        edges.add(sym.file, entry.file, 'call', homonymAmbiguous ? 'inferred' : 'resolved');
      }
    } else if (entry.file !== sym.file) {
      edges.add(sym.file, entry.file, 'call', homonymAmbiguous ? 'inferred' : 'resolved');
    }
  }
}

// ── TS / JS ────────────────────────────────────────────────────────────────────

function resolveTsFile(
  sym: FileSymbols,
  resolveTsModule: ModuleResolver,
  table: SymbolTable,
  edges: EdgeSet,
  externalDeps: Set<string>,
  fileSet: Set<string>,
  allSymbols: FileSymbols[]
): void {
  const byFile = tsIndex(allSymbols);

  for (const imp of sym.imports) {
    if (imp.source.startsWith('.') || isAliasLike(imp.source)) {
      const target = resolveTsModule(imp.source, sym.file);
      if (target && fileSet.has(target) && target !== sym.file) {
        edges.add(sym.file, target, 'import', 'resolved');
        // segue barris (re-exports) até a origem dos símbolos importados
        followBarrel(sym.file, target, imp.names, resolveTsModule, byFile, fileSet, edges, new Set([sym.file, target]));
      } else if (!target) {
        externalDeps.add(packageName(imp.source));
      }
    } else {
      externalDeps.add(packageName(imp.source));
    }
  }
}

function followBarrel(
  consumer: string,
  barrelFile: string,
  wantedNames: string[],
  resolveTsModule: ModuleResolver,
  byFile: Map<string, FileSymbols>,
  fileSet: Set<string>,
  edges: EdgeSet,
  visited: Set<string>,
  depth = 0
): void {
  if (depth > 5) return;
  const barrel = byFile.get(barrelFile);
  if (!barrel) return;

  for (const reexp of barrel.imports.filter((i) => i.isReexport)) {
    const providesWanted =
      wantedNames.length === 0 || reexp.isWildcard || reexp.names.some((n) => wantedNames.includes(n));
    if (!providesWanted) continue;

    const origin = resolveTsModule(reexp.source, barrelFile);
    if (!origin || !fileSet.has(origin) || visited.has(origin)) continue;
    visited.add(origin);
    edges.add(consumer, origin, 'import', 'resolved');
    followBarrel(consumer, origin, wantedNames, resolveTsModule, byFile, fileSet, edges, visited, depth + 1);
  }
}

function tsIndex(allSymbols: FileSymbols[]): Map<string, FileSymbols> {
  const m = new Map<string, FileSymbols>();
  for (const s of allSymbols) if (s.lang !== 'java') m.set(s.file, s);
  return m;
}

// ── helpers ────────────────────────────────────────────────────────────────────

function isAliasLike(source: string): boolean {
  // não-relativo mas com cara de alias de projeto (@/, ~/, @app/...)
  return /^[@~]/.test(source) && source.includes('/');
}

function rootPackage(fqn: string): string {
  const parts = fqn.split('.');
  return parts.slice(0, Math.min(3, parts.length)).join('.');
}

function packageName(source: string): string {
  return source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : source.split('/')[0];
}

/** Conjunto de arestas com dedupe por from|to|kind, mantendo a maior confiança. */
class EdgeSet {
  private map = new Map<string, SemanticEdge>();
  add(from: string, to: string, kind: EdgeKind, confidence: Confidence): void {
    const key = `${from} ${to} ${kind}`;
    const existing = this.map.get(key);
    if (!existing) this.map.set(key, { from, to, kind, confidence });
    else if (existing.confidence === 'inferred' && confidence === 'resolved') existing.confidence = 'resolved';
  }
  toArray(): SemanticEdge[] {
    return [...this.map.values()];
  }
}
