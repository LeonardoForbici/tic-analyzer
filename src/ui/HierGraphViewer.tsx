/**
 * Explorador hierárquico do grafo (estilo CAST Imaging):
 * app → camadas → módulos → arquivos → símbolos.
 *
 * Renderiza APENAS o nível visível (agregação server-side via IPC
 * get-graph-level), então funciona em projetos de 74k arquivos:
 * - duplo-clique expande um container (layer/module/file)
 * - breadcrumb colapsa de volta
 * - raio do nó ∝ nº de filhos · largura da aresta ∝ log(peso)
 * - cor da aresta: verde (resolvida por AST) → âmbar (heurística)
 */
import { useEffect, useRef, useState, useCallback } from 'react';

interface AggNode {
  id: string;
  label: string;
  kind: 'layer' | 'module' | 'file' | 'symbol' | 'more';
  layer?: string;
  childCount: number;
  inWeight: number;
  outWeight: number;
}

interface AggEdge { from: string; to: string; weight: number; resolvedWeight: number; }
interface LevelData { nodes: AggNode[]; edges: AggEdge[]; error?: string; }

const LAYER_COLORS: Record<string, string> = {
  frontend: '#4a9eff',
  backend: '#56cfad',
  database: '#f0a500',
  default: '#7c83fd'
};

const KIND_RING: Record<string, string> = { layer: '#ffffff', module: '#aab2ff', file: '#667', symbol: '#9d8cff', more: '#555' };

export function HierGraphViewer({ projectPath }: { projectPath: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [data, setData] = useState<LevelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AggNode | null>(null);

  const simRef = useRef<{
    positions: Map<string, { x: number; y: number; vx: number; vy: number }>;
    dragging: string | null;
    dragOffset: { x: number; y: number };
    pan: { x: number; y: number };
    scale: number;
    animFrame: number | null;
    isPanning: boolean;
    panStart: { x: number; y: number; px: number; py: number };
    lastClick: { id: string | null; time: number };
  }>({
    positions: new Map(), dragging: null, dragOffset: { x: 0, y: 0 },
    pan: { x: 0, y: 0 }, scale: 1, animFrame: null,
    isPanning: false, panStart: { x: 0, y: 0, px: 0, py: 0 },
    lastClick: { id: null, time: 0 }
  });

  // Carrega o nível visível sempre que o estado de expansão muda
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (window.ticAnalyzer.getGraphLevel(projectPath, expanded) as Promise<LevelData>).then((d) => {
      if (!alive) return;
      setData(d);
      setLoading(false);
      setSelected(null);
    });
    return () => { alive = false; };
  }, [projectPath, expanded]);

  const radiusOf = useCallback((n: AggNode): number => {
    if (n.kind === 'layer') return 34;
    if (n.kind === 'module') return Math.min(30, 12 + Math.sqrt(n.childCount) * 1.8);
    if (n.kind === 'more') return 14;
    if (n.kind === 'symbol') return 7;
    return 9;
  }, []);

  // Posições iniciais + simulação
  useEffect(() => {
    if (!data || data.error || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const W = canvas.width, H = canvas.height;
    const sim = simRef.current;

    // mantém posições de nós que continuam visíveis; novos entram perto do layer
    const visible = new Set(data.nodes.map((n) => n.id));
    for (const id of [...sim.positions.keys()]) if (!visible.has(id)) sim.positions.delete(id);
    data.nodes.forEach((node, i) => {
      if (sim.positions.has(node.id)) return;
      const xBase = node.layer === 'frontend' ? W * 0.18 : node.layer === 'backend' ? W * 0.5 : node.layer === 'database' ? W * 0.82 : W * 0.5;
      sim.positions.set(node.id, { x: xBase + (Math.random() - 0.5) * 160, y: 70 + (i % 14) * ((H - 100) / 14), vx: 0, vy: 0 });
    });

    if (sim.animFrame) cancelAnimationFrame(sim.animFrame);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frame = 0;

    const tick = () => {
      // força (Fruchterman-Reingold simplificado), congela após 180 frames
      if (frame < 180) {
        const k = Math.sqrt((W * H) / Math.max(data.nodes.length, 1)) * 0.55;
        for (const ni of data.nodes) {
          const pi = sim.positions.get(ni.id);
          if (!pi || sim.dragging === ni.id) continue;
          let fx = 0, fy = 0;
          for (const nj of data.nodes) {
            if (ni.id === nj.id) continue;
            const pj = sim.positions.get(nj.id);
            if (!pj) continue;
            const dx = pi.x - pj.x, dy = pi.y - pj.y;
            const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
            const rep = (k * k) / dist;
            fx += (dx / dist) * rep;
            fy += (dy / dist) * rep;
          }
          for (const e of data.edges) {
            let other: string | null = null;
            if (e.from === ni.id) other = e.to;
            else if (e.to === ni.id) other = e.from;
            if (!other) continue;
            const po = sim.positions.get(other);
            if (!po) continue;
            const dx = po.x - pi.x, dy = po.y - pi.y;
            const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
            const attr = ((dist * dist) / k) * 0.25;
            fx += (dx / dist) * attr;
            fy += (dy / dist) * attr;
          }
          fx += (W / 2 - pi.x) * 0.012;
          fy += (H / 2 - pi.y) * 0.012;
          pi.vx = (pi.vx + fx) * 0.68;
          pi.vy = (pi.vy + fy) * 0.68;
          pi.x = Math.max(46, Math.min(W - 46, pi.x + pi.vx));
          pi.y = Math.max(46, Math.min(H - 46, pi.y + pi.vy));
        }
      }

      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(sim.pan.x, sim.pan.y);
      ctx.scale(sim.scale, sim.scale);

      // arestas (largura ∝ log do peso; cor pela fração resolvida)
      for (const e of data.edges) {
        const pf = sim.positions.get(e.from);
        const pt = sim.positions.get(e.to);
        if (!pf || !pt) continue;
        const ratio = e.weight > 0 ? e.resolvedWeight / e.weight : 0;
        const r = Math.round(86 + (240 - 86) * (1 - ratio));
        const g = Math.round(207 - (207 - 165) * (1 - ratio));
        const b = Math.round(173 - 173 * (1 - ratio));
        ctx.strokeStyle = `rgba(${r},${g},${b},0.55)`;
        ctx.lineWidth = Math.min(7, 1 + Math.log2(e.weight + 1)) / sim.scale;
        ctx.beginPath();
        ctx.moveTo(pf.x, pf.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        const angle = Math.atan2(pt.y - pf.y, pt.x - pf.x);
        const toNode = data.nodes.find((n) => n.id === e.to);
        const off = toNode ? radiusOf(toNode) + 2 : 10;
        const ax = pt.x - off * Math.cos(angle);
        const ay = pt.y - off * Math.sin(angle);
        const as = 7 / sim.scale;
        ctx.fillStyle = `rgba(${r},${g},${b},0.8)`;
        ctx.beginPath();
        ctx.moveTo(ax - as * Math.cos(angle - 0.45), ay - as * Math.sin(angle - 0.45));
        ctx.lineTo(ax, ay);
        ctx.lineTo(ax - as * Math.cos(angle + 0.45), ay - as * Math.sin(angle + 0.45));
        ctx.fill();
        // peso da aresta no meio (só agregadas com peso > 1)
        if (e.weight > 1 && sim.scale > 0.6) {
          ctx.fillStyle = 'rgba(200,200,220,0.8)';
          ctx.font = `${10 / sim.scale}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(String(e.weight), (pf.x + pt.x) / 2, (pf.y + pt.y) / 2 - 4 / sim.scale);
        }
      }

      // nós
      for (const node of data.nodes) {
        const p = sim.positions.get(node.id);
        if (!p) continue;
        const R = radiusOf(node) / Math.max(0.7, Math.min(1.6, sim.scale));
        const color = LAYER_COLORS[node.layer ?? 'default'];
        const isSel = selected?.id === node.id;

        if (node.kind === 'layer' || node.kind === 'module') {
          // halo p/ containers expandíveis
          ctx.beginPath();
          ctx.arc(p.x, p.y, R + 5 / sim.scale, 0, Math.PI * 2);
          ctx.strokeStyle = color + '44';
          ctx.lineWidth = 4 / sim.scale;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
        ctx.fillStyle = isSel ? '#fff' : node.kind === 'more' ? '#1a1a3a' : color + (node.kind === 'file' || node.kind === 'symbol' ? '99' : 'cc');
        ctx.fill();
        ctx.strokeStyle = isSel ? '#fff' : KIND_RING[node.kind] ?? color;
        ctx.lineWidth = (isSel ? 2.5 : 1.2) / sim.scale;
        ctx.stroke();

        if (node.childCount > 0 && (node.kind === 'layer' || node.kind === 'module' || node.kind === 'more')) {
          ctx.fillStyle = isSel ? '#16213e' : '#0d1117';
          ctx.font = `bold ${Math.max(9, R * 0.55)}px 'Segoe UI', sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(node.childCount), p.x, p.y);
          ctx.textBaseline = 'alphabetic';
        }
        if (sim.scale > 0.45) {
          ctx.fillStyle = isSel ? '#fff' : '#ccc';
          ctx.font = `${Math.max(9, 11 / sim.scale)}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(node.label.slice(0, 26), p.x, p.y + R + 13 / sim.scale);
        }
      }

      ctx.restore();
      frame++;
      sim.animFrame = requestAnimationFrame(tick);
    };
    sim.animFrame = requestAnimationFrame(tick);
    return () => { if (sim.animFrame) cancelAnimationFrame(sim.animFrame); };
  }, [data, selected, radiusOf]);

  const nodeAt = useCallback((mx: number, my: number): AggNode | null => {
    if (!data) return null;
    const sim = simRef.current;
    const cx = (mx - sim.pan.x) / sim.scale;
    const cy = (my - sim.pan.y) / sim.scale;
    for (const node of data.nodes) {
      const p = sim.positions.get(node.id);
      if (!p) continue;
      const R = radiusOf(node) / Math.max(0.7, Math.min(1.6, sim.scale)) + 4;
      if (Math.sqrt((cx - p.x) ** 2 + (cy - p.y) ** 2) < R) return node;
    }
    return null;
  }, [data, radiusOf]);

  const expand = useCallback((node: AggNode) => {
    if (node.kind === 'symbol' || node.kind === 'more') return;
    if (expanded.includes(node.id)) return;
    setExpanded((prev) => [...prev, node.id]);
  }, [expanded]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const sim = simRef.current;
    const node = nodeAt(mx, my);
    const now = Date.now();
    if (node) {
      // duplo-clique = expandir
      if (sim.lastClick.id === node.id && now - sim.lastClick.time < 350) {
        expand(node);
        sim.lastClick = { id: null, time: 0 };
        return;
      }
      sim.lastClick = { id: node.id, time: now };
      setSelected(node);
      const p = sim.positions.get(node.id);
      if (p) {
        sim.dragging = node.id;
        sim.dragOffset = { x: (mx - sim.pan.x) / sim.scale - p.x, y: (my - sim.pan.y) / sim.scale - p.y };
      }
    } else {
      sim.lastClick = { id: null, time: 0 };
      sim.isPanning = true;
      sim.panStart = { x: e.clientX, y: e.clientY, px: sim.pan.x, py: sim.pan.y };
    }
  }, [nodeAt, expand]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    if (sim.dragging) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const p = sim.positions.get(sim.dragging);
      if (p) {
        p.x = (e.clientX - rect.left - sim.pan.x) / sim.scale - sim.dragOffset.x;
        p.y = (e.clientY - rect.top - sim.pan.y) / sim.scale - sim.dragOffset.y;
        p.vx = 0; p.vy = 0;
      }
    } else if (sim.isPanning) {
      sim.pan.x = sim.panStart.px + e.clientX - sim.panStart.x;
      sim.pan.y = sim.panStart.py + e.clientY - sim.panStart.y;
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    const sim = simRef.current;
    sim.dragging = null;
    sim.isPanning = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const sim = simRef.current;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.15, Math.min(5, sim.scale * factor));
    sim.pan.x = mx - (mx - sim.pan.x) * (newScale / sim.scale);
    sim.pan.y = my - (my - sim.pan.y) * (newScale / sim.scale);
    sim.scale = newScale;
  }, []);

  const breadcrumb = [{ id: '__root__', label: 'Aplicação' }, ...expanded.map((id) => ({ id, label: id.slice(id.indexOf(':') + 1).split('/').pop() ?? id }))];

  return (
    <div>
      {/* Breadcrumb de drill-down */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
        {breadcrumb.map((b, i) => (
          <span key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {i > 0 && <span style={{ color: '#555' }}>›</span>}
            <button
              onClick={() => setExpanded(i === 0 ? [] : expanded.slice(0, i))}
              style={{
                padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                background: i === breadcrumb.length - 1 ? '#7c83fd' : '#1a1a3a',
                border: '1px solid #2a2a4e', color: i === breadcrumb.length - 1 ? '#fff' : '#aaa',
                fontFamily: 'monospace'
              }}>
              {b.label}
            </button>
          </span>
        ))}
        <span style={{ fontSize: '11px', color: '#666', marginLeft: 'auto' }}>
          {data && !data.error ? `${data.nodes.length} nós · ${data.edges.length} arestas` : ''} · 2×clique = expandir · scroll = zoom
        </span>
      </div>

      {data?.error && <div style={{ padding: '20px', color: '#ff6b6b', fontSize: '13px' }}>{data.error}</div>}

      <div style={{ position: 'relative', opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
        <canvas
          ref={canvasRef} width={900} height={500}
          style={{ background: '#0d1117', borderRadius: '8px', cursor: 'grab', display: 'block', maxWidth: '100%' }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={handleWheel}
        />

        {/* Legenda */}
        <div style={{ position: 'absolute', left: 10, bottom: 10, display: 'flex', gap: '12px', fontSize: '11px', color: '#aaa', background: '#0d1117cc', padding: '6px 10px', borderRadius: '6px' }}>
          {Object.entries(LAYER_COLORS).filter(([k]) => k !== 'default').map(([layer, color]) => (
            <span key={layer} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block' }} />{layer}
            </span>
          ))}
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 18, height: 2, background: '#56cfad', display: 'inline-block' }} />AST</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 18, height: 2, background: '#f0a500', display: 'inline-block' }} />heurística</span>
        </div>

        {/* Painel do nó selecionado */}
        {selected && (
          <div style={{ position: 'absolute', top: 8, right: 8, background: '#16213e', border: '1px solid #2a2a4e', borderRadius: '8px', padding: '10px 14px', maxWidth: '280px', fontSize: '12px' }}>
            <div style={{ color: LAYER_COLORS[selected.layer ?? 'default'], fontWeight: 600, marginBottom: '4px', wordBreak: 'break-all' }}>{selected.label}</div>
            <div style={{ color: '#888' }}>
              {selected.kind}{selected.layer ? ` · ${selected.layer}` : ''}
              {selected.childCount > 0 ? ` · ${selected.childCount} filhos` : ''}
            </div>
            <div style={{ color: '#888', marginTop: '4px' }}>dependências: in {selected.inWeight} · out {selected.outWeight}</div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              {(selected.kind === 'layer' || selected.kind === 'module' || selected.kind === 'file') && (
                <button onClick={() => expand(selected)} style={{ padding: '4px 10px', background: '#7c83fd', border: 'none', borderRadius: '5px', color: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>
                  ⤵ Expandir
                </button>
              )}
              <button onClick={() => setSelected(null)} style={{ padding: '4px 10px', background: '#0d1117', border: '1px solid #2a2a4e', borderRadius: '5px', color: '#888', cursor: 'pointer', fontSize: '11px' }}>Fechar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
