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

const C = {
  bg: '#060e20',
  surfaceContainer: '#171f33', surfaceContainerLow: '#131b2e',
  surfaceContainerHigh: '#222a3d',
  primaryFixedDim: '#00dbe9', primaryFixed: '#7df4ff',
  secondary: '#4edea3', error: '#ffb4ab',
  tertiaryFixedDim: '#ffb95f',
  onSurface: '#dae2fd', onSurfaceVariant: '#b9cacb',
  outline: '#849495', outlineVariant: '#3b494b',
};
const F = { body: "'Inter', system-ui, sans-serif", code: "'JetBrains Mono', monospace" };

const LAYER_COLORS: Record<string, string> = {
  frontend: '#4a9eff', backend: '#4edea3', database: '#ffb95f', default: '#00dbe9',
};

const CY_STYLE: cytoscape.Stylesheet[] = [
  {
    selector: 'node',
    style: {
      'background-color': C.surfaceContainer,
      'border-width': 1.5,
      'border-color': C.outlineVariant,
      'label': 'data(label)',
      'font-family': 'JetBrains Mono, monospace',
      'font-size': 11,
      'color': C.onSurfaceVariant,
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 4,
      'text-max-width': '100px',
      'text-overflow-wrap': 'anywhere',
    },
  },
  {
    selector: 'node[kind = "layer"]',
    style: {
      'width': 60, 'height': 60,
      'border-color': C.primaryFixedDim,
      'border-width': 2,
      'font-weight': 700,
      'color': C.primaryFixed,
      'font-size': 12,
    },
  },
  {
    selector: 'node[kind = "module"]',
    style: { 'width': 44, 'height': 44, 'border-color': C.secondary, 'color': C.secondary },
  },
  {
    selector: 'node[kind = "file"]',
    style: {
      'shape': 'round-rectangle',
      'width': 36, 'height': 20,
      'font-size': 9,
      'color': C.onSurfaceVariant,
    },
  },
  {
    selector: 'node[kind = "symbol"]',
    style: {
      'shape': 'ellipse',
      'width': 14, 'height': 14,
      'border-color': '#9d8cff',
      'color': '#9d8cff',
      'font-size': 9,
    },
  },
  {
    selector: 'node[kind = "more"]',
    style: {
      'border-style': 'dashed',
      'background-color': '#060e20',
      'color': C.outline,
      'font-size': 9,
    },
  },
  { selector: 'node[layer = "frontend"]', style: { 'border-color': '#4a9eff' } },
  { selector: 'node[layer = "backend"]',  style: { 'border-color': '#4edea3' } },
  { selector: 'node[layer = "database"]', style: { 'border-color': '#ffb95f' } },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      'line-color': C.outlineVariant,
      'target-arrow-color': C.outlineVariant,
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.8,
      'width': 1.5,
      'opacity': 0.7,
    },
  },
  {
    selector: 'edge.ast',
    style: { 'line-color': C.secondary, 'target-arrow-color': C.secondary },
  },
  {
    selector: 'edge.heuristic',
    style: {
      'line-color': C.tertiaryFixedDim,
      'target-arrow-color': C.tertiaryFixedDim,
      'line-style': 'dashed',
    },
  },
  {
    selector: ':selected',
    style: { 'border-width': 3, 'border-color': C.primaryFixedDim },
  },
  {
    selector: 'node.search-match',
    style: { 'border-width': 3, 'border-color': C.primaryFixedDim, 'background-color': `${C.primaryFixedDim}22` },
  },
  { selector: '.faded', style: { 'opacity': 0.06 } },
];

function Icon({ name, size = 14, color }: { name: string; size?: number; color?: string }) {
  return (
    <span className="material-symbols-outlined" style={{
      fontSize: `${size}px`, color, lineHeight: 1, display: 'inline-flex', alignItems: 'center',
      fontVariationSettings: `'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
    }}>{name}</span>
  );
}

export function HierGraphViewer({ projectPath }: { projectPath: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const [expanded, setExpanded] = useState<string[]>([]);
  const [data, setData] = useState<LevelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AggNode | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'dagre' | 'cose' | 'grid'>('dagre');
  const [searchQuery, setSearchQuery] = useState('');

  // ref so event handlers always see current focusMode without stale closure
  const focusModeRef = useRef(focusMode);
  useEffect(() => { focusModeRef.current = focusMode; }, [focusMode]);

  // Load data when expanded changes
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

  // Initialize Cytoscape once
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({ container: containerRef.current, style: CY_STYLE, wheelSensitivity: 0.3, minZoom: 0.05, maxZoom: 4 });
    cyRef.current = cy;
    return () => { cy.destroy(); cyRef.current = null; };
  }, []);

  const expand = useCallback((id: string) => {
    setExpanded((prev) => prev.includes(id) ? prev : [...prev, id]);
  }, []);

  // Rebuild graph when data or layout changes
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

    cy.edges().forEach((e) => {
      e.style('width', Math.min(4, 1 + Math.log1p(e.data('weight') as number) * 0.5));
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cy.layout({ name: layoutMode, rankDir: 'TB', nodeSep: 60, rankSep: 80, animate: false } as any).run();
    cy.fit(undefined, 40);

    cy.off('dblclick').on('dblclick', 'node', (e) => {
      const { id, kind } = e.target.data() as AggNode;
      if (['layer', 'module', 'file'].includes(kind)) expand(id);
    });

    cy.off('tap').on('tap', 'node', (e) => {
      const nodeData = e.target.data() as AggNode;
      setSelected(nodeData);
      if (focusModeRef.current) {
        const ego = e.target.closedNeighborhood().add(
          e.target.closedNeighborhood().neighborhood()
        );
        cy.elements().addClass('faded');
        ego.removeClass('faded');
      }
    });

    cy.on('tap', (e) => {
      if (e.target === cy) {
        cy.elements().removeClass('faded');
        setSelected(null);
      }
    });
  }, [data, layoutMode, expand]);

  // Clear faded state when focus mode is turned off
  useEffect(() => {
    if (!focusMode) { cyRef.current?.elements().removeClass('faded'); setSelected(null); }
  }, [focusMode]);

  // Search highlight
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass('search-match');
    if (searchQuery.length > 1) {
      const q = searchQuery.toLowerCase();
      cy.nodes().filter((n) => (n.data('label') as string).toLowerCase().includes(q)).addClass('search-match');
    }
  }, [searchQuery]);

  const fitView = useCallback(() => { cyRef.current?.fit(undefined, 40); }, []);

  const breadcrumb = [
    { id: '__root__', label: 'Aplicação' },
    ...expanded.map((id) => ({ id, label: id.slice(id.indexOf(':') + 1).split('/').pop() ?? id })),
  ];

  return (
    <div style={{ fontFamily: F.body, color: C.onSurface, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flex: '1 1 auto', flexWrap: 'wrap' as const }}>
          {breadcrumb.map((b, i) => (
            <span key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span style={{ color: C.outline, fontSize: 13 }}>›</span>}
              <button
                onClick={() => setExpanded(i === 0 ? [] : expanded.slice(0, i))}
                style={{
                  padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                  fontFamily: F.code, fontWeight: i === breadcrumb.length - 1 ? 700 : 400,
                  background: i === breadcrumb.length - 1 ? C.primaryFixedDim : C.surfaceContainerHigh,
                  border: `1px solid ${i === breadcrumb.length - 1 ? C.primaryFixedDim : C.outlineVariant}`,
                  color: i === breadcrumb.length - 1 ? '#00363a' : C.onSurfaceVariant,
                }}>
                {b.label}
              </button>
            </span>
          ))}
        </div>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="search" size={14} color={C.outline} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar nó…"
            style={{
              padding: '3px 8px', background: C.surfaceContainerHigh,
              border: `1px solid ${C.outlineVariant}`, borderRadius: 6,
              color: C.onSurface, fontFamily: F.code, fontSize: 11, width: 140, outline: 'none',
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}
              style={{ background: 'none', border: 'none', color: C.outline, cursor: 'pointer', padding: '0 2px', fontSize: 14, lineHeight: 1 }}>
              ×
            </button>
          )}
        </div>

        {/* Layout picker */}
        <select
          value={layoutMode}
          onChange={(e) => {
            const nl = e.target.value as 'dagre' | 'cose' | 'grid';
            setLayoutMode(nl);
            const cy = cyRef.current;
            if (cy && cy.nodes().length) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              cy.layout({ name: nl, rankDir: 'TB', nodeSep: 60, rankSep: 80, animate: false } as any).run();
              cy.fit(undefined, 40);
            }
          }}
          style={{
            padding: '3px 8px', background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}`,
            borderRadius: 6, color: C.onSurfaceVariant, fontFamily: F.code, fontSize: 11, cursor: 'pointer',
          }}>
          <option value="dagre">Dagre</option>
          <option value="cose">Force</option>
          <option value="grid">Grid</option>
        </select>

        {/* Focus mode */}
        <button
          onClick={() => setFocusMode((f) => !f)}
          style={{
            padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: F.code,
            background: focusMode ? C.primaryFixedDim : C.surfaceContainerHigh,
            border: `1px solid ${focusMode ? C.primaryFixedDim : C.outlineVariant}`,
            color: focusMode ? '#00363a' : C.onSurfaceVariant,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
          <Icon name="center_focus_strong" size={13} color={focusMode ? '#00363a' : C.onSurfaceVariant} />
          Foco: {focusMode ? 'ON' : 'OFF'}
        </button>

        {/* Fit */}
        <button onClick={fitView}
          style={{
            padding: '3px 10px', background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}`,
            borderRadius: 6, color: C.onSurfaceVariant, cursor: 'pointer', fontSize: 11, fontFamily: F.code,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
          <Icon name="fit_screen" size={13} color={C.onSurfaceVariant} />
          Fit
        </button>
      </div>

      {/* Stats hint */}
      <div style={{ fontSize: 11, color: C.outline, fontFamily: F.code }}>
        {!loading && data && !data.error ? `${data.nodes.length} nós · ${data.edges.length} arestas · ` : ''}
        2×clique = expandir · scroll = zoom
      </div>

      {data?.error && (
        <div style={{ padding: 16, color: C.onSurface, fontSize: 13, background: C.surfaceContainerLow,
          border: `1px solid ${C.outlineVariant}`, borderRadius: 8 }}>{data.error}</div>
      )}

      {/* Graph */}
      <div style={{ position: 'relative', opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
        <div
          ref={containerRef}
          style={{ width: '100%', height: 560, background: C.bg, borderRadius: 8, border: `1px solid ${C.outlineVariant}` }}
        />

        {/* Legend */}
        <div style={{
          position: 'absolute', left: 10, bottom: 10, display: 'flex', gap: 12,
          fontSize: 11, color: C.onSurfaceVariant, fontFamily: F.code,
          background: `${C.bg}cc`, padding: '6px 10px', borderRadius: 6,
          border: `1px solid ${C.outlineVariant}40`,
        }}>
          {Object.entries(LAYER_COLORS).filter(([k]) => k !== 'default').map(([layer, color]) => (
            <span key={layer} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block' }} />
              {layer}
            </span>
          ))}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 18, height: 2, background: C.secondary, display: 'inline-block' }} /> AST
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 18, height: 2, borderTop: `2px dashed ${C.tertiaryFixedDim}`, display: 'inline-block' }} /> heurística
          </span>
        </div>

        {/* Selected node panel */}
        {selected && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}`,
            borderRadius: 8, padding: '12px 16px', maxWidth: 280, fontSize: 12,
          }}>
            <div style={{
              color: LAYER_COLORS[selected.layer ?? 'default'], fontWeight: 700,
              marginBottom: 4, wordBreak: 'break-all' as const, fontFamily: F.code,
            }}>{selected.label}</div>
            <div style={{ color: C.onSurfaceVariant }}>
              {selected.kind}{selected.layer ? ` · ${selected.layer}` : ''}
              {selected.childCount > 0 ? ` · ${selected.childCount} filhos` : ''}
            </div>
            <div style={{ color: C.onSurfaceVariant, marginTop: 4, fontFamily: F.code, fontSize: 11 }}>
              in {selected.inWeight} · out {selected.outWeight}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              {['layer', 'module', 'file'].includes(selected.kind) && (
                <button
                  onClick={() => expand(selected.id)}
                  style={{
                    padding: '5px 12px', background: C.primaryFixedDim, border: 'none',
                    borderRadius: 5, color: '#00363a', cursor: 'pointer', fontSize: 11,
                    fontWeight: 700, fontFamily: F.code,
                  }}>
                  ⤵ Expandir
                </button>
              )}
              <button
                onClick={() => setSelected(null)}
                style={{
                  padding: '5px 12px', background: 'transparent',
                  border: `1px solid ${C.outlineVariant}`, borderRadius: 5,
                  color: C.onSurfaceVariant, cursor: 'pointer', fontSize: 11, fontFamily: F.code,
                }}>
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
