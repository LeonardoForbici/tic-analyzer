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
const MAX_FILES_PER_MOD = 12;
const POOL_PER_MOD = 36;
const MAX_SUBFILES = 3;

// Overview (radial outward) layout distances
const MOD_RADIUS = 230;
const FILE_DIST = 92;
const SUBFILE_DIST = 56;
// Focus (upward fan) layout distances — wider/longer so it fills the screen when zoomed
const FILE_DIST_F = 150;
const SUBFILE_DIST_F = 100;

const FOCUS_SCALE = 2.6;
const SPEED = 0.0015;
const FLOAT_DIST = 6;

const FILE_KINDS = new Set(['file', 'plsql', 'table', 'symbol', 'method', 'column']);

// Paleta vibrante (Nord-ish) — cada módulo ganha uma cor distinta, como no vídeo
const PALETTE = [
  '#88c0d0', '#ebcb8b', '#d08770', '#bf616a', '#a3be8c', '#b48ead',
  '#81a1c1', '#8fbcbb', '#d8a657', '#5e81ac', '#e09ec2', '#a3d4cf',
];
function colorForIndex(i: number): string {
  return PALETTE[i % PALETTE.length];
}
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
// mix a hex color toward white by t (0..1) → an rgb() string
function lighten(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const L = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${L(r)},${L(g)},${L(b)})`;
}
function hexA(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

interface GalaxyData {
  modules: AggNode[];
  filesByMod: Map<string, AggNode[]>;
  fileById: Map<string, AggNode>;
  fwd: Map<string, string[]>;
}

interface GNode {
  id: string; label: string;
  ox: number; oy: number;  // overview position (radial outward)
  fx: number; fy: number;  // focus position (upward fan, anchored at module)
  isModule: boolean; depth: number;
  r: number; color: string; glowId: string;
  floatOffset: number;
  layer?: string;
  moduleId: string;
  modIndex: number;   // index of the owning module (for carousel + color)
  labelAngle: number; // for module label placement (overview)
}
interface GLink { src: GNode; tgt: GNode; }

function idSeed(id: string): number {
  return Math.abs(id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0) * 0.37) % (Math.PI * 2);
}

// World center is (0,0). Modules sit on a circle of MOD_RADIUS.
function buildGraph(g: GalaxyData): { gnodes: GNode[]; glinks: GLink[]; deplinks: GLink[] } {
  const gnodes: GNode[] = [];
  const glinks: GLink[] = [];
  const deplinks: GLink[] = [];
  const placed = new Map<string, GNode>();
  const mods = g.modules.slice(0, MAX_MODS);

  const modOfFile = new Map<string, string>();
  for (const [mid, files] of g.filesByMod) for (const f of files) modOfFile.set(f.id, mid);

  const spokeKeys = new Set<string>();
  const UP = -Math.PI / 2; // upward on screen

  mods.forEach((mod, i) => {
    const angle = (i / mods.length) * Math.PI * 2 - Math.PI / 2; // module's radial angle
    const mx = Math.cos(angle) * MOD_RADIUS;
    const my = Math.sin(angle) * MOD_RADIUS;
    const color = colorForIndex(i);
    const gm: GNode = {
      id: mod.id, label: mod.label,
      ox: mx, oy: my, fx: mx, fy: my,
      isModule: true, depth: 0, r: 11, color,
      glowId: 'gal-glow-hub',
      floatOffset: 0, layer: mod.layer, moduleId: mod.id,
      modIndex: i, labelAngle: angle,
    };
    gnodes.push(gm);
    placed.set(mod.id, gm);

    const level1 = (g.filesByMod.get(mod.id) ?? []).slice(0, MAX_FILES_PER_MOD);
    const N1 = level1.length;

    level1.forEach((f, j) => {
      if (placed.has(f.id)) return;
      // fan offset shared by both layouts
      const spreadO = Math.min(Math.PI * 0.95, 0.32 * (N1 + 1));
      const spreadF = Math.min(Math.PI * 0.95, 0.30 * (N1 + 1));
      const frac = N1 > 1 ? (j - (N1 - 1) / 2) / (N1 - 1) : 0;
      const aO = angle + frac * spreadO;          // overview: fan around outward angle
      const aF = UP + frac * spreadF;             // focus: fan around up
      const distO = FILE_DIST + (j % 3) * 18;
      const distF = FILE_DIST_F + (j % 3) * 26;

      const w = f.inWeight + f.outWeight;
      const r = Math.max(4.5, Math.min(8, 4 + Math.log1p(w * 0.3)));
      const gf: GNode = {
        id: f.id, label: f.label,
        ox: mx + Math.cos(aO) * distO,
        oy: my + Math.sin(aO) * distO,
        fx: mx + Math.cos(aF) * distF,
        fy: my + Math.sin(aF) * distF,
        isModule: false, depth: 1, r,
        color: lighten(color, 0.5), glowId: 'none',
        floatOffset: idSeed(f.id), layer: f.layer, moduleId: mod.id,
        modIndex: i, labelAngle: aF,
      };
      gnodes.push(gf);
      placed.set(f.id, gf);
      glinks.push({ src: gm, tgt: gf });
      spokeKeys.add(`${mod.id}→${f.id}`);

      const deps = (g.fwd.get(f.id) ?? [])
        .filter(id => modOfFile.get(id) === mod.id && !placed.has(id))
        .slice(0, MAX_SUBFILES);
      const N2 = deps.length;
      deps.forEach((depId, k) => {
        const dn = g.fileById.get(depId);
        if (!dn) return;
        const frac2 = N2 > 1 ? (k - (N2 - 1) / 2) / (N2 - 1) : 0;
        const aO2 = aO + frac2 * 0.5;
        const aF2 = aF + frac2 * 0.5;
        const distO2 = SUBFILE_DIST + (k % 2) * 12;
        const distF2 = SUBFILE_DIST_F + (k % 2) * 18;
        const gs: GNode = {
          id: depId, label: dn.label,
          ox: gf.ox + Math.cos(aO2) * distO2,
          oy: gf.oy + Math.sin(aO2) * distO2,
          fx: gf.fx + Math.cos(aF2) * distF2,
          fy: gf.fy + Math.sin(aF2) * distF2,
          isModule: false, depth: 2, r: 3,
          color: lighten(color, 0.35), glowId: 'none',
          floatOffset: idSeed(depId), layer: dn.layer, moduleId: mod.id,
          modIndex: i, labelAngle: aF2,
        };
        gnodes.push(gs);
        placed.set(depId, gs);
        glinks.push({ src: gf, tgt: gs });
        spokeKeys.add(`${f.id}→${depId}`);
      });
    });
  });

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
  const focusModuleRef = useRef<((id: string) => void) | null>(null);
  const resetRef = useRef<(() => void) | null>(null);
  const onFocusIdxRef = useRef<((i: number) => void) | null>(null);
  const [curIdx, setCurIdx] = useState(0);
  const [zoomedModule, setZoomedModule] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [galaxy, setGalaxy] = useState<GalaxyData | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [summary, setSummary] = useState({ mods: 0, files: 0, deps: 0 });

  useEffect(() => {
    const id = 'tic-orbitron';
    if (!document.getElementById(id)) {
      const s = document.createElement('style');
      s.id = id;
      s.textContent = "@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700&display=swap');";
      document.head.appendChild(s);
    }
  }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  // Keep the carousel index in sync when a hub is clicked directly on the canvas
  useEffect(() => { onFocusIdxRef.current = setCurIdx; }, []);

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

    const svg = d3.select(svgEl).attr('width', W).attr('height', H);

    // Glow filters — the blur inherits the node's own fill, so one filter tints any color
    const defs = svg.append('defs');
    {
      const f = defs.append('filter').attr('id', 'gal-glow-hub')
        .attr('x', '-80%').attr('y', '-80%').attr('width', '260%').attr('height', '260%');
      f.append('feGaussianBlur').attr('stdDeviation', 6).attr('result', 'blur');
      const m = f.append('feMerge');
      m.append('feMergeNode').attr('in', 'blur');
      m.append('feMergeNode').attr('in', 'SourceGraphic');
    }
    // Soft white glow for focused file orbs
    {
      const f = defs.append('filter').attr('id', 'gal-glow-orb')
        .attr('x', '-120%').attr('y', '-120%').attr('width', '340%').attr('height', '340%');
      f.append('feGaussianBlur').attr('stdDeviation', 5).attr('result', 'blur');
      const m = f.append('feMerge');
      m.append('feMergeNode').attr('in', 'blur');
      m.append('feMergeNode').attr('in', 'SourceGraphic');
    }

    const mainGroup = svg.append('g');

    // Overview camera fits the whole radial galaxy
    const fitR = MOD_RADIUS + FILE_DIST + SUBFILE_DIST + 80;
    const s0 = Math.min(W, H) / (2 * fitR);
    const overviewT = d3.zoomIdentity.translate(W / 2, H / 2).scale(s0);
    mainGroup.attr('transform', overviewT.toString());

    // Decorative orbit rings (world coords, centered at 0,0)
    [120, MOD_RADIUS, MOD_RADIUS + 120].forEach(r => {
      mainGroup.append('circle')
        .attr('cx', 0).attr('cy', 0).attr('r', r)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(255,255,255,0.035)')
        .attr('stroke-width', 1);
    });

    // Central golden nebula
    const nebulaData = Array.from({ length: 90 }, (_, i) => ({
      bx: (((i * 7919) % 100) / 100 - 0.5) * 70,
      by: (((i * 6271) % 100) / 100 - 0.5) * 70,
      r:  ((i * 3) % 15) / 10 + 0.4,
      off: (i * 1.37) % (Math.PI * 2),
    }));
    const nebulaEls = mainGroup.append('g').selectAll('circle')
      .data(nebulaData).enter().append('circle')
      .attr('cx', d => d.bx).attr('cy', d => d.by).attr('r', d => d.r)
      .attr('fill', '#ebcb8b')
      .attr('opacity', (_, i) => 0.18 + (i % 5) * 0.09);

    const { gnodes, glinks, deplinks } = buildGraph(galaxy);

    // ── Morph + camera state, driven by the animation timer ──
    let focusedId: string | null = null;
    let morphTarget = 0;   // 0 = overview, 1 = focus
    let morphValue = 0;

    const tOf = (d: GNode) => (focusedId && d.moduleId === focusedId) ? morphValue : 0;
    const baseX = (d: GNode) => d.ox + (d.fx - d.ox) * tOf(d);
    const baseY = (d: GNode) => d.oy + (d.fy - d.oy) * tOf(d);
    const px = (d: GNode, e: number) => d.isModule ? baseX(d) : baseX(d) + Math.sin(e * SPEED + d.floatOffset) * FLOAT_DIST;
    const py = (d: GNode, e: number) => d.isModule ? baseY(d) : baseY(d) + Math.cos(e * SPEED * 1.2 + d.floatOffset) * FLOAT_DIST;

    // Cross-module dependency links — subtle, only shown when focused
    const depEls = mainGroup.append('g').selectAll<SVGLineElement, GLink>('line')
      .data(deplinks).enter().append('line')
      .attr('stroke', 'rgba(140,180,255,0.16)')
      .attr('stroke-width', 0.7)
      .attr('opacity', 0);

    // Tree links — tinted with the owning module's color
    const linkEls = mainGroup.append('g').selectAll<SVGLineElement, GLink>('line')
      .data(glinks).enter().append('line')
      .attr('stroke', (d: GLink) => hexA(colorForIndex(d.src.modIndex), 0.5))
      .attr('stroke-width', 1);

    // Node groups
    const nodeEls = mainGroup.append('g')
      .selectAll<SVGGElement, GNode>('.gn')
      .data(gnodes).enter().append('g').attr('class', 'gn');

    nodeEls.append('circle').attr('class', 'core')
      .attr('r', d => d.r)
      .attr('fill', d => d.color)
      .style('filter', d => d.glowId !== 'none' ? `url(#${d.glowId})` : 'none')
      .style('cursor', d => d.isModule ? 'pointer' : 'default');

    // Decorative ring on module nodes
    nodeEls.filter(d => d.isModule).append('circle').attr('class', 'mring')
      .attr('r', 18).attr('fill', 'none')
      .attr('stroke', d => d.color).attr('stroke-width', '1px').attr('opacity', 0.45);

    // Inner glyph (cube/diamond) inside each hub — echoes the icon look from the reference
    nodeEls.filter(d => d.isModule).append('path')
      .attr('d', 'M0,-5 L5,0 L0,5 L-5,0 Z')
      .attr('fill', 'rgba(0,0,0,0.30)')
      .attr('stroke', 'rgba(255,255,255,0.55)')
      .attr('stroke-width', 0.8)
      .attr('pointer-events', 'none');

    // Module labels (Orbitron) — placed outward in overview
    nodeEls.filter(d => d.isModule).append('text').attr('class', 'mlabel')
      .attr('text-anchor', 'middle')
      .attr('fill', '#ffffff').attr('opacity', 0.85)
      .attr('font-family', "'Orbitron', 'Inter', sans-serif")
      .attr('font-size', 11).attr('letter-spacing', 3).attr('font-weight', 500)
      .attr('pointer-events', 'none')
      .text(d => d.label.toUpperCase().slice(0, 18));

    nodeEls.filter(d => d.isModule).append('text').attr('class', 'msub')
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(255,255,255,0.35)')
      .attr('font-family', "'Inter', sans-serif")
      .attr('font-size', 7)
      .attr('pointer-events', 'none')
      .text(d => {
        const n = galaxy.filesByMod.get(d.id)?.length ?? 0;
        return `${n} arquivo${n === 1 ? '' : 's'}`;
      });

    // File labels — hidden until focused
    nodeEls.filter(d => !d.isModule && d.depth === 1).append('text').attr('class', 'flabel')
      .attr('y', d => d.r + 9)
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(255,255,255,0.55)')
      .attr('font-family', "'Inter', sans-serif")
      .attr('font-size', 6)
      .attr('opacity', 0)
      .attr('pointer-events', 'none')
      .text(d => {
        const name = d.label.split('/').pop() ?? d.label;
        return name.replace(/\.(ts|tsx|js|jsx|java|py|sql|kt)$/, '').slice(0, 16);
      });

    // Position module labels (overview: outward of the node)
    function layoutModuleLabels() {
      nodeEls.filter(d => d.isModule).select('.mlabel')
        .attr('x', 0)
        .attr('y', d => Math.sin(d.labelAngle) >= 0 ? 36 : -26);
      nodeEls.filter(d => d.isModule).select('.msub')
        .attr('x', 0)
        .attr('y', d => Math.sin(d.labelAngle) >= 0 ? 47 : -16);
    }
    layoutModuleLabels();

    nodeEls
      .on('mouseover', function(_ev, d) {
        if (!d.isModule || focusedId) return;
        d3.select(this).select('.core').transition().duration(200).attr('r', d.r + 4);
      })
      .on('mouseout', function(_ev, d) {
        if (!d.isModule) return;
        d3.select(this).select('.core').transition().duration(200).attr('r', d.r);
      });

    // ── Focus a module: pan camera so module sits at bottom-center, morph its tree up
    function focusModule(id: string) {
      const m = gnodes.find(n => n.id === id && n.isModule);
      if (!m) return;
      focusedId = id;
      morphTarget = 1;

      // camera: place module world (m.ox,m.oy) near screen bottom-center
      const sf = FOCUS_SCALE;
      const tx = W / 2 - m.ox * sf;
      const ty = H * 0.84 - m.oy * sf;
      const focusT = d3.zoomIdentity.translate(tx, ty).scale(sf);
      mainGroup.transition().duration(1000).ease(d3.easeCubicInOut)
        .attr('transform', focusT.toString());

      // fades
      nodeEls.filter(d => d.isModule && d.id !== id)
        .transition().duration(550).attr('opacity', 0.06);
      nodeEls.filter(d => !d.isModule && d.moduleId !== id)
        .transition().duration(550).attr('opacity', 0.04);
      nodeEls.filter(d => d.moduleId === id)
        .transition().duration(550).attr('opacity', 1);

      // focused tree: brighter links, glow orbs, show file labels
      linkEls.transition().duration(550)
        .attr('opacity', (lk: GLink) => lk.src.moduleId === id ? 0.85 : 0.03);
      depEls.transition().delay(300).duration(500)
        .attr('opacity', (lk: GLink) => lk.src.moduleId === id ? 1 : 0);

      const focusNodes = nodeEls.filter(d => d.moduleId === id && !d.isModule);
      focusNodes.select('.core')
        .transition().duration(550)
        .attr('r', (d: GNode) => d.r * 1.5)
        .style('filter', 'url(#gal-glow-orb)');
      focusNodes.filter(d => d.depth === 1).select('.flabel')
        .transition().delay(400).duration(500).attr('opacity', 1);

      setZoomedModule(m.label);
    }

    function reset() {
      // keep focusedId until the morph eases back out; just flip the target now
      morphTarget = 0;
      mainGroup.transition().duration(900).ease(d3.easeCubicInOut)
        .attr('transform', overviewT.toString());

      nodeEls.transition().duration(500).attr('opacity', 1);
      linkEls.transition().duration(500).attr('opacity', 1);
      depEls.transition().duration(400).attr('opacity', 0);

      nodeEls.filter(d => !d.isModule).select('.core')
        .transition().duration(500)
        .attr('r', (d: GNode) => d.r)
        .style('filter', 'none');
      nodeEls.filter(d => !d.isModule && d.depth === 1).select('.flabel')
        .transition().duration(300).attr('opacity', 0);

      // clear focus once the morph has settled back
      window.setTimeout(() => { if (morphTarget === 0) focusedId = null; }, 950);
      setZoomedModule(null);
    }

    focusModuleRef.current = focusModule;
    resetRef.current = reset;

    nodeEls.filter(d => d.isModule).on('click', (_ev, d) => {
      if (focusedId === d.id) return;
      focusModule(d.id);
      onFocusIdxRef.current?.(d.modIndex);
    });

    // Animation timer: ease morph + breathing + draw links
    timerRef.current = d3.timer(elapsed => {
      morphValue += (morphTarget - morphValue) * 0.08;
      nodeEls.attr('transform', (d: GNode) => `translate(${px(d, elapsed)},${py(d, elapsed)})`);
      linkEls
        .attr('x1', (d: GLink) => px(d.src, elapsed)).attr('y1', (d: GLink) => py(d.src, elapsed))
        .attr('x2', (d: GLink) => px(d.tgt, elapsed)).attr('y2', (d: GLink) => py(d.tgt, elapsed));
      depEls
        .attr('x1', (d: GLink) => px(d.src, elapsed)).attr('y1', (d: GLink) => py(d.src, elapsed))
        .attr('x2', (d: GLink) => px(d.tgt, elapsed)).attr('y2', (d: GLink) => py(d.tgt, elapsed));
      nebulaEls
        .attr('cx', (d: typeof nebulaData[0]) => d.bx + Math.sin(elapsed * 0.0005 + d.off) * 15)
        .attr('cy', (d: typeof nebulaData[0]) => d.by + Math.cos(elapsed * 0.0007 + d.off) * 15);
    });

    return () => { if (timerRef.current) { timerRef.current.stop(); timerRef.current = null; } };
  }, [galaxy]);

  function resetZoom() {
    if (resetRef.current) resetRef.current();
  }

  // Bottom carousel: list of modules with their assigned colors
  const modList = galaxy
    ? galaxy.modules.slice(0, MAX_MODS).map((m, i) => ({ id: m.id, label: m.label, color: colorForIndex(i) }))
    : [];
  function goTo(i: number) {
    const n = modList.length;
    if (!n) return;
    const ni = ((i % n) + n) % n;
    setCurIdx(ni);
    focusModuleRef.current?.(modList[ni].id);
  }
  const current = modList[curIdx];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'radial-gradient(circle at center, #101216 0%, #050608 100%)',
      overflow: 'hidden', cursor: 'default',
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
        opacity: 0.16,
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
          opacity: zoomedModule ? 0 : 1, transition: 'opacity 0.4s',
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
          position: 'absolute', top: '42%', left: 0, right: 0,
          textAlign: 'center',
          fontSize: Math.max(44, Math.min(110, window.innerWidth / 10)),
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

      {/* Bottom carousel — navigate departments (‹ NAME ›) */}
      {!loading && !errMsg && modList.length > 0 && (
        <div style={{
          position: 'absolute', bottom: zoomedModule ? 78 : 26, left: '50%',
          transform: 'translateX(-50%)', zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 18,
          transition: 'bottom 0.4s',
        }}>
          <span onClick={() => goTo(curIdx - 1)} style={{
            cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 22,
            userSelect: 'none', padding: '0 6px',
          }}>‹</span>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 9,
            fontFamily: "'Orbitron', 'Inter', sans-serif",
            fontSize: 13, letterSpacing: 3, textTransform: 'uppercase',
            color: '#fff', minWidth: 160, justifyContent: 'center',
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: '50%', background: current?.color ?? '#fff',
              boxShadow: `0 0 8px ${current?.color ?? '#fff'}aa`,
            }} />
            {(current?.label ?? '').toUpperCase().slice(0, 18)}
          </span>
          <span onClick={() => goTo(curIdx + 1)} style={{
            cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 22,
            userSelect: 'none', padding: '0 6px',
          }}>›</span>
        </div>
      )}
    </div>
  );
}
