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
const MAX_FILES_PER_MOD = 7;   // nível 1 (arquivos diretos do módulo)
const POOL_PER_MOD = 24;       // pool guardado p/ achar deps intra-módulo (nível 2)
const MAX_SUBFILES = 3;        // nível 2 por arquivo
const MOD_RADIUS = 250;
const FILE_DIST = 70;
const SUBFILE_DIST = 44;
const SPEED = 0.0015;
const FLOAT_DIST = 6;

const FILE_KINDS = new Set(['file', 'plsql', 'table', 'symbol', 'method', 'column']);

const LAYER_CLR: Record<string, string> = {
  frontend: '#00dbe9',
  backend:  '#e8b84b',
  database: '#b48ead',
};

interface GalaxyData {
  modules: AggNode[];
  filesByMod: Map<string, AggNode[]>;   // moduleId → arquivos (contenção real)
  fileById: Map<string, AggNode>;
  fwd: Map<string, string[]>;           // arquivo → arquivos que ele depende (dependentes reais)
}

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
  return Math.abs(id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0) * 0.37) % (Math.PI * 2);
}

function buildGraph(
  g: GalaxyData, cx: number, cy: number,
): { gnodes: GNode[]; glinks: GLink[]; deplinks: GLink[] } {
  const gnodes: GNode[] = [];
  const glinks: GLink[] = [];   // árvore (módulo→arquivo, arquivo→subarquivo)
  const deplinks: GLink[] = []; // dependências cruzadas reais
  const placed = new Map<string, GNode>();
  const mods = g.modules.slice(0, MAX_MODS);
  const R = MOD_RADIUS;

  // arquivo → módulo (para manter o nível 2 dentro do mesmo departamento)
  const modOfFile = new Map<string, string>();
  for (const [mid, files] of g.filesByMod) for (const f of files) modOfFile.set(f.id, mid);

  const spokeKeys = new Set<string>();

  mods.forEach((mod, i) => {
    const angle = (i / mods.length) * Math.PI * 2 - Math.PI / 2;
    const mx = cx + Math.cos(angle) * R;
    const my = cy + Math.sin(angle) * R;
    const color = LAYER_CLR[mod.layer ?? ''] ?? '#81a1c1';
    const gm: GNode = {
      id: mod.id, label: mod.label, x: mx, y: my,
      isModule: true, depth: 0, r: 14, color,
      glowId: `gal-glow-${mod.layer ?? 'default'}`,
      angle, floatOffset: 0, layer: mod.layer,
    };
    gnodes.push(gm);
    placed.set(mod.id, gm);

    const pool = (g.filesByMod.get(mod.id) ?? []);
    const level1 = pool.slice(0, MAX_FILES_PER_MOD);
    const N1 = level1.length;

    level1.forEach((f, j) => {
      if (placed.has(f.id)) return;
      const spread = Math.min(Math.PI * 0.8, 0.3 * (N1 + 1));
      const a1 = angle + (j - (N1 - 1) / 2) * (spread / Math.max(1, N1 - 1));
      const dist1 = FILE_DIST + (j % 3) * 16;
      const w = f.inWeight + f.outWeight;
      const r = Math.max(3.5, Math.min(7, 3 + Math.log1p(w) * 0.8));
      const gf: GNode = {
        id: f.id, label: f.label,
        x: mx + Math.cos(a1) * dist1,
        y: my + Math.sin(a1) * dist1,
        isModule: false, depth: 1, r,
        color: '#ffffff', glowId: 'none',
        angle: a1, floatOffset: idSeed(f.id), layer: f.layer,
      };
      gnodes.push(gf);
      placed.set(f.id, gf);
      glinks.push({ src: gm, tgt: gf });
      spokeKeys.add(`${mod.id}→${f.id}`);

      // nível 2: dependências reais deste arquivo, dentro do mesmo módulo
      const deps = (g.fwd.get(f.id) ?? [])
        .filter(id => modOfFile.get(id) === mod.id && !placed.has(id))
        .slice(0, MAX_SUBFILES);
      const N2 = deps.length;
      deps.forEach((depId, k) => {
        const dn = g.fileById.get(depId);
        if (!dn) return;
        const a2 = a1 + (k - (N2 - 1) / 2) * (0.42 / Math.max(1, N2 - 1));
        const dist2 = SUBFILE_DIST + (k % 2) * 8;
        const gs: GNode = {
          id: depId, label: dn.label,
          x: gf.x + Math.cos(a2) * dist2,
          y: gf.y + Math.sin(a2) * dist2,
          isModule: false, depth: 2, r: 3,
          color: 'rgba(255,255,255,0.7)', glowId: 'none',
          angle: a2, floatOffset: idSeed(depId), layer: dn.layer,
        };
        gnodes.push(gs);
        placed.set(depId, gs);
        glinks.push({ src: gf, tgt: gs });
        spokeKeys.add(`${f.id}→${depId}`);
      });
    });
  });

  // dependências cruzadas reais entre nós já posicionados (os "dependentes")
  const seen = new Set<string>();
  for (const [from, tos] of g.fwd) {
    const s = placed.get(from);
    if (!s || s.isModule) continue;
    for (const to of tos) {
      const t = placed.get(to);
      if (!t || t.isModule || s === t) continue;
      const key = `${from}→${to}`;
      if (spokeKeys.has(key) || seen.has(key)) continue;
      seen.add(key);
      deplinks.push({ src: s, tgt: t });
    }
  }

  return { gnodes, glinks, deplinks };
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
  const [galaxy, setGalaxy] = useState<GalaxyData | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [summary, setSummary] = useState({ mods: 0, files: 0, deps: 0 });

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

  // Fetch graph data: layers → modules → per-module files (+ real dependency edges)
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setGalaxy(null);
    setErrMsg(null);

    (async () => {
      const getLevel = (exp: string[]) =>
        window.ticAnalyzer.getGraphLevel(projectPath, exp) as Promise<LevelData>;

      const top = await getLevel([]);
      if (!alive) return;
      if (top.error) { setErrMsg(top.error); setLoading(false); return; }

      // 1. módulos (hubs): expandir as layers
      const layerIds = top.nodes.filter(n => n.kind === 'layer').map(n => n.id);
      const modLevel = layerIds.length ? await getLevel(layerIds) : top;
      if (!alive) return;

      let modules = modLevel.nodes.filter(n => n.kind === 'module');
      if (modules.length === 0) modules = modLevel.nodes.filter(n => n.kind === 'module' || n.kind === 'layer');
      modules = modules
        .sort((a, b) => (b.childCount ?? 0) - (a.childCount ?? 0))
        .slice(0, MAX_MODS);

      if (modules.length === 0) {
        setErrMsg('Nenhum módulo encontrado. Rode a análise primeiro.');
        setLoading(false);
        return;
      }

      // 2. arquivos por módulo (contenção real) + arestas que tocam cada módulo
      const filesByMod = new Map<string, AggNode[]>();
      const fileById = new Map<string, AggNode>();
      const rawEdges: AggEdge[] = [];

      for (const mod of modules) {
        const r = await getLevel([mod.id]);
        if (!alive) return;
        const files = r.nodes
          .filter(n => FILE_KINDS.has(n.kind))
          .sort((a, b) => (b.inWeight + b.outWeight) - (a.inWeight + a.outWeight))
          .slice(0, POOL_PER_MOD);
        filesByMod.set(mod.id, files);
        for (const f of files) fileById.set(f.id, f);
        rawEdges.push(...r.edges);
      }

      // 3. fwd map: arquivo → arquivos que depende (só entre arquivos posicionáveis)
      const fwd = new Map<string, string[]>();
      let depCount = 0;
      for (const e of rawEdges) {
        if (!fileById.has(e.from) || !fileById.has(e.to) || e.from === e.to) continue;
        if (!fwd.has(e.from)) fwd.set(e.from, []);
        const arr = fwd.get(e.from)!;
        if (!arr.includes(e.to)) { arr.push(e.to); depCount++; }
      }

      setGalaxy({ modules, filesByMod, fileById, fwd });
      setSummary({ mods: modules.length, files: fileById.size, deps: depCount });
      setLoading(false);
    })().catch(err => {
      if (alive) { setErrMsg(String(err?.message ?? err)); setLoading(false); }
    });

    return () => { alive = false; };
  }, [projectPath]);

  // Build & render D3 galaxy
  useEffect(() => {
    if (!galaxy || !svgRef.current) return;
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
    [150, MOD_RADIUS, MOD_RADIUS + 130].forEach(r => {
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
    const { gnodes, glinks, deplinks } = buildGraph(galaxy, cx, cy);

    // Dependency cross-links (faint — os dependentes cruzados)
    const depEls = mainGroup.append('g').selectAll<SVGLineElement, GLink>('line')
      .data(deplinks).enter().append('line')
      .attr('stroke', 'rgba(140,180,255,0.10)')
      .attr('stroke-width', 0.8);

    // Tree links (módulo → arquivo → subarquivo)
    const linkEls = mainGroup.append('g').selectAll<SVGLineElement, GLink>('line')
      .data(glinks).enter().append('line')
      .attr('stroke', 'rgba(255,255,255,0.16)')
      .attr('stroke-width', 1.1);

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
      .attr('r', 21).attr('fill', 'none')
      .attr('stroke', d => d.color).attr('stroke-width', '1px').attr('opacity', 0.4);

    // Module labels (Orbitron)
    nodeEls.filter(d => d.isModule).append('text')
      .attr('y', d => Math.sin(d.angle) >= 0 ? 42 : -32)
      .attr('text-anchor', 'middle')
      .attr('fill', '#ffffff').attr('opacity', 0.82)
      .attr('font-family', "'Orbitron', 'Inter', sans-serif")
      .attr('font-size', 11).attr('letter-spacing', 3).attr('font-weight', 500)
      .attr('pointer-events', 'none')
      .text(d => d.label.toUpperCase().slice(0, 18));

    // Sub-label: contagem de arquivos
    nodeEls.filter(d => d.isModule).append('text')
      .attr('y', d => Math.sin(d.angle) >= 0 ? 54 : -22)
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(255,255,255,0.35)')
      .attr('font-family', "'Inter', sans-serif")
      .attr('font-size', 8)
      .attr('pointer-events', 'none')
      .text(d => {
        const n = galaxy.filesByMod.get(d.id)?.length ?? 0;
        return `${n} arquivo${n === 1 ? '' : 's'}`;
      });

    // Hover
    nodeEls
      .on('mouseover', function(_ev, d) {
        d3.select(this).select('.core').transition().duration(200)
          .attr('r', d.r + (d.isModule ? 4 : 2));
      })
      .on('mouseout', function(_ev, d) {
        d3.select(this).select('.core').transition().duration(200).attr('r', d.r);
      });

    // Click module → zoom camera
    nodeEls.filter(d => d.isModule).on('click', (_ev, d) => {
      const scale = 2.2;
      const tx = W / 2 - d.x * scale;
      const ty = H * 0.75 - d.y * scale;
      svg.transition().duration(1000).ease(d3.easeCubicInOut)
        .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
      setZoomedModule(d.label);
    });

    // Breathing animation
    const ax = (d: GNode, e: number) => d.isModule ? d.x : d.x + Math.sin(e * SPEED + d.floatOffset) * FLOAT_DIST;
    const ay = (d: GNode, e: number) => d.isModule ? d.y : d.y + Math.cos(e * SPEED * 1.2 + d.floatOffset) * FLOAT_DIST;

    timerRef.current = d3.timer(elapsed => {
      nodeEls.attr('transform', (d: GNode) => `translate(${ax(d, elapsed)},${ay(d, elapsed)})`);
      linkEls
        .attr('x1', (d: GLink) => ax(d.src, elapsed)).attr('y1', (d: GLink) => ay(d.src, elapsed))
        .attr('x2', (d: GLink) => ax(d.tgt, elapsed)).attr('y2', (d: GLink) => ay(d.tgt, elapsed));
      depEls
        .attr('x1', (d: GLink) => ax(d.src, elapsed)).attr('y1', (d: GLink) => ay(d.src, elapsed))
        .attr('x2', (d: GLink) => ax(d.tgt, elapsed)).attr('y2', (d: GLink) => ay(d.tgt, elapsed));
      nebulaEls
        .attr('cx', (d: typeof nebulaData[0]) => d.bx + Math.sin(elapsed * 0.0005 + d.off) * 15)
        .attr('cy', (d: typeof nebulaData[0]) => d.by + Math.cos(elapsed * 0.0007 + d.off) * 15);
    });

    return () => { if (timerRef.current) { timerRef.current.stop(); timerRef.current = null; } };
  }, [galaxy]);

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

      {/* Top navigation */}
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
            borderRadius: 14, fontWeight: item.active ? 700 : 400,
          }}>
            {item.label}
          </span>
        ))}
        <span onClick={onClose} title="Fechar (ESC)" style={{
          marginLeft: 6, padding: '5px 12px',
          fontFamily: "'Orbitron', 'Inter', sans-serif",
          fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.4)', cursor: 'pointer', borderRadius: 14, userSelect: 'none',
        }}>
          ✕ esc
        </span>
      </div>

      {/* POV header */}
      {!loading && !errMsg && (
        <div style={{
          position: 'absolute', top: 88, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.75)',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '12px 28px', borderRadius: 6,
          fontSize: 14, letterSpacing: '0.5px',
          textAlign: 'center', color: '#ffffff',
          maxWidth: 640, zIndex: 10, pointerEvents: 'none',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)', whiteSpace: 'nowrap',
          opacity: zoomedModule ? 0.15 : 1, transition: 'opacity 0.4s',
        }}>
          {summary.mods} módulos · {summary.files} arquivos · {summary.deps} dependências
        </div>
      )}

      {/* D3 SVG — full viewport */}
      <svg ref={svgRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* Loading state */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.35)', fontSize: 13,
          fontFamily: "'Orbitron', 'Inter', sans-serif",
          letterSpacing: 3, pointerEvents: 'none',
        }}>
          MAPEANDO DEPENDÊNCIAS…
        </div>
      )}

      {/* Error state */}
      {errMsg && !loading && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,180,180,0.7)', fontSize: 13,
          fontFamily: "'Inter', sans-serif", textAlign: 'center', padding: 40,
        }}>
          {errMsg}
        </div>
      )}

      {/* Watermark when zoomed */}
      {zoomedModule && (
        <div style={{
          position: 'absolute', bottom: '18%', left: 0, right: 0,
          textAlign: 'center',
          fontSize: Math.max(44, Math.min(96, window.innerWidth / 11)),
          fontWeight: 900, color: 'rgba(255,255,255,0.05)', letterSpacing: 18,
          pointerEvents: 'none', userSelect: 'none',
          fontFamily: "'Orbitron', 'Inter', sans-serif",
        }}>
          {zoomedModule.toUpperCase()}
        </div>
      )}

      {/* Reset zoom button */}
      {zoomedModule && (
        <button onClick={resetZoom} style={{
          position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)',
          color: '#fff', padding: '8px 22px', borderRadius: 4,
          cursor: 'pointer', fontSize: 11, letterSpacing: '1px',
          fontFamily: "'Inter', sans-serif", textTransform: 'uppercase', zIndex: 10,
        }}>
          Ver Visão Geral
        </button>
      )}

      {/* Layer legend */}
      {!loading && !errMsg && !zoomedModule && (
        <div style={{
          position: 'absolute', left: 20, bottom: 20, zIndex: 10,
          display: 'flex', gap: 16, alignItems: 'center',
          fontSize: 10, color: 'rgba(255,255,255,0.38)', fontFamily: "'Inter', sans-serif",
        }}>
          {Object.entries(LAYER_CLR).map(([layer, color]) => (
            <span key={layer} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: color,
                display: 'inline-block', boxShadow: `0 0 6px ${color}55`,
              }} />
              {layer}
            </span>
          ))}
          <span style={{ marginLeft: 8, opacity: 0.7 }}>
            <span style={{ display: 'inline-block', width: 14, height: 1, background: 'rgba(140,180,255,0.4)', verticalAlign: 'middle', marginRight: 5 }} />
            dependência
          </span>
        </div>
      )}
    </div>
  );
}
