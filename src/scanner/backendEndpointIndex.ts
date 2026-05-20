/**
 * backendEndpointIndex.ts
 *
 * Detecta endpoints backend em arquivos Java/Spring e TS/JS (Express, Fastify, Nest, Next).
 * Análise estática 100% local — nenhuma execução ou conexão externa.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ScanResult } from './scanWorkspace';
import type { DetectedProject } from '../types';

export type Confidence = 'CONFIRMED' | 'INFERRED' | 'GAP';

export interface BackendEndpoint {
  projectId: string;
  controllerFile: string;
  controllerClass?: string;
  controllerMethod?: string;
  httpMethod: string;
  basePath: string;
  path: string;
  fullPath: string;
  line: number;
  confidence: Confidence;
  evidence: string[];
}

export interface BackendEndpointIndex {
  generatedAt: string;
  projectId: string;
  endpoints: BackendEndpoint[];
  gaps: string[];
  stats: {
    total: number;
    confirmed: number;
    inferred: number;
    byMethod: Record<string, number>;
  };
}

// Spring mapping annotations
const MAPPING_PATTERNS = [
  { annotation: 'GetMapping', method: 'GET' },
  { annotation: 'PostMapping', method: 'POST' },
  { annotation: 'PutMapping', method: 'PUT' },
  { annotation: 'DeleteMapping', method: 'DELETE' },
  { annotation: 'PatchMapping', method: 'PATCH' },
  { annotation: 'RequestMapping', method: 'ANY' }
];

interface NodeRoutePattern {
  label: string;
  pattern: RegExp;
  methodGroup: number;
  pathGroup: number;
  nameGroup?: number;
}

const NODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const NODE_ROUTE_PATTERNS: NodeRoutePattern[] = [
  {
    label: 'express-router',
    pattern: /\b(?:router|app|fastify)\.(get|post|put|delete|patch|options|head|all)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    methodGroup: 1,
    pathGroup: 2
  },
  {
    label: 'express-route-chain',
    pattern: /\b(?:router|app)\.route\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\s*\.\s*(get|post|put|delete|patch|options|head|all)\b/g,
    methodGroup: 2,
    pathGroup: 1
  },
  {
    label: 'nestjs-decorator',
    pattern: /@(Get|Post|Put|Delete|Patch|Options|Head|All)\s*\(\s*(?:['"`]([^'"`]+)['"`])?\s*\)\s*(?:public|protected|private|async)?\s*(?:[A-Za-z_$][\w$<>,\s\[\]]*\s+)?([A-Za-z_$][\w$]*)\s*\(/g,
    methodGroup: 1,
    pathGroup: 2,
    nameGroup: 3
  }
];

export async function buildBackendEndpointIndex(
  scan: ScanResult,
  projects: DetectedProject[]
): Promise<BackendEndpointIndex[]> {
  const backendProjects = projects.filter((p) => p.kind === 'backend');

  const projectsToScan = backendProjects.length > 0 ? backendProjects : [
    { id: 'workspace', relativePath: '.', kind: 'backend' } as DetectedProject
  ];

  const results: BackendEndpointIndex[] = [];

  for (const project of projectsToScan) {
    const endpoints: BackendEndpoint[] = [];
    const gaps: string[] = [];

    const backendFiles = scan.files.filter((f) => {
      if (f.extension === '.java') return true;
      return NODE_EXTENSIONS.has(f.extension);
    });

    const javaFiles = backendFiles.filter((f) => {
      if (f.extension !== '.java') return false;
      if (project.relativePath === '.') return true;
      return f.relativePath.startsWith(project.relativePath);
    });

    const nodeFiles = backendFiles.filter((f) => {
      if (!NODE_EXTENSIONS.has(f.extension)) return false;
      if (project.relativePath === '.') return true;
      return f.relativePath.startsWith(project.relativePath);
    });

    if (javaFiles.length === 0 && nodeFiles.length === 0) {
      gaps.push(`GAP: nenhum arquivo backend encontrado no projeto ${project.id}.`);
    }

    for (const file of [...javaFiles, ...nodeFiles]) {
      const absolutePath = path.join(scan.rootPath, file.relativePath);
      const content = await readSafe(absolutePath);
      if (!content) continue;

      const fileEndpoints = extractEndpoints(file.relativePath, content, project.id);
      endpoints.push(...fileEndpoints);
    }

    const confirmed = endpoints.filter((e) => e.confidence === 'CONFIRMED').length;
    const inferred = endpoints.filter((e) => e.confidence === 'INFERRED').length;
    const byMethod: Record<string, number> = {};
    for (const ep of endpoints) {
      byMethod[ep.httpMethod] = (byMethod[ep.httpMethod] ?? 0) + 1;
    }

    results.push({
      generatedAt: new Date().toISOString(),
      projectId: project.id,
      endpoints,
      gaps,
      stats: { total: endpoints.length, confirmed, inferred, byMethod }
    });
  }

  return results;
}

function extractEndpoints(filePath: string, content: string, projectId: string): BackendEndpoint[] {
  const endpoints: BackendEndpoint[] = [];
  const lines = content.split('\n');

  if (filePath.toLowerCase().endsWith('.java')) {
    const isController =
      /@(RestController|Controller)\b/.test(content) ||
      /@RequestMapping\b/.test(content);

    if (!isController) {
      return endpoints;
    }

    endpoints.push(...extractJavaEndpoints(filePath, content, projectId, lines));
    return dedupeEndpoints(endpoints);
  }

  endpoints.push(...extractNodeEndpoints(filePath, content, projectId, lines));
  return dedupeEndpoints(endpoints);
}

function extractJavaEndpoints(
  filePath: string,
  content: string,
  projectId: string,
  lines: string[]
): BackendEndpoint[] {
  const endpoints: BackendEndpoint[] = [];

  // Extract class-level @RequestMapping
  const classBaseMatch = content.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*)?["'`]([^"'`]+)["'`]/);
  const classBase = classBaseMatch?.[1] ?? '';
  const controllerClass = extractJavaClassName(content);

  for (const { annotation, method } of MAPPING_PATTERNS) {
    const pattern = new RegExp(
      `@${annotation}\\s*(?:\\(([^)]*?)\\))?\\s*(?:public|protected|private)?\\s+\\w[\\w<>\\[\\],\\s]*\\s+(\\w+)\\s*\\(`,
      'g'
    );

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const args = match[1] ?? '';
      const methodName = match[2];
      const lineNumber = getLineNumber(content, match.index);
      const lineText = lines[lineNumber - 1]?.trim() ?? '';

      // Extract path from annotation args
      const pathMatch = args.match(/(?:value\s*=\s*)?["'`]([^"'`]*)["'`]/);
      const endpointPath = pathMatch?.[1] ?? '';

      // Determine actual HTTP method for @RequestMapping
      let httpMethod = method;
      if (method === 'ANY') {
        const methodMatch = args.match(/method\s*=\s*RequestMethod\.(\w+)/);
        httpMethod = methodMatch?.[1] ?? 'ANY';
      }

      const fullPath = joinPaths(classBase, endpointPath);

      // Skip class-level @RequestMapping (will be used as base only)
      if (annotation === 'RequestMapping' && methodName === undefined) continue;

      endpoints.push({
        projectId,
        controllerFile: filePath,
        controllerClass,
        controllerMethod: methodName,
        httpMethod,
        basePath: classBase,
        path: endpointPath,
        fullPath,
        line: lineNumber,
        confidence: fullPath ? 'CONFIRMED' : 'INFERRED',
        evidence: [lineText.slice(0, 120)]
      });
    }
  }

  return endpoints;
}

function extractNodeEndpoints(
  filePath: string,
  content: string,
  projectId: string,
  lines: string[]
): BackendEndpoint[] {
  const endpoints: BackendEndpoint[] = [];
  const controllerClass = extractJavaClassName(content);
  const classBase = extractNodeClassBase(content);

  for (const descriptor of NODE_ROUTE_PATTERNS) {
    const pattern = new RegExp(descriptor.pattern.source, descriptor.pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const rawMethod = match[descriptor.methodGroup];
      const rawPath = match[descriptor.pathGroup];
      const lineNumber = getLineNumber(content, match.index);
      const lineText = lines[lineNumber - 1]?.trim() ?? '';
      const methodName = descriptor.nameGroup ? match[descriptor.nameGroup] : undefined;

      if (descriptor.label === 'nestjs-decorator' && !rawPath && !classBase) {
        continue;
      }

      const routeSegment = rawPath && rawPath.trim() ? rawPath : inferNodeRoutePathFromFile(filePath);
      const fullPath = joinPaths(classBase, routeSegment);
      endpoints.push({
        projectId,
        controllerFile: filePath,
        controllerClass,
        controllerMethod: methodName,
        httpMethod: normalizeHttpMethod(rawMethod),
        basePath: classBase,
        path: routeSegment,
        fullPath,
        line: lineNumber,
        confidence: fullPath ? 'CONFIRMED' : 'INFERRED',
        evidence: [lineText.slice(0, 120)]
      });
    }
  }

  const nextMethods = [...content.matchAll(/\bexport\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\b/g)];
  if (nextMethods.length > 0) {
    const routePath = inferNodeRoutePathFromFile(filePath);
    for (const match of nextMethods) {
      const lineNumber = getLineNumber(content, match.index ?? 0);
      const lineText = lines[lineNumber - 1]?.trim() ?? '';
      endpoints.push({
        projectId,
        controllerFile: filePath,
        controllerClass,
        controllerMethod: match[1],
        httpMethod: match[1].toUpperCase(),
        basePath: '',
        path: routePath,
        fullPath: routePath,
        line: lineNumber,
        confidence: 'CONFIRMED',
        evidence: [lineText.slice(0, 120)]
      });
    }
  }

  if (endpoints.length === 0) {
    const routePath = inferNodeRoutePathFromFile(filePath);
    if (routePath !== '/') {
      endpoints.push({
        projectId,
        controllerFile: filePath,
        controllerClass,
        httpMethod: 'ANY',
        basePath: '',
        path: routePath,
        fullPath: routePath,
        line: 1,
        confidence: 'INFERRED',
        evidence: [`Route file detected: ${routePath}`]
      });
    }
  }

  return endpoints;
}

function extractJavaClassName(content: string): string | undefined {
  return content.match(/\b(?:class|interface)\s+([A-Za-z_$][\w$]*)/)?.[1];
}

function extractNodeClassBase(content: string): string {
  const controllerMatch = content.match(/@Controller\s*\(\s*(?:['"`]([^'"`]+)['"`])?/);
  return controllerMatch?.[1] ?? '';
}

function joinPaths(base: string, segment: string): string {
  if (!base && !segment) return '/';
  const normalizedBase = normalizePathPart(base);
  const normalizedSegment = normalizePathPart(segment);
  const joined = normalizedBase && normalizedSegment
    ? `${normalizedBase}/${normalizedSegment}`
    : normalizedBase || normalizedSegment || '/';
  return normalizeJoinedPath(joined);
}

function inferNodeRoutePathFromFile(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const apiIndex = normalized.indexOf('/api/');
  if (apiIndex >= 0) {
    const afterApi = filePath.replace(/\\/g, '/').slice(apiIndex + 5).replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
    const trimmed = afterApi.replace(/\/route$/i, '').replace(/\/index$/i, '');
    return `/api/${trimmed}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/api';
  }

  const routesIndex = normalized.indexOf('/routes/');
  if (routesIndex >= 0) {
    const afterRoutes = filePath.replace(/\\/g, '/').slice(routesIndex + 8).replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
    const trimmed = afterRoutes.replace(/\/index$/i, '');
    return `/${trimmed}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  }

  return '/';
}

function normalizeHttpMethod(raw?: string): string {
  if (!raw) return 'ANY';
  return raw.toUpperCase();
}

function normalizePathPart(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function normalizeJoinedPath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/+/g, '/');
  if (normalized === '/') return normalized;
  return normalized.startsWith('/') ? normalized.replace(/\/+$/, '') : `/${normalized.replace(/\/+$/, '')}`;
}

function dedupeEndpoints(endpoints: BackendEndpoint[]): BackendEndpoint[] {
  const seen = new Set<string>();
  const out: BackendEndpoint[] = [];
  for (const endpoint of endpoints) {
    const key = `${endpoint.controllerFile}::${endpoint.httpMethod}::${endpoint.fullPath}::${endpoint.controllerMethod ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(endpoint);
  }
  return out;
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
