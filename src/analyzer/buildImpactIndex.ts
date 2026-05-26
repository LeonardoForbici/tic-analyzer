import type { DependencyGraph } from './buildDependencyGraph';

export interface ImpactEntry {
  directCount: number;
  transitiveCount: number;
  direct: string[];
  transitive: string[];
}

export type ImpactIndex = Record<string, ImpactEntry>;

/** Inverte o grafo de dependências para "quem depende de mim?" */
export function buildImpactIndex(graph: DependencyGraph): ImpactIndex {
  // reverseAdj[file] = lista de arquivos que importam `file`
  const reverseAdj: Record<string, string[]> = {};

  for (const edge of graph.edges) {
    if (!reverseAdj[edge.to]) reverseAdj[edge.to] = [];
    if (!reverseAdj[edge.to].includes(edge.from)) {
      reverseAdj[edge.to].push(edge.from);
    }
  }

  const index: ImpactIndex = {};

  for (const [file, direct] of Object.entries(reverseAdj)) {
    if (direct.length === 0) continue;

    // BFS para dependentes transitivos (cap 200 por performance)
    const visited = new Set<string>();
    const queue = [...direct];

    while (queue.length > 0 && visited.size < 200) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const dep of reverseAdj[current] ?? []) {
        if (!visited.has(dep)) queue.push(dep);
      }
    }

    index[file] = {
      directCount: direct.length,
      transitiveCount: visited.size,
      direct: direct.slice(0, 30),
      transitive: [...visited].slice(0, 100)
    };
  }

  return index;
}
