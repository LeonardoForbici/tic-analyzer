/**
 * Índice persistente consultável (SQLite via better-sqlite3) em
 * `.tic-code/index.db`. Substitui a leitura de JSON estático pelo MCP para as
 * consultas de impacto/caminho/busca/trace — e, crucialmente, **remove o teto de
 * 3000 nós** do `dep-graph.json`: o grafo inteiro é persistido e consultado por
 * índices, escalando para 70k+ arquivos.
 *
 * 100% local/offline. O `.db` fica fora do git (`.tic-code/` é gitignored).
 */
import * as fs from 'fs';
import Database from 'better-sqlite3';
import type { ScannedFile } from '../scanFiles';
import type { DependencyGraph } from '../buildDependencyGraph';
import type { CallGraph } from '../buildCallGraph';
import type { SearchIndexEntry } from '../buildSearchIndex';
import type { MethodEdge } from '../semantic/resolveReferences';
import type { ColumnAccess } from '../detectOrmMappings';
import type { ProjectModule } from '../detectModules';
import type { ImpactEdge } from '../buildImpactGraph';
import { vectorToBlob } from '../semantic/embeddings';

export const INDEX_DB_FILE = 'index.db';

const SCHEMA = `
CREATE TABLE files (
  rel_path TEXT PRIMARY KEY,
  ext TEXT,
  lines INTEGER,
  in_degree INTEGER,
  out_degree INTEGER,
  module TEXT
);
CREATE INDEX idx_files_module ON files(module);

CREATE TABLE modules (
  name TEXT PRIMARY KEY,
  file_count INTEGER,
  layer TEXT
);

-- Grafo de impacto unificado (file/method/plsql/table/column). Aresta A→B
-- significa "A depende de B"; impacto de B = BFS reverso a partir de B.
CREATE TABLE impact_edges (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  from_kind TEXT,
  to_kind TEXT,
  via TEXT,
  confidence TEXT
);
CREATE INDEX idx_impact_to ON impact_edges(to_id);
CREATE INDEX idx_impact_from ON impact_edges(from_id);
CREATE TABLE edges (
  from_file TEXT NOT NULL,
  to_file TEXT NOT NULL,
  kind TEXT,
  confidence TEXT
);
CREATE INDEX idx_edges_to ON edges(to_file);
CREATE INDEX idx_edges_from ON edges(from_file);

CREATE TABLE symbols (
  file TEXT,
  kind TEXT,
  simple_name TEXT,
  line INTEGER
);
CREATE INDEX idx_symbols_name ON symbols(simple_name);

CREATE TABLE method_edges (
  from_file TEXT NOT NULL,
  from_type TEXT,
  from_method TEXT,
  to_file TEXT NOT NULL,
  to_method TEXT,
  confidence TEXT
);
CREATE INDEX idx_method_edges_to ON method_edges(to_file);
CREATE INDEX idx_method_edges_pair ON method_edges(from_file, to_file);

CREATE TABLE cg_nodes (
  id TEXT PRIMARY KEY,
  label TEXT,
  layer TEXT,
  file TEXT,
  line INTEGER
);
CREATE TABLE cg_edges (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  type TEXT,
  confidence TEXT,
  label TEXT
);

CREATE TABLE column_access (
  from_file TEXT,
  "table" TEXT NOT NULL,
  column TEXT NOT NULL,
  mode TEXT,
  confidence TEXT
);
CREATE INDEX idx_column_access_table ON column_access("table");

CREATE VIRTUAL TABLE search_fts USING fts5(file UNINDEXED, snippet UNINDEXED, terms);

CREATE TABLE embeddings (
  file TEXT PRIMARY KEY,
  vec BLOB NOT NULL
);
`;

export interface IndexDbInput {
  files: ScannedFile[];
  graph: DependencyGraph;
  callGraph: CallGraph;
  searchEntries: SearchIndexEntry[];
  methodEdges?: MethodEdge[];
  columnAccess?: ColumnAccess[];
  /** Módulos detectados — persistidos para agregação (grafo drill-down). */
  modules?: ProjectModule[];
  /** Grafo de impacto unificado (file/method/plsql/table/column). */
  impactEdges?: ImpactEdge[];
  /** Embeddings por arquivo (Fase 4). Ausente quando o modelo não está disponível. */
  embeddings?: Array<{ file: string; vector: Float32Array }>;
}

/** (Re)constrói o index.db a partir dos resultados já computados na pipeline. */
export function writeIndexDb(dbPath: string, input: IndexDbInput): { nodes: number; edges: number } {
  // Rebuild limpo (remove .db + WAL/SHM de runs anteriores).
  for (const suffix of ['', '-wal', '-shm']) {
    const f = dbPath + suffix;
    if (fs.existsSync(f)) fs.rmSync(f);
  }

  const db = new Database(dbPath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.exec(SCHEMA);

    const linesByPath = new Map<string, ScannedFile>();
    for (const f of input.files) linesByPath.set(f.relativePath, f);

    // Mapa arquivo→módulo + camada predominante por módulo
    const moduleByFile = new Map<string, string>();
    const moduleLayers: Array<{ name: string; fileCount: number; layer: string }> = [];
    for (const mod of input.modules ?? []) {
      let fe = 0, dbc = 0, be = 0;
      for (const f of mod.files) {
        moduleByFile.set(f.relativePath, mod.name);
        if (['.tsx', '.jsx', '.vue', '.html', '.css', '.scss'].includes(f.extension)) fe++;
        else if (['.sql', '.plsql', '.pls', '.pck', '.pks', '.pkb', '.prc', '.fnc', '.trg', '.pkg'].includes(f.extension)) dbc++;
        else be++;
      }
      const layer = dbc >= fe && dbc >= be ? 'database' : fe >= be ? 'frontend' : 'backend';
      moduleLayers.push({ name: mod.name, fileCount: mod.fileCount, layer });
    }

    const insertFile = db.prepare(
      'INSERT OR REPLACE INTO files (rel_path, ext, lines, in_degree, out_degree, module) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insertModule = db.prepare('INSERT OR REPLACE INTO modules (name, file_count, layer) VALUES (?, ?, ?)');
    const insertImpact = db.prepare('INSERT INTO impact_edges (from_id, to_id, from_kind, to_kind, via, confidence) VALUES (?, ?, ?, ?, ?, ?)');
    const insertEdge = db.prepare('INSERT INTO edges (from_file, to_file, kind, confidence) VALUES (?, ?, ?, ?)');
    const insertSymbol = db.prepare('INSERT INTO symbols (file, kind, simple_name, line) VALUES (?, ?, ?, ?)');
    const insertMethodEdge = db.prepare('INSERT INTO method_edges (from_file, from_type, from_method, to_file, to_method, confidence) VALUES (?, ?, ?, ?, ?, ?)');
    const insertCgNode = db.prepare('INSERT OR REPLACE INTO cg_nodes (id, label, layer, file, line) VALUES (?, ?, ?, ?, ?)');
    const insertCgEdge = db.prepare('INSERT INTO cg_edges (from_id, to_id, type, confidence, label) VALUES (?, ?, ?, ?, ?)');
    const insertSearch = db.prepare('INSERT INTO search_fts (file, snippet, terms) VALUES (?, ?, ?)');
    const insertColumn = db.prepare('INSERT INTO column_access (from_file, "table", column, mode, confidence) VALUES (?, ?, ?, ?, ?)');
    const insertEmbedding = db.prepare('INSERT OR REPLACE INTO embeddings (file, vec) VALUES (?, ?)');

    const writeAll = db.transaction(() => {
      for (const n of input.graph.nodes) {
        const sf = linesByPath.get(n.path);
        insertFile.run(n.path, sf?.extension ?? null, sf?.lines ?? null, n.inDegree, n.outDegree, moduleByFile.get(n.path) ?? null);
      }
      for (const m of moduleLayers) insertModule.run(m.name, m.fileCount, m.layer);
      for (const e of input.impactEdges ?? []) {
        insertImpact.run(e.from, e.to, e.fromKind, e.toKind, e.via, e.confidence);
      }
      for (const e of input.graph.edges) {
        insertEdge.run(e.from, e.to, e.kind ?? 'import', e.confidence ?? 'inferred');
      }
      for (const c of input.graph.semanticClasses ?? []) {
        insertSymbol.run(c.file, c.isInterface ? 'interface' : 'class', c.name, c.line);
      }
      for (const m of input.methodEdges ?? []) {
        insertMethodEdge.run(m.fromFile, m.fromType ?? null, m.fromMethod ?? null, m.toFile, m.toMethod ?? null, m.confidence);
      }
      for (const n of input.callGraph.nodes) {
        insertCgNode.run(n.id, n.label, n.layer, n.file, n.line ?? null);
      }
      for (const e of input.callGraph.edges) {
        insertCgEdge.run(e.from, e.to, e.type, e.confidence, e.label ?? null);
      }
      for (const s of input.searchEntries) {
        insertSearch.run(s.file, s.snippet, s.terms.join(' '));
      }
      for (const c of input.columnAccess ?? []) {
        insertColumn.run(c.fromFile, c.table, c.column, c.mode, c.confidence);
      }
      for (const e of input.embeddings ?? []) {
        insertEmbedding.run(e.file, vectorToBlob(e.vector));
      }
    });
    writeAll();

    return { nodes: input.graph.nodes.length, edges: input.graph.edges.length };
  } finally {
    db.close();
  }
}

/** Abre o index.db em modo leitura para o MCP. Retorna null se ausente. */
export function openIndexDb(dbPath: string): Database.Database | null {
  if (!fs.existsSync(dbPath)) return null;
  try {
    return new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch {
    return null;
  }
}
