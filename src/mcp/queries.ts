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

// ── Trace cross-tier unificado (Fase 3) ──────────────────────────────────────
//
// Une o grafo intra-código (`edges`, resolvido na Fase 1) com o grafo cross-tier
// (`cg_edges`: HTTP/DB/PLSQL) num único espaço de nós, usando os ARQUIVOS como
// ponte entre as camadas. Assim a cadeia do exemplo do usuário
// (TelaCliente.tsx → Controller → Service → Repository → PKG_CLIENTE.SALVAR)
// existe conectada de ponta a ponta — sem pular o miolo Service/Repository, que
// vive no grafo intra-código, nem o salto Java→PL/SQL, que vive no cross-tier.

export interface TraceNode {
  /** `file:<rel_path>` para código; `db:<cg_id>` para objeto de banco. */
  key: string;
  label: string;
  layer: string; // 'frontend' | 'backend' | 'database' | 'code'
}

export interface CrossTierTrace {
  entry: TraceNode | null;
  /** Tudo que depende de `entry` (quem quebra se ele mudar), por camada. */
  upstream: Array<TraceNode & { depth: number }>;
  /** Caminho representativo: do chamador mais alto (ex.: tela) até `entry`. */
  samplePath: TraceNode[];
}

export function queryCrossTierTrace(db: Database.Database, entry: string, maxNodes = 800): CrossTierTrace {
  const start = resolveTraceNode(db, entry);
  if (!start) return { entry: null, upstream: [], samplePath: [] };

  const codeCallers = db.prepare('SELECT DISTINCT from_file FROM edges WHERE to_file = ?');
  const beNodeForFile = db.prepare("SELECT id FROM cg_nodes WHERE file = ? AND id LIKE 'be_%' LIMIT 1");
  const httpCallers = db.prepare("SELECT from_id FROM cg_edges WHERE to_id = ? AND type = 'HTTP_CALL'");
  const dbCallers = db.prepare("SELECT from_id FROM cg_edges WHERE to_id = ? AND type = 'DB_CALL'");
  const plsqlCallers = db.prepare("SELECT from_id FROM cg_edges WHERE to_id = ? AND type = 'PLSQL_CALL'");
  const cgNodeById = db.prepare('SELECT id, label, layer, file FROM cg_nodes WHERE id = ?');

  const reverseNeighbors = (node: TraceNode): TraceNode[] => {
    const out: TraceNode[] = [];
    if (node.key.startsWith('file:')) {
      const file = node.key.slice('file:'.length);
      for (const r of codeCallers.all(file) as any[]) out.push(nodeForFile(db, r.from_file));
      const be = beNodeForFile.get(file) as any;
      if (be) {
        for (const r of httpCallers.all(be.id) as any[]) {
          const fe = cgNodeById.get(r.from_id) as any;
          if (fe?.file) out.push(nodeForFile(db, fe.file));
        }
      }
    } else if (node.key.startsWith('db:')) {
      const dbId = node.key.slice('db:'.length);
      for (const r of dbCallers.all(dbId) as any[]) {
        const be = cgNodeById.get(r.from_id) as any;
        if (be?.file) out.push(nodeForFile(db, be.file));
      }
      for (const r of plsqlCallers.all(dbId) as any[]) {
        const caller = cgNodeById.get(r.from_id) as any;
        if (caller) out.push({ key: `db:${caller.id}`, label: caller.label, layer: 'database' });
      }
    }
    return out;
  };

  // BFS reverso (quem depende de entry)
  const seen = new Set<string>([start.key]);
  const parent = new Map<string, string>();
  const nodeByKey = new Map<string, TraceNode>([[start.key, start]]);
  const upstream: Array<TraceNode & { depth: number }> = [];
  const queue: Array<{ node: TraceNode; depth: number }> = [{ node: start, depth: 0 }];

  while (queue.length > 0 && seen.size < maxNodes) {
    const { node, depth } = queue.shift()!;
    for (const caller of reverseNeighbors(node)) {
      if (seen.has(caller.key)) continue;
      seen.add(caller.key);
      parent.set(caller.key, node.key);
      nodeByKey.set(caller.key, caller);
      upstream.push({ ...caller, depth: depth + 1 });
      queue.push({ node: caller, depth: depth + 1 });
      if (seen.size >= maxNodes) break;
    }
  }

  // Caminho representativo: prefere o chamador frontend mais profundo.
  const frontendLeaves = upstream.filter((n) => n.layer === 'frontend').sort((a, b) => b.depth - a.depth);
  const target = frontendLeaves[0] ?? upstream.sort((a, b) => b.depth - a.depth)[0];
  const samplePath: TraceNode[] = [];
  if (target) {
    let cur: string | undefined = target.key;
    while (cur) {
      const n = nodeByKey.get(cur);
      if (n) samplePath.push(n);
      if (cur === start.key) break;
      cur = parent.get(cur);
    }
  }

  return { entry: start, upstream, samplePath };
}

function nodeForFile(db: Database.Database, file: string): TraceNode {
  const cg = db.prepare("SELECT label, layer FROM cg_nodes WHERE file = ? AND layer IN ('frontend','backend') LIMIT 1").get(file) as any;
  const base = (file.split('/').pop() ?? file).replace(/\.(java|kt|ts|tsx|js|jsx|cs|py|rb|go|php)$/, '');
  return { key: `file:${file}`, label: cg?.label ?? base, layer: cg?.layer ?? 'code' };
}

function resolveTraceNode(db: Database.Database, entry: string): TraceNode | null {
  const up = entry.toUpperCase();
  // 1. objeto de banco (package/procedure) — match por label contido em entry ou vice-versa
  const dbNode = db
    .prepare(
      "SELECT id, label FROM cg_nodes WHERE layer = 'database' AND (UPPER(label) = ? OR ? LIKE '%' || UPPER(label) || '%' OR UPPER(label) LIKE '%' || ? || '%') ORDER BY LENGTH(label) DESC LIMIT 1"
    )
    .get(up, up, up) as any;
  if (dbNode) return { key: `db:${dbNode.id}`, label: dbNode.label, layer: 'database' };

  // 2. arquivo de código
  const file = resolveFile(db, entry);
  if (file) return nodeForFile(db, file);
  return null;
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
