/**
 * Explorador hierárquico com Cytoscape.js + Dagre:
 * layout DAG hierárquico, Focus/Ego mode, search/filter, 500+ nós sem engasgo.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module 'cytoscape-dagre';

import { useEffect, useRef, useState, useCallback } from 'react';
import cytoscape from 'cytoscape';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import dagre from 'cytoscape-dagre';

cytoscape.use(dagre);

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

// ── Paleta constellation ────────────────────────────────────────────────────
const C = {
  bg: '#060d1a',
  // node fills
  nodeAmber: '#e8b84b',
  nodeAmberDim: '#c49530',
  nodeAmberBright: '#f5d480',
  nodeGlow: 'rgba(232, 184, 75, 0.45)',
  nodeGlowStrong: 'rgba(232, 184, 75, 0.70)',
  // edges
  edgeWhite: 'rgba(255,255,255,0.22)',
  edgeWhiteHover: 'rgba(255,255,255,0.55)',
  // ui chrome
  surface: '#0d1628',
  surfaceHigh: '#172038',
  border: '#2a3a55',
  textPrimary: 'rgba(255,255,255,0.92)',
  textMuted: 'rgba(255,255,255,0.45)',
  accent: '#00dbe9',
  accentDim: '#00363a',
};

const F = { body: "'Inter', system-ui, sans-serif", code: "'JetBrains Mono', monospace" };

// ── Layer accent colors (para painel info / legenda) ────────────────────────
const LAYER_COLORS: Record<string, string> = {
  frontend: '#4a9eff', backend: '#4edea3', database: '#ffb95f', default: C.nodeAmber,
};

// Tamanho dos nós por kind
function nodeSize(kind: AggNode['kind']): number {
  return kind === 'layer' ? 28 : kind === 'module' ? 20 : kind === 'symbol' ? 9 : kind === 'more' ? 12 : 13;
}

const CY_STYLE: cytoscape.Stylesheet[] = [
  // ── Base ──────────────────────────────────────────────────────────────────
  {
    selector: 'node',
    style: {
      'shape': 'ellipse',
      'width': 13, 'height': 13,
      'background-color': C.nodeAmber,
      'border-width': 1.5,
      'border-color': C.nodeAmberBright,
      'border-opacity': 0.7,
      'label': 'data(label)',
      'font-family': 'Inter, system-ui, sans-serif',
      'font-size': 10,
      'font-weight': 400,
      'color': C.textPrimary,
      'text-valign': 'center',
      'text-halign': 'right',
      'text-margin-x': 8,
      'text-max-width': '120px',
      'text-overflow-wrap': 'anywhere' as any,
      'shadow-blur': 14,
      'shadow-color': C.nodeGlow,
      'shadow-offset-x': 0,
      'shadow-offset-y': 0,
      'shadow-opacity': 1,
    },
  },
  // ── Layer (nó mais relevante — hub) ───────────────────────────────────────
  {
    selector: 'node[kind = "layer"]',
    style: {
      'width': 28, 'height': 28,
      'background-color': C.nodeAmberBright,
      'border-color': '#fff',
      'border-width': 2,
      'border-opacity': 0.6,
      'font-size': 11,
      'font-weight': 700,
      'shadow-blur': 28,
      'shadow-color': C.nodeGlowStrong,
    },
  },
  // ── Module ────────────────────────────────────────────────────────────────
  {
    selector: 'node[kind = "module"]',
    style: {
      'width': 20, 'height': 20,
      'shadow-blur': 18,
      'shadow-color': C.nodeGlow,
    },
  },
  // ── File ──────────────────────────────────────────────────────────────────
  {
    selector: 'node[kind = "file"]',
    style: {
      'width': 11, 'height': 11,
      'background-color': C.nodeAmberDim,
      'border-width': 1,
      'shadow-blur': 8,
      'font-size': 9,
    },
  },
  // ── Symbol ────────────────────────────────────────────────────────────────
  {
    selector: 'node[kind = "symbol"]',
    style: {
      'width': 8, 'height': 8,
      'background-color': '#9d8cff',
      'border-color': '#c4b8ff',
      'border-width': 1,
      'shadow-blur': 8,
      'shadow-color': 'rgba(157,140,255,0.5)',
      'font-size': 9,
    },
  },
  // ── More (pseudo-nó) ──────────────────────────────────────────────────────
  {
    selector: 'node[kind = "more"]',
    style: {
      'width': 10, 'height': 10,
      'background-color': 'rgba(255,255,255,0.08)',
      'border-style': 'dashed',
      'border-color': 'rgba(255,255,255,0.25)',
      'border-width': 1,
      'shadow-blur': 0,
      'color': C.textMuted,
      'font-size': 9,
    },
  },
  // ── Edges ─────────────────────────────────────────────────────────────────
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      'line-color': C.edgeWhite,
      'target-arrow-shape': 'none',
      'width': 0.8,
      'opacity': 0.6,
    },
  },
  {
    selector: 'edge.ast',
    style: { 'line-color': 'rgba(255,255,255,0.28)', 'opacity': 0.7 },
  },
  {
    selector: 'edge.heuristic',
    style: { 'line-color': 'rgba(255,185,95,0.25)', 'line-style': 'dashed', 'opacity': 0.5 },
  },
  // ── Estados interativos ───────────────────────────────────────────────────
  {
    selector: ':selected',
    style: {
      'border-width': 2.5,
      'border-color': '#fff',
      'shadow-blur': 30,
      'shadow-color': 'rgba(255,255,255,0.6)',
    },
  },
  {
    selector: 'node.search-match',
    style: {
      'border-width': 2.5,
      'border-color': C.accent,
      'shadow-blur': 24,
      'shadow-color': `${C.accent}88`,
    },
  },
  { selector: '.faded', style: { 'opacity': 0.06 } },
];

// ── Campo de partículas (canvas independente) ───────────────────────────────
function useParticleField(canvasRef: React.RefObject<HTMLCanvasElement>, width: number, height: number) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Semear com seed determinístico para evitar re-renders piscantes
    const rng = (() => { let s = 0x9e3779b9; return () => { s ^= s << 13; s ^= s >> 7; s ^= s << 17; return (s >>> 0) / 0xffffffff; }; })();
    const N = Math.round((width * height) / 3200); // ~densididade fixa por px²

    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < N; i++) {
      const x = rng() * width;
      const y = rng() * height;
      const r = rng() < 0.15 ? 1.5 : rng() < 0.5 ? 1.1 : 0.7;
      const alpha = 0.12 + rng() * 0.28;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,200,240,${alpha.toFixed(2)})`;
      ctx.fill();
    }
  }, [canvasRef, width, height]);
}

function Icon({ name, size = 14, color }: { name: string; size?: number; color?: string }) {
  return (
    <span className="material-symbols-outlined" style={{
      fontSize: `${size}px`, color, lineHeight: 1, display: 'inline-flex', alignItems: 'center',
      fontVariationSettings: `'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
    }}>{name}</span>
  );
}

const GRAPH_HEIGHT = 580;
const GRAPH_WIDTH_FALLBACK = 900;

export function HierGraphViewer({ projectPath }: { projectPath: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [graphWidth, setGraphWidth] = useState(GRAPH_WIDTH_FALLBACK);

  const [expanded, setExpanded] = useState<string[]>([]);
  const [data, setData] = useState<LevelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AggNode | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'cose' | 'dagre' | 'grid'>('cose');
  const [searchQuery, setSearchQuery] = useState('');

  const focusModeRef = useRef(focusMode);
  useEffect(() => { focusModeRef.current = focusMode; }, [focusMode]);

  // Mede a largura real do wrapper para o particle canvas
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setGraphWidth(entry.contentRect.width || GRAPH_WIDTH_FALLBACK));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useParticleField(particleCanvasRef, graphWidth, GRAPH_HEIGHT);

  // Carrega dados quando expanded muda
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

  // Inicializa Cytoscape uma vez
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      style: CY_STYLE,
      wheelSensitivity: 0.3,
      minZoom: 0.05,
      maxZoom: 4,
    });
    cyRef.current = cy;
    return () => { cy.destroy(); cyRef.current = null; };
  }, []);

  const expand = useCallback((id: string) => {
    setExpanded((prev) => prev.includes(id) ? prev : [...prev, id]);
  }, []);

  // Reconstrói o grafo quando dados ou layout mudam
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !data || data.error) return;

    cy.elements().remove();

    cy.add(data.nodes.map((n) => ({
      group: 'nodes' as const,
      data: { id: n.id, label: n.label, kind: n.kind, layer: n.layer ?? '', childCount: n.childCount, inWeight: n.inWeight, outWeight: n.outWeight },
    })));

    cy.add(data.edges.map((e) => {
      const ratio = e.weight > 0 ? e.resolvedWeight / e.weight : 0;
      return {
        group: 'edges' as const,
        data: { id: `${e.from}→${e.to}`, source: e.from, target: e.to, weight: e.weight },
        classes: ratio >= 0.5 ? 'ast' : 'heuristic',
      };
    }));

    // Espessura de aresta por peso (mais suave que antes)
    cy.edges().forEach((e) => {
      const w = e.data('weight') as number;
      e.style('width', Math.min(2.5, 0.6 + Math.log1p(w) * 0.35));
    });

    // Aplica layout
    const layoutOpts: any =
      layoutMode === 'dagre' ? { name: 'dagre', rankDir: 'TB', nodeSep: 60, rankSep: 80, animate: false }
      : layoutMode === 'grid' ? { name: 'grid', animate: false }
      : { name: 'cose', animate: false, randomize: true, nodeRepulsion: () => 6000, idealEdgeLength: () => 100, gravity: 0.25 };

    cy.layout(layoutOpts).run();
    cy.fit(undefined, 48);

    cy.off('dblclick').on('dblclick', 'node', (e) => {
      const { id, kind } = e.target.data() as AggNode;
      if (['layer', 'module', 'file'].includes(kind)) expand(id);
    });

    cy.off('tap').on('tap', 'node', (e) => {
      const nodeData = e.target.data() as AggNode;
      setSelected(nodeData);
      if (focusModeRef.current) {
        const ego = e.target.closedNeighborhood().add(e.target.closedNeighborhood().neighborhood());
        cy.elements().addClass('faded');
        ego.removeClass('faded');
      }
    });

    cy.on('tap', (e) => {
      if (e.target === cy) { cy.elements().removeClass('faded'); setSelected(null); }
    });
  }, [data, layoutMode, expand]);

  // Limpa faded quando focus mode desliga
  useEffect(() => {
    if (!focusMode) { cyRef.current?.elements().removeClass('faded'); setSelected(null); }
  }, [focusMode]);

  // Highlight de busca
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass('search-match');
    if (searchQuery.length > 1) {
      const q = searchQuery.toLowerCase();
      cy.nodes().filter((n) => (n.data('label') as string).toLowerCase().includes(q)).addClass('search-match');
    }
  }, [searchQuery]);

  const fitView = useCallback(() => { cyRef.current?.fit(undefined, 48); }, []);

  const breadcrumb = [
    { id: '__root__', label: 'Aplicação' },
    ...expanded.map((id) => ({ id, label: id.slice(id.indexOf(':') + 1).split('/').pop() ?? id })),
  ];

  // ── Styles inline reutilizados ─────────────────────────────────────────────
  const btnBase: React.CSSProperties = {
    padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
    fontFamily: F.code, display: 'flex', alignItems: 'center', gap: 4,
    background: C.surfaceHigh, border: `1px solid ${C.border}`, color: C.textMuted,
  };
  const btnActive: React.CSSProperties = {
    ...btnBase, background: C.accent, border: `1px solid ${C.accent}`, color: C.accentDim, fontWeight: 700,
  };

  return (
    <div style={{ fontFamily: F.body, color: C.textPrimary, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flex: '1 1 auto', flexWrap: 'wrap' }}>
          {breadcrumb.map((b, i) => {
            const isLast = i === breadcrumb.length - 1;
            return (
              <span key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {i > 0 && <span style={{ color: C.textMuted, fontSize: 13 }}>›</span>}
                <button
                  onClick={() => setExpanded(i === 0 ? [] : expanded.slice(0, i))}
                  style={isLast ? { ...btnBase, background: C.surfaceHigh, color: C.textPrimary, fontWeight: 700 } : btnBase}>
                  {b.label}
                </button>
              </span>
            );
          })}
        </div>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="search" size={14} color={C.textMuted} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar nó…"
            style={{
              padding: '3px 8px', background: C.surfaceHigh,
              border: `1px solid ${C.border}`, borderRadius: 6,
              color: C.textPrimary, fontFamily: F.code, fontSize: 11, width: 140, outline: 'none',
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}
              style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', padding: '0 2px', fontSize: 14, lineHeight: 1 }}>
              ×
            </button>
          )}
        </div>

        {/* Layout picker */}
        <select
          value={layoutMode}
          onChange={(e) => {
            const nl = e.target.value as 'cose' | 'dagre' | 'grid';
            setLayoutMode(nl);
            const cy = cyRef.current;
            if (cy && cy.nodes().length) {
              const opts: any =
                nl === 'dagre' ? { name: 'dagre', rankDir: 'TB', nodeSep: 60, rankSep: 80, animate: false }
                : nl === 'grid' ? { name: 'grid', animate: false }
                : { name: 'cose', animate: false, randomize: true, nodeRepulsion: () => 6000, idealEdgeLength: () => 100, gravity: 0.25 };
              cy.layout(opts).run();
              cy.fit(undefined, 48);
            }
          }}
          style={{
            padding: '3px 8px', background: C.surfaceHigh, border: `1px solid ${C.border}`,
            borderRadius: 6, color: C.textMuted, fontFamily: F.code, fontSize: 11, cursor: 'pointer',
          }}>
          <option value="cose">Force</option>
          <option value="dagre">Dagre</option>
          <option value="grid">Grid</option>
        </select>

        {/* Focus mode */}
        <button onClick={() => setFocusMode((f) => !f)} style={focusMode ? btnActive : btnBase}>
          <Icon name="center_focus_strong" size={13} color={focusMode ? C.accentDim : C.textMuted} />
          Foco: {focusMode ? 'ON' : 'OFF'}
        </button>

        {/* Fit */}
        <button onClick={fitView} style={btnBase}>
          <Icon name="fit_screen" size={13} color={C.textMuted} />
          Fit
        </button>
      </div>

      {/* Stats hint */}
      <div style={{ fontSize: 11, color: C.textMuted, fontFamily: F.code }}>
        {!loading && data && !data.error ? `${data.nodes.length} nós · ${data.edges.length} arestas · ` : ''}
        2×clique = expandir · scroll = zoom
      </div>

      {data?.error && (
        <div style={{ padding: 16, color: C.textPrimary, fontSize: 13, background: C.surface,
          border: `1px solid ${C.border}`, borderRadius: 8 }}>{data.error}</div>
      )}

      {/* ── Grafo ──────────────────────────────────────────────────────────── */}
      <div ref={wrapperRef} style={{ position: 'relative', opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
        {/* Canvas de partículas (fundo) */}
        <canvas
          ref={particleCanvasRef}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: GRAPH_HEIGHT,
            pointerEvents: 'none', borderRadius: 10,
          }}
        />

        {/* Container Cytoscape */}
        <div
          ref={containerRef}
          style={{
            width: '100%', height: GRAPH_HEIGHT,
            background: C.bg,
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            position: 'relative',
          }}
        />

        {/* Legenda */}
        <div style={{
          position: 'absolute', left: 12, bottom: 12, display: 'flex', gap: 14,
          fontSize: 10, color: C.textMuted, fontFamily: F.code,
          background: 'rgba(6,13,26,0.75)', padding: '5px 10px', borderRadius: 6,
          backdropFilter: 'blur(4px)',
        }}>
          {Object.entries(LAYER_COLORS).filter(([k]) => k !== 'default').map(([layer, color]) => (
            <span key={layer} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', boxShadow: `0 0 6px ${color}` }} />
              {layer}
            </span>
          ))}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 16, height: 1, background: 'rgba(255,255,255,0.35)', display: 'inline-block' }} /> AST
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 16, height: 1, borderTop: '1px dashed rgba(255,185,95,0.5)', display: 'inline-block' }} /> heurística
          </span>
        </div>

        {/* Painel de nó selecionado */}
        {selected && (
          <div style={{
            position: 'absolute', top: 10, right: 10,
            background: 'rgba(13,22,40,0.90)', border: `1px solid ${C.border}`,
            backdropFilter: 'blur(8px)',
            borderRadius: 10, padding: '14px 18px', maxWidth: 270, fontSize: 12,
          }}>
            <div style={{
              color: LAYER_COLORS[selected.layer ?? 'default'] ?? C.nodeAmber,
              fontWeight: 700, marginBottom: 4, wordBreak: 'break-all', fontFamily: F.code,
            }}>{selected.label}</div>
            <div style={{ color: C.textMuted }}>
              {selected.kind}{selected.layer ? ` · ${selected.layer}` : ''}
              {selected.childCount > 0 ? ` · ${selected.childCount} filhos` : ''}
            </div>
            <div style={{ color: C.textMuted, marginTop: 4, fontFamily: F.code, fontSize: 10 }}>
              in {selected.inWeight} · out {selected.outWeight}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              {['layer', 'module', 'file'].includes(selected.kind) && (
                <button
                  onClick={() => expand(selected.id)}
                  style={{ padding: '5px 12px', background: C.nodeAmber, border: 'none',
                    borderRadius: 5, color: '#1a0f00', cursor: 'pointer', fontSize: 11,
                    fontWeight: 700, fontFamily: F.code }}>
                  ⤵ Expandir
                </button>
              )}
              <button
                onClick={() => setSelected(null)}
                style={{ padding: '5px 12px', background: 'transparent',
                  border: `1px solid ${C.border}`, borderRadius: 5,
                  color: C.textMuted, cursor: 'pointer', fontSize: 11, fontFamily: F.code }}>
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
