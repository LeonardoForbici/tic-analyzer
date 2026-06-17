/**
 * Consultas do MCP sobre o índice SQLite (`.tic-code/index.db`).
 *
 * Substituem a leitura de JSON estático nas tools de escala-crítica
 * (`get_impact`, `find_path`, `search_code`, `trace_flow`). As consultas usam
 * índices (em `from_file`/`to_file`) e BFS sob demanda — sem carregar o grafo
 * inteiro na memória e **sem o teto de 3000 nós** do `dep-graph.json`.
 */
import type Database from 'better-sqlite3';
import { blobToVector, cosine } from '../analyzer/semantic/embeddings';

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

/** Quantos arquivos têm embedding (0 = busca vetorial inativa → usa FTS). */
export function embeddingsCount(db: Database.Database): number {
  return (db.prepare('SELECT COUNT(*) c FROM embeddings').get() as any).c;
}

/** Busca semântica por similaridade de cosseno sobre os embeddings (Fase 4). */
export function queryVectorSearch(db: Database.Database, queryVec: Float32Array, limit = 10): SearchHit[] {
  const rows = db.prepare('SELECT file, vec FROM embeddings').all() as any[];
  const scored = rows.map((r) => ({ file: r.file as string, score: cosine(queryVec, blobToVector(r.vec as Buffer)) }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);
  // Enriquece com snippet da FTS5 para nunca devolver hit "cego" (sem contexto).
  const snippetStmt = db.prepare('SELECT snippet FROM search_fts WHERE file = ? LIMIT 1');
  return top.map((s) => {
    const row = snippetStmt.get(s.file) as any;
    return { file: s.file, snippet: (row?.snippet as string) ?? '', score: Math.round(s.score * 1000) / 1000 };
  });
}

export interface FusedHit extends SearchHit {
  /** Indica a origem do hit: só FTS, só vetorial, ou ambos. */
  origin: 'fts' | 'vec' | 'both';
}

/**
 * Reciprocal Rank Fusion (RRF) — funde listas FTS e vetorial num único ranking.
 *
 * score_rrf(d) = Σ 1/(k + rank_i(d))  onde rank é 1-based.
 * k=60 é o padrão da literatura (Cormack et al. 2009); atenua o peso de
 * posições iniciais sem depender de reranker neural — 100% determinístico.
 */
export function fuseRRF(ftsHits: SearchHit[], vecHits: SearchHit[], k = 60, limit = 10): FusedHit[] {
  const scores = new Map<string, { rrf: number; ftsRank?: number; vecRank?: number; snippet: string }>();
  for (let i = 0; i < ftsHits.length; i++) {
    const h = ftsHits[i];
    const entry = scores.get(h.file) ?? { rrf: 0, snippet: h.snippet };
    entry.rrf += 1 / (k + i + 1);
    entry.ftsRank = i + 1;
    if (!entry.snippet && h.snippet) entry.snippet = h.snippet;
    scores.set(h.file, entry);
  }
  for (let i = 0; i < vecHits.length; i++) {
    const h = vecHits[i];
    const entry = scores.get(h.file) ?? { rrf: 0, snippet: h.snippet };
    entry.rrf += 1 / (k + i + 1);
    entry.vecRank = i + 1;
    if (!entry.snippet && h.snippet) entry.snippet = h.snippet;
    scores.set(h.file, entry);
  }
  return [...scores.entries()]
    .sort((a, b) => b[1].rrf - a[1].rrf)
    .slice(0, limit)
    .map(([file, e]) => ({
      file,
      snippet: e.snippet,
      score: Math.round(e.rrf * 10000) / 10000,
      origin: e.ftsRank !== undefined && e.vecRank !== undefined ? 'both'
            : e.vecRank !== undefined ? 'vec'
            : 'fts'
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
  // DB_CALL (be→proc), PLSQL_CALL (proc→proc) e TABLE_ACCESS (be/proc→tabela)
  const dbLayerCallers = db.prepare("SELECT from_id FROM cg_edges WHERE to_id = ? AND type IN ('DB_CALL','PLSQL_CALL','TABLE_ACCESS')");
  const cgNodeById = db.prepare('SELECT id, label, layer, file FROM cg_nodes WHERE id = ?');

  /** Mapeia um id de nó cross-tier para o espaço de trace (arquivo ou objeto de banco). */
  const cgIdToTrace = (id: string): TraceNode | null => {
    const row = cgNodeById.get(id) as any;
    if (!row) return null;
    if (row.layer === 'database') return { key: `db:${row.id}`, label: row.label, layer: 'database' };
    if (row.file) return nodeForFile(db, row.file);
    return null;
  };

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
      for (const r of dbLayerCallers.all(dbId) as any[]) {
        const caller = cgIdToTrace(r.from_id);
        if (caller) out.push(caller);
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

  // Granularidade de método: anota cada chamador código→código com o método que
  // faz a chamada (Classe.metodo), via method_edges resolvidas.
  const methodForPair = db.prepare(
    'SELECT from_method FROM method_edges WHERE from_file = ? AND to_file = ? AND from_method IS NOT NULL LIMIT 1'
  );
  for (let i = 0; i < samplePath.length - 1; i++) {
    const a = samplePath[i];
    const b = samplePath[i + 1];
    if (a.key.startsWith('file:') && b.key.startsWith('file:')) {
      const r = methodForPair.get(a.key.slice(5), b.key.slice(5)) as any;
      if (r?.from_method) a.label = `${a.label}.${r.from_method}`;
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
  const asDb = (n: any): TraceNode => ({ key: `db:${n.id}`, label: n.label, layer: 'database' });
  const exact = db.prepare("SELECT id, label FROM cg_nodes WHERE layer = 'database' AND UPPER(label) = ? LIMIT 1");

  // 1. match EXATO no objeto de banco (tabela/package/procedure)
  const direct = exact.get(up) as any;
  if (direct) return asDb(direct);

  // 2. entry qualificado "PKG.PROC" / "SCHEMA.PKG.PROC" → tenta os segmentos
  if (up.includes('.')) {
    for (const seg of up.split('.')) {
      const hit = exact.get(seg) as any;
      if (hit) return asDb(hit);
    }
  }

  // 3. fuzzy — prefere o label MAIS CURTO (mais específico ao termo), não o maior
  const fuzzy = db
    .prepare(
      "SELECT id, label FROM cg_nodes WHERE layer = 'database' AND (UPPER(label) LIKE ? OR ? LIKE '%' || UPPER(label) || '%') ORDER BY LENGTH(label) ASC LIMIT 1"
    )
    .get(`${up}%`, up) as any;
  if (fuzzy) return asDb(fuzzy);

  // 4. arquivo de código
  const file = resolveFile(db, entry);
  if (file) return nodeForFile(db, file);
  return null;
}

export interface ColumnLineage {
  table: string;
  reads: Array<{ column: string; from: string }>;
  writes: Array<{ column: string; from: string }>;
}

/** Lineage coluna-a-coluna: quais colunas de uma tabela são lidas/escritas e onde. */
export function queryTableColumns(db: Database.Database, table: string): ColumnLineage | null {
  const up = table.toUpperCase();
  const rows = db
    .prepare('SELECT DISTINCT column, mode, from_file FROM column_access WHERE UPPER("table") = ? ORDER BY column')
    .all(up) as any[];
  if (rows.length === 0) return null;
  const reads: Array<{ column: string; from: string }> = [];
  const writes: Array<{ column: string; from: string }> = [];
  for (const r of rows) {
    const item = { column: r.column as string, from: (r.from_file as string)?.split('/').pop() ?? r.from_file };
    (r.mode === 'write' ? writes : reads).push(item);
  }
  return { table: up, reads, writes };
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
