/**
 * Vincula arquivos .osw (definições JSON de telas do frontend) aos seus
 * controllers de código — ex.: `kitAssembly.osw` → `KitAssemblyController.tsx`.
 *
 * Duas estratégias, ambas resolvidas contra os arquivos reais do projeto:
 *   1. Convenção de nome: basename PascalCase + sufixo Controller/Component/View
 *   2. Conteúdo: strings do JSON que casam com basename de arquivo de código
 *      ou com classe/símbolo conhecido (ex.: "controller": "KitAssemblyController")
 *
 * As arestas entram no grafo de dependências (kind 'osw-ref') e, por
 * consequência, no grafo de impacto: mudar o controller — ou qualquer coisa
 * que ele alcança no backend/banco — acusa a tela .osw afetada.
 */
import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';
import type { GraphEdge } from './buildDependencyGraph';

const CODE_EXTS = new Set(['.tsx', '.ts', '.jsx', '.js']);
const NAME_SUFFIXES = ['Controller', 'Component', 'View', 'Screen', 'Page'];

export function detectOswLinks(files: ScannedFile[]): GraphEdge[] {
  const oswFiles = files.filter((f) => f.extension === '.osw');
  if (oswFiles.length === 0) return [];

  // basename (sem extensão) → rel_paths de arquivos de código
  const byBasename = new Map<string, string[]>();
  for (const f of files) {
    if (!CODE_EXTS.has(f.extension)) continue;
    const base = (f.relativePath.split('/').pop() ?? '').replace(/\.(tsx|ts|jsx|js)$/, '');
    const arr = byBasename.get(base) ?? [];
    arr.push(f.relativePath);
    byBasename.set(base, arr);
  }

  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const add = (from: string, to: string, confidence: 'resolved' | 'inferred') => {
    const key = `${from}→${to}`;
    if (seen.has(key) || from === to) return;
    seen.add(key);
    edges.push({ from, to, kind: 'osw-ref', confidence });
  };

  for (const osw of oswFiles) {
    const base = (osw.relativePath.split('/').pop() ?? '').replace(/\.osw$/, '');
    const pascal = base.charAt(0).toUpperCase() + base.slice(1);

    // 1. Convenção: kitAssembly.osw → KitAssemblyController/Component/...
    for (const suffix of NAME_SUFFIXES) {
      const targets = byBasename.get(`${pascal}${suffix}`) ?? [];
      for (const t of targets) add(osw.relativePath, t, targets.length === 1 ? 'resolved' : 'inferred');
    }
    // ... e match direto pelo próprio nome (kitAssembly.osw → KitAssembly.tsx)
    for (const t of byBasename.get(pascal) ?? []) add(osw.relativePath, t, 'inferred');

    // 2. Conteúdo: qualquer string do JSON que seja basename de código do projeto
    let content: string;
    try { content = fs.readFileSync(osw.absolutePath, 'utf8'); } catch { continue; }
    for (const name of extractCandidateNames(content)) {
      const targets = byBasename.get(name) ?? [];
      for (const t of targets) add(osw.relativePath, t, targets.length === 1 ? 'resolved' : 'inferred');
    }
  }

  return edges;
}

/** Strings PascalCase do JSON que podem referenciar componentes/controllers. */
function extractCandidateNames(content: string): Set<string> {
  const names = new Set<string>();
  let values: string[] = [];
  try {
    const json = JSON.parse(content);
    collectStrings(json, values);
  } catch {
    // .osw malformado/não-JSON: cai para regex sobre o texto cru
    values = [...content.matchAll(/"([A-Z][A-Za-z0-9_]{2,60})"/g)].map((m) => m[1]);
  }
  for (const v of values) {
    if (/^[A-Z][A-Za-z0-9_]{2,60}$/.test(v)) names.add(v);
  }
  return names;
}

function collectStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 12 || out.length > 5000) return;
  if (typeof value === 'string') { out.push(value); return; }
  if (Array.isArray(value)) { for (const v of value) collectStrings(v, out, depth + 1); return; }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectStrings(v, out, depth + 1);
  }
}
