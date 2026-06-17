import * as fs from 'fs';
import * as path from 'path';
import type { ScannedFile } from './scanFiles';
import { buildSemanticGraph } from './semantic/buildSemanticGraph';
import type { EdgeKind, Confidence, ClassInfoLite, MethodEdge } from './semantic/resolveReferences';
import { langForExtension } from './semantic/treeSitter';

export interface GraphNode {
  id: string;
  path: string;
  inDegree: number;  // quantos outros arquivos importam/usam este
  outDegree: number; // quantos arquivos este importa/usa
}

export interface GraphEdge {
  from: string;
  to: string;
  /** Tipo da relação. Ausente em arestas legadas/regex (tratadas como 'import'). */
  kind?: EdgeKind;
  /** 'resolved' = alvo único confirmado via AST; 'inferred' = heurística/ambíguo. */
  confidence?: Confidence;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centralFiles: string[]; // top arquivos mais referenciados
  externalDeps: string[];
  /** Classes/interfaces extraídas via AST (TS/Java) — reusado por detectInheritance. */
  semanticClasses?: ClassInfoLite[];
  /** Arestas método→método resolvidas (Java) — granularidade de método no trace. */
  methodEdges?: MethodEdge[];
  /** Arquivos que reusaram símbolos do cache AST (re-análise incremental). */
  astCacheHits?: number;
}

/**
 * Constrói o grafo de dependências. Usa parsing AST + resolução de símbolos
 * (TS/JS/TSX/Java) e cai para extração por regex apenas em linguagens sem
 * grammar (Python/Go/C#/Rust/PHP) ou em arquivos que falharam o parse.
 */
export interface DependencyGraphOptions {
  /** Arquivos alterados (mtime) — habilita reuso do cache de símbolos AST. */
  changedFiles?: Set<string>;
}

export async function buildDependencyGraph(files: ScannedFile[], rootPath: string, opts: DependencyGraphOptions = {}): Promise<DependencyGraph> {
  const fileSet = new Set(files.map((f) => f.relativePath));
  const edgeMap = new Map<string, GraphEdge>();
  const externalDepsSet = new Set<string>();

  const addEdge = (from: string, to: string, kind: EdgeKind, confidence: Confidence) => {
    if (from === to) return;
    const key = `${from} ${to} ${kind}`;
    const existing = edgeMap.get(key);
    if (!existing) edgeMap.set(key, { from, to, kind, confidence });
    else if (existing.confidence === 'inferred' && confidence === 'resolved') existing.confidence = 'resolved';
  };

  // ── 1. Camada semântica (AST) ──────────────────────────────────────────────
  const semantic = await buildSemanticGraph(files, rootPath, { changedFiles: opts.changedFiles });
  for (const e of semantic.edges) addEdge(e.from, e.to, e.kind, e.confidence);
  for (const dep of semantic.externalDeps) externalDepsSet.add(dep);

  // ── 2. Fallback regex (linguagens sem grammar ou parse falho) ──────────────
  // Cai para regex em: Python/Go/C#/Rust/PHP/Kotlin (sem grammar) e em arquivos
  // de linguagem suportada que não foram parseados (grammars ausentes ou erro).
  // Java/Kotlin entram no fallback quando o AST falhou — garante grafo não-vazio
  // resolvendo imports por nome qualificado (FQN) contra os arquivos do projeto.
  const regexExts = new Set(['.py', '.go', '.cs', '.rs', '.php', '.kt']);

  // Índice FQN→arquivo e pacote→arquivos (FQN = pacote declarado + nome do arquivo,
  // convenção Java: classe pública = nome do arquivo).
  const javaFqnToFile = new Map<string, string>();
  const javaPkgToFiles = new Map<string, string[]>();
  const contentCache = new Map<string, string>();
  const readCached = (file: ScannedFile): string | null => {
    if (contentCache.has(file.relativePath)) return contentCache.get(file.relativePath)!;
    try { const c = fs.readFileSync(file.absolutePath, 'utf8'); contentCache.set(file.relativePath, c); return c; }
    catch { return null; }
  };
  const javaFiles = files.filter((f) => f.extension === '.java' || f.extension === '.kt');
  for (const file of javaFiles) {
    const content = readCached(file);
    if (content == null) continue;
    const pkgMatch = content.match(/^\s*package\s+([\w.]+)/m);
    const pkg = pkgMatch ? pkgMatch[1] : '';
    const typeName = path.basename(file.relativePath).replace(/\.(java|kt)$/, '');
    const fqn = pkg ? `${pkg}.${typeName}` : typeName;
    javaFqnToFile.set(fqn, file.relativePath);
    if (pkg) {
      const list = javaPkgToFiles.get(pkg) ?? [];
      list.push(file.relativePath);
      javaPkgToFiles.set(pkg, list);
    }
  }

  for (const file of files) {
    const isJavaLike = file.extension === '.java' || file.extension === '.kt';
    const langSupported = langForExtension(file.extension) !== null;
    const needsFallback = regexExts.has(file.extension) || (langSupported && !semantic.parsedFiles.has(file.relativePath));
    if (!needsFallback) continue;

    const content = readCached(file);
    if (content == null) continue;

    // Java/Kotlin: resolve imports por FQN/pacote contra arquivos do projeto.
    if (isJavaLike) {
      const simpleNames = javaReferencedSimpleNames(content);
      for (const m of content.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+?)(\.\*)?\s*;?\s*$/gm)) {
        const base = m[1];
        if (m[2]) {
          for (const target of javaPkgToFiles.get(base) ?? []) {
            const tName = path.basename(target).replace(/\.(java|kt)$/, '');
            if (target !== file.relativePath && simpleNames.has(tName)) addEdge(file.relativePath, target, 'import', 'inferred');
          }
        } else {
          const found = javaFqnToFile.get(base);
          if (found && found !== file.relativePath) addEdge(file.relativePath, found, 'import', 'inferred');
          else if (!found) externalDepsSet.add(base.split('.').slice(0, 2).join('.'));
        }
      }
      continue;
    }

    for (const imp of extractImports(content, file.extension)) {
      if (imp.startsWith('.')) {
        const dir = path.dirname(file.absolutePath);
        const resolved = path.resolve(dir, imp).replace(/\\/g, '/');
        const rel = path.relative(rootPath, resolved).replace(/\\/g, '/');
        const candidates = [rel, `${rel}.ts`, `${rel}.tsx`, `${rel}.js`, `${rel}.jsx`, `${rel}/index.ts`, `${rel}/index.js`];
        const found = candidates.find((c) => fileSet.has(c));
        if (found) addEdge(file.relativePath, found, 'import', 'inferred');
      } else if (!imp.startsWith('/')) {
        const pkg = imp.startsWith('@') ? imp.split('/').slice(0, 2).join('/') : imp.split('/')[0];
        if (pkg) externalDepsSet.add(pkg);
      }
    }
  }

  // ── 3. Graus (contados por par único from→to, qualquer tipo de aresta) ──────
  const inDegree: Record<string, number> = {};
  const outDegree: Record<string, number> = {};
  for (const f of files) { inDegree[f.relativePath] = 0; outDegree[f.relativePath] = 0; }

  const seenPairs = new Set<string>();
  for (const e of edgeMap.values()) {
    const pair = `${e.from} ${e.to}`;
    if (seenPairs.has(pair)) continue;
    seenPairs.add(pair);
    outDegree[e.from] = (outDegree[e.from] ?? 0) + 1;
    inDegree[e.to] = (inDegree[e.to] ?? 0) + 1;
  }

  const nodes: GraphNode[] = files.map((f) => ({
    id: f.relativePath,
    path: f.relativePath,
    inDegree: inDegree[f.relativePath] ?? 0,
    outDegree: outDegree[f.relativePath] ?? 0
  }));

  const centralFiles = [...nodes]
    .sort((a, b) => b.inDegree - a.inDegree)
    .slice(0, 20)
    .filter((n) => n.inDegree > 0)
    .map((n) => n.path);

  return {
    nodes,
    edges: [...edgeMap.values()].slice(0, 50_000),
    centralFiles,
    externalDeps: [...externalDepsSet].sort().slice(0, 100),
    semanticClasses: semantic.classes,
    methodEdges: semantic.methodEdges,
    astCacheHits: semantic.cacheHits
  };
}

/** Nomes simples (CamelCase iniciando em maiúscula) referenciados no código Java —
 *  usados para materializar arestas de imports wildcard sem ligar o pacote inteiro. */
function javaReferencedSimpleNames(content: string): Set<string> {
  const names = new Set<string>();
  // remove a linha de imports/package para não capturar o próprio FQN
  const body = content.replace(/^\s*(?:import|package)\s+[^\n]*$/gm, '');
  for (const m of body.matchAll(/\b([A-Z][A-Za-z0-9_]+)\b/g)) names.add(m[1]);
  return names;
}

function extractImports(content: string, ext: string): string[] {
  const imports: string[] = [];

  if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) {
    const esm = content.matchAll(/(?:import|from)\s+['"]([^'"]+)['"]/g);
    for (const m of esm) if (m[1]) imports.push(m[1]);
    const cjs = content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
    for (const m of cjs) if (m[1]) imports.push(m[1]);
  }

  if (ext === '.java' || ext === '.kt') {
    const javaImports = content.matchAll(/^import\s+([\w.]+)/gm);
    for (const m of javaImports) if (m[1]) imports.push(m[1]);
  }

  if (ext === '.py') {
    const pyImports = content.matchAll(/^(?:import|from)\s+([\w.]+)/gm);
    for (const m of pyImports) if (m[1]) imports.push(m[1].replace(/\./g, '/'));
  }

  if (ext === '.go') {
    const goImports = content.matchAll(/"([^"]+)"/g);
    for (const m of goImports) if (m[1] && m[1].includes('/')) imports.push(m[1]);
  }

  return imports;
}
