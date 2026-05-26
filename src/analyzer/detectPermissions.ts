import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';
import type { EndpointFound } from './detectEndpoints';

export interface PermissionEntry {
  route: string;
  method: string;
  roles: string[];
  file: string;
  line: number;
}

const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.java', '.py', '.cs', '.go', '.rb', '.php']);

export function detectPermissions(files: ScannedFile[], endpoints: EndpointFound[]): PermissionEntry[] {
  const permissions: PermissionEntry[] = [];
  const seen = new Set<string>();

  // Pré-indexar endpoints por arquivo para correlacionar com guards
  const endpointsByFile = new Map<string, EndpointFound[]>();
  for (const ep of endpoints) {
    const arr = endpointsByFile.get(ep.file) ?? [];
    arr.push(ep);
    endpointsByFile.set(ep.file, arr);
  }

  for (const file of files) {
    if (!CODE_EXTS.has(file.extension)) continue;

    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Spring @PreAuthorize / @Secured / @RolesAllowed
      const preAuth = line.match(/@PreAuthorize\s*\(\s*["'](.+?)["']\s*\)/);
      if (preAuth) {
        const nearEndpoint = findNearestEndpoint(lines, i, endpointsByFile.get(file.relativePath) ?? []);
        const roles = extractRolesFromSpEL(preAuth[1]);
        const key = `${file.relativePath}:${i}`;
        if (!seen.has(key)) {
          seen.add(key);
          permissions.push({ route: nearEndpoint?.path ?? '?', method: nearEndpoint?.method ?? 'ANY', roles, file: file.relativePath, line: i + 1 });
        }
      }

      const secured = line.match(/@(?:Secured|RolesAllowed)\s*\(\s*\{?(.+?)\}?\s*\)/);
      if (secured) {
        const roles = secured[1].split(',').map((r) => r.trim().replace(/['"]/g, '').replace(/^ROLE_/, ''));
        const nearEndpoint = findNearestEndpoint(lines, i, endpointsByFile.get(file.relativePath) ?? []);
        const key = `${file.relativePath}:${i}`;
        if (!seen.has(key)) {
          seen.add(key);
          permissions.push({ route: nearEndpoint?.path ?? '?', method: nearEndpoint?.method ?? 'ANY', roles, file: file.relativePath, line: i + 1 });
        }
      }

      // NestJS @Roles(...)
      const nestRoles = line.match(/@Roles\s*\((.+?)\)/);
      if (nestRoles) {
        const roles = nestRoles[1].split(',').map((r) => r.trim().replace(/['"]/g, ''));
        const nearEndpoint = findNearestEndpoint(lines, i, endpointsByFile.get(file.relativePath) ?? []);
        const key = `${file.relativePath}:${i}`;
        if (!seen.has(key)) {
          seen.add(key);
          permissions.push({ route: nearEndpoint?.path ?? '?', method: nearEndpoint?.method ?? 'ANY', roles, file: file.relativePath, line: i + 1 });
        }
      }

      // Express/Node middleware pattern: router.use('/admin', authMiddleware, requireRole('admin'))
      const nodeAuth = line.match(/requireRole\s*\(\s*['"](.+?)['"]\s*\)/);
      if (nodeAuth) {
        const routeMatch = line.match(/(?:router|app)\.\w+\s*\(\s*['"]([^'"]+)['"]/);
        const key = `${file.relativePath}:${i}`;
        if (!seen.has(key)) {
          seen.add(key);
          permissions.push({ route: routeMatch?.[1] ?? '?', method: 'ANY', roles: [nodeAuth[1]], file: file.relativePath, line: i + 1 });
        }
      }
    }
  }

  return permissions.slice(0, 200);
}

function extractRolesFromSpEL(spel: string): string[] {
  const roles: string[] = [];
  const matches = spel.matchAll(/hasRole\s*\(\s*['"]([^'"]+)['"]\s*\)|hasAuthority\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
  for (const m of matches) {
    roles.push((m[1] ?? m[2]).replace(/^ROLE_/, ''));
  }
  return roles.length > 0 ? roles : ['authenticated'];
}

function findNearestEndpoint(lines: string[], fromLine: number, endpoints: EndpointFound[]): EndpointFound | null {
  // Procura endpoint nas próximas 5 linhas
  for (let j = fromLine; j < Math.min(fromLine + 5, lines.length); j++) {
    const ep = endpoints.find((e) => e.line === j + 1);
    if (ep) return ep;
  }
  return null;
}
