/**
 * Zoom-out executivo — fiel à skill `engineering/zoom-out`: sobe a hierarquia
 * de abstração, mapeia módulos, identifica chamadores e usa o vocabulário de
 * domínio (módulos/camadas), nunca nomes de arquivo.
 *
 * Gera `.tic-code/zoom-out.md` com diagrama Mermaid das fronteiras de domínio:
 * camadas como subgraphs, módulos como nós, arestas módulo→módulo com peso.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { GraphEdge } from './buildDependencyGraph';
import type { ProjectModule } from './detectModules';
import { fileLayer } from './store/indexDb';

const MAX_MODULES = 12;
const MAX_EDGES = 15;

export function generateZoomOut(
  ticCodeDir: string,
  projectName: string,
  modules: ProjectModule[],
  edges: GraphEdge[],
  files: Array<{ relativePath: string; extension: string }>
): string {
  const moduleOf = new Map<string, string>();
  for (const m of modules) for (const f of m.files) moduleOf.set(f.relativePath, m.name);

  const top = [...modules].sort((a, b) => b.fileCount - a.fileCount).slice(0, MAX_MODULES);
  const topNames = new Set(top.map((m) => m.name));

  // Camada predominante por módulo (vocabulário de fronteira)
  const layerByModule = new Map<string, string>();
  for (const m of top) {
    const counts: Record<string, number> = { frontend: 0, backend: 0, database: 0 };
    for (const f of m.files) counts[fileLayer(f.relativePath, f.extension)]++;
    layerByModule.set(m.name, Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
  }

  // Arestas módulo×módulo (agregadas em memória)
  const agg = new Map<string, number>();
  for (const e of edges) {
    const fm = moduleOf.get(e.from);
    const tm = moduleOf.get(e.to);
    if (!fm || !tm || fm === tm || !topNames.has(fm) || !topNames.has(tm)) continue;
    const key = `${fm}→${tm}`;
    agg.set(key, (agg.get(key) ?? 0) + 1);
  }
  const topEdges = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_EDGES);

  const nid = (name: string) => name.replace(/[^a-zA-Z0-9]/g, '_');
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

  const byLayer = new Map<string, ProjectModule[]>();
  for (const m of top) {
    const l = layerByModule.get(m.name) ?? 'backend';
    byLayer.set(l, [...(byLayer.get(l) ?? []), m]);
  }

  const lines: string[] = ['flowchart LR'];
  for (const [layer, mods] of byLayer) {
    lines.push(`  subgraph ${layer}`);
    for (const m of mods) lines.push(`    ${nid(m.name)}["${m.name} — ${fmt(m.fileCount)} arquivos"]`);
    lines.push('  end');
  }
  for (const [key, w] of topEdges) {
    const [fm, tm] = key.split('→');
    lines.push(`  ${nid(fm)} -->|${w}| ${nid(tm)}`);
  }

  const md = [
    `# Visão Executiva — ${projectName}`,
    '',
    'Fronteiras de domínio e fluxos principais (vocabulário de módulos, sem arquivos).',
    `${modules.length} módulos no total; mostrando os ${top.length} maiores e os ${topEdges.length} fluxos mais fortes.`,
    '',
    '```mermaid',
    ...lines,
    '```',
    '',
    '| Módulo | Camada | Arquivos | Linguagens |',
    '| --- | --- | --- | --- |',
    ...top.map((m) => `| ${m.name} | ${layerByModule.get(m.name)} | ${m.fileCount.toLocaleString()} | ${m.languages.join(', ')} |`),
    '',
    '> Detalhe de qualquer fronteira: tool MCP `get_zoom_out("<entidade>")` ou aba Explorador.'
  ].join('\n');

  fs.writeFileSync(path.join(ticCodeDir, 'zoom-out.md'), md, 'utf8');
  return md;
}
