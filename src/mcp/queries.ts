/**
 * Consultas do MCP sobre o índice SQLite (`.tic-code/index.db`).
 *
 * Substituem a leitura de JSON estático nas tools de escala-crítica
 * (`get_impact`, `find_path`, `search_code`, `trace_flow`). As consultas usam
 * índices (em `from_file`/`to_file`) e BFS sob demanda — sem carregar o grafo
 * inteiro na memória e **sem o teto de 3000 nós** do `dep-graph.json`.
 */
import type Database from 'better-sqlite3';

export interface ImpactResult {
  matchedKey: string;
  directCount: number;
  transitiveCount: number;
  direct: string[];
  transitive: string[];
}

/** Quem depende de `file` (dependentes diretos + transitivos via BFS reverso). */
export function queryImpact(db: Database.Database, file: string): ImpactResult | null {
  const matchedKey = resolveFile(db, file);
  if (!matchedKey) return null;

  const directStmt = db.prepare('SELECT DISTINCT from_file FROM edges WHERE to_file = ?');
  const direct = directStmt.all(matchedKey).map((r: any) => r.from_file as string);
  if (direct.length === 0) return null;

  // BFS reverso (cap 200 visitados — paridade com buildImpactIndex)
  const visited = new Set<string>();
  const queue = [...direct];
  while (queue.length > 0 && visited.size < 200) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const r of directStmt.all(current) as any[]) {
      if (!visited.has(r.from_file)) queue.push(r.from_file);
    }
  }

  return {
    matchedKey,
    directCount: direct.length,
    transitiveCount: visited.size,
    direct: direct.slice(0, 30),
    transitive: [...visited].slice(0, 100)
  };
}

export interface PathResult {
  fromResolved: string;
  toResolved: string;
  /** rel_paths do caminho (origem→destino), ou null se não há caminho. */
  pathFiles: string[] | null;
}

/** Menor caminho (BFS) entre dois arquivos no grafo de dependências. */
export function queryFindPath(db: Database.Database, from: string, to: string): { error: string } | PathResult {
  const fromResolved = resolveFile(db, from);
  const toResolved = resolveFile(db, to);
  if (!fromResolved) return { error: `Arquivo de origem não encontrado: "${from}". Verifique o caminho relativo.` };
  if (!toResolved) return { error: `Arquivo de destino não encontrado: "${to}". Verifique o caminho relativo.` };
  if (fromResolved === toResolved) return { fromResolved, toResolved, pathFiles: [fromResolved] };

  const neighbors = db.prepare('SELECT DISTINCT to_file FROM edges WHERE from_file = ?');
  const visited = new Set<string>([fromResolved]);
  const parent = new Map<string, string>();
  const queue = [fromResolved];
  let found = false;

  while (queue.length > 0 && !found) {
    const current = queue.shift()!;
    for (const r of neighbors.all(current) as any[]) {
      const next = r.to_file as string;
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, current);
      if (next === toResolved) { found = true; break; }
      queue.push(next);
    }
  }

  if (!found) return { fromResolved, toResolved, pathFiles: null };

  const pathFiles: string[] = [];
  let cur = toResolved;
  while (cur !== fromResolved) {
    pathFiles.unshift(cur);
    cur = parent.get(cur)!;
  }
  pathFiles.unshift(fromResolved);
  return { fromResolved, toResolved, pathFiles };
}

export interface SearchHit {
  file: string;
  snippet: string;
  score: number;
}

/** Busca por código via FTS5 (prefixo por token), ranqueada por BM25. */
export function querySearch(db: Database.Database, tokens: string[], limit = 10): SearchHit[] {
  if (tokens.length === 0) return [];
  // tokens vêm de tokenizeQuery ([a-z]{3,}); prefixo p/ casar identificadores.
  const matchExpr = tokens.map((t) => `"${t.replace(/"/g, '')}"*`).join(' OR ');
  const rows = db
    .prepare(
      'SELECT file, snippet, bm25(search_fts) AS rank FROM search_fts WHERE search_fts MATCH ? ORDER BY rank LIMIT ?'
    )
    .all(matchExpr, limit) as any[];
  // BM25: menor = melhor (negativo). Converte para score positivo (maior = melhor).
  return rows.map((r) => ({
    file: r.file as string,
    snippet: (r.snippet as string) ?? '',
    score: Math.round(-(r.rank as number) * 10) / 10
  }));
}

export interface DbCallGraph {
  nodes: Array<{ id: string; label: string; layer: string; file: string; line?: number }>;
  edges: Array<{ from: string; to: string; type: string; confidence: string; label?: string }>;
}

/** Reconstrói o grafo cross-tier a partir do DB (fonte única para trace_flow). */
export function queryCallGraph(db: Database.Database): DbCallGraph {
  const nodes = (db.prepare('SELECT id, label, layer, file, line FROM cg_nodes').all() as any[]).map((r) => ({
    id: r.id, label: r.label, layer: r.layer, file: r.file, line: r.line ?? undefined
  }));
  const edges = (db.prepare('SELECT from_id, to_id, type, confidence, label FROM cg_edges').all() as any[]).map((r) => ({
    from: r.from_id, to: r.to_id, type: r.type, confidence: r.confidence, label: r.label ?? undefined
  }));
  return { nodes, edges };
}

/** Resolve um arquivo: match exato em rel_path, senão sufixo/substring. */
function resolveFile(db: Database.Database, query: string): string | null {
  const exact = db.prepare('SELECT rel_path FROM files WHERE rel_path = ?').get(query) as any;
  if (exact) return exact.rel_path;
  const base = query.split('/').pop() ?? query;
  const partial = db
    .prepare('SELECT rel_path FROM files WHERE rel_path LIKE ? OR rel_path LIKE ? LIMIT 1')
    .get(`%${query}%`, `%${base}`) as any;
  return partial?.rel_path ?? null;
}
