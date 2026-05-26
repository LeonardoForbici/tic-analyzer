import { useEffect, useRef, useState, useCallback } from 'react';

interface GraphNode {
  id: string;
  label: string;
  layer?: 'frontend' | 'backend' | 'database';
  path?: string;
  file?: string;
  inDegree?: number;
  outDegree?: number;
}

interface GraphEdge {
  from: string;
  to: string;
  type?: string;
  confidence?: string;
  label?: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphViewerProps {
  ticCodeDir: string;
  mode: 'call' | 'deps';
}

const LAYER_COLORS: Record<string, string> = {
  frontend: '#4a9eff',
  backend: '#56cfad',
  database: '#f0a500',
  default: '#7c83fd'
};

const LAYER_LABELS: Record<string, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  database: 'PL/SQL / Database'
};

export function GraphViewer({ ticCodeDir, mode }: GraphViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [filterLayer, setFilterLayer] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });

  // Simulation state
  const simRef = useRef<{
    positions: Map<string, { x: number; y: number; vx: number; vy: number }>;
    dragging: string | null;
    dragOffset: { x: number; y: number };
    pan: { x: number; y: number };
    scale: number;
    animFrame: number | null;
    isPanning: boolean;
    panStart: { x: number; y: number; px: number; py: number };
  }>({
    positions: new Map(),
    dragging: null,
    dragOffset: { x: 0, y: 0 },
    pan: { x: 0, y: 0 },
    scale: 1,
    animFrame: null,
    isPanning: false,
    panStart: { x: 0, y: 0, px: 0, py: 0 }
  });

  // Load graph data
  useEffect(() => {
    const file = mode === 'call' ? `${ticCodeDir}/call-graph.json` : `${ticCodeDir}/dep-graph.json`;
    window.ticAnalyzer.readFile(file).then((content) => {
      if (!content) { setError(`Arquivo não encontrado. Execute a análise.`); setLoading(false); return; }
      try {
        const data: GraphData = JSON.parse(content);
        // Limit for dep-graph to avoid performance issues
        const maxNodes = mode === 'deps' ? 200 : data.nodes.length;
        const limited: GraphData = {
          nodes: data.nodes.slice(0, maxNodes),
          edges: data.edges.filter((e) => data.nodes.slice(0, maxNodes).some((n) => n.id === e.from || n.path === e.from))
            .slice(0, 500)
        };
        setGraphData(limited);
        setStats({ nodes: limited.nodes.length, edges: limited.edges.length });
      } catch { setError('Erro ao parsear dados do grafo.'); }
      setLoading(false);
    });
  }, [ticCodeDir, mode]);

  // Initialize force simulation positions
  useEffect(() => {
    if (!graphData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const W = canvas.width;
    const H = canvas.height;
    const sim = simRef.current;
    sim.positions.clear();

    const filtered = getFilteredData(graphData, filterLayer, searchTerm);

    filtered.nodes.forEach((node, i) => {
      if (sim.positions.has(node.id)) return;
      // Arrange by layer
      const layer = node.layer ?? 'default';
      const xBase = layer === 'frontend' ? W * 0.15 : layer === 'backend' ? W * 0.5 : layer === 'database' ? W * 0.85 : W * 0.5;
      sim.positions.set(node.id, {
        x: xBase + (Math.random() - 0.5) * 120,
        y: 60 + (i % 12) * (H / 13),
        vx: 0, vy: 0
      });
    });

    startSimulation(filtered);
    return () => { if (sim.animFrame) cancelAnimationFrame(sim.animFrame); };
  }, [graphData, filterLayer, searchTerm]);

  const getFilteredData = (data: GraphData, layer: string, search: string): GraphData => {
    let nodes = data.nodes;
    if (layer !== 'all') nodes = nodes.filter((n) => (n.layer ?? 'default') === layer);
    if (search) nodes = nodes.filter((n) => n.label?.toLowerCase().includes(search.toLowerCase()) || n.file?.toLowerCase().includes(search.toLowerCase()));
    const nodeIds = new Set(nodes.map((n) => n.id ?? n.path));
    const edges = data.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
    return { nodes, edges };
  };

  const startSimulation = useCallback((data: GraphData) => {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (sim.animFrame) cancelAnimationFrame(sim.animFrame);

    let frame = 0;

    const tick = () => {
      const W = canvas.width;
      const H = canvas.height;

      // Force simulation (simplified Fruchterman-Reingold)
      if (frame < 150) { // Only simulate for 150 frames
        const k = Math.sqrt((W * H) / Math.max(data.nodes.length, 1)) * 0.5;

        // Repulsion between all nodes
        const nodeList = data.nodes;
        for (let i = 0; i < nodeList.length; i++) {
          const ni = nodeList[i];
          const pi = sim.positions.get(ni.id);
          if (!pi) continue;
          let fx = 0, fy = 0;

          for (let j = 0; j < nodeList.length; j++) {
            if (i === j) continue;
            const pj = sim.positions.get(nodeList[j].id);
            if (!pj) continue;
            const dx = pi.x - pj.x;
            const dy = pi.y - pj.y;
            const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
            const rep = (k * k) / dist;
            fx += (dx / dist) * rep;
            fy += (dy / dist) * rep;
          }

          // Attraction along edges
          for (const edge of data.edges) {
            let otherId: string | null = null;
            if (edge.from === ni.id) otherId = edge.to;
            else if (edge.to === ni.id) otherId = edge.from;
            if (!otherId) continue;
            const po = sim.positions.get(otherId);
            if (!po) continue;
            const dx = po.x - pi.x;
            const dy = po.y - pi.y;
            const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
            const attr = (dist * dist) / k * 0.3;
            fx += (dx / dist) * attr;
            fy += (dy / dist) * attr;
          }

          // Center gravity
          fx += (W / 2 - pi.x) * 0.01;
          fy += (H / 2 - pi.y) * 0.01;

          pi.vx = (pi.vx + fx) * 0.7;
          pi.vy = (pi.vy + fy) * 0.7;
          pi.x = Math.max(40, Math.min(W - 40, pi.x + pi.vx));
          pi.y = Math.max(40, Math.min(H - 40, pi.y + pi.vy));
        }
      }

      // Draw
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(sim.pan.x, sim.pan.y);
      ctx.scale(sim.scale, sim.scale);

      // Draw edges
      ctx.lineWidth = 1 / sim.scale;
      for (const edge of data.edges) {
        const pf = sim.positions.get(edge.from);
        const pt = sim.positions.get(edge.to);
        if (!pf || !pt) continue;
        const isGreen = edge.confidence === '🟢';
        ctx.strokeStyle = isGreen ? 'rgba(86,207,173,0.5)' : 'rgba(240,165,0,0.4)';
        ctx.beginPath();
        ctx.moveTo(pf.x, pf.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        // Arrow
        const angle = Math.atan2(pt.y - pf.y, pt.x - pf.x);
        const arrowSize = 6 / sim.scale;
        ctx.fillStyle = isGreen ? 'rgba(86,207,173,0.7)' : 'rgba(240,165,0,0.6)';
        ctx.beginPath();
        ctx.moveTo(pt.x - arrowSize * Math.cos(angle - 0.4), pt.y - arrowSize * Math.sin(angle - 0.4));
        ctx.lineTo(pt.x, pt.y);
        ctx.lineTo(pt.x - arrowSize * Math.cos(angle + 0.4), pt.y - arrowSize * Math.sin(angle + 0.4));
        ctx.fill();
      }

      // Draw nodes
      const nodeR = Math.max(5, 14 / sim.scale);
      for (const node of data.nodes) {
        const p = sim.positions.get(node.id);
        if (!p) continue;
        const color = LAYER_COLORS[node.layer ?? 'default'];
        const isSelected = selected?.id === node.id;

        ctx.beginPath();
        ctx.arc(p.x, p.y, isSelected ? nodeR * 1.4 : nodeR, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#fff' : color + 'cc';
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#fff' : color;
        ctx.lineWidth = isSelected ? 2 / sim.scale : 1 / sim.scale;
        ctx.stroke();

        // Label
        if (sim.scale > 0.5) {
          ctx.fillStyle = isSelected ? '#fff' : '#ccc';
          ctx.font = `${Math.max(9, 11 / sim.scale)}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(node.label?.slice(0, 20) ?? '', p.x, p.y + nodeR + 12 / sim.scale);
        }
      }

      ctx.restore();
      frame++;
      sim.animFrame = requestAnimationFrame(tick);
    };

    sim.animFrame = requestAnimationFrame(tick);
  }, [selected]);

  // Mouse events
  const getNodeAt = (mx: number, my: number, data: GraphData): GraphNode | null => {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const cx = (mx - sim.pan.x) / sim.scale;
    const cy = (my - sim.pan.y) / sim.scale;
    const R = Math.max(5, 18 / sim.scale);
    for (const node of data.nodes) {
      const p = sim.positions.get(node.id);
      if (!p) continue;
      if (Math.sqrt((cx - p.x) ** 2 + (cy - p.y) ** 2) < R) return node;
    }
    return null;
  };

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!graphData) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const sim = simRef.current;
    const filtered = getFilteredData(graphData, filterLayer, searchTerm);
    const node = getNodeAt(mx, my, filtered);
    if (node) {
      setSelected(node);
      const p = sim.positions.get(node.id);
      if (p) {
        sim.dragging = node.id;
        sim.dragOffset = { x: (mx - sim.pan.x) / sim.scale - p.x, y: (my - sim.pan.y) / sim.scale - p.y };
      }
    } else {
      sim.isPanning = true;
      sim.panStart = { x: e.clientX, y: e.clientY, px: sim.pan.x, py: sim.pan.y };
    }
  }, [graphData, filterLayer, searchTerm]);

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
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5, sim.scale * factor));
    sim.pan.x = mx - (mx - sim.pan.x) * (newScale / sim.scale);
    sim.pan.y = my - (my - sim.pan.y) * (newScale / sim.scale);
    sim.scale = newScale;
  }, []);

  const resetView = useCallback(() => {
    const sim = simRef.current;
    sim.pan = { x: 0, y: 0 };
    sim.scale = 1;
  }, []);

  const layers = graphData ? [...new Set(graphData.nodes.map((n) => n.layer ?? 'default'))].filter(Boolean) : [];

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Carregando grafo...</div>;
  if (error) return <div style={{ padding: '20px', color: '#ff6b6b', fontSize: '13px' }}>{error}</div>;
  if (!graphData || graphData.nodes.length === 0) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Nenhum dado de grafo disponível.</div>;

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={resetView} style={{ padding: '5px 12px', background: '#1a1a3a', border: '1px solid #2a2a4e', borderRadius: '6px', color: '#aaa', cursor: 'pointer', fontSize: '12px' }}>⟳ Reset</button>
        <select value={filterLayer} onChange={(e) => setFilterLayer(e.target.value)}
          style={{ padding: '5px 8px', background: '#1a1a3a', border: '1px solid #2a2a4e', borderRadius: '6px', color: '#ccc', fontSize: '12px', cursor: 'pointer' }}>
          <option value="all">Todas as camadas</option>
          {layers.map((l) => <option key={l} value={l}>{LAYER_LABELS[l] ?? l}</option>)}
        </select>
        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Filtrar nó..."
          style={{ padding: '5px 10px', background: '#1a1a3a', border: '1px solid #2a2a4e', borderRadius: '6px', color: '#ccc', fontSize: '12px', width: '160px' }} />
        <span style={{ fontSize: '11px', color: '#666', marginLeft: 'auto' }}>{stats.nodes} nós · {stats.edges} arestas · scroll=zoom · drag=mover</span>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
        {Object.entries(LAYER_COLORS).filter(([k]) => k !== 'default').map(([layer, color]) => (
          <div key={layer} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#aaa' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
            {LAYER_LABELS[layer] ?? layer}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#aaa' }}>
          <div style={{ width: 20, height: 2, background: '#56cfad' }} /> 🟢 detectado
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#aaa' }}>
          <div style={{ width: 20, height: 2, background: '#f0a500' }} /> 🟡 inferido
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={900}
          height={480}
          style={{ background: '#0d1117', borderRadius: '8px', cursor: 'grab', display: 'block', maxWidth: '100%' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />

        {/* Selected node info */}
        {selected && (
          <div style={{ position: 'absolute', top: 8, right: 8, background: '#16213e', border: '1px solid #2a2a4e', borderRadius: '8px', padding: '10px 14px', maxWidth: '250px', fontSize: '12px' }}>
            <div style={{ color: LAYER_COLORS[selected.layer ?? 'default'], fontWeight: 600, marginBottom: '6px' }}>
              {selected.label}
            </div>
            {selected.layer && <div style={{ color: '#888' }}>Camada: {LAYER_LABELS[selected.layer] ?? selected.layer}</div>}
            {selected.file && <div style={{ color: '#888', wordBreak: 'break-all', marginTop: '4px' }}>{selected.file}</div>}
            {(selected.inDegree !== undefined || selected.outDegree !== undefined) && (
              <div style={{ color: '#888', marginTop: '4px' }}>
                {selected.inDegree !== undefined && `In: ${selected.inDegree}`}
                {selected.outDegree !== undefined && ` · Out: ${selected.outDegree}`}
              </div>
            )}
            <button onClick={() => setSelected(null)} style={{ marginTop: '8px', padding: '3px 8px', background: '#0d1117', border: '1px solid #2a2a4e', borderRadius: '4px', color: '#888', cursor: 'pointer', fontSize: '11px' }}>Fechar</button>
          </div>
        )}
      </div>
    </div>
  );
}
