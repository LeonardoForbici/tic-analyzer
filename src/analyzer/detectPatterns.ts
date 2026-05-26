import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';

export type ArchPattern =
  | 'Repository'
  | 'Service'
  | 'Controller'
  | 'Factory'
  | 'Observer'
  | 'Strategy'
  | 'Facade'
  | 'DTO'
  | 'Entity'
  | 'Mapper'
  | 'Middleware'
  | 'Interceptor'
  | 'Guard'
  | 'Provider'
  | 'UseCase';

export interface PatternMatch {
  pattern: ArchPattern;
  file: string;
  className?: string;
  confidence: '🟢' | '🟡';
}

const FILENAME_PATTERNS: Array<[RegExp, ArchPattern, '🟢' | '🟡']> = [
  [/[Rr]epository\.(ts|js|java|cs|py)$/, 'Repository', '🟢'],
  [/[Dd]ao\.(ts|js|java|cs|py)$/, 'Repository', '🟢'],
  [/[Ss]ervice\.(ts|js|java|cs|py)$/, 'Service', '🟢'],
  [/[Cc]ontroller\.(ts|js|java|cs|py)$/, 'Controller', '🟢'],
  [/[Rr]outer?\.(ts|js)$/, 'Controller', '🟢'],
  [/[Hh]andler\.(ts|js|java|cs|py)$/, 'Controller', '🟡'],
  [/[Ff]actory\.(ts|js|java|cs|py)$/, 'Factory', '🟢'],
  [/[Ff]acade\.(ts|js|java|cs|py)$/, 'Facade', '🟢'],
  [/[Dd][Tt][Oo]\.(ts|js|java|cs|py)$/, 'DTO', '🟢'],
  [/[Rr]equest\.(ts|js|java|cs)$/, 'DTO', '🟡'],
  [/[Rr]esponse\.(ts|js|java|cs)$/, 'DTO', '🟡'],
  [/[Ee]ntity\.(ts|js|java|cs|py)$/, 'Entity', '🟢'],
  [/[Mm]odel\.(ts|js|java|cs|py)$/, 'Entity', '🟡'],
  [/[Mm]apper\.(ts|js|java|cs|py)$/, 'Mapper', '🟢'],
  [/[Mm]iddleware\.(ts|js|py)$/, 'Middleware', '🟢'],
  [/[Ii]nterceptor\.(ts|java|cs)$/, 'Interceptor', '🟢'],
  [/[Gg]uard\.(ts|java|cs)$/, 'Guard', '🟢'],
  [/[Pp]rovider\.(ts|js)$/, 'Provider', '🟢'],
  [/[Uu]se[Cc]ase\.(ts|js|java|cs|py)$/, 'UseCase', '🟢'],
];

const ANNOTATION_PATTERNS: Array<[RegExp, ArchPattern]> = [
  [/@Repository|@JpaRepository|extends.*Repository/i, 'Repository'],
  [/@Service|@Injectable.*service/i, 'Service'],
  [/@Controller|@RestController|@RequestMapping/i, 'Controller'],
  [/@Component\b|@Injectable\b/i, 'Service'],
  [/@Mapper\b|implements.*Mapper/i, 'Mapper'],
  [/@Middleware|implements.*Middleware/i, 'Middleware'],
  [/@UseInterceptors|@Interceptor/i, 'Interceptor'],
  [/@UseGuards|@Guard\b|implements.*Guard/i, 'Guard'],
  [/@EventListener|@Subscribe|implements.*Observer/i, 'Observer'],
  [/implements.*Strategy\b|Strategy\s*\{/i, 'Strategy'],
  [/implements.*UseCase|class.*UseCase\b/i, 'UseCase'],
  [/@Entity\b|@Table\b|@ORM\b/i, 'Entity'],
];

const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.java', '.py', '.cs', '.kt']);

export function detectPatterns(files: ScannedFile[]): PatternMatch[] {
  const matches: PatternMatch[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    if (!CODE_EXTS.has(file.extension)) continue;

    const fname = file.relativePath.split('/').pop() ?? '';

    // Filename-based detection
    for (const [pattern, archPattern, confidence] of FILENAME_PATTERNS) {
      if (pattern.test(fname)) {
        const key = `${file.relativePath}:${archPattern}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push({ pattern: archPattern, file: file.relativePath, confidence });
        }
      }
    }

    // Annotation/code-based detection
    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }

    for (const [annotationPattern, archPattern] of ANNOTATION_PATTERNS) {
      if (annotationPattern.test(content)) {
        const key = `${file.relativePath}:${archPattern}`;
        if (!seen.has(key)) {
          seen.add(key);
          // Extract class name
          const classMatch = content.match(/(?:class|interface)\s+(\w+)/);
          matches.push({ pattern: archPattern, file: file.relativePath, className: classMatch?.[1], confidence: '🟢' });
        }
      }
    }
  }

  return matches;
}

/** Gera relatório de padrões por módulo, compacto */
export function formatPatternsReport(matches: PatternMatch[]): string {
  if (matches.length === 0) return '';

  const byPattern: Record<string, PatternMatch[]> = {};
  for (const m of matches) {
    if (!byPattern[m.pattern]) byPattern[m.pattern] = [];
    byPattern[m.pattern].push(m);
  }

  const lines: string[] = [
    '# Padrões Arquiteturais Detectados',
    '',
    '| Padrão | Ocorrências |',
    '| --- | --- |',
  ];

  const sorted = Object.entries(byPattern).sort((a, b) => b[1].length - a[1].length);
  for (const [pattern, items] of sorted) {
    lines.push(`| **${pattern}** | ${items.length} |`);
  }
  lines.push('');

  for (const [pattern, items] of sorted) {
    lines.push(`## ${pattern} (${items.length})`);
    lines.push('');
    for (const m of items.slice(0, 10)) {
      const cls = m.className ? ` — \`${m.className}\`` : '';
      lines.push(`- ${m.confidence} \`${m.file}\`${cls}`);
    }
    if (items.length > 10) lines.push(`- ... e mais ${items.length - 10}`);
    lines.push('');
  }

  return lines.join('\n');
}
