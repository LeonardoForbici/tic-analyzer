import type Database from 'better-sqlite3';
import { inferResponsibility } from '../inferResponsibility';

export interface FileSummary {
  file: string;
  responsibility: string;
  module: string | null;
  layer: 'frontend' | 'backend' | 'database' | null;
  calls: string[];
  calledBy: string[];
  symbols: string[];
  risk: string;
  riskDetail: string | null;
  inDegree: number;
  outDegree: number;
}

interface FileRow {
  rel_path: string;
  ext: string;
  lines: number;
  in_degree: number;
  out_degree: number;
  module: string | null;
  layer: string | null;
}

function riskLabel(inDegree: number, outDegree: number, lines: number): { risk: string; detail: string | null } {
  const coupling = inDegree + outDegree;
  if (coupling > 50 || lines > 1000) return { risk: 'critical risk', detail: `coupling=${coupling}, lines=${lines}` };
  if (coupling > 20 || lines > 500) return { risk: 'high complexity', detail: `coupling=${coupling}, lines=${lines}` };
  if (coupling > 10 || lines > 300) return { risk: 'medium', detail: null };
  if (coupling > 4) return { risk: 'low', detail: null };
  return { risk: 'clean', detail: null };
}

/**
 * Returns a structured profile of a single file from the SQLite index.
 * All data is derived locally — no AI, no file I/O beyond the DB.
 */
export function getFileSummary(db: Database.Database, relPath: string): FileSummary | null {
  const normalized = relPath.replace(/\\/g, '/');

  const fileRow = db.prepare(
    'SELECT rel_path, ext, lines, in_degree, out_degree, module, layer FROM files WHERE rel_path = ?'
  ).get(normalized) as FileRow | undefined;

  if (!fileRow) return null;

  const calls = (db.prepare(
    'SELECT DISTINCT to_file FROM edges WHERE from_file = ? AND confidence = \'resolved\' LIMIT 20'
  ).all(normalized) as Array<{ to_file: string }>).map((r) => r.to_file);

  const calledBy = (db.prepare(
    'SELECT DISTINCT from_file FROM edges WHERE to_file = ? LIMIT 10'
  ).all(normalized) as Array<{ from_file: string }>).map((r) => r.from_file);

  const symbols = (db.prepare(
    'SELECT simple_name FROM symbols WHERE file = ? AND kind IN (\'class\',\'interface\') LIMIT 5'
  ).all(normalized) as Array<{ simple_name: string }>).map((r) => r.simple_name);

  const { risk, detail } = riskLabel(fileRow.in_degree, fileRow.out_degree, fileRow.lines);

  const responsibility = inferResponsibility(
    fileRow.rel_path,
    symbols[0],
    fileRow.module
  );

  return {
    file: fileRow.rel_path,
    responsibility,
    module: fileRow.module,
    layer: (fileRow.layer as FileSummary['layer']) ?? null,
    calls,
    calledBy,
    symbols,
    risk,
    riskDetail: detail,
    inDegree: fileRow.in_degree,
    outDegree: fileRow.out_degree
  };
}
