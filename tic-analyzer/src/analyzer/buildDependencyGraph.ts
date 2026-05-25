import * as fs from 'fs';
import * as path from 'path';
import type { ScannedFile } from './scanFiles';

export interface GraphNode {
  id: string;
  path: string;
  inDegree: number;  // quantos outros arquivos importam este
  outDegree: number; // quantos arquivos este importa
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centralFiles: string[]; // top arquivos mais referenciados
  externalDeps: string[];
}

/** Constrói grafo de dependências por análise de imports (sem executar o código) */
export function buildDependencyGraph(files: ScannedFile[], rootPath: string): DependencyGraph {
  const fileSet = new Set(files.map((f) => f.relativePath));
  const edges: GraphEdge[] = [];
  const inDegree: Record<string, number> = {};
  const outDegree: Record<string, number> = {};
  const externalDepsSet = new Set<string>();

  // Inicializa contadores
  for (const f of files) {
    inDegree[f.relativePath] = 0;
    outDegree[f.relativePath] = 0;
  }

  const codeExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.java', '.py', '.go', '.cs', '.rs', '.php']);

  for (const file of files) {
    if (!codeExts.has(file.extension)) continue;

    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }

    const imports = extractImports(content, file.extension);

    for (const imp of imports) {
      if (imp.startsWith('.')) {
        // Import relativo — resolve para caminho relativo do root
        const dir = path.dirname(file.absolutePath);
        const resolved = path.resolve(dir, imp).replace(/\\/g, '/');
        const rel = path.relative(rootPath, resolved).replace(/\\/g, '/');

        // Tenta com e sem extensão
        const candidates = [rel, `${rel}.ts`, `${rel}.tsx`, `${rel}.js`, `${rel}.jsx`, `${rel}/index.ts`, `${rel}/index.js`];
        const found = candidates.find((c) => fileSet.has(c));

        if (found && found !== file.relativePath) {
          edges.push({ from: file.relativePath, to: found });
          outDegree[file.relativePath] = (outDegree[file.relativePath] ?? 0) + 1;
          inDegree[found] = (inDegree[found] ?? 0) + 1;
        }
      } else if (!imp.startsWith('/')) {
        // Dependência externa (npm package, etc.)
        const pkg = imp.startsWith('@') ? imp.split('/').slice(0, 2).join('/') : imp.split('/')[0];
        if (pkg) externalDepsSet.add(pkg);
      }
    }
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
    edges: edges.slice(0, 10_000), // limita arestas para não explodir memória
    centralFiles,
    externalDeps: [...externalDepsSet].sort().slice(0, 100)
  };
}

function extractImports(content: string, ext: string): string[] {
  const imports: string[] = [];

  if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) {
    // ES Modules: import ... from '...' / import('...')
    const esm = content.matchAll(/(?:import|from)\s+['"]([^'"]+)['"]/g);
    for (const m of esm) if (m[1]) imports.push(m[1]);
    // require('...')
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
