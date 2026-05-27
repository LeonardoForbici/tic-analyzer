import * as fs from 'fs';
import * as path from 'path';
import type { ScannedFile } from './scanFiles';

export interface SearchIndexEntry {
  file: string;
  terms: string[];
  snippet: string;
}

const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx',
  '.java', '.py', '.cs', '.go', '.rs', '.php', '.rb', '.sql'
]);

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'was', 'this', 'that', 'with', 'from',
  'have', 'has', 'had', 'not', 'but', 'you', 'all', 'can', 'her', 'his',
  'one', 'will', 'more', 'use', 'get', 'set', 'let', 'var', 'new', 'null',
  'true', 'false', 'else', 'then', 'void', 'type', 'enum', 'class',
  'interface', 'extends', 'implements', 'import', 'export', 'return',
  'public', 'private', 'protected', 'static', 'final', 'const',
  'que', 'nao', 'com', 'por', 'para', 'uma', 'dos', 'das', 'nos', 'nas',
  'seu', 'sua', 'num', 'ser', 'ter', 'tem', 'foi', 'como', 'mais', 'mas',
  'sem', 'quando', 'muito', 'bem', 'entre', 'depois', 'antes', 'onde',
  'tambem', 'isso', 'isto', 'aqui',
]);

const SQL_KEYWORDS = new Set([
  'select', 'insert', 'update', 'delete', 'where', 'join',
  'inner', 'outer', 'left', 'right', 'group', 'order', 'having',
  'create', 'table', 'index', 'primary', 'foreign', 'key', 'values',
  'commit', 'rollback', 'begin', 'declare', 'procedure',
  'function', 'trigger', 'cursor', 'fetch', 'open', 'close',
]);

function splitCamelCase(identifier: string): string[] {
  return identifier
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .split(/[_\s]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 3);
}

function extractPathTokens(relativePath: string): string[] {
  return relativePath
    .split(/[/\\\-_.]+/)
    .flatMap((part) => splitCamelCase(part))
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !SQL_KEYWORDS.has(t));
}

function extractCommentTokens(lines: string[]): string[] {
  const tokens: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (inBlock) {
      const words = (trimmed.replace(/\*\//g, '').replace(/^\*/, '').match(/\b[a-zA-Z]{3,}\b/g) ?? []);
      tokens.push(...words.map((w) => w.toLowerCase()));
      if (trimmed.includes('*/')) inBlock = false;
      continue;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
      const words = (trimmed.slice(2).match(/\b[a-zA-Z]{3,}\b/g) ?? []);
      tokens.push(...words.map((w) => w.toLowerCase()));
    } else if (trimmed.startsWith('/*') || trimmed.startsWith('/**')) {
      inBlock = !trimmed.includes('*/');
      const content = trimmed.replace(/\/\*+/, '').replace(/\*\//, '');
      const words = (content.match(/\b[a-zA-Z]{3,}\b/g) ?? []);
      tokens.push(...words.map((w) => w.toLowerCase()));
    }
  }
  return tokens;
}

function extractIdentifierTokens(content: string): string[] {
  const identifiers = content.match(/\b[a-zA-Z][a-zA-Z0-9]{2,}\b/g) ?? [];
  const tokens: string[] = [];
  for (const id of identifiers) {
    tokens.push(...splitCamelCase(id));
  }
  return tokens;
}

function extractStringLiterals(content: string): string[] {
  const tokens: string[] = [];
  const re = /["'`]([a-zA-Z][a-zA-Z0-9 \-_./]{2,57}[a-zA-Z0-9])["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const val = m[1].toLowerCase();
    const first = val.split(/\s+/)[0];
    if (SQL_KEYWORDS.has(first)) continue;
    tokens.push(...val.split(/[\s\-_/]+/).filter((t) => t.length >= 3));
  }
  return tokens;
}

function buildSnippet(lines: string[]): string {
  const meaningful: string[] = [];
  for (const line of lines) {
    if (meaningful.length >= 3) break;
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) continue;
    if (/^import\s|^from\s|^require\s*\(|^package\s|^#include/.test(trimmed)) continue;
    meaningful.push(trimmed.slice(0, 120));
  }
  return meaningful.join(' | ');
}

export function buildSearchIndex(files: ScannedFile[], ticCodeDir: string): void {
  const index: SearchIndexEntry[] = [];

  for (const file of files) {
    if (!CODE_EXTS.has(file.extension)) continue;

    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }

    const lines = content.split('\n');
    const allTokens: string[] = [];

    allTokens.push(...extractPathTokens(file.relativePath));
    allTokens.push(...extractCommentTokens(lines));
    allTokens.push(...extractIdentifierTokens(content));
    allTokens.push(...extractStringLiterals(content));

    const seen = new Set<string>();
    const terms: string[] = [];
    for (const t of allTokens) {
      const lower = t.toLowerCase();
      if (lower.length < 3) continue;
      if (STOPWORDS.has(lower) || SQL_KEYWORDS.has(lower)) continue;
      if (seen.has(lower)) continue;
      seen.add(lower);
      terms.push(lower);
      if (terms.length >= 400) break;
    }

    const snippet = buildSnippet(lines);
    index.push({ file: file.relativePath, terms, snippet });
  }

  fs.writeFileSync(path.join(ticCodeDir, 'search-index.json'), JSON.stringify(index), 'utf8');
}
