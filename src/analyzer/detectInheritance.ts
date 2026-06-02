import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';
import { langForExtension } from './semantic/treeSitter';

export interface ClassInfo {
  name: string;
  file: string;
  line: number;
  extends?: string;
  implements: string[];
  isAbstract: boolean;
  isInterface: boolean;
}

export interface InheritanceTree {
  classes: ClassInfo[];
  roots: string[];      // Classes sem pai
  leafs: string[];      // Classes sem filhos
  maxDepth: number;
}

const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.java', '.kt', '.cs', '.py']);

/**
 * Extrai hierarquia de herança de classes Java/TypeScript/Python/C#.
 *
 * Quando `semanticClasses` (extraídas via AST em buildDependencyGraph) são
 * fornecidas, usa-as para TS/Java (resolução confiável) e cai para regex apenas
 * nas linguagens sem grammar (Python/C#/Kotlin).
 */
export function detectInheritance(files: ScannedFile[], semanticClasses?: ClassInfo[]): InheritanceTree {
  const classes: ClassInfo[] = [];
  const useSemantic = !!semanticClasses && semanticClasses.length > 0;
  if (useSemantic) classes.push(...semanticClasses!);

  for (const file of files) {
    if (!CODE_EXTS.has(file.extension)) continue;
    // Já coberto pela camada semântica (AST)?
    if (useSemantic && langForExtension(file.extension) !== null) continue;

    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }

    const found = extractClasses(content, file.relativePath, file.extension);
    classes.push(...found);
  }

  // Identifica roots (sem extends) e leafs (não são extendidos por ninguém)
  const allParents = new Set(classes.map((c) => c.extends).filter(Boolean) as string[]);
  const allImplemented = new Set(classes.flatMap((c) => c.implements));
  const classNames = new Set(classes.map((c) => c.name));

  const roots = classes.filter((c) => !c.extends || !classNames.has(c.extends)).map((c) => c.name);
  const leafs = classes.filter((c) => !allParents.has(c.name) && !allImplemented.has(c.name)).map((c) => c.name);

  // Calcula profundidade máxima
  const depth = computeMaxDepth(classes);

  return { classes, roots, leafs, maxDepth: depth };
}

function extractClasses(content: string, file: string, ext: string): ClassInfo[] {
  const result: ClassInfo[] = [];
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      // TypeScript: abstract class Foo extends Bar implements IFoo, IBaz
      const match = line.match(/^(?:export\s+)?(?:(abstract)\s+)?(?:(interface)|class)\s+(\w+)(?:\s+extends\s+([\w<>, ]+?))?(?:\s+implements\s+([\w<>, ]+?))?(?:\s*\{|$)/);
      if (match) {
        const isInterface = !!match[2];
        const name = match[3];
        const parentRaw = match[4];
        const implRaw = match[5];
        result.push({
          name,
          file,
          line: lineNum,
          extends: parentRaw ? parentRaw.split('<')[0].trim() : undefined,
          implements: implRaw ? implRaw.split(',').map((s) => s.trim().split('<')[0]) : [],
          isAbstract: !!match[1],
          isInterface
        });
      }
    }

    if (['.java', '.kt'].includes(ext)) {
      // Java: public abstract class Foo extends Bar implements IFoo, IBaz
      const match = line.match(/(?:public\s+|private\s+|protected\s+)?(?:(abstract)\s+)?(?:(interface)|class|enum)\s+(\w+)(?:<[^>]*>)?(?:\s+extends\s+([\w<>, ]+?))?(?:\s+implements\s+([\w<>, ]+?))?(?:\s*\{|$)/);
      if (match) {
        const isInterface = match[2] === 'interface';
        const name = match[3];
        const parentRaw = match[4];
        const implRaw = match[5];
        result.push({
          name,
          file,
          line: lineNum,
          extends: parentRaw ? parentRaw.split('<')[0].trim() : undefined,
          implements: implRaw ? implRaw.split(',').map((s) => s.trim().split('<')[0]) : [],
          isAbstract: !!match[1],
          isInterface
        });
      }
    }

    if (ext === '.py') {
      // Python: class Foo(Bar, Mixin):
      const match = line.match(/^class\s+(\w+)\s*\(([^)]*)\)\s*:/);
      if (match) {
        const name = match[1];
        const parents = match[2].split(',').map((s) => s.trim()).filter(Boolean);
        result.push({
          name,
          file,
          line: lineNum,
          extends: parents[0] || undefined,
          implements: parents.slice(1),
          isAbstract: false,
          isInterface: false
        });
      }
    }
  });

  return result;
}

function computeMaxDepth(classes: ClassInfo[]): number {
  const classMap = new Map(classes.map((c) => [c.name, c]));
  const depthCache = new Map<string, number>();

  function depth(name: string, visited = new Set<string>()): number {
    if (depthCache.has(name)) return depthCache.get(name)!;
    if (visited.has(name)) return 0;
    visited.add(name);

    const cls = classMap.get(name);
    if (!cls?.extends) { depthCache.set(name, 0); return 0; }

    const d = 1 + depth(cls.extends, visited);
    depthCache.set(name, d);
    return d;
  }

  let max = 0;
  for (const cls of classes) {
    max = Math.max(max, depth(cls.name));
  }
  return max;
}

/** Gera relatório de herança compacto (~2k tokens) */
export function formatInheritanceReport(tree: InheritanceTree): string {
  if (tree.classes.length === 0) return '';

  const lines: string[] = [
    '# Hierarquia de Classes — TIC Analyzer',
    '',
    `| Métrica | Valor |`,
    `| --- | --- |`,
    `| Classes detectadas | ${tree.classes.length} |`,
    `| Interfaces | ${tree.classes.filter((c) => c.isInterface).length} |`,
    `| Classes abstratas | ${tree.classes.filter((c) => c.isAbstract).length} |`,
    `| Profundidade máxima | ${tree.maxDepth} |`,
    ''
  ];

  // Hierarquias (classes que têm filhos)
  const childMap: Record<string, string[]> = {};
  for (const cls of tree.classes) {
    if (cls.extends) {
      if (!childMap[cls.extends]) childMap[cls.extends] = [];
      childMap[cls.extends].push(cls.name);
    }
  }

  const families = Object.entries(childMap)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20);

  if (families.length > 0) {
    lines.push('## Hierarquias Detectadas');
    lines.push('');
    lines.push('| Pai | Filhos |');
    lines.push('| --- | --- |');
    for (const [parent, children] of families) {
      lines.push(`| **${parent}** | ${children.slice(0, 8).join(', ')}${children.length > 8 ? ` +${children.length - 8}` : ''} |`);
    }
    lines.push('');
  }

  // Classes por arquivo (top 15)
  const classesWithParent = tree.classes.filter((c) => c.extends);
  lines.push('## Classes com Herança');
  lines.push('');
  lines.push('| Classe | Extends | Arquivo |');
  lines.push('| --- | --- | --- |');
  for (const cls of classesWithParent.slice(0, 30)) {
    const icon = cls.isInterface ? '⬡' : cls.isAbstract ? '◈' : '○';
    lines.push(`| ${icon} \`${cls.name}\` | \`${cls.extends}\` | \`${cls.file}:${cls.line}\` |`);
  }

  return lines.join('\n');
}
