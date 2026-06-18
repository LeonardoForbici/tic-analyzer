/**
 * Export standalone do grafo — inspirado no `graph.html` e nos callflow exports
 * do graphify. Transforma o nível agregado do grafo (`GraphLevelResult`, a mesma
 * forma que o HierGraphViewer consome) em artefatos compartilháveis FORA do
 * Electron:
 *
 *   - html    → página interativa self-contained (Cytoscape + dagre via CDN),
 *               com botões "Baixar PNG/SVG" que rodam no próprio browser;
 *   - mermaid → diagrama flowchart (subgraphs por camada), reaproveitando o
 *               molde de `generateZoomOut.ts`;
 *   - svg     → SVG estático layered (zero dependência, layout próprio) para
 *               quem precisa de imagem sem abrir browser.
 *
 * Tudo bounded por `queryGraphLevel` (MAX_CHILDREN), então mesmo um projeto de
 * 74k arquivos exporta um diagrama legível.
 */
import * as fs from 'fs';
import * as path from 'path';
import type Database from 'better-sqlite3';
import { queryGraphLevel, type GraphLevelResult, type AggNode } from './store/graphQueries';

export type GraphExportFormat = 'html' | 'mermaid' | 'svg';

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const nid = (id: string) => id.replace(/[^a-zA-Z0-9]/g, '_');
const layerOf = (n: AggNode) => n.layer ?? (n.kind === 'layer' ? n.label : n.kind);

// ── HTML interativo self-contained ──────────────────────────────────────────

export function renderGraphHtml(level: GraphLevelResult, projectName: string): string {
  const elements = {
    nodes: level.nodes.map((n) => ({
      data: { id: n.id, label: n.label, kind: n.kind, role: n.role ?? '', layer: n.layer ?? '',
        deg: n.inWeight + n.outWeight }
    })),
    edges: level.edges.map((e) => ({
      data: { id: `${e.from}__${e.to}`, source: e.from, target: e.to, weight: e.weight,
        cls: e.resolvedWeight >= e.weight / 2 ? 'ast' : 'heuristic' }
    }))
  };
  const DATA = JSON.stringify(elements);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Grafo — ${esc(projectName)}</title>
<script src="https://cdn.jsdelivr.net/npm/cytoscape@3.30.2/dist/cytoscape.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/dagre@0.8.5/dist/dagre.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/cytoscape-dagre@2.5.0/cytoscape-dagre.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/cytoscape-svg@0.4.0/cytoscape-svg.min.js"></script>
<style>
  html,body{margin:0;height:100%;background:#04121f;color:#e2e8f0;font-family:Inter,system-ui,sans-serif}
  #cy{position:absolute;inset:0;top:48px}
  #bar{position:absolute;top:0;left:0;right:0;height:48px;display:flex;align-items:center;gap:12px;padding:0 16px;background:#06192b;border-bottom:1px solid #0e2a45;z-index:10}
  #bar b{font-size:14px}#bar .muted{color:#64748b;font-size:12px}
  button{background:#0e2a45;color:#e2e8f0;border:1px solid #1e4060;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:12px}
  button:hover{background:#143452}
</style>
</head><body>
<div id="bar">
  <b>${esc(projectName)}</b>
  <span class="muted">${level.nodes.length} nós · ${level.edges.length} arestas — grafo de impacto (TIC Analyzer)</span>
  <span style="flex:1"></span>
  <button id="png">Baixar PNG</button>
  <button id="svg">Baixar SVG</button>
</div>
<div id="cy"></div>
<script>
const DATA = ${DATA};
const cy = cytoscape({
  container: document.getElementById('cy'),
  elements: DATA,
  style: [
    { selector: 'node', style: { 'background-color':'#f5b042','border-color':'#ffd07a','border-width':1.5,
      'label':'data(label)','color':'#e2e8f0','font-size':10,'text-valign':'center','text-halign':'right',
      'text-margin-x':8,'text-max-width':'140px','text-background-color':'#04203a','text-background-opacity':0.55,
      'text-background-padding':3,'text-background-shape':'roundrectangle','width':13,'height':13 } },
    { selector: 'node[kind = "layer"]', style: { 'width':28,'height':28,'background-color':'#ffd07a','font-weight':700,'font-size':12 } },
    { selector: 'node[kind = "module"]', style: { 'width':20,'height':20 } },
    { selector: 'node[kind = "file"]', style: { 'width':11,'height':11,'background-color':'#d99a3a' } },
    { selector: 'node[kind = "symbol"]', style: { 'width':8,'height':8,'background-color':'#9d8cff' } },
    { selector: 'node[role = "Controller"]', style: { 'background-color':'#60a5fa','shape':'round-rectangle' } },
    { selector: 'node[role = "Service"]', style: { 'background-color':'#4edea3' } },
    { selector: 'node[role = "Repository"]', style: { 'background-color':'#c084fc' } },
    { selector: 'node[role = "Entity"]', style: { 'background-color':'#f97316','shape':'diamond' } },
    { selector: 'edge', style: { 'curve-style':'bezier','line-color':'rgba(255,255,255,0.22)','width':'mapData(weight,1,50,0.6,4)','opacity':0.6 } },
    { selector: 'edge[cls = "heuristic"]', style: { 'line-color':'rgba(255,185,95,0.25)','line-style':'dashed' } }
  ],
  layout: { name: 'dagre', rankDir: 'LR', nodeSep: 22, rankSep: 80, animate: false },
  minZoom: 0.05, maxZoom: 4
});
function dl(name, uri){ const a=document.createElement('a'); a.href=uri; a.download=name; a.click(); }
document.getElementById('png').onclick = () => dl('grafo.png', cy.png({ full:true, scale:2, bg:'#04121f' }));
document.getElementById('svg').onclick = () => { const s = cy.svg ? cy.svg({ full:true, bg:'#04121f' }) : ''; dl('grafo.svg', 'data:image/svg+xml;utf8,'+encodeURIComponent(s)); };
</script>
</body></html>`;
}

// ── Mermaid flowchart (subgraphs por camada) ────────────────────────────────

export function renderGraphMermaid(level: GraphLevelResult, _projectName: string): string {
  const byLayer = new Map<string, AggNode[]>();
  for (const n of level.nodes) {
    const l = layerOf(n);
    byLayer.set(l, [...(byLayer.get(l) ?? []), n]);
  }
  const lines: string[] = ['flowchart LR'];
  for (const [layer, nodes] of byLayer) {
    lines.push(`  subgraph ${nid(layer)}["${layer}"]`);
    for (const n of nodes) lines.push(`    ${nid(n.id)}["${n.label.replace(/"/g, "'")}"]`);
    lines.push('  end');
  }
  for (const e of level.edges) {
    lines.push(`  ${nid(e.from)} -->|${e.weight}| ${nid(e.to)}`);
  }
  return lines.join('\n');
}

// ── SVG estático layered (sem dependência, layout próprio) ───────────────────

export function renderGraphSvg(level: GraphLevelResult, projectName: string): string {
  // Colunas por camada (frontend→backend→database→outras), nós empilhados.
  const order: Record<string, number> = { frontend: 0, backend: 1, database: 2 };
  const columns = new Map<string, AggNode[]>();
  for (const n of level.nodes) {
    const key = layerOf(n);
    columns.set(key, [...(columns.get(key) ?? []), n]);
  }
  const colKeys = [...columns.keys()].sort((a, b) => (order[a] ?? 9) - (order[b] ?? 9) || a.localeCompare(b));
  const COL_W = 260, ROW_H = 34, PAD = 40, NODE_W = 200, NODE_H = 22;
  const maxRows = Math.max(1, ...colKeys.map((k) => columns.get(k)!.length));
  const width = PAD * 2 + colKeys.length * COL_W;
  const height = PAD * 2 + 30 + maxRows * ROW_H;

  const pos = new Map<string, { x: number; y: number }>();
  colKeys.forEach((k, ci) => {
    columns.get(k)!.forEach((n, ri) => {
      pos.set(n.id, { x: PAD + ci * COL_W, y: PAD + 30 + ri * ROW_H });
    });
  });

  const edgeSvg = level.edges
    .map((e) => {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a || !b) return '';
      const stroke = e.resolvedWeight >= e.weight / 2 ? 'rgba(255,255,255,0.30)' : 'rgba(255,185,95,0.35)';
      const dash = e.resolvedWeight >= e.weight / 2 ? '' : ' stroke-dasharray="4 3"';
      const w = Math.min(4, 0.6 + Math.log1p(e.weight) * 0.6);
      return `<line x1="${(a.x + NODE_W).toFixed(0)}" y1="${(a.y + NODE_H / 2).toFixed(0)}" x2="${b.x.toFixed(0)}" y2="${(b.y + NODE_H / 2).toFixed(0)}" stroke="${stroke}" stroke-width="${w.toFixed(1)}"${dash}/>`;
    })
    .join('');

  const roleColor: Record<string, string> = { Controller: '#60a5fa', Service: '#4edea3', Repository: '#c084fc', Entity: '#f97316' };
  const nodeSvg = level.nodes
    .map((n) => {
      const p = pos.get(n.id)!;
      const fill = roleColor[n.role ?? ''] ?? (n.kind === 'layer' ? '#ffd07a' : n.kind === 'symbol' ? '#9d8cff' : '#f5b042');
      const label = n.label.length > 26 ? n.label.slice(0, 25) + '…' : n.label;
      return `<g><rect x="${p.x}" y="${p.y}" rx="5" width="${NODE_W}" height="${NODE_H}" fill="${fill}" fill-opacity="0.85"/>` +
        `<text x="${p.x + 8}" y="${p.y + 15}" font-size="11" fill="#04121f" font-family="Inter,system-ui,sans-serif">${esc(label)}</text></g>`;
    })
    .join('');

  const colLabels = colKeys
    .map((k, ci) => `<text x="${PAD + ci * COL_W}" y="${PAD}" font-size="13" font-weight="700" fill="#94a3b8" font-family="Inter,system-ui,sans-serif">${esc(k)}</text>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="#04121f"/>
<text x="${PAD}" y="22" font-size="14" font-weight="700" fill="#e2e8f0" font-family="Inter,system-ui,sans-serif">${esc(projectName)} — grafo de impacto</text>
${colLabels}
${edgeSvg}
${nodeSvg}
</svg>`;
}

// ── Orquestração ─────────────────────────────────────────────────────────────

export interface ExportGraphOptions {
  format: GraphExportFormat;
  /** Ids expandidos passados a queryGraphLevel (default: nível topo, layers+módulos). */
  expanded?: string[];
  /** Caminho de saída (default: .tic-code/graph.<ext>). */
  out?: string;
}

const EXT: Record<GraphExportFormat, string> = { html: 'html', mermaid: 'mmd', svg: 'svg' };

export function exportGraphFiles(db: Database.Database, ticCodeDir: string, opts: ExportGraphOptions): { path: string } {
  const projectName = path.basename(path.dirname(ticCodeDir));
  const level = queryGraphLevel(db, { expanded: opts.expanded ?? [] });
  const content =
    opts.format === 'html' ? renderGraphHtml(level, projectName)
    : opts.format === 'mermaid' ? renderGraphMermaid(level, projectName)
    : renderGraphSvg(level, projectName);
  const out = opts.out ?? path.join(ticCodeDir, `graph.${EXT[opts.format]}`);
  fs.writeFileSync(out, content, 'utf8');
  return { path: out };
}
