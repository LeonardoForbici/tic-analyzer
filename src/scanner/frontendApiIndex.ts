/**
 * frontendApiIndex.ts
 *
 * Detecta chamadas HTTP/API em arquivos frontend (TS/JS/TSX/JSX).
 * Análise estática 100% local — nenhuma execução, request HTTP ou conexão externa.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ScanResult } from './scanWorkspace';
import type { DetectedProject } from '../types';

export type Confidence = 'CONFIRMED' | 'INFERRED' | 'GAP';

export interface FrontendApiCall {
  projectId: string;
  file: string;
  line: number;
  method: string;
  path: string;
  caller?: string;
  confidence: Confidence;
  evidence: string[];
}

export interface FrontendApiIndex {
  generatedAt: string;
  projectId: string;
  calls: FrontendApiCall[];
  gaps: string[];
  stats: {
    total: number;
    confirmed: number;
    inferred: number;
    gaps: number;
  };
}

// Padrões de chamadas HTTP
const HTTP_PATTERNS: Array<{ label: string; pattern: RegExp; methodGroup: number | null; pathGroup: number }> = [
  // axios.get<T>('/api/...') — with optional TypeScript generic
  {
    label: 'axios',
    pattern: /\baxios\.(get|post|put|delete|patch|head|options)(?:<[^>]*>)?\s*\(\s*['"`]([^'"`]+)['"`]/g,
    methodGroup: 1,
    pathGroup: 2
  },
  // fetch('/api/...')
  {
    label: 'fetch',
    pattern: /\bfetch\s*\(\s*['"`]([^'"`]+)['"`]/g,
    methodGroup: null,
    pathGroup: 1
  },
  // api.get<T>(...) / api.post<T>(...) — with optional TypeScript generic
  {
    label: 'api',
    pattern: /\bapi\.(get|post|put|delete|patch)(?:<[^>]*>)?\s*\(\s*['"`]([^'"`]+)['"`]/g,
    methodGroup: 1,
    pathGroup: 2
  },
  // Angular HttpClient: this.http.get<T>('/api/...') — with optional generic
  {
    label: 'http',
    pattern: /\bhttp(?:Client)?\.(get|post|put|delete|patch)(?:<[^>]*>)?\s*\(\s*['"`]([^'"`]+)['"`]/g,
    methodGroup: 1,
    pathGroup: 2
  },
  // Generic service/client: service.get<T>('/api/...') — with optional generic
  {
    label: 'client',
    pattern: /\b(?:[A-Za-z_$][\w$]*?(?:Client|Service|Api|Request|Fetcher)|client|service|request|fetcher|httpService)\.(get|post|put|delete|patch)(?:<[^>]*>)?\s*\(\s*['"`]([^'"`]+)['"`]/g,
    methodGroup: 1,
    pathGroup: 2
  },
  // Angular HttpClient template literal: http.get<T>(`${baseUrl}/api/...`)
  // Captures the path segment after the variable expression
  {
    label: 'http-template',
    pattern: /\bhttp(?:Client)?\.(get|post|put|delete|patch)(?:<[^>]*>)?\s*\(\s*`(?:\$\{[^}]+\})?(\/[^`$\s][^`]*)`/g,
    methodGroup: 1,
    pathGroup: 2
  },
  // String concatenation: http.get<T>(baseUrl + '/api/...')
  {
    label: 'http-concat',
    pattern: /\bhttp(?:Client)?\.(get|post|put|delete|patch)(?:<[^>]*>)?\s*\([^)'"` \t\n]*\+\s*['"`](\/[^'"`\n]+)['"`]/g,
    methodGroup: 1,
    pathGroup: 2
  },
  // useQuery('key', () => fetch/axios...)
  {
    label: 'useQuery',
    pattern: /\buseQuery\s*\(\s*['"`]([^'"`]*\/[^'"`]*)['"`]/g,
    methodGroup: null,
    pathGroup: 1
  },
  // useMutation with URL
  {
    label: 'useMutation',
    pattern: /\buseMutation\s*\(\s*['"`]([^'"`]*\/[^'"`]*)['"`]/g,
    methodGroup: null,
    pathGroup: 1
  },
  // axios({ method: 'GET', url: '/api/...' })
  {
    label: 'axios-config',
    pattern: /\baxios\s*\(\s*\{[^}]*method\s*:\s*['"`]([^'"`]+)['"`][^}]*url\s*:\s*['"`]([^'"`]+)['"`]/gs,
    methodGroup: 1,
    pathGroup: 2
  }
];

const FRONTEND_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

export async function buildFrontendApiIndex(
  scan: ScanResult,
  projects: DetectedProject[]
): Promise<FrontendApiIndex[]> {
  const frontendProjects = projects.filter((p) => p.kind === 'frontend');

  // If no project detection, fall back to scanning everything
  const projectsToScan = frontendProjects.length > 0 ? frontendProjects : [
    { id: 'workspace', relativePath: '.', kind: 'frontend' } as DetectedProject
  ];

  const results: FrontendApiIndex[] = [];

  for (const project of projectsToScan) {
    const calls: FrontendApiCall[] = [];
    const gaps: string[] = [];

    const projectFiles = scan.files.filter((f) => {
      if (!FRONTEND_EXTENSIONS.has(f.extension)) return false;
      const rel = f.relativePath.toLowerCase();
      // Exclude test files and generated files
      if (rel.includes('.test.') || rel.includes('.spec.') || rel.includes('/dist/') || rel.includes('/build/')) return false;
      if (project.relativePath === '.') return true;
      return f.relativePath.startsWith(project.relativePath);
    });

    for (const file of projectFiles) {
      const absolutePath = path.join(scan.rootPath, file.relativePath);
      const content = await readSafe(absolutePath);
      if (!content) continue;

      const fileCalls = extractApiCalls(file.relativePath, content, project.id);
      calls.push(...fileCalls);
    }

    if (calls.length === 0 && projectFiles.length > 0) {
      gaps.push(`GAP: nenhuma chamada API detectada nos ${projectFiles.length} arquivos frontend de ${project.id}.`);
    }

    const confirmed = calls.filter((c) => c.confidence === 'CONFIRMED').length;
    const inferred = calls.filter((c) => c.confidence === 'INFERRED').length;
    const gapCount = calls.filter((c) => c.confidence === 'GAP').length;

    results.push({
      generatedAt: new Date().toISOString(),
      projectId: project.id,
      calls,
      gaps,
      stats: { total: calls.length, confirmed, inferred, gaps: gapCount }
    });
  }

  return results;
}

function extractApiCalls(filePath: string, content: string, projectId: string): FrontendApiCall[] {
  const calls: FrontendApiCall[] = [];
  const lines = content.split('\n');

  // Pre-pass: collect URL constants defined in this file
  // Matches: private/readonly/const apiUrl = '/api/...' or apiUrl: string = '/api/...'
  const urlConstants = new Map<string, string>();
  const URL_CONST_PATTERN = /(?:private|protected|readonly|const|let|var)?\s+(\w*(?:[Uu]rl|[Ee]ndpoint|[Pp]ath|[Rr]oute|[Bb]ase)\w*)\s*[=:]\s*(?:string\s*=\s*)?['"\`]([^'"\`]{3,}['"\`])/g;
  let constMatch: RegExpExecArray | null;
  while ((constMatch = URL_CONST_PATTERN.exec(content)) !== null) {
    const varName = constMatch[1];
    const varValue = constMatch[2].replace(/['"\`]$/, '');
    if (looksLikeApiPath(varValue)) {
      urlConstants.set(varName, varValue);
    }
  }

  // Pattern: this.http.get<T>(this.varName) or this.http.get(varName) — with optional generic
  if (urlConstants.size > 0) {
    const VAR_CALL_PATTERN = /\b(http(?:Client)?|axios|api|(?:[A-Za-z_$][\w$]*?(?:Client|Service|Api|Request|Fetcher)|client|service|request|fetcher|httpService))\.(get|post|put|delete|patch)(?:<[^>]*>)?\s*\(\s*(?:this\.)?(\w+)/g;
    let varMatch: RegExpExecArray | null;
    while ((varMatch = VAR_CALL_PATTERN.exec(content)) !== null) {
      const varName = varMatch[3];
      const resolved = urlConstants.get(varName);
      if (!resolved) continue;
      const method = normalizeMethod(varMatch[2]);
      const apiPath = normalizePath(resolved);
      const lineNumber = getLineNumber(content, varMatch.index);
      const lineText = lines[lineNumber - 1]?.trim() ?? '';
      if (calls.some((c) => c.file === filePath && c.path === apiPath && c.method === method)) continue;
      calls.push({
        projectId,
        file: filePath,
        line: lineNumber,
        method,
        path: apiPath,
        caller: extractCallerName(filePath),
        confidence: 'INFERRED',
        evidence: [`${lineText.slice(0, 100)} [resolved: ${varName}=${resolved}]`]
      });
    }
  }

  for (const descriptor of HTTP_PATTERNS) {
    const pattern = new RegExp(descriptor.pattern.source, descriptor.pattern.flags.includes('g') ? descriptor.pattern.flags : descriptor.pattern.flags + 'g');
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      const rawMethod = descriptor.methodGroup !== null ? match[descriptor.methodGroup] : undefined;
      const rawPath = match[descriptor.pathGroup];

      if (!rawPath || !looksLikeApiPath(rawPath)) continue;

      const method = normalizeMethod(rawMethod);
      const apiPath = normalizePath(rawPath);
      const lineNumber = getLineNumber(content, match.index);
      const lineText = lines[lineNumber - 1]?.trim() ?? '';

      // Avoid duplicate
      if (calls.some((c) => c.file === filePath && c.path === apiPath && c.method === method)) continue;

      calls.push({
        projectId,
        file: filePath,
        line: lineNumber,
        method,
        path: apiPath,
        caller: extractCallerName(filePath),
        confidence: apiPath.startsWith('/api/') || apiPath.startsWith('/v') ? 'CONFIRMED' : 'INFERRED',
        evidence: [lineText.slice(0, 120)]
      });
    }
  }

  return calls;
}

function looksLikeApiPath(raw: string): boolean {
  if (!raw || raw.length < 2) return false;
  if (!raw.includes('/')) return false;
  // Skip relative imports
  if (raw.startsWith('./') || raw.startsWith('../')) return false;
  // Skip static file references
  if (/\.(png|jpg|jpeg|svg|gif|ico|css|html|woff|ttf)$/i.test(raw)) return false;
  // Explicit absolute path or full URL
  if (raw.startsWith('/') || raw.startsWith('http')) return true;
  // Known API-like segments
  if (/\/(api|v\d|rest|service|endpoint|resource|data)/i.test(raw)) return true;
  // Template literal with variable prefix: ${...}/something
  if (/\$\{[^}]+\}\//.test(raw)) return true;
  return false;
}

function normalizeMethod(raw?: string): string {
  if (!raw) return 'GET';
  return raw.toUpperCase();
}

function normalizePath(raw: string): string {
  // Remove query string and fragments
  let p = raw.split('?')[0].split('#')[0].trim();
  // Strip template literal variable prefix: ${env.apiUrl}/users -> /users
  p = p.replace(/^[^/]*\$\{[^}]+\}/g, '');
  if (!p.startsWith('/') && p.includes('/')) {
    // Grab from the first slash
    const idx = p.indexOf('/');
    p = p.slice(idx);
  }
  p = p.replace(/\/+$/, '');
  return p || raw.split('?')[0].split('#')[0].trim();
}

function extractCallerName(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

function getLineNumber(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}

async function readSafe(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}
