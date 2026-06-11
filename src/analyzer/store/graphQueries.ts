/**
 * Consultas de agregação hierárquica do grafo (estilo CAST Imaging):
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

export type AggNodeKind = 'layer' | 'module' | 'file' | 'symbol' | 'more';

export interface AggNode {
  id: string;
  label: string;
  kind: AggNodeKind;
  layer?: string;
  /** Quantos filhos este agregado tem (módulos num layer, arquivos num módulo...). */
  childCount: number;
  inWeight: number;
  outWeight: number;
}

export interface AggEdge {
  from: string;
  to: string;
  /** Nº de arestas arquivo→arquivo agregadas neste par. */
  weight: number;
  /** Quantas delas são `resolved` (AST) — o resto é heurístico. */
  resolvedWeight: number;
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
      // Módulo expandido → arquivos (top N por grau, resto agregado)
      const files = db
        .prepare('SELECT rel_path, in_degree, out_degree FROM files WHERE module = ? ORDER BY (in_degree + out_degree) DESC LIMIT ?')
        .all(m.name, MAX_CHILDREN + 1) as Array<{ rel_path: string; in_degree: number; out_degree: number }>;
      const shown = files.slice(0, MAX_CHILDREN);
      for (const f of shown) {
        const id = `file:${f.rel_path}`;
        nodes.set(id, {
          id, label: f.rel_path.split('/').pop() ?? f.rel_path, kind: 'file', layer,
          childCount: 0, inWeight: f.in_degree, outWeight: f.out_degree
        });
        visibleFiles.set(f.rel_path, id);
      }
      if (m.file_count > shown.length) {
        const id = `more:${m.name}`;
        nodes.set(id, { id, label: `…${m.file_count - shown.length} arquivos`, kind: 'more', layer, childCount: m.file_count - shown.length, inWeight: 0, outWeight: 0 });
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
