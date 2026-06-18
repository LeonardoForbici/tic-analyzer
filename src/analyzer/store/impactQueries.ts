/**
 * Consultas de impacto sobre o grafo unificado (`impact_edges` no index.db).
 *
 * Respondem "se eu mexer em X, o que é afetado?" para X = arquivo, método,
 * procedure/function PL/SQL, tabela ou coluna — atravessando camadas
 * (coluna → procedures → DAOs Java → endpoints → telas React).
 *
 * Resultados são pensados para gastar poucos tokens no MCP: agrupados por
 * tipo/módulo, com truncamento explícito (`truncated` + `totalVisited`) para a
 * IA saber que há mais e como pedir.
 */
import type Database from 'better-sqlite3';
import type { ImpactNodeKind } from '../buildImpactGraph';

export interface ImpactedNode {
  id: string;
  kind: ImpactNodeKind;
  /** Distância em saltos a partir da entidade consultada. */
  depth: number;
  /** 'inferred' se algum salto do caminho foi heurístico. */
  confidence: 'resolved' | 'inferred';
  /** Módulo do arquivo (apenas kind=file/method). */
  module?: string;
}

export interface ImpactOfResult {
  /** Id canônico resolvido (ex.: `plsql:PKG_CLIENTE.SALVAR`). */
  entity: string;
  affected: ImpactedNode[];
  byKind: Record<string, number>;
  byModule: Record<string, number>;
  totalVisited: number;
  truncated: boolean;
  /** Outras entidades que casam com a busca (quando ambígua). */
  candidates?: string[];
}

const KIND_PREFIXES = ['file:', 'method:', 'plsql:', 'table:', 'column:'];

/**
 * Resolve um nome livre para um id do grafo de impacto. Aceita ids canônicos
 * (`table:CLIENTES`), caminhos de arquivo (completos ou sufixo), nomes de
 * procedure (`SALVAR`, `PKG.SALVAR`), tabelas e colunas (`CLIENTES.CPF`).
 */
export function resolveImpactId(db: Database.Database, query: string): { id: string | null; candidates: string[] } {
  const q = query.trim();
  // Id canônico: valida que existe no grafo
  if (KIND_PREFIXES.some((p) => q.startsWith(p))) {
    return { id: nodeExists(db, q) ? q : null, candidates: [] };
  }

  const candidates: string[] = [];
  const up = q.toUpperCase();

  // 1. Arquivo com caminho exato
  const exactFile = db.prepare('SELECT rel_path FROM files WHERE rel_path = ?').get(q) as any;
  if (exactFile) return { id: `file:${exactFile.rel_path}`, candidates: [] };

  // 2. Objeto de banco (plsql/table/column) com nome exato — vence match parcial
  // de arquivo (ex.: "CLIENTE" deve resolver para a tabela, não p/ ClienteController)
  const dbHits = db
    .prepare(
      `SELECT DISTINCT id FROM (
         SELECT to_id AS id FROM impact_edges WHERE to_kind IN ('plsql','table','column')
         UNION SELECT from_id FROM impact_edges WHERE from_kind IN ('plsql','table','column')
       ) WHERE id = ? OR id = ? OR id = ? OR id LIKE ? LIMIT 10`
    )
    .all(`plsql:${up}`, `table:${up}`, `column:${up}`, `%:${up}`) as any[];
  for (const r of dbHits) candidates.push(r.id);

  // 3. Arquivo por sufixo/substring
  const base = q.split('/').pop() ?? q;
  const fileHits = db
    .prepare('SELECT rel_path FROM files WHERE rel_path LIKE ? OR rel_path LIKE ? LIMIT 5')
    .all(`%/${base}`, `%${q}%`) as any[];
  for (const r of fileHits) if (!candidates.includes(`file:${r.rel_path}`)) candidates.push(`file:${r.rel_path}`);
  // 4. PKG.PROC qualificado e sufixo .NOME (ex.: SALVAR → plsql:PKG.SALVAR)
  if (candidates.length === 0) {
    const suffixHits = db
      .prepare(
        `SELECT DISTINCT id FROM (
           SELECT to_id AS id FROM impact_edges UNION SELECT from_id FROM impact_edges
         ) WHERE id LIKE ? OR id LIKE ? LIMIT 10`
      )
      .all(`plsql:%.${up}`, `column:%.${up}`) as any[];
    for (const r of suffixHits) candidates.push(r.id);
  }

  // 5. Símbolo (classe/interface) → arquivo que o define
  if (candidates.length === 0) {
    const sym = db.prepare('SELECT file FROM symbols WHERE simple_name = ? LIMIT 5').all(q) as any[];
    for (const r of sym) if (!candidates.includes(`file:${r.file}`)) candidates.push(`file:${r.file}`);
  }

  if (candidates.length === 1) return { id: candidates[0], candidates: [] };
  if (candidates.length > 1) return { id: candidates[0], candidates: candidates.slice(1) };
  return { id: null, candidates: [] };
}

function nodeExists(db: Database.Database, id: string): boolean {
  const row = db
    .prepare('SELECT 1 ok FROM impact_edges WHERE to_id = ? OR from_id = ? LIMIT 1')
    .get(id, id) as any;
  if (row) return true;
  // Arquivo pode existir sem arestas de impacto
  if (id.startsWith('file:')) {
    return !!db.prepare('SELECT 1 FROM files WHERE rel_path = ?').get(id.slice(5));
  }
  return false;
}

export interface ImpactOptions {
  /** Máximo de nós visitados no BFS (default 2000; truncamento é reportado). */
  maxNodes?: number;
  /** Profundidade máxima de saltos (default ilimitada dentro de maxNodes). */
  maxDepth?: number;
}

/** BFS reverso sobre `impact_edges`: tudo que depende (direta/transitivamente) de `entity`. */
export function queryImpactOf(db: Database.Database, entity: string, opts: ImpactOptions = {}): ImpactOfResult | null {
  const { id, candidates } = resolveImpactId(db, entity);
  if (!id) return null;
  const maxNodes = opts.maxNodes ?? 2000;
  const maxDepth = opts.maxDepth ?? Infinity;

  const callers = db.prepare('SELECT from_id, from_kind, confidence FROM impact_edges WHERE to_id = ?');
  const moduleOf = db.prepare('SELECT module FROM files WHERE rel_path = ?');

  const visited = new Map<string, ImpactedNode>();
  let truncated = false;
  let queue: Array<{ id: string; depth: number; confidence: 'resolved' | 'inferred' }> = [
    { id, depth: 0, confidence: 'resolved' }
  ];

  while (queue.length > 0) {
    const next: typeof queue = [];
    for (const cur of queue) {
      if (cur.depth >= maxDepth) continue;
      for (const r of callers.all(cur.id) as any[]) {
        if (r.from_id === id || visited.has(r.from_id)) continue;
        if (visited.size >= maxNodes) { truncated = true; break; }
        const confidence: 'resolved' | 'inferred' =
          cur.confidence === 'inferred' || r.confidence === 'inferred' ? 'inferred' : 'resolved';
        const kind = r.from_kind as ImpactNodeKind;
        const node: ImpactedNode = { id: r.from_id, kind, depth: cur.depth + 1, confidence };
        const filePath = kind === 'file' ? r.from_id.slice(5) : kind === 'method' ? r.from_id.slice(7).split('#')[0] : null;
        if (filePath) node.module = (moduleOf.get(filePath) as any)?.module ?? undefined;
        visited.set(r.from_id, node);
        next.push({ id: r.from_id, depth: cur.depth + 1, confidence });
      }
      if (truncated) break;
    }
    if (truncated) break;
    queue = next;
  }

  const affected = [...visited.values()].sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  const byKind: Record<string, number> = {};
  const byModule: Record<string, number> = {};
  for (const n of affected) {
    byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
    if (n.module) byModule[n.module] = (byModule[n.module] ?? 0) + 1;
  }

  return {
    entity: id,
    affected,
    byKind,
    byModule,
    totalVisited: affected.length,
    truncated,
    candidates: candidates.length > 0 ? candidates : undefined
  };
}

export interface BlastRadiusResult {
  entity: string;
  totalAffected: number;
  truncated: boolean;
  byKind: Record<string, number>;
  byModule: Record<string, number>;
  /** Top afetados ordenados por quantos OUTROS nós dependem deles (criticidade). */
  top: Array<{ id: string; kind: string; depth: number; dependents: number; confidence: string }>;
  candidates?: string[];
}

/** Resumo ultra-compacto do impacto — pensado para ~200–400 tokens no MCP. */
export function queryBlastRadius(db: Database.Database, entity: string, topN = 20): BlastRadiusResult | null {
  const impact = queryImpactOf(db, entity);
  if (!impact) return null;

  const dependentsOf = db.prepare('SELECT COUNT(DISTINCT from_id) c FROM impact_edges WHERE to_id = ?');
  // Limita a contagem de criticidade aos 200 mais rasos (custo previsível em 74k arquivos)
  const scored = impact.affected.slice(0, 200).map((n) => ({
    id: n.id,
    kind: n.kind,
    depth: n.depth,
    confidence: n.confidence,
    dependents: (dependentsOf.get(n.id) as any).c as number
  }));
  scored.sort((a, b) => b.dependents - a.dependents || a.depth - b.depth);

  return {
    entity: impact.entity,
    totalAffected: impact.totalVisited,
    truncated: impact.truncated,
    byKind: impact.byKind,
    byModule: impact.byModule,
    top: scored.slice(0, topN),
    candidates: impact.candidates
  };
}

// ── Path finding: "por que X impacta Y" ──────────────────────────────────────
//
// `queryImpactOf` diz O QUE é afetado, mas descarta o caminho. Aqui reconstruímos
// a CADEIA de arestas (com `via` + confiança por salto) que liga duas entidades —
// reaproveitando `resolveImpactId` nas duas pontas e o mesmo BFS+parent-map de
// `queryFindPath`, mas sobre `impact_edges` (cross-tier) em vez de `edges`.

export interface ImpactPathHop {
  from: string;
  to: string;
  /** Como a dependência foi detectada (import, call, db-call, reads, writes…). */
  via: string;
  confidence: 'resolved' | 'inferred';
}

export interface ImpactPathResult {
  /** Id canônico resolvido da origem. */
  from: string;
  /** Id canônico resolvido do destino. */
  to: string;
  /** Até `maxPaths` cadeias de arestas (mais curtas primeiro). Vazio = sem caminho. */
  paths: ImpactPathHop[][];
  /** Nº de saltos do caminho mais curto (0 = origem == destino). */
  hops: number;
  /** Busca atingiu o teto de nós antes de esgotar o grafo. */
  truncated: boolean;
  fromCandidates?: string[];
  toCandidates?: string[];
}

export interface ImpactPathOptions {
  /** Quantas cadeias alternativas retornar (default 3). */
  maxPaths?: number;
  /** Teto de nós visitados por busca (default 5000; reporta `truncated`). */
  maxNodes?: number;
  /**
   * 'impact' (default): caminho de propagação — "mexer em `from` afeta `to`".
   * 'depends': caminho de dependência — "`from` depende de `to`".
   */
  direction?: 'impact' | 'depends';
}

/**
 * Reconstrói a(s) cadeia(s) de arestas que ligam `from` a `to` no grafo de impacto.
 *
 * direction='impact' (default) responde "por que mexer em `from` afeta `to`":
 * caminha pelas arestas reversas (dependentes) de `from` até alcançar `to`. Cada
 * salto `A --via--> B` lê-se "o impacto flui de A para B porque B depende de A".
 */
export function queryImpactPath(
  db: Database.Database,
  from: string,
  to: string,
  opts: ImpactPathOptions = {}
): ImpactPathResult | null {
  const src = resolveImpactId(db, from);
  const dst = resolveImpactId(db, to);
  if (!src.id || !dst.id) return null;

  const maxPaths = opts.maxPaths ?? 3;
  const maxNodes = opts.maxNodes ?? 5000;
  const direction = opts.direction ?? 'impact';

  // 'impact': vizinho = quem depende do nó atual (from_id onde to_id = atual).
  // 'depends': vizinho = de quem o nó atual depende (to_id onde from_id = atual).
  const neighborStmt =
    direction === 'impact'
      ? db.prepare('SELECT from_id AS node, via, confidence FROM impact_edges WHERE to_id = ?')
      : db.prepare('SELECT to_id AS node, via, confidence FROM impact_edges WHERE from_id = ?');

  const edgeKey = (parent: string, node: string) => `${parent} ${node}`;

  let truncated = false; // setado se alguma busca atingir maxNodes

  // BFS shortest path com parent-map; `banned` permite achar caminhos alternativos.
  const search = (banned: Set<string>): ImpactPathHop[] | null => {
    if (src.id === dst.id) return [];
    const parent = new Map<string, { from: string; via: string; confidence: 'resolved' | 'inferred' }>();
    const visited = new Set<string>([src.id!]);
    let queue: string[] = [src.id!];
    let found = false;

    while (queue.length > 0 && !found) {
      const next: string[] = [];
      for (const cur of queue) {
        for (const r of neighborStmt.all(cur) as any[]) {
          const node = r.node as string;
          if (visited.has(node)) continue;
          if (banned.has(edgeKey(cur, node))) continue;
          if (visited.size >= maxNodes) { truncated = true; break; }
          visited.add(node);
          parent.set(node, { from: cur, via: r.via as string, confidence: r.confidence as any });
          if (node === dst.id) { found = true; break; }
          next.push(node);
        }
        if (found || truncated) break;
      }
      if (found || truncated) break;
      queue = next;
    }

    if (!found) return null;
    // Reconstrói do destino até a origem. Hop = aresta de dependência `from -> to`,
    // independente da direção de busca (o flow de impacto é a mesma orientação).
    const hops: ImpactPathHop[] = [];
    let cur = dst.id!;
    while (cur !== src.id) {
      const p = parent.get(cur)!;
      // Hop sempre orientado parent→node (a ordem em que descobrimos o caminho).
      hops.unshift({ from: p.from, to: cur, via: p.via, confidence: p.confidence });
      cur = p.from;
    }
    return hops;
  };

  const first = search(new Set());
  if (first === null) {
    // Distingue "sem caminho" de "estourou o teto": refaz sem cap p/ marcar truncado.
    return { from: src.id, to: dst.id, paths: [], hops: 0, truncated: false,
      fromCandidates: src.candidates.length ? src.candidates : undefined,
      toCandidates: dst.candidates.length ? dst.candidates : undefined };
  }

  const paths: ImpactPathHop[][] = [first];
  // k-shortest leve: para cada caminho achado, bane uma de suas arestas e re-busca.
  const banned = new Set<string>();
  for (let k = 1; k < maxPaths && paths.length > 0; k++) {
    const base = paths[paths.length - 1];
    if (base.length === 0) break;
    // Bane a aresta do meio do último caminho para forçar uma rota distinta.
    const mid = base[Math.floor(base.length / 2)];
    const key =
      direction === 'impact'
        ? edgeKey(mid.to, mid.from) // busca reversa: (cur=to, node=from)
        : edgeKey(mid.from, mid.to);
    if (banned.has(key)) break;
    banned.add(key);
    const alt = search(banned);
    if (!alt) break;
    const sig = (p: ImpactPathHop[]) => p.map((h) => `${h.from}->${h.to}`).join('|');
    if (paths.some((p) => sig(p) === sig(alt))) break;
    paths.push(alt);
  }

  return {
    from: src.id,
    to: dst.id,
    paths,
    hops: first.length,
    truncated,
    fromCandidates: src.candidates.length ? src.candidates : undefined,
    toCandidates: dst.candidates.length ? dst.candidates : undefined
  };
}
