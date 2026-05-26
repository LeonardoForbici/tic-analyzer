import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';

export interface DbCall {
  fromFile: string;
  fromLine: number;
  procedureName: string;
  packageName?: string;
  confidence: '🟢' | '🟡';
}

const BACKEND_EXTS = new Set(['.java', '.kt', '.cs', '.py', '.ts', '.js', '.go', '.rb', '.php']);

// Palavras-chave que indicam chamada a procedure/banco — filtro rápido
const DB_KEYWORDS = [
  'SimpleJdbcCall', 'StoredProcedure', 'CallableStatement', 'callablestatement',
  'jdbcTemplate', 'namedParameterJdbcTemplate', '{call ', 'BEGIN ', 'oracledb',
  'cx_Oracle', 'OracleCommand', 'SqlCommand', 'ExecuteNonQuery', 'executeQuery',
  'EXECUTE IMMEDIATE', 'callProc', 'callProcedure', 'executeProcedure',
  'StoredProcedureQuery', 'createStoredProcedureQuery'
];

export function detectBackendDbCalls(files: ScannedFile[]): DbCall[] {
  const calls: DbCall[] = [];
  const seen = new Set<string>();

  const backendFiles = files.filter((f) =>
    BACKEND_EXTS.has(f.extension) &&
    !f.relativePath.includes('.spec.') &&
    !f.relativePath.includes('.test.')
  );

  for (const file of backendFiles) {
    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }

    // Filtro rápido: pular arquivos que não mencionam DB calls
    const hasDbKeyword = DB_KEYWORDS.some((kw) => content.includes(kw));
    if (!hasDbKeyword) continue;

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Java: new SimpleJdbcCall(jdbcTemplate).withProcedureName("sp_name")
      const simpleJdbcCall = line.match(/withProcedureName\s*\(\s*["']([^"']+)["']\s*\)/i) ||
                             line.match(/new\s+SimpleJdbcCall[^.]+\.setProcedureName\s*\(\s*["']([^"']+)["']\s*\)/i);
      if (simpleJdbcCall) {
        const raw = simpleJdbcCall[1];
        const { name, pkg } = parseProcName(raw);
        push(calls, seen, { fromFile: file.relativePath, fromLine: lineNum, procedureName: name, packageName: pkg, confidence: '🟢' });
      }

      // Java: {call schema.pkg.proc(?)} ou {call proc(?)}
      const callableStmt = line.match(/\{call\s+([\w.]+)\s*\(/i);
      if (callableStmt) {
        const raw = callableStmt[1];
        const { name, pkg } = parseProcName(raw);
        push(calls, seen, { fromFile: file.relativePath, fromLine: lineNum, procedureName: name, packageName: pkg, confidence: '🟢' });
      }

      // Java: createStoredProcedureQuery("proc_name")
      const storedProcQuery = line.match(/createStoredProcedureQuery\s*\(\s*["']([^"']+)["']\s*\)/i) ||
                              line.match(/StoredProcedureQuery[^"']*["']([^"']+)["']/i);
      if (storedProcQuery) {
        const { name, pkg } = parseProcName(storedProcQuery[1]);
        push(calls, seen, { fromFile: file.relativePath, fromLine: lineNum, procedureName: name, packageName: pkg, confidence: '🟢' });
      }

      // Node.js oracledb: connection.execute("BEGIN pkg.proc(:p1); END;")
      const oraNodeMatch = line.match(/(?:execute|query)\s*\(\s*["'`](?:BEGIN\s+)?([\w.]+)\s*[\(;]/i);
      if (oraNodeMatch && (line.includes('oracledb') || line.includes('BEGIN'))) {
        const { name, pkg } = parseProcName(oraNodeMatch[1]);
        push(calls, seen, { fromFile: file.relativePath, fromLine: lineNum, procedureName: name, packageName: pkg, confidence: '🟢' });
      }

      // Python cx_Oracle: cursor.callproc('pkg.proc', args)
      const pyCallproc = line.match(/callproc\s*\(\s*["']([^"']+)["']/i);
      if (pyCallproc) {
        const { name, pkg } = parseProcName(pyCallproc[1]);
        push(calls, seen, { fromFile: file.relativePath, fromLine: lineNum, procedureName: name, packageName: pkg, confidence: '🟢' });
      }

      // C# SqlCommand / OracleCommand: new OracleCommand("pkg.proc")
      const csharpCmd = line.match(/new\s+(?:Oracle|Sql)Command\s*\(\s*["']([^"']+)["']/i);
      if (csharpCmd && !csharpCmd[1].includes(' ')) {
        const { name, pkg } = parseProcName(csharpCmd[1]);
        push(calls, seen, { fromFile: file.relativePath, fromLine: lineNum, procedureName: name, packageName: pkg, confidence: '🟢' });
      }

      // Genérico: string que parece nome de procedure no formato SCHEMA.PKG.PROC — 🟡
      const genericProc = line.match(/["']([A-Z_][A-Z0-9_]*\.[A-Z_][A-Z0-9_]*(?:\.[A-Z_][A-Z0-9_]*)?)["']/);
      if (genericProc && !simpleJdbcCall && !callableStmt && !storedProcQuery) {
        const raw = genericProc[1];
        if (raw.length > 3 && raw.length < 80) {
          const { name, pkg } = parseProcName(raw);
          push(calls, seen, { fromFile: file.relativePath, fromLine: lineNum, procedureName: name, packageName: pkg, confidence: '🟡' });
        }
      }
    }
  }

  return calls;
}

function parseProcName(raw: string): { name: string; pkg: string | undefined } {
  const parts = raw.toUpperCase().split('.');
  if (parts.length >= 3) {
    // SCHEMA.PKG.PROC
    return { pkg: parts[parts.length - 2], name: parts[parts.length - 1] };
  }
  if (parts.length === 2) {
    // PKG.PROC
    return { pkg: parts[0], name: parts[1] };
  }
  return { pkg: undefined, name: parts[0] };
}

function push(calls: DbCall[], seen: Set<string>, call: DbCall): void {
  const key = `${call.fromFile}:${call.fromLine}:${call.procedureName}`;
  if (!seen.has(key)) {
    seen.add(key);
    calls.push(call);
  }
}
