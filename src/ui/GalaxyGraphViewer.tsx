import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface AggNode {
  id: string; label: string;
  kind: 'layer' | 'module' | 'file' | 'symbol' | 'more' | 'plsql' | 'table' | 'column' | 'method';
  layer?: string; role?: string;
  childCount: number; inWeight: number; outWeight: number;
}
interface AggEdge { from: string; to: string; weight: number; resolvedWeight: number; via?: string; }
interface LevelData { nodes: AggNode[]; edges: AggEdge[]; error?: string; }

const GRAPH_H = 580;
const MAX_MODS = 22;
const MAX_FILES = 18;
const FILE_DIST = 62;
const ZOOM_SCALE = 2.2;
const FLOAT_DIST = 5;
const SPEED = 0.0015;

const LAYER_CLR: Record<string, string> = {
  frontend: '#00dbe9',
  backend: '#e8b84b',
  database: '#b48ead',
};
function modColor(layer?: string) { return LAYER_CLR[layer ?? ''] ?? '#81a1c1'; }
function glowId(layer?: string) { return `galaxy-glow-${LAYER_CLR[layer ?? ''] ? layer : 'default'}`; }

interface GNode {
  id: string; label: string; x: number; y: number;
  isModule: boolean; r: number; color: string; glow: string;
  angle: number; floatOffset: number; layer?: string;
}
interface GLink { src: GNode; tgt: GNode; }

function buildGraph(nodes: AggNode[], edges: AggEdge[], cx: number, cy: number): { gnodes: GNode[]; glinks: GLink[] } {
  const mods = nodes.filter(n => n.kind === 'module' || n.kind === 'layer').slice(0, MAX_MODS);
  const fileIds = new Set(nodes.filter(n => ['file', 'plsql', 'table', 'symbol'].includes(n.kind)).map(n => n.id));
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  // parent → child file ids
  const childMap = new Map<string, string[]>();
  for (const e of edges) {
    if (!childMap.has(e.from)) childMap.set(e.from, []);
    childMap.get(e.from)!.push(e.to);
  }

  const gnodes: GNode[] = [];
  const glinks: GLink[] = [];
  const gById = new Map<string, GNode>();

  const orbitR = Math.min(cx, cy) * 0.52;

  mods.forEach((mod, i) => {
    const angle = (i / mods.length) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(angle) * orbitR;
    const y = cy + Math.sin(angle) * orbitR;
    const gn: GNode = {
      id: mod.id, label: mod.label, x, y,
      isModule: true, r: 14,
      color: modColor(mod.layer),
      glow: glowId(mod.layer),
      angle,
      floatOffset: 0,
      layer: mod.layer,
    };
    gnodes.push(gn);
    gById.set(mod.id, gn);
  });

  for (const mod of gnodes) {
    const childIds = (childMap.get(mod.id) ?? [])
      .filter(id => fileIds.has(id))
      .slice(0, MAX_FILES);
    const children = childIds
      .map(id => nodeById.get(id)!)
      .filter(Boolean)
      .sort((a, b) => (b.inWeight + b.outWeight) - (a.inWeight + a.outWeight));

    const N = children.length;
    children.forEach((child, j) => {
      const spread = Math.min(Math.PI * 0.9, 0.18 * Math.sqrt(N + 1));
      const angle = mod.angle + (j - (N - 1) / 2) * (spread / Math.max(1, N - 1));
      const dist = FILE_DIST + (j % 3) * 12;
      const x = mod.x + Math.cos(angle) * dist;
      const y = mod.y + Math.sin(angle) * dist;
      const w = child.inWeight + child.outWeight;
      const r = Math.max(3, Math.min(6, 2 + Math.log1p(w) * 0.7));
      const seed = child.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const gn: GNode = {
        id: child.id, label: child.label, x, y,
        isModule: false, r,
        color: '#ffffff',
        glow: 'none',
        angle, floatOffset: (seed * 0.37) % (Math.PI * 2),
        layer: child.layer,
      };
      gnodes.push(gn);
      gById.set(child.id, gn);
      glinks.push({ src: mod, tgt: gn });
    });
  }

  return { gnodes, glinks };
}

export function GalaxyGraphViewer({ projectPath }: { projectPath: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<d3.Timer | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [zoomedModule, setZoomedModule] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LevelData | null>(null);
  const [w, setW] = useState(900);

  // Measure wrapper width
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width || 900));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Draw star field canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = w;
    canvas.height = GRAPH_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let s = 0x9e3779b9;
    const rng = () => { s ^= s << 13; s ^= s >> 7; s ^= s << 17; return (s >>> 0) / 0xffffffff; };
    const N = Math.round((w * GRAPH_H) / 3200);
    ctx.clearRect(0, 0, w, GRAPH_H);
    for (let i = 0; i < N; i++) {
      const x = rng() * w, y = rng() * GRAPH_H;
      const r = rng() < 0.15 ? 1.5 : rng() < 0.5 ? 1.1 : 0.7;
      const alpha = 0.12 + rng() * 0.28;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,200,240,${alpha.toFixed(2)})`;
      ctx.fill();
    }
  }, [w]);

  // Fetch data: top-level → expand all modules
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);
    (window.ticAnalyzer.getGraphLevel(projectPath, []) as Promise<LevelData>).then(async (top) => {
      if (!alive) return;
      const modIds = top.nodes.filter(n => n.kind === 'module' || n.kind === 'layer').map(n => n.id).slice(0, MAX_MODS);
      if (modIds.length === 0) { setData(top); setLoading(false); return; }
      const expanded = await (window.ticAnalyzer.getGraphLevel(projectPath, modIds) as Promise<LevelData>);
      if (!alive) return;
      setData(expanded);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [projectPath]);

  // Initialize D3 galaxy
  useEffect(() => {
    if (!data || !svgRef.current) return;

    const svgEl = svgRef.current;
    if (timerRef.current) { timerRef.current.stop(); timerRef.current = null; }
    d3.select(svgEl).selectAll('*').remove();

    const svgW = svgEl.clientWidth || w || 900;
    const svgH = GRAPH_H;
    const cx = svgW / 2, cy = svgH / 2;

    const svg = d3.select(svgEl);

    // Zoom behavior
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on('zoom', (event) => mainGroup.attr('transform', event.transform));
    svg.call(zoomBehavior);
    zoomRef.current = zoomBehavior;

    // Glow filters
    const defs = svg.append('defs');
    [
      { id: 'galaxy-glow-frontend', stdDev: 6 },
      { id: 'galaxy-glow-backend',  stdDev: 6 },
      { id: 'galaxy-glow-database', stdDev: 6 },
      { id: 'galaxy-glow-default',  stdDev: 3 },
    ].forEach(({ id, stdDev }) => {
      const f = defs.append('filter').attr('id', id)
        .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
      f.append('feGaussianBlur').attr('stdDeviation', stdDev).attr('result', 'blur');
      const m = f.append('feMerge');
      m.append('feMergeNode').attr('in', 'blur');
      m.append('feMergeNode').attr('in', 'SourceGraphic');
    });

    const mainGroup = svg.append('g');

    // Orbit rings
    const orbitR = Math.min(cx, cy) * 0.52;
    [orbitR * 0.38, orbitR * 0.7, orbitR, orbitR * 1.35].forEach(r => {
      mainGroup.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r)
        .attr('fill', 'none').attr('stroke', 'rgba(255,255,255,0.03)').attr('stroke-width', 1);
    });

    // Central nebula
    const nebulaData = Array.from({ length: 80 }, (_, i) => ({
      x: cx + (((i * 7919) % 100) / 100 - 0.5) * 60,
      y: cy + (((i * 6271) % 100) / 100 - 0.5) * 60,
      r: ((i * 3) % 15) / 10 + 0.5,
      offset: (i * 1.37) % (Math.PI * 2),
    }));
    const nebulaEls = mainGroup.append('g').selectAll('circle')
      .data(nebulaData).enter().append('circle')
      .attr('cx', d => d.x).attr('cy', d => d.y).attr('r', d => d.r)
      .attr('fill', '#ebcb8b')
      .attr('opacity', (_, i) => 0.2 + (i % 5) * 0.1);

    // Build visual graph
    const { gnodes, glinks } = buildGraph(data.nodes, data.edges, cx, cy);

    // Links
    const linkEls = mainGroup.append('g').selectAll<SVGLineElement, GLink>('line')
      .data(glinks).enter().append('line')
      .attr('stroke', 'rgba(255,255,255,0.15)')
      .attr('stroke-width', 1.2)
      .attr('x1', d => d.src.x).attr('y1', d => d.src.y)
      .attr('x2', d => d.tgt.x).attr('y2', d => d.tgt.y);

    // Node groups
    const nodeEls = mainGroup.append('g').selectAll<SVGGElement, GNode>('.gal-node')
      .data(gnodes).enter().append('g')
      .attr('class', 'gal-node')
      .attr('transform', d => `translate(${d.x},${d.y})`);

    // Core circle
    nodeEls.append('circle').attr('class', 'core')
      .attr('r', d => d.r)
      .attr('fill', d => d.color)
      .style('filter', d => d.glow !== 'none' ? `url(#${d.glow})` : 'none')
      .style('cursor', d => d.isModule ? 'pointer' : 'default');

    // Decorative ring on modules
    nodeEls.filter(d => d.isModule).append('circle')
      .attr('r', 20).attr('fill', 'none')
      .attr('stroke', d => d.color).attr('stroke-width', 1).attr('opacity', 0.35);

    // Module labels
    nodeEls.filter(d => d.isModule).append('text')
      .attr('y', d => Math.sin(d.angle) >= 0 ? 38 : -30)
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(255,255,255,0.85)')
      .attr('font-family', 'Inter, system-ui, sans-serif')
      .attr('font-size', 11).attr('letter-spacing', 2)
      .attr('pointer-events', 'none')
      .text(d => d.label.toUpperCase().slice(0, 16));

    // Hover
    nodeEls
      .on('mouseover', function(_event, d) {
        d3.select(this).select('.core').transition().duration(200).attr('r', d.r + (d.isModule ? 4 : 2));
      })
      .on('mouseout', function(_event, d) {
        d3.select(this).select('.core').transition().duration(200).attr('r', d.r);
      });

    // Click → zoom camera to module
    nodeEls.filter(d => d.isModule).on('click', (_event, d) => {
      const scale = ZOOM_SCALE;
      const tx = svgW / 2 - d.x * scale;
      const ty = svgH * 0.75 - d.y * scale;
      svg.transition().duration(1000).ease(d3.easeCubicInOut)
        .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
      setZoomedModule(d.label);
    });

    // Breathing animation
    timerRef.current = d3.timer((elapsed) => {
      nodeEls.attr('transform', (d: GNode) => {
        if (d.isModule) return `translate(${d.x},${d.y})`;
        const fx = d.x + Math.sin(elapsed * SPEED + d.floatOffset) * FLOAT_DIST;
        const fy = d.y + Math.cos(elapsed * SPEED * 1.3 + d.floatOffset) * FLOAT_DIST;
        return `translate(${fx},${fy})`;
      });
      linkEls
        .attr('x1', (d: GLink) => d.src.x)
        .attr('y1', (d: GLink) => d.src.y)
        .attr('x2', (d: GLink) => {
          if (d.tgt.isModule) return d.tgt.x;
          return d.tgt.x + Math.sin(elapsed * SPEED + d.tgt.floatOffset) * FLOAT_DIST;
        })
        .attr('y2', (d: GLink) => {
          if (d.tgt.isModule) return d.tgt.y;
          return d.tgt.y + Math.cos(elapsed * SPEED * 1.3 + d.tgt.floatOffset) * FLOAT_DIST;
        });
      nebulaEls
        .attr('cx', (d: typeof nebulaData[0]) => d.x + Math.sin(elapsed * 0.0005 + d.offset) * 15)
        .attr('cy', (d: typeof nebulaData[0]) => d.y + Math.cos(elapsed * 0.0007 + d.offset) * 15);
    });

    return () => { if (timerRef.current) { timerRef.current.stop(); timerRef.current = null; } };
  }, [data, w]);

  function resetZoom() {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(800).ease(d3.easeCubicInOut)
        .call(zoomRef.current.transform, d3.zoomIdentity);
    }
    setZoomedModule(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: "'JetBrains Mono', monospace" }}>
        {!loading && data && !data.error
          ? `${data.nodes.filter(n => n.kind === 'module' || n.kind === 'layer').length} módulos · clique = zoom · scroll = navegar`
          : loading ? 'Carregando galáxia…' : ''}
      </div>

      <div ref={wrapperRef} style={{ position: 'relative' }}>
        {/* Star field */}
        <canvas ref={canvasRef} style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: GRAPH_H,
          pointerEvents: 'none', borderRadius: 10,
        }} />

        {/* D3 SVG */}
        <svg ref={svgRef} style={{
          width: '100%', height: GRAPH_H,
          background: '#060d1a', borderRadius: 10,
          border: '1px solid #2a3a55', display: 'block',
          cursor: 'grab',
        }} />

        {/* Loading overlay */}
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.3)', fontSize: 13,
            fontFamily: "'Inter', system-ui, sans-serif",
            pointerEvents: 'none',
          }}>
            Construindo galáxia…
          </div>
        )}

        {/* Zoomed module watermark */}
        {zoomedModule && (
          <div style={{
            position: 'absolute', bottom: '18%', left: 0, right: 0,
            textAlign: 'center', fontSize: 52, fontWeight: 900,
            color: 'rgba(255,255,255,0.04)', letterSpacing: 14,
            pointerEvents: 'none', userSelect: 'none',
            fontFamily: "'Inter', system-ui, sans-serif",
          }}>
            {zoomedModule.toUpperCase()}
          </div>
        )}

        {/* Reset zoom button */}
        {zoomedModule && (
          <button onClick={resetZoom} style={{
            position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', padding: '8px 20px', borderRadius: 4,
            cursor: 'pointer', fontSize: 11, letterSpacing: 1,
            fontFamily: "'Inter', system-ui, sans-serif",
            textTransform: 'uppercase',
          }}>
            Ver Visão Geral
          </button>
        )}

        {/* Layer legend */}
        {!loading && (
          <div style={{
            position: 'absolute', left: 12, bottom: 12,
            display: 'flex', gap: 12, flexWrap: 'wrap',
            fontSize: 10, color: 'rgba(255,255,255,0.4)',
            fontFamily: "'JetBrains Mono', monospace",
            background: 'rgba(6,13,26,0.75)', padding: '5px 10px',
            borderRadius: 6, backdropFilter: 'blur(4px)',
          }}>
            {Object.entries(LAYER_CLR).map(([layer, color]) => (
              <span key={layer} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', boxShadow: `0 0 6px ${color}` }} />
                {layer}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
