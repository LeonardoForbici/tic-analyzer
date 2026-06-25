/**
 * Consultas de agregação hierárquica do grafo:
 *
 *   app → layer (frontend/backend/database) → module → file → symbol
 *
 * O renderer só recebe o NÍVEL VISÍVEL: cada nó na tela é um agregado
 * (layer/module) ou uma folha (file/symbol), e as arestas são somadas no nível
 * do container (peso = nº de arestas arquivo→arquivo embaixo dele). Nunca
 * retorna o grafo inteiro de um projeto de 74k arquivos — expandir um módulo
 * busca apenas as arestas que tocam aquele módulo.
 *
 * Ids: `layer:<nome>` | `module:<nome>` | `file:<rel_path>` | `symbol:<file>#<nome>`
 */
import type Database from 'better-sqlite3';

export type AggNodeKind = 'layer' | 'module' | 'file' | 'symbol' | 'more' | 'plsql' | 'table' | 'column' | 'method';

export interface AggNode {
  id: string;
  label: string;
  kind: AggNodeKind;
  layer?: string;
  role?: string;
  /** Quantos filhos este agregado tem (módulos num layer, arquivos num módulo...). */
  childCount: number;
  inWeight: number;
  outWeight: number;
}

export interface AggEdge {
  from: string;
  to: string;
  /** Nº de arestas agregadas neste par. */
  weight: number;
  /** Quantas delas são `resolved` (AST) — o resto é heurístico. */
  resolvedWeight: number;
  /** Tipo de relação dominante (import / db-call / writes / reads / trigger / calls). Preenchido no modo unificado. */
  via?: string;
}

export interface GraphLevelRequest {
  /** Ids expandidos (ex.: ['layer:backend', 'module:cliente', 'file:src/a.ts']). */
  expanded: string[];
}

export interface GraphLevelResult {
  nodes: AggNode[];
  edges: AggEdge[];
}

/** Máximo de filhos mostrados ao expandir um container (resto vira nó "…N more"). */
const MAX_CHILDREN = 150;

export interface CommunitySummary {
  id: number;
  name: string;
  size: number;
  /** Distribuição por tipo de nó (file/method/plsql/table/column). */
  byKind: Record<string, number>;
}

export interface CommunityCoupling {
  from: number;
  to: number;
  fromName: string;
  toName: string;
  weight: number;
}

export interface CommunitiesResult {
  communities: CommunitySummary[];
  /** Acoplamentos entre comunidades mais fortes (arestas cross-cluster). */
  coupling: CommunityCoupling[];
}

/**
 * Comunidades do grafo (Louvain), lidas da tabela `communities`. Feature-detect:
 * retorna null para index.db antigo (sem a tabela). O acoplamento cross-cluster
 * é recomputado de impact_edges para destacar pontes entre comunidades.
 */
export function queryCommunities(db: Database.Database, topN = 25): CommunitiesResult | null {
  const hasTable = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='communities'").get();
  if (!hasTable) return null;

  const rows = db.prepare('SELECT node_id, community, name FROM communities').all() as Array<{ node_id: string; community: number; name: string }>;
  if (rows.length === 0) return { communities: [], coupling: [] };

  const nameById = new Map<number, string>();
  const sizeById = new Map<number, number>();
  const byKind = new Map<number, Record<string, number>>();
  const commOfNode = new Map<string, number>();
  for (const r of rows) {
    nameById.set(r.community, r.name);
    sizeById.set(r.community, (sizeById.get(r.community) ?? 0) + 1);
    commOfNode.set(r.node_id, r.community);
    const kind = r.node_id.slice(0, r.node_id.indexOf(':'));
    const k = byKind.get(r.community) ?? {};
    k[kind] = (k[kind] ?? 0) + 1;
    byKind.set(r.community, k);
  }

  const communities: CommunitySummary[] = [...sizeById.entries()]
    .map(([id, size]) => ({ id, name: nameById.get(id) ?? String(id), size, byKind: byKind.get(id) ?? {} }))
    .sort((a, b) => b.size - a.size)
    .slice(0, topN);

  // Acoplamento cross-cluster a partir do grafo de impacto.
  const crossWeight = new Map<string, number>();
  const edges = db.prepare('SELECT from_id, to_id FROM impact_edges').all() as Array<{ from_id: string; to_id: string }>;
  for (const e of edges) {
    const ca = commOfNode.get(e.from_id);
    const cb = commOfNode.get(e.to_id);
    if (ca === undefined || cb === undefined || ca === cb) continue;
    const key = ca < cb ? `${ca}-${cb}` : `${cb}-${ca}`;
    crossWeight.set(key, (crossWeight.get(key) ?? 0) + 1);
  }
  const coupling: CommunityCoupling[] = [...crossWeight.entries()]
    .map(([key, weight]) => {
      const [from, to] = key.split('-').map(Number);
      return { from, to, fromName: nameById.get(from) ?? String(from), toName: nameById.get(to) ?? String(to), weight };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, topN);

  return { communities, coupling };
}

export function queryGraphLevel(db: Database.Database, req: GraphLevelRequest): GraphLevelResult {
  const expandedLayers = new Set<string>();
  const expandedModules = new Set<string>();
  const expandedFiles = new Set<string>();
  for (const id of req.expanded) {
    if (id.startsWith('layer:')) expandedLayers.add(id.slice(6));
    else if (id.startsWith('module:')) expandedModules.add(id.slice(7));
    else if (id.startsWith('file:')) expandedFiles.add(id.slice(5));
  }

  // ── Estrutura: módulos e layers ─────────────────────────────────────────────
  const modules = db.prepare('SELECT name, file_count, layer FROM modules').all() as Array<{
    name: string; file_count: number; layer: string;
  }>;
  const layerOf = new Map<string, string>();
  const layerModules = new Map<string, typeof modules>();
  for (const m of modules) {
    layerOf.set(m.name, m.layer);
    const arr = layerModules.get(m.layer) ?? [];
    arr.push(m);
    layerModules.set(m.layer, arr);
  }
  // Módulo expandido implica layer expandido (drill direto por busca/clique)
  for (const m of expandedModules) {
    const l = layerOf.get(m);
    if (l) expandedLayers.add(l);
  }

  const nodes = new Map<string, AggNode>();
  const visibleFiles = new Map<string, string>(); // rel_path → node id (file ou symbol-container)

  // ── Nós visíveis ────────────────────────────────────────────────────────────
  for (const [layer, mods] of layerModules) {
    if (!expandedLayers.has(layer)) {
      const fileCount = mods.reduce((s, m) => s + m.file_count, 0);
      nodes.set(`layer:${layer}`, { id: `layer:${layer}`, label: layer, kind: 'layer', layer, childCount: mods.length, inWeight: 0, outWeight: 0 });
      continue;
    }
    for (const m of mods) {
      if (!expandedModules.has(m.name)) {
        nodes.set(`module:${m.name}`, { id: `module:${m.name}`, label: m.name, kind: 'module', layer, childCount: m.file_count, inWeight: 0, outWeight: 0 });
        continue;
      }
      // Módulo expandido → só arquivos CONECTADOS (top N por grau); os sem
      // dependência (package.json, README...) viram um único pseudo-nó.
      const files = db
        .prepare('SELECT rel_path, in_degree, out_degree, layer, role FROM files WHERE module = ? AND (in_degree + out_degree) > 0 ORDER BY (in_degree + out_degree) DESC LIMIT ?')
        .all(m.name, MAX_CHILDREN) as Array<{ rel_path: string; in_degree: number; out_degree: number; layer: string | null; role: string | null }>;
      for (const f of files) {
        const id = `file:${f.rel_path}`;
        nodes.set(id, {
          id, label: f.rel_path.split('/').pop() ?? f.rel_path, kind: 'file',
          layer: f.layer ?? layer,
          role: f.role ?? undefined,
          childCount: 0, inWeight: f.in_degree, outWeight: f.out_degree
        });
        visibleFiles.set(f.rel_path, id);
      }
      const hidden = m.file_count - files.length;
      if (hidden > 0) {
        const id = `more:${m.name}`;
        const label = files.length >= MAX_CHILDREN ? `…${hidden} arquivos` : `…${hidden} sem dependências`;
        nodes.set(id, { id, label, kind: 'more', layer, childCount: hidden, inWeight: 0, outWeight: 0 });
      }
    }
  }

  // Arquivos sem módulo ficam invisíveis no nível agregado (entram via expand de
  // módulo "..."), mas arquivos explicitamente expandidos mostram símbolos.
  const symbolStmt = db.prepare('SELECT kind, simple_name, line FROM symbols WHERE file = ? ORDER BY line LIMIT 80');
  for (const f of expandedFiles) {
    const fileId = `file:${f}`;
    if (!nodes.has(fileId)) continue;
    const syms = symbolStmt.all(f) as Array<{ kind: string; simple_name: string; line: number }>;
    if (syms.length === 0) continue; // sem AST p/ este arquivo: mantém o nó de arquivo
    const layer = nodes.get(fileId)?.layer;
    nodes.delete(fileId);
    for (const s of syms) {
      const id = `symbol:${f}#${s.simple_name}`;
      nodes.set(id, { id, label: s.simple_name, kind: 'symbol', layer, childCount: 0, inWeight: 0, outWeight: 0 });
    }
    visibleFiles.set(f, `symbolset:${f}`); // marcador: arestas viram símbolo-nível
  }

  /** Mapeia um arquivo para o nó visível que o contém. */
  const moduleOfFile = db.prepare('SELECT module FROM files WHERE rel_path = ?');
  const containerCache = new Map<string, string | null>();
  const containerOf = (relPath: string): string | null => {
    const direct = visibleFiles.get(relPath);
    if (direct) return direct;
    if (containerCache.has(relPath)) return containerCache.get(relPath)!;
    const mod = (moduleOfFile.get(relPath) as any)?.module as string | undefined;
    let result: string | null = null;
    if (mod) {
      const layer = layerOf.get(mod);
      if (expandedModules.has(mod)) result = `more:${mod}`; // ficou fora do top N
      else if (layer && expandedLayers.has(layer)) result = `module:${mod}`;
      else if (layer) result = `layer:${layer}`;
    }
    if (result && !nodes.has(result)) result = null;
    containerCache.set(relPath, result);
    return result;
  };

  // ── Arestas agregadas ───────────────────────────────────────────────────────
  const edgeAgg = new Map<string, AggEdge>();
  const addEdge = (from: string, to: string, weight: number, resolvedWeight: number) => {
    if (from === to) return;
    const key = `${from}→${to}`;
    const cur = edgeAgg.get(key);
    if (cur) { cur.weight += weight; cur.resolvedWeight += resolvedWeight; }
    else edgeAgg.set(key, { from, to, weight, resolvedWeight });
  };

  if (expandedModules.size === 0 && expandedFiles.size === 0) {
    // Nível layer/module: uma única query agregada módulo×módulo (rápida com índices)
    const rows = db
      .prepare(
        `SELECT f1.module m1, f2.module m2, COUNT(*) w,
                SUM(CASE WHEN e.confidence = 'resolved' THEN 1 ELSE 0 END) rw
         FROM edges e
         JOIN files f1 ON f1.rel_path = e.from_file
         JOIN files f2 ON f2.rel_path = e.to_file
         WHERE f1.module IS NOT NULL AND f2.module IS NOT NULL
         GROUP BY f1.module, f2.module`
      )
      .all() as Array<{ m1: string; m2: string; w: number; rw: number }>;
    for (const r of rows) {
      const from = moduleContainer(r.m1, expandedLayers, layerOf, nodes);
      const to = moduleContainer(r.m2, expandedLayers, layerOf, nodes);
      if (from && to) addEdge(from, to, r.w, r.rw);
    }
  } else {
    // Há módulos/arquivos expandidos: busca apenas as arestas que tocam esses
    // módulos + a matriz módulo×módulo para o restante do mapa.
    const mods = [...expandedModules];
    const placeholders = mods.map(() => '?').join(',');
    const touching = db
      .prepare(
        `SELECT e.from_file ff, e.to_file tf, e.confidence c
         FROM edges e
         JOIN files f1 ON f1.rel_path = e.from_file
         JOIN files f2 ON f2.rel_path = e.to_file
         WHERE f1.module IN (${placeholders}) OR f2.module IN (${placeholders})`
      )
      .all(...mods, ...mods) as Array<{ ff: string; tf: string; c: string }>;
    for (const r of touching) {
      let from = containerOf(r.ff);
      let to = containerOf(r.tf);
      if (from?.startsWith('symbolset:') || to?.startsWith('symbolset:')) {
        // nível símbolo: tenta resolver método via method_edges; senão liga no 1º símbolo
        continue; // arestas símbolo-nível tratadas abaixo via method_edges
      }
      if (from && to) addEdge(from, to, 1, r.c === 'resolved' ? 1 : 0);
    }
    const rows = db
      .prepare(
        `SELECT f1.module m1, f2.module m2, COUNT(*) w,
                SUM(CASE WHEN e.confidence = 'resolved' THEN 1 ELSE 0 END) rw
         FROM edges e
         JOIN files f1 ON f1.rel_path = e.from_file
         JOIN files f2 ON f2.rel_path = e.to_file
         WHERE f1.module NOT IN (${placeholders}) AND f2.module NOT IN (${placeholders})
           AND f1.module IS NOT NULL AND f2.module IS NOT NULL
         GROUP BY f1.module, f2.module`
      )
      .all(...mods, ...mods) as Array<{ m1: string; m2: string; w: number; rw: number }>;
    for (const r of rows) {
      const from = moduleContainer(r.m1, expandedLayers, layerOf, nodes);
      const to = moduleContainer(r.m2, expandedLayers, layerOf, nodes);
      if (from && to) addEdge(from, to, r.w, r.rw);
    }

    // Arestas símbolo→símbolo (method_edges) para arquivos expandidos
    if (expandedFiles.size > 0) {
      const fileList = [...expandedFiles];
      const fph = fileList.map(() => '?').join(',');
      const mrows = db
        .prepare(
          `SELECT from_file, from_method, to_file, to_method, confidence
           FROM method_edges WHERE from_file IN (${fph}) OR to_file IN (${fph})`
        )
        .all(...fileList, ...fileList) as Array<{ from_file: string; from_method: string | null; to_file: string; to_method: string | null; confidence: string }>;
      for (const m of mrows) {
        const fromSym = `symbol:${m.from_file}#${(m.from_method ?? '').split('.').pop()}`;
        const toSym = `symbol:${m.to_file}#${m.to_method}`;
        const from = nodes.has(fromSym) ? fromSym : containerOf(m.from_file);
        const to = nodes.has(toSym) ? toSym : containerOf(m.to_file);
        if (from && to && !from.startsWith('symbolset:') && !to.startsWith('symbolset:')) {
          addEdge(from, to, 1, m.confidence === 'resolved' ? 1 : 0);
        }
      }
    }
  }

  // Pesos in/out dos agregados a partir das arestas visíveis
  for (const e of edgeAgg.values()) {
    const f = nodes.get(e.from);
    const t = nodes.get(e.to);
    if (f) f.outWeight += e.weight;
    if (t) t.inWeight += e.weight;
  }

  return { nodes: [...nodes.values()], edges: [...edgeAgg.values()] };
}

function moduleContainer(
  mod: string,
  expandedLayers: Set<string>,
  layerOf: Map<string, string>,
  nodes: Map<string, AggNode>
): string | null {
  const layer = layerOf.get(mod);
  if (!layer) return null;
  const id = expandedLayers.has(layer) ? `module:${mod}` : `layer:${layer}`;
  return nodes.has(id) ? id : null;
}

// ── Grafo unificado cross-tier ─────────────────────────────────────────────

const VIA_PRIORITY: Record<string, number> = {
  trigger: 6, writes: 5, reads: 4, 'db-call': 3, calls: 2, import: 1, depends: 0,
};

function dominantVia(vias: Map<string, number>): string {
  let best = 'depends';
  let bestScore = -1;
  for (const [v, count] of vias) {
    const score = (VIA_PRIORITY[v] ?? 0) + count * 0.01;
    if (score > bestScore) { bestScore = score; best = v; }
  }
  return best;
}

/**
 * Grafo unificado cross-tier: mostra nós de TODOS os tipos (layer/module/file/plsql/table/column/method)
 * com arestas coloridas por tipo de relação (import/db-call/writes/reads/trigger).
 * Reusa o mesmo contrato GraphLevelResult do queryGraphLevel — o HierGraphViewer pode
 * consumir qualquer um sem adaptação.
 */
export function queryUnifiedGraph(db: Database.Database, req: GraphLevelRequest): GraphLevelResult {
  const expandedLayers = new Set<string>();
  const expandedModules = new Set<string>();
  for (const id of req.expanded) {
    if (id.startsWith('layer:')) expandedLayers.add(id.slice(6));
    else if (id.startsWith('module:')) expandedModules.add(id.slice(7));
  }

  // ── Metadados dos módulos (camadas de arquivos) ──────────────────────────
  const modules = db.prepare('SELECT name, file_count, layer FROM modules').all() as Array<{ name: string; file_count: number; layer: string }>;
  const layerOf = new Map<string, string>();
  const layerModules = new Map<string, typeof modules>();
  for (const m of modules) {
    layerOf.set(m.name, m.layer);
    const arr = layerModules.get(m.layer) ?? [];
    arr.push(m);
    layerModules.set(m.layer, arr);
  }
  for (const m of expandedModules) {
    const l = layerOf.get(m);
    if (l) expandedLayers.add(l);
  }

  // ── Maps arquivo → módulo/layer ──────────────────────────────────────────
  const fileModuleMap = new Map<string, string>();
  const fileLayerMap = new Map<string, string>();
  for (const r of db.prepare('SELECT rel_path, module, layer FROM files').all() as Array<{ rel_path: string; module: string | null; layer: string | null }>) {
    if (r.module) fileModuleMap.set(r.rel_path, r.module);
    if (r.layer) fileLayerMap.set(r.rel_path, r.layer);
  }

  const nodes = new Map<string, AggNode>();
  // Aresta: chave from→to (sem via), armazena vias separadas para escolher a dominante
  const edgeMap = new Map<string, { from: string; to: string; weight: number; resolvedWeight: number; vias: Map<string, number> }>();

  function upsertEdge(from: string, to: string, via: string, resolved: boolean) {
    if (from === to) return;
    const key = `${from}→${to}`;
    const cur = edgeMap.get(key);
    if (cur) {
      cur.weight++;
      if (resolved) cur.resolvedWeight++;
      cur.vias.set(via, (cur.vias.get(via) ?? 0) + 1);
    } else {
      edgeMap.set(key, { from, to, weight: 1, resolvedWeight: resolved ? 1 : 0, vias: new Map([[via, 1]]) });
    }
  }

  // ── Nós visíveis ─────────────────────────────────────────────────────────
  const hasNonFile = !!db.prepare("SELECT 1 FROM impact_edges WHERE from_kind != 'file' OR to_kind != 'file' LIMIT 1").get();
  const allLayers = new Set(layerModules.keys());
  if (hasNonFile && !allLayers.has('database')) allLayers.add('database');

  for (const layer of allLayers) {
    const mods = layerModules.get(layer) ?? [];

    if (!expandedLayers.has(layer)) {
      nodes.set(`layer:${layer}`, {
        id: `layer:${layer}`, label: layer, kind: 'layer', layer,
        childCount: mods.reduce((s, m) => s + m.file_count, 0),
        inWeight: 0, outWeight: 0,
      });
      continue;
    }

    if (layer === 'database') {
      // Módulos de arquivo na camada database (ex. .pkb, .trg)
      for (const m of mods) {
        if (!expandedModules.has(m.name)) {
          nodes.set(`module:${m.name}`, { id: `module:${m.name}`, label: m.name, kind: 'module', layer, childCount: m.file_count, inWeight: 0, outWeight: 0 });
        } else {
          const files = db.prepare('SELECT rel_path, in_degree, out_degree, layer, role FROM files WHERE module = ? AND (in_degree + out_degree) > 0 ORDER BY (in_degree + out_degree) DESC LIMIT ?')
            .all(m.name, MAX_CHILDREN) as Array<{ rel_path: string; in_degree: number; out_degree: number; layer: string | null; role: string | null }>;
          for (const f of files) {
            const id = `file:${f.rel_path}`;
            nodes.set(id, { id, label: f.rel_path.split('/').pop() ?? f.rel_path, kind: 'file', layer: f.layer ?? layer, role: f.role ?? undefined, childCount: 0, inWeight: f.in_degree, outWeight: f.out_degree });
          }
          const hidden = m.file_count - files.length;
          if (hidden > 0) nodes.set(`more:${m.name}`, { id: `more:${m.name}`, label: `…${hidden} mais`, kind: 'more', layer, childCount: hidden, inWeight: 0, outWeight: 0 });
        }
      }

      // Nós não-arquivo (plsql/table/column/method) da camada database
      const NON_FILE_KINDS = "('plsql','table','column','method')";
      const dbNodes = db.prepare(
        `SELECT DISTINCT id, kind FROM (
           SELECT from_id id, from_kind kind FROM impact_edges WHERE from_kind IN ${NON_FILE_KINDS}
           UNION SELECT to_id, to_kind FROM impact_edges WHERE to_kind IN ${NON_FILE_KINDS}
         ) ORDER BY kind, id LIMIT ${MAX_CHILDREN}`
      ).all() as Array<{ id: string; kind: string }>;
      for (const r of dbNodes) {
        if (!nodes.has(r.id)) {
          const label = r.id.includes(':') ? r.id.slice(r.id.indexOf(':') + 1) : r.id;
          nodes.set(r.id, { id: r.id, label, kind: r.kind as AggNodeKind, layer: 'database', childCount: 0, inWeight: 0, outWeight: 0 });
        }
      }
      const totalDb = (db.prepare(
        `SELECT COUNT(DISTINCT id) c FROM (
           SELECT from_id id FROM impact_edges WHERE from_kind IN ${NON_FILE_KINDS}
           UNION SELECT to_id FROM impact_edges WHERE to_kind IN ${NON_FILE_KINDS}
         )`
      ).get() as { c: number }).c;
      const dbShown = dbNodes.length;
      if (totalDb > dbShown) {
        nodes.set('more:database', { id: 'more:database', label: `…${totalDb - dbShown} mais`, kind: 'more', layer: 'database', childCount: totalDb - dbShown, inWeight: 0, outWeight: 0 });
      }
    } else {
      // Camada de arquivo (frontend/backend)
      for (const m of mods) {
        if (!expandedModules.has(m.name)) {
          nodes.set(`module:${m.name}`, { id: `module:${m.name}`, label: m.name, kind: 'module', layer, childCount: m.file_count, inWeight: 0, outWeight: 0 });
        } else {
          const files = db.prepare('SELECT rel_path, in_degree, out_degree, layer, role FROM files WHERE module = ? AND (in_degree + out_degree) > 0 ORDER BY (in_degree + out_degree) DESC LIMIT ?')
            .all(m.name, MAX_CHILDREN) as Array<{ rel_path: string; in_degree: number; out_degree: number; layer: string | null; role: string | null }>;
          for (const f of files) {
            const id = `file:${f.rel_path}`;
            nodes.set(id, { id, label: f.rel_path.split('/').pop() ?? f.rel_path, kind: 'file', layer: f.layer ?? layer, role: f.role ?? undefined, childCount: 0, inWeight: f.in_degree, outWeight: f.out_degree });
          }
          const hidden = m.file_count - files.length;
          if (hidden > 0) nodes.set(`more:${m.name}`, { id: `more:${m.name}`, label: `…${hidden} mais`, kind: 'more', layer, childCount: hidden, inWeight: 0, outWeight: 0 });
        }
      }
    }
  }

  // ── Arestas de impacto cross-tier ─────────────────────────────────────────

  function containerOf(id: string, kind: string): string | null {
    if (kind === 'file') {
      if (nodes.has(id)) return id;
      const relPath = id.slice(5);
      const mod = fileModuleMap.get(relPath);
      if (mod) {
        if (nodes.has(`module:${mod}`)) return `module:${mod}`;
        if (nodes.has(`more:${mod}`)) return `more:${mod}`;
        const layer = layerOf.get(mod) ?? fileLayerMap.get(relPath);
        if (layer && nodes.has(`layer:${layer}`)) return `layer:${layer}`;
      } else {
        const layer = fileLayerMap.get(relPath);
        if (layer && nodes.has(`layer:${layer}`)) return `layer:${layer}`;
      }
      return null;
    }
    // Nó não-arquivo (plsql, table, column, method)
    if (nodes.has(id)) return id;
    if (nodes.has('more:database')) return 'more:database';
    if (nodes.has('layer:database')) return 'layer:database';
    return null;
  }

  for (const e of db.prepare('SELECT from_id, from_kind, to_id, to_kind, via, confidence FROM impact_edges').all() as Array<{ from_id: string; from_kind: string; to_id: string; to_kind: string; via: string; confidence: string }>) {
    const from = containerOf(e.from_id, e.from_kind);
    const to = containerOf(e.to_id, e.to_kind);
    if (from && to) upsertEdge(from, to, e.via ?? 'depends', e.confidence === 'resolved');
  }

  // Pesos in/out + converte para AggEdge[]
  const edges: AggEdge[] = [];
  for (const [, e] of edgeMap) {
    const via = dominantVia(e.vias);
    edges.push({ from: e.from, to: e.to, weight: e.weight, resolvedWeight: e.resolvedWeight, via });
    const f = nodes.get(e.from);
    const t = nodes.get(e.to);
    if (f) f.outWeight += e.weight;
    if (t) t.inWeight += e.weight;
  }

  return { nodes: [...nodes.values()], edges };
}
