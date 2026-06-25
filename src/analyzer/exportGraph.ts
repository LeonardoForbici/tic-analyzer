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

export type GraphExportFormat = 'html' | 'mermaid' | 'svg' | 'galaxy';

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

// ── Galaxy — visualização constelação espacial (D3 standalone) ───────────────

export function renderGraphGalaxy(level: GraphLevelResult, projectName: string): string {
  // Expand module children so the galaxy has files to show as constellations
  const mods = level.nodes.filter(n => n.kind === 'module' || n.kind === 'layer');
  const files = level.nodes.filter(n => ['file', 'plsql', 'table', 'symbol'].includes(n.kind));
  // Build parent→children map from edges
  const childMapRaw: Record<string, string[]> = {};
  for (const e of level.edges) {
    if (!childMapRaw[e.from]) childMapRaw[e.from] = [];
    childMapRaw[e.from].push(e.to);
  }
  const fileSet = new Set(files.map(n => n.id));
  const nodeIndex: Record<string, typeof level.nodes[0]> = {};
  for (const n of level.nodes) nodeIndex[n.id] = n;

  const galaxyData = {
    projectName,
    modules: mods.slice(0, 22).map(m => ({
      id: m.id, label: m.label, layer: m.layer ?? '',
      files: (childMapRaw[m.id] ?? [])
        .filter(id => fileSet.has(id))
        .slice(0, 18)
        .map(id => {
          const n = nodeIndex[id];
          return { id, label: n?.label ?? id, weight: (n?.inWeight ?? 0) + (n?.outWeight ?? 0) };
        })
        .sort((a, b) => b.weight - a.weight),
    })),
  };
  const DATA = JSON.stringify(galaxyData);

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Galaxy — ${esc(projectName)}</title>
<script src="https://d3js.org/d3.v7.min.js"></script>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:radial-gradient(circle at center,#101216 0%,#050608 100%);color:#fff;font-family:'Inter',system-ui,sans-serif;overflow:hidden;height:100vh;cursor:grab}
  body:active{cursor:grabbing}
  body::before{content:"";position:absolute;width:100%;height:100%;
    background-image:radial-gradient(white,rgba(255,255,255,.2) 2px,transparent 40px),radial-gradient(white,rgba(255,255,255,.15) 1px,transparent 30px);
    background-size:550px 550px,350px 350px;background-position:0 0,40px 60px;opacity:.18;pointer-events:none}
  #app{width:100vw;height:100vh;position:relative}
  svg{width:100%;height:100%}
  #header{position:absolute;top:20px;left:50%;transform:translateX(-50%);
    background:rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.1);
    padding:10px 22px;border-radius:6px;font-size:13px;text-align:center;
    pointer-events:none;white-space:nowrap;box-shadow:0 10px 30px rgba(0,0,0,.5)}
  #reset{position:absolute;bottom:36px;left:50%;transform:translateX(-50%);
    background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.2);color:#fff;
    padding:8px 22px;border-radius:4px;cursor:pointer;font-size:11px;letter-spacing:1px;
    text-transform:uppercase;display:none;transition:.2s}
  #reset:hover{background:rgba(255,255,255,.13)}
  #watermark{position:absolute;bottom:18%;width:100%;text-align:center;
    font-size:52px;font-weight:900;color:rgba(255,255,255,.04);letter-spacing:14px;
    pointer-events:none;display:none}
  .link{stroke:rgba(255,255,255,.15);stroke-width:1.2px;fill:none}
</style>
</head><body>
<div id="app">
  <div id="header">${esc(projectName)} — ${mods.length} módulos · grafo constelação (TIC Analyzer)</div>
  <div id="watermark"></div>
  <button id="reset">Ver Visão Geral</button>
  <svg id="svg"></svg>
</div>
<script>
const RAW = ${DATA};
const LAYER_CLR = {frontend:'#00dbe9',backend:'#e8b84b',database:'#b48ead'};
const FILE_DIST = 62, FLOAT_DIST = 5, SPEED = 0.0015, ZOOM_SCALE = 2.2;
function modColor(l){return LAYER_CLR[l]||'#81a1c1';}
function glowId(l){return 'gg-'+(LAYER_CLR[l]?l:'def');}

const svgEl = document.getElementById('svg');
const W = window.innerWidth, H = window.innerHeight, cx = W/2, cy = H/2;
const svg = d3.select(svgEl).attr('width',W).attr('height',H);

const zoom = d3.zoom().scaleExtent([0.3,4]).on('zoom',e=>mainG.attr('transform',e.transform));
svg.call(zoom);

const defs = svg.append('defs');
[{id:'gg-frontend',s:6},{id:'gg-backend',s:6},{id:'gg-database',s:6},{id:'gg-def',s:3}].forEach(({id,s})=>{
  const f=defs.append('filter').attr('id',id).attr('x','-50%').attr('y','-50%').attr('width','200%').attr('height','200%');
  f.append('feGaussianBlur').attr('stdDeviation',s).attr('result','b');
  const m=f.append('feMerge');m.append('feMergeNode').attr('in','b');m.append('feMergeNode').attr('in','SourceGraphic');
});

const mainG = svg.append('g');
const orbitR = Math.min(cx,cy)*0.52;
[orbitR*.38,orbitR*.7,orbitR,orbitR*1.35].forEach(r=>{
  mainG.append('circle').attr('cx',cx).attr('cy',cy).attr('r',r).attr('fill','none').attr('stroke','rgba(255,255,255,.03)').attr('stroke-width',1);
});

// Nebula
const neb = Array.from({length:80},(_,i)=>({
  x:cx+((i*7919)%100/100-.5)*60, y:cy+((i*6271)%100/100-.5)*60,
  r:(i*3)%15/10+.5, o:(i*1.37)%(Math.PI*2)
}));
const nebEls = mainG.append('g').selectAll('circle').data(neb).enter().append('circle')
  .attr('cx',d=>d.x).attr('cy',d=>d.y).attr('r',d=>d.r)
  .attr('fill','#ebcb8b').attr('opacity',(_,i)=>0.2+(i%5)*0.1);

// Build gnodes + glinks
const gnodes=[], glinks=[];
const mods = RAW.modules;
mods.forEach((mod,i)=>{
  const angle = (i/mods.length)*Math.PI*2 - Math.PI/2;
  const x=cx+Math.cos(angle)*orbitR, y=cy+Math.sin(angle)*orbitR;
  const gn={id:mod.id,label:mod.label,x,y,isModule:true,r:14,color:modColor(mod.layer),glow:glowId(mod.layer),angle,floatOffset:0,layer:mod.layer};
  gnodes.push(gn);
  const N=mod.files.length;
  mod.files.forEach((f,j)=>{
    const spread=Math.min(Math.PI*.9,.18*Math.sqrt(N+1));
    const a=angle+(j-(N-1)/2)*(spread/Math.max(1,N-1));
    const dist=FILE_DIST+(j%3)*12;
    const fx=x+Math.cos(a)*dist, fy=y+Math.sin(a)*dist;
    const w=f.weight, r=Math.max(3,Math.min(6,2+Math.log1p(w)*.7));
    const seed=f.id.split('').reduce((s,c)=>s+c.charCodeAt(0),0);
    const fg={id:f.id,label:f.label,x:fx,y:fy,isModule:false,r,color:'#fff',glow:'none',angle:a,floatOffset:(seed*.37)%(Math.PI*2)};
    gnodes.push(fg);
    glinks.push({src:gn,tgt:fg});
  });
});

const linkEls = mainG.append('g').selectAll('line').data(glinks).enter().append('line')
  .attr('class','link').attr('x1',d=>d.src.x).attr('y1',d=>d.src.y).attr('x2',d=>d.tgt.x).attr('y2',d=>d.tgt.y);

const nodeEls = mainG.append('g').selectAll('g').data(gnodes).enter().append('g')
  .attr('transform',d=>'translate('+d.x+','+d.y+')');
nodeEls.append('circle').attr('class','core').attr('r',d=>d.r).attr('fill',d=>d.color)
  .style('filter',d=>d.glow!=='none'?'url(#'+d.glow+')':'none')
  .style('cursor',d=>d.isModule?'pointer':'default');
nodeEls.filter(d=>d.isModule).append('circle').attr('r',20).attr('fill','none')
  .attr('stroke',d=>d.color).attr('stroke-width',1).attr('opacity',.35);
nodeEls.filter(d=>d.isModule).append('text')
  .attr('y',d=>Math.sin(d.angle)>=0?38:-30).attr('text-anchor','middle')
  .attr('fill','rgba(255,255,255,.85)').attr('font-family','Inter,system-ui,sans-serif')
  .attr('font-size',11).attr('letter-spacing',2).attr('pointer-events','none')
  .text(d=>d.label.toUpperCase().slice(0,16));

nodeEls.on('mouseover',function(_,d){d3.select(this).select('.core').transition().duration(200).attr('r',d.r+(d.isModule?4:2));})
       .on('mouseout',function(_,d){d3.select(this).select('.core').transition().duration(200).attr('r',d.r);});

const wm=document.getElementById('watermark'), rst=document.getElementById('reset');
nodeEls.filter(d=>d.isModule).on('click',(_,d)=>{
  const tx=W/2-d.x*ZOOM_SCALE, ty=H*.75-d.y*ZOOM_SCALE;
  svg.transition().duration(1000).ease(d3.easeCubicInOut)
    .call(zoom.transform,d3.zoomIdentity.translate(tx,ty).scale(ZOOM_SCALE));
  wm.textContent=d.label.toUpperCase(); wm.style.display='block'; rst.style.display='block';
});
rst.onclick=()=>{
  svg.transition().duration(800).ease(d3.easeCubicInOut).call(zoom.transform,d3.zoomIdentity);
  wm.style.display='none'; rst.style.display='none';
};

d3.timer(t=>{
  nodeEls.attr('transform',d=>{
    if(d.isModule) return 'translate('+d.x+','+d.y+')';
    const fx=d.x+Math.sin(t*SPEED+d.floatOffset)*FLOAT_DIST;
    const fy=d.y+Math.cos(t*SPEED*1.3+d.floatOffset)*FLOAT_DIST;
    return 'translate('+fx+','+fy+')';
  });
  linkEls
    .attr('x1',d=>d.src.x).attr('y1',d=>d.src.y)
    .attr('x2',d=>d.tgt.isModule?d.tgt.x:d.tgt.x+Math.sin(t*SPEED+d.tgt.floatOffset)*FLOAT_DIST)
    .attr('y2',d=>d.tgt.isModule?d.tgt.y:d.tgt.y+Math.cos(t*SPEED*1.3+d.tgt.floatOffset)*FLOAT_DIST);
  nebEls.attr('cx',d=>d.x+Math.sin(t*.0005+d.o)*15).attr('cy',d=>d.y+Math.cos(t*.0007+d.o)*15);
});
</script>
</body></html>`;
}

// ── Orquestração ─────────────────────────────────────────────────────────────

export interface ExportGraphOptions {
  format: GraphExportFormat;
  /** Ids expandidos passados a queryGraphLevel (default: nível topo, layers+módulos). */
  expanded?: string[];
  /** Caminho de saída (default: .tic-code/graph.<ext>). */
  out?: string;
}

const EXT: Record<GraphExportFormat, string> = { html: 'html', mermaid: 'mmd', svg: 'svg', galaxy: 'html' };

export function exportGraphFiles(db: Database.Database, ticCodeDir: string, opts: ExportGraphOptions): { path: string } {
  const projectName = path.basename(path.dirname(ticCodeDir));

  // Galaxy: expand all modules so the visualization has file-level constellation nodes
  const expanded = opts.expanded ?? [];
  const topLevel = queryGraphLevel(db, { expanded: [] });
  const modIds = topLevel.nodes.filter(n => n.kind === 'module' || n.kind === 'layer').map(n => n.id).slice(0, 22);
  const level = opts.format === 'galaxy'
    ? queryGraphLevel(db, { expanded: modIds })
    : queryGraphLevel(db, { expanded });

  const content =
    opts.format === 'html' ? renderGraphHtml(level, projectName)
    : opts.format === 'mermaid' ? renderGraphMermaid(level, projectName)
    : opts.format === 'galaxy' ? renderGraphGalaxy(level, projectName)
    : renderGraphSvg(level, projectName);
  const outName = opts.format === 'galaxy' ? 'galaxy' : 'graph';
  const out = opts.out ?? path.join(ticCodeDir, `${outName}.${EXT[opts.format]}`);
  fs.writeFileSync(out, content, 'utf8');
  return { path: out };
}
