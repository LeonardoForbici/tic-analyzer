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

const MAX_MODS = 12;
const MAX_FILES_PER_MOD = 5;
const MAX_SUBFILES = 3;
const MOD_RADIUS = 240;
const FILE_DIST = 65;
const SUBFILE_DIST = 42;
const SPEED = 0.0015;
const FLOAT_DIST = 6;

const LAYER_CLR: Record<string, string> = {
  frontend: '#00dbe9',
  backend:  '#e8b84b',
  database: '#b48ead',
};

interface GNode {
  id: string; label: string;
  x: number; y: number;
  isModule: boolean; depth: number;
  r: number; color: string; glowId: string;
  angle: number; floatOffset: number;
  layer?: string;
}
interface GLink { src: GNode; tgt: GNode; }

function idSeed(id: string): number {
  return (id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0) * 0.37 + 100) % (Math.PI * 2);
}

function buildGraph(
  nodes: AggNode[], edges: AggEdge[], cx: number, cy: number,
): { gnodes: GNode[]; glinks: GLink[] } {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const mods = nodes
    .filter(n => n.kind === 'module' || n.kind === 'layer')
    .slice(0, MAX_MODS);
  const fileKinds = new Set(['file', 'plsql', 'table', 'symbol', 'method', 'column']);
  const files = nodes.filter(n => fileKinds.has(n.kind));
  const fileSet = new Set(files.map(n => n.id));

  // forward adjacency (from → to[])
  const fwd = new Map<string, string[]>();
  for (const e of edges) {
    if (!fwd.has(e.from)) fwd.set(e.from, []);
    fwd.get(e.from)!.push(e.to);
  }

  function modFiles(mod: AggNode): AggNode[] {
    // via edge containment
    const via = (fwd.get(mod.id) ?? [])
      .filter(id => fileSet.has(id))
      .map(id => byId.get(id)!)
      .filter(Boolean)
      .sort((a, b) => (b.inWeight + b.outWeight) - (a.inWeight + a.outWeight))
      .slice(0, MAX_FILES_PER_MOD);
    if (via.length > 0) return via;

    // path-prefix fallback
    const name = mod.label.toLowerCase().replace(/[^a-z0-9]/g, '');
    return files
      .filter(f => {
        const p = f.id.replace(/^file:/, '').toLowerCase();
        return name.length >= 3 && (p.includes(name) || name.includes(p.split('/').slice(-1)[0].replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/g, '')));
      })
      .sort((a, b) => (b.inWeight + b.outWeight) - (a.inWeight + a.outWeight))
      .slice(0, MAX_FILES_PER_MOD);
  }

  const gnodes: GNode[] = [];
  const glinks: GLink[] = [];
  const visited = new Set<string>();

  const R = MOD_RADIUS;

  mods.forEach((mod, i) => {
    const angle = (i / mods.length) * Math.PI * 2 - Math.PI / 2;
    const mx = cx + Math.cos(angle) * R;
    const my = cy + Math.sin(angle) * R;
    const color = LAYER_CLR[mod.layer ?? ''] ?? '#81a1c1';
    const gm: GNode = {
      id: mod.id, label: mod.label,
      x: mx, y: my,
      isModule: true, depth: 0,
      r: 14, color, glowId: `gal-glow-${mod.layer ?? 'default'}`,
      angle, floatOffset: 0,
      layer: mod.layer,
    };
    gnodes.push(gm);
    visited.add(mod.id);

    const level1 = modFiles(mod);
    // if still empty, synthetic nodes to keep aesthetics
    const l1nodes: AggNode[] = level1.length > 0 ? level1
      : Array.from({ length: 4 }, (_, j) => ({
        id: `${mod.id}::s${j}`, label: `node ${j + 1}`,
        kind: 'file' as const, childCount: 0, inWeight: 1, outWeight: 1,
      }));

    const N1 = l1nodes.length;
    l1nodes.forEach((child, j) => {
      if (visited.has(child.id)) return;
      visited.add(child.id);

      const spread = Math.min(Math.PI * 0.72, 0.25 * (N1 + 1));
      const a1 = angle + (j - (N1 - 1) / 2) * (spread / Math.max(1, N1 - 1));
      const dist1 = FILE_DIST + (j % 2) * 12;
      const gf: GNode = {
        id: child.id, label: child.label,
        x: mx + Math.cos(a1) * dist1,
        y: my + Math.sin(a1) * dist1,
        isModule: false, depth: 1,
        r: 5, color: '#ffffff', glowId: 'none',
        angle: a1, floatOffset: idSeed(child.id),
      };
      gnodes.push(gf);
      glinks.push({ src: gm, tgt: gf });

      // level 2: deps of this file
      const deps = (fwd.get(child.id) ?? [])
        .filter(id => fileSet.has(id) && !visited.has(id))
        .slice(0, MAX_SUBFILES);
      const N2 = deps.length;

      const l2nodes = N2 > 0 ? deps
        : Array.from({ length: 1 + (Math.abs(idSeed(child.id) * 100) | 0) % 2 }, (_, k) => ({
          id: `${child.id}::sub${k}`, real: false,
        }));

      l2nodes.forEach((dep, k) => {
        const depId = typeof dep === 'string' ? dep : (dep as any).id;
        if (visited.has(depId)) return;
        visited.add(depId);
        const depNode = byId.get(depId);
        const N2eff = Math.max(1, typeof dep === 'string' ? N2 : l2nodes.length);
        const spread2 = 0.35 / Math.max(1, N2eff - 1);
        const a2 = a1 + (k - (N2eff - 1) / 2) * spread2;
        const dist2 = SUBFILE_DIST + (k % 2) * 6;
        const gs: GNode = {
          id: depId,
          label: depNode?.label ?? '',
          x: gf.x + Math.cos(a2) * dist2,
          y: gf.y + Math.sin(a2) * dist2,
          isModule: false, depth: 2,
          r: 2.8, color: 'rgba(255,255,255,0.65)', glowId: 'none',
          angle: a2, floatOffset: idSeed(depId),
        };
        gnodes.push(gs);
        glinks.push({ src: gf, tgt: gs });
      });
    });
  });

  return { gnodes, glinks };
}

// ── Component ────────────────────────────────────────────────────────────────

export function GalaxyGraphViewer({
  projectPath,
  onClose,
}: {
  projectPath: string;
  onClose: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const timerRef = useRef<d3.Timer | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [zoomedModule, setZoomedModule] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LevelData | null>(null);
  const [summary, setSummary] = useState({ mods: 0, files: 0 });

  // Inject Orbitron font once
  useEffect(() => {
    const id = 'tic-orbitron';
    if (!document.getElementById(id)) {
      const s = document.createElement('style');
      s.id = id;
      s.textContent = "@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700&display=swap');";
      document.head.appendChild(s);
    }
  }, []);

  // ESC closes overlay
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  // Fetch graph data
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);

    (window.ticAnalyzer.getGraphLevel(projectPath, []) as Promise<LevelData>).then(async (top) => {
      if (!alive) return;
      const modIds = top.nodes
        .filter(n => n.kind === 'module' || n.kind === 'layer')
        .map(n => n.id)
        .slice(0, MAX_MODS);

      setSummary({
        mods: modIds.length,
        files: top.nodes.filter(n => n.kind !== 'module' && n.kind !== 'layer').length
          + top.nodes.filter(n => n.kind === 'module' || n.kind === 'layer')
              .reduce((s, m) => s + (m.childCount ?? 0), 0),
      });

      if (modIds.length === 0) { setData(top); setLoading(false); return; }

      const expanded = await (window.ticAnalyzer.getGraphLevel(projectPath, modIds) as Promise<LevelData>);
      if (!alive) return;
      setData(expanded);
      setLoading(false);
    });

    return () => { alive = false; };
  }, [projectPath]);

  // Build & render D3 galaxy
  useEffect(() => {
    if (!data || !svgRef.current) return;
    const svgEl = svgRef.current;

    if (timerRef.current) { timerRef.current.stop(); timerRef.current = null; }
    d3.select(svgEl).selectAll('*').remove();

    const W = window.innerWidth;
    const H = window.innerHeight;
    const cx = W / 2;
    const cy = H / 2;

    const svg = d3.select(svgEl).attr('width', W).attr('height', H);

    // Zoom / pan
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 5])
      .on('zoom', ev => mainGroup.attr('transform', ev.transform));
    svg.call(zoomBehavior);
    zoomRef.current = zoomBehavior;

    // Glow filters
    const defs = svg.append('defs');
    (['frontend', 'backend', 'database', 'default'] as const).forEach(layer => {
      const stdDev = layer === 'default' ? 3 : 6;
      const f = defs.append('filter').attr('id', `gal-glow-${layer}`)
        .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
      f.append('feGaussianBlur').attr('stdDeviation', stdDev).attr('result', 'blur');
      const m = f.append('feMerge');
      m.append('feMergeNode').attr('in', 'blur');
      m.append('feMergeNode').attr('in', 'SourceGraphic');
    });

    const mainGroup = svg.append('g');

    // Decorative orbit rings
    [150, MOD_RADIUS, MOD_RADIUS + 120].forEach(r => {
      mainGroup.append('circle')
        .attr('cx', cx).attr('cy', cy).attr('r', r)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(255,255,255,0.03)')
        .attr('stroke-width', 1);
    });

    // Central nebula (golden particles)
    const nebulaData = Array.from({ length: 80 }, (_, i) => ({
      bx: cx + (((i * 7919) % 100) / 100 - 0.5) * 60,
      by: cy + (((i * 6271) % 100) / 100 - 0.5) * 60,
      r:  ((i * 3) % 15) / 10 + 0.5,
      off: (i * 1.37) % (Math.PI * 2),
    }));
    const nebulaEls = mainGroup.append('g').selectAll('circle')
      .data(nebulaData).enter().append('circle')
      .attr('cx', d => d.bx).attr('cy', d => d.by).attr('r', d => d.r)
      .attr('fill', '#ebcb8b')
      .attr('opacity', (_, i) => 0.18 + (i % 5) * 0.09);

    // Graph data → visual nodes/links
    const { gnodes, glinks } = buildGraph(data.nodes, data.edges, cx, cy);

    // Links
    const linkEls = mainGroup.append('g')
      .selectAll<SVGLineElement, GLink>('line')
      .data(glinks).enter().append('line')
      .attr('stroke', 'rgba(255,255,255,0.15)')
      .attr('stroke-width', 1.2)
      .attr('x1', d => d.src.x).attr('y1', d => d.src.y)
      .attr('x2', d => d.tgt.x).attr('y2', d => d.tgt.y);

    // Node groups
    const nodeEls = mainGroup.append('g')
      .selectAll<SVGGElement, GNode>('.gn')
      .data(gnodes).enter().append('g').attr('class', 'gn')
      .attr('transform', d => `translate(${d.x},${d.y})`);

    // Core circle
    nodeEls.append('circle').attr('class', 'core')
      .attr('r', d => d.r)
      .attr('fill', d => d.color)
      .style('filter', d => d.glowId !== 'none' ? `url(#${d.glowId})` : 'none')
      .style('cursor', d => d.isModule ? 'pointer' : 'default');

    // Decorative ring on module nodes
    nodeEls.filter(d => d.isModule).append('circle')
      .attr('r', 21)
      .attr('fill', 'none')
      .attr('stroke', d => d.color)
      .attr('stroke-width', '1px')
      .attr('opacity', 0.4);

    // Module labels (Orbitron)
    nodeEls.filter(d => d.isModule).append('text')
      .attr('y', d => Math.sin(d.angle) >= 0 ? 42 : -32)
      .attr('text-anchor', 'middle')
      .attr('fill', '#ffffff').attr('opacity', 0.82)
      .attr('font-family', "'Orbitron', 'Inter', sans-serif")
      .attr('font-size', 11).attr('letter-spacing', 3).attr('font-weight', 500)
      .attr('pointer-events', 'none')
      .text(d => d.label.toUpperCase().slice(0, 18));

    // Sub-label
    nodeEls.filter(d => d.isModule).append('text')
      .attr('y', d => Math.sin(d.angle) >= 0 ? 54 : -22)
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(255,255,255,0.35)')
      .attr('font-family', "'Inter', sans-serif")
      .attr('font-size', 8)
      .attr('pointer-events', 'none')
      .text('connected · active');

    // Hover effect
    nodeEls
      .on('mouseover', function(_ev, d) {
        d3.select(this).select('.core').transition().duration(200)
          .attr('r', d.r + (d.isModule ? 4 : 2));
      })
      .on('mouseout', function(_ev, d) {
        d3.select(this).select('.core').transition().duration(200).attr('r', d.r);
      });

    // Click module → zoom camera (identical to reference)
    nodeEls.filter(d => d.isModule).on('click', (_ev, d) => {
      const scale = 2.2;
      const tx = W / 2 - d.x * scale;
      const ty = H * 0.75 - d.y * scale;
      svg.transition().duration(1000).ease(d3.easeCubicInOut)
        .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
      setZoomedModule(d.label);
    });

    // Breathing animation timer
    timerRef.current = d3.timer(elapsed => {
      nodeEls.attr('transform', (d: GNode) => {
        if (d.isModule) return `translate(${d.x},${d.y})`;
        const fx = d.x + Math.sin(elapsed * SPEED + d.floatOffset) * FLOAT_DIST;
        const fy = d.y + Math.cos(elapsed * SPEED * 1.2 + d.floatOffset) * FLOAT_DIST;
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
          return d.tgt.y + Math.cos(elapsed * SPEED * 1.2 + d.tgt.floatOffset) * FLOAT_DIST;
        });
      nebulaEls
        .attr('cx', (d: typeof nebulaData[0]) => d.bx + Math.sin(elapsed * 0.0005 + d.off) * 15)
        .attr('cy', (d: typeof nebulaData[0]) => d.by + Math.cos(elapsed * 0.0007 + d.off) * 15);
    });

    return () => { if (timerRef.current) { timerRef.current.stop(); timerRef.current = null; } };
  }, [data]);

  function resetZoom() {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(800).ease(d3.easeCubicInOut)
        .call(zoomRef.current.transform, d3.zoomIdentity);
    }
    setZoomedModule(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'radial-gradient(circle at center, #101216 0%, #050608 100%)',
      overflow: 'hidden', cursor: 'grab',
    }}>
      {/* Simulated star field */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          radial-gradient(white, rgba(255,255,255,.2) 2px, transparent 40px),
          radial-gradient(white, rgba(255,255,255,.15) 1px, transparent 30px)
        `,
        backgroundSize: '550px 550px, 350px 350px',
        backgroundPosition: '0 0, 40px 60px',
        opacity: 0.18,
      }} />

      {/* Top navigation (like reference) */}
      <div style={{
        position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 4, zIndex: 10,
        background: 'rgba(255,255,255,0.03)',
        padding: '4px 6px', borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        {[{ label: 'Map', active: true }, { label: 'Dashboards', active: false }, { label: 'Explorer', active: false }].map(item => (
          <span key={item.label} style={{
            padding: '5px 15px',
            fontFamily: "'Orbitron', 'Inter', sans-serif",
            fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase',
            color: item.active ? '#000' : 'rgba(255,255,255,0.45)',
            background: item.active ? '#ffffff' : 'transparent',
            borderRadius: 14,
            fontWeight: item.active ? 700 : 400,
          }}>
            {item.label}
          </span>
        ))}
        <span
          onClick={onClose}
          title="Fechar (ESC)"
          style={{
            marginLeft: 6, padding: '5px 12px',
            fontFamily: "'Orbitron', 'Inter', sans-serif",
            fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.4)', cursor: 'pointer', borderRadius: 14,
            userSelect: 'none',
          }}
        >
          ✕ esc
        </span>
      </div>

      {/* POV header (like reference) */}
      {!loading && (
        <div style={{
          position: 'absolute', top: 88, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.75)',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '12px 28px', borderRadius: 6,
          fontSize: 14, letterSpacing: '0.5px',
          textAlign: 'center', color: '#ffffff',
          maxWidth: 520, zIndex: 10, pointerEvents: 'none',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap',
          opacity: zoomedModule ? 0.15 : 1,
          transition: 'opacity 0.4s',
        }}>
          {summary.mods} módulos · {summary.files > 0 ? `${summary.files} arquivos` : 'enterprise'} · second brain
        </div>
      )}

      {/* D3 SVG — full viewport */}
      <svg ref={svgRef} style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
      }} />

      {/* Loading state */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.35)', fontSize: 13,
          fontFamily: "'Orbitron', 'Inter', sans-serif",
          letterSpacing: 3, pointerEvents: 'none',
        }}>
          CARREGANDO GALÁXIA…
        </div>
      )}

      {/* Watermark when zoomed */}
      {zoomedModule && (
        <div style={{
          position: 'absolute', bottom: '18%', left: 0, right: 0,
          textAlign: 'center',
          fontSize: Math.max(44, Math.min(96, window.innerWidth / 11)),
          fontWeight: 900,
          color: 'rgba(255,255,255,0.05)',
          letterSpacing: 18,
          pointerEvents: 'none', userSelect: 'none',
          fontFamily: "'Orbitron', 'Inter', sans-serif",
        }}>
          {zoomedModule.toUpperCase()}
        </div>
      )}

      {/* Reset zoom button */}
      {zoomedModule && (
        <button
          onClick={resetZoom}
          style={{
            position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', padding: '8px 22px', borderRadius: 4,
            cursor: 'pointer', fontSize: 11, letterSpacing: '1px',
            fontFamily: "'Inter', sans-serif", textTransform: 'uppercase',
            zIndex: 10,
          }}
        >
          Ver Visão Geral
        </button>
      )}

      {/* Layer legend */}
      {!loading && !zoomedModule && (
        <div style={{
          position: 'absolute', left: 20, bottom: 20, zIndex: 10,
          display: 'flex', gap: 16, alignItems: 'center',
          fontSize: 10, color: 'rgba(255,255,255,0.38)',
          fontFamily: "'Inter', sans-serif",
        }}>
          {Object.entries(LAYER_CLR).map(([layer, color]) => (
            <span key={layer} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: color, display: 'inline-block',
                boxShadow: `0 0 6px ${color}55`,
              }} />
              {layer}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
