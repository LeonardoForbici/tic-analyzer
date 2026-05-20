import type { LightweightGraph } from '../scanner/buildGraph';

export interface WebviewGraphNode {
  id: string;
  label: string;
  path: string;
  module: string;
  type: string;
  language: string;
  riskLevel?: string;
  degree: number;
  x: number;
  y: number;
  /** Classificação de origem: 'internal' | 'external' | 'framework' */
  origin: string;
  /** Nome do framework quando origin === 'framework'. Ex: 'Spring' */
  frameworkName?: string;
  /** Se o nó é exibido no filtro padrão "Internos". */
  visibleByDefault: boolean;
}

export interface WebviewGraphEdge {
  from: string;
  to: string;
  type: string;
  evidence?: string;
}

export interface WebviewGraphData {
  nodes: WebviewGraphNode[];
  edges: WebviewGraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    visibleNodes: number;
    visibleEdges: number;
    modules: Record<string, number>;
    internalCount: number;
    externalCount: number;
    frameworkCount: number;
  };
}

export function buildWebviewGraphData(graph: LightweightGraph): WebviewGraphData {
  const degree = new Map<string, number>();
  for (const edge of graph.edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }

  // Nós internos apenas para a visualização padrão
  const internalNodes = graph.nodes.filter((node) => node.visibleByDefault);

  const centralPaths = new Set(graph.stats.centralFiles.slice(0, 60).map((file) => file.path));
  const connectedIds = new Set<string>();
  for (const edge of graph.edges) {
    const fromInternal = graph.nodes.find((n) => n.id === edge.from)?.visibleByDefault ?? false;
    const toInternal = graph.nodes.find((n) => n.id === edge.to)?.visibleByDefault ?? false;
    if ((fromInternal || toInternal) && (centralPaths.has(edge.sourcePath) || centralPaths.has(edge.targetPath))) {
      connectedIds.add(edge.from);
      connectedIds.add(edge.to);
    }
  }

  // Selecionar até 180 nós do conjunto interno, priorizando por grau e risco
  const selectedNodes = internalNodes
    .filter((node) => centralPaths.has(node.path) || connectedIds.has(node.id) || node.riskLevel || node.module !== 'unknown')
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.path.localeCompare(b.path))
    .slice(0, 180);

  const selectedIds = new Set(selectedNodes.map((node) => node.id));
  // Arestas apenas entre nós internos
  const visibleEdges = graph.edges
    .filter((edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to))
    .sort((a, b) => (degree.get(b.from) ?? 0) + (degree.get(b.to) ?? 0) - ((degree.get(a.from) ?? 0) + (degree.get(a.to) ?? 0)))
    .slice(0, 420);

  const modules = [...new Set(selectedNodes.map((node) => node.module))].sort();
  const moduleCenters = new Map<string, { x: number; y: number }>();
  const columns = Math.max(2, Math.ceil(Math.sqrt(modules.length)));
  modules.forEach((module, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    moduleCenters.set(module, {
      x: 170 + col * 220,
      y: 120 + row * 170
    });
  });

  const moduleCounts: Record<string, number> = {};

  const internalCount = graph.nodes.filter((n) => n.origin === 'internal').length;
  const externalCount = graph.nodes.filter((n) => n.origin === 'external').length;
  const frameworkCount = graph.nodes.filter((n) => n.origin === 'framework').length;

  return {
    nodes: selectedNodes.map((node) => {
      const moduleIndex = moduleCounts[node.module] ?? 0;
      moduleCounts[node.module] = moduleIndex + 1;
      const center = moduleCenters.get(node.module) ?? { x: 360, y: 220 };
      const angle = moduleIndex * 2.399963229728653;
      const ring = 18 + Math.sqrt(moduleIndex) * 18;
      return {
        id: node.id,
        label: node.label,
        path: node.path,
        module: node.module,
        type: node.type,
        language: node.language,
        riskLevel: node.riskLevel,
        degree: degree.get(node.id) ?? 0,
        x: Math.round(center.x + Math.cos(angle) * ring),
        y: Math.round(center.y + Math.sin(angle) * ring),
        origin: node.origin,
        frameworkName: node.frameworkName,
        visibleByDefault: node.visibleByDefault
      };
    }),
    edges: visibleEdges.map((edge) => ({ from: edge.from, to: edge.to, type: edge.type, evidence: edge.evidence })),
    stats: {
      totalNodes: graph.nodes.length,
      totalEdges: graph.edges.length,
      visibleNodes: selectedNodes.length,
      visibleEdges: visibleEdges.length,
      modules: graph.stats.modules,
      internalCount,
      externalCount,
      frameworkCount
    }
  };
}

