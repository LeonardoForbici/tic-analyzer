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

export const INDEX_DB_FILE = 'index.db';

const SCHEMA = `
CREATE TABLE files (
  rel_path TEXT PRIMARY KEY,
  ext TEXT,
  lines INTEGER,
  in_degree INTEGER,
  out_degree INTEGER
);
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

CREATE VIRTUAL TABLE search_fts USING fts5(file UNINDEXED, snippet UNINDEXED, terms);
`;

export interface IndexDbInput {
  files: ScannedFile[];
  graph: DependencyGraph;
  callGraph: CallGraph;
  searchEntries: SearchIndexEntry[];
  methodEdges?: MethodEdge[];
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

    const insertFile = db.prepare(
      'INSERT OR REPLACE INTO files (rel_path, ext, lines, in_degree, out_degree) VALUES (?, ?, ?, ?, ?)'
    );
    const insertEdge = db.prepare('INSERT INTO edges (from_file, to_file, kind, confidence) VALUES (?, ?, ?, ?)');
    const insertSymbol = db.prepare('INSERT INTO symbols (file, kind, simple_name, line) VALUES (?, ?, ?, ?)');
    const insertMethodEdge = db.prepare('INSERT INTO method_edges (from_file, from_type, from_method, to_file, to_method, confidence) VALUES (?, ?, ?, ?, ?, ?)');
    const insertCgNode = db.prepare('INSERT OR REPLACE INTO cg_nodes (id, label, layer, file, line) VALUES (?, ?, ?, ?, ?)');
    const insertCgEdge = db.prepare('INSERT INTO cg_edges (from_id, to_id, type, confidence, label) VALUES (?, ?, ?, ?, ?)');
    const insertSearch = db.prepare('INSERT INTO search_fts (file, snippet, terms) VALUES (?, ?, ?)');

    const writeAll = db.transaction(() => {
      for (const n of input.graph.nodes) {
        const sf = linesByPath.get(n.path);
        insertFile.run(n.path, sf?.extension ?? null, sf?.lines ?? null, n.inDegree, n.outDegree);
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
