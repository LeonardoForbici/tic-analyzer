import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';

export type PlsqlObjectType =
  | 'PROCEDURE' | 'FUNCTION' | 'PACKAGE' | 'PACKAGE_BODY'
  | 'TRIGGER' | 'TYPE' | 'VIEW' | 'SEQUENCE' | 'INDEX' | 'SYNONYM';

export interface PlsqlObject {
  type: PlsqlObjectType;
  name: string;
  packageName?: string;
  params?: string;
  returnType?: string;
  file: string;
  line: number;
  tablesRead: string[];
  tablesWritten: string[];
}

export interface PlsqlCall {
  callerObject: string;
  calledObject: string;
  calledPackage?: string;
  file: string;
  line: number;
  isDynamic: boolean;
}

const PLSQL_EXTS = new Set(['.sql', '.plsql', '.pls', '.pck', '.pks', '.pkb', '.prc', '.fnc', '.trg', '.pkg']);

// SQL keywords that appear after FROM/INTO/UPDATE but are not table names
const SQL_NON_TABLES = new Set([
  'DUAL', 'WHERE', 'SET', 'VALUES', 'SELECT', 'INTO', 'FROM', 'JOIN',
  'ON', 'AND', 'OR', 'NOT', 'NULL', 'AS', 'BY', 'GROUP', 'ORDER',
  'HAVING', 'UNION', 'ALL', 'EXCEPT', 'INTERSECT', 'CONNECT', 'WITH',
  'USING', 'CROSS', 'INNER', 'OUTER', 'LEFT', 'RIGHT', 'FULL', 'NATURAL',
  'LATERAL', 'PARTITION', 'PIVOT', 'UNPIVOT', 'SAMPLE', 'SUBQUERY',
  'XMLTABLE', 'TABLE', 'ONLY', 'ROWS', 'FETCH', 'NEXT', 'FIRST', 'LAST',
]);

function canonTable(raw: string): string | null {
  const name = raw.toUpperCase().split('.').pop() ?? raw.toUpperCase();
  if (SQL_NON_TABLES.has(name)) return null;
  if (name.length < 2 || !/^[A-Z][A-Z0-9_$#]*$/.test(name)) return null;
  return name;
}

/** Extrai tabelas lidas/escritas por objeto PL/SQL por análise de SQL no corpo */
function extractTableAccessPerObject(
  content: string
): Map<string, { tablesRead: Set<string>; tablesWritten: Set<string> }> {
  const result = new Map<string, { tablesRead: Set<string>; tablesWritten: Set<string> }>();
  const lines = content.split('\n');
  let currentObject: string | undefined;

  const ensureEntry = (name: string) => {
    if (!result.has(name)) result.set(name, { tablesRead: new Set(), tablesWritten: new Set() });
  };

  for (const line of lines) {
    const upper = line.toUpperCase();

    // Detect object scope changes (same logic as main pass)
    const pkgBodyMatch = line.match(/CREATE\s+(?:OR\s+REPLACE\s+)?PACKAGE\s+BODY\s+(\w+(?:\.\w+)?)/i);
    if (pkgBodyMatch) { currentObject = pkgBodyMatch[1].toUpperCase().split('.').pop(); continue; }

    const procMatch = line.match(/(?:CREATE\s+(?:OR\s+REPLACE\s+)?)?PROCEDURE\s+((?:\w+\.)?(\w+))\s*(?:\(|IS|AS|$)/i);
    if (procMatch) {
      currentObject = procMatch[2].toUpperCase();
      ensureEntry(currentObject);
      continue;
    }

    const funcMatch = line.match(/(?:CREATE\s+(?:OR\s+REPLACE\s+)?)?FUNCTION\s+((?:\w+\.)?(\w+))\s*(?:\(|RETURN|IS|AS|$)/i);
    if (funcMatch) {
      currentObject = funcMatch[2].toUpperCase();
      ensureEntry(currentObject);
      continue;
    }

    const trigMatch = line.match(/CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+(\w+)/i);
    if (trigMatch) {
      currentObject = trigMatch[1].toUpperCase();
      ensureEntry(currentObject);
      continue;
    }

    const viewMatch = line.match(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:FORCE\s+)?(?:NO\s+FORCE\s+)?VIEW\s+(\w+(?:\.\w+)?)/i);
    if (viewMatch) {
      currentObject = viewMatch[1].toUpperCase().split('.').pop();
      if (currentObject) ensureEntry(currentObject);
      continue;
    }

    if (!currentObject) continue;
    const entry = result.get(currentObject)!;

    // Skip comment lines
    const trimmed = line.trim();
    if (trimmed.startsWith('--')) continue;

    // INSERT INTO table
    const insertMatch = upper.match(/\bINSERT\s+INTO\s+([\w$#.]+)/);
    if (insertMatch) {
      const t = canonTable(insertMatch[1]);
      if (t) entry.tablesWritten.add(t);
    }

    // UPDATE table SET  (also: UPDATE table\n SET)
    const updateMatch = upper.match(/\bUPDATE\s+([\w$#.]+)(?:\s+SET|\s*$|\s+\w)/);
    if (updateMatch) {
      const t = canonTable(updateMatch[1]);
      if (t && t !== 'SET') entry.tablesWritten.add(t);
    }

    // DELETE FROM table  or  DELETE table
    const deleteMatch = upper.match(/\bDELETE\s+(?:FROM\s+)?([\w$#.]+)/);
    if (deleteMatch) {
      const t = canonTable(deleteMatch[1]);
      if (t) entry.tablesWritten.add(t);
    }

    // MERGE INTO table
    const mergeMatch = upper.match(/\bMERGE\s+INTO\s+([\w$#.]+)/);
    if (mergeMatch) {
      const t = canonTable(mergeMatch[1]);
      if (t) entry.tablesWritten.add(t);
    }

    // FROM table  (SELECT ... FROM, CURSOR IS SELECT ... FROM, JOIN)
    // Multiple FROM clauses possible (subqueries)
    const fromMatches = [...upper.matchAll(/\bFROM\s+([\w$#.]+)/g)];
    for (const m of fromMatches) {
      const t = canonTable(m[1]);
      if (t) entry.tablesRead.add(t);
    }

    // JOIN table ON
    const joinMatches = [...upper.matchAll(/\b(?:INNER\s+|OUTER\s+|LEFT\s+|RIGHT\s+|FULL\s+|CROSS\s+)?JOIN\s+([\w$#.]+)/g)];
    for (const m of joinMatches) {
      const t = canonTable(m[1]);
      if (t) entry.tablesRead.add(t);
    }

    // Reset on END; or END name;
    if (/^\s*END\s*;/i.test(line) || /^\s*END\s+\w+\s*;/i.test(line)) {
      // Don't reset — next proc/func will re-set currentObject
    }
  }

  return result;
}

export function detectPlsqlObjects(files: ScannedFile[]): { objects: PlsqlObject[]; calls: PlsqlCall[] } {
  const objects: PlsqlObject[] = [];
  const calls: PlsqlCall[] = [];

  const plsqlFiles = files.filter((f) => PLSQL_EXTS.has(f.extension));

  for (const file of plsqlFiles) {
    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }

    // Second-pass: build table access per object name
    const tableAccessMap = extractTableAccessPerObject(content);

    const getAccess = (name: string) => {
      const entry = tableAccessMap.get(name.toUpperCase());
      return {
        tablesRead: entry ? [...entry.tablesRead] : [],
        tablesWritten: entry ? [...entry.tablesWritten] : [],
      };
    };

    const lines = content.split('\n');
    let currentPackage: string | undefined;
    let currentObject: string | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const upper = line.toUpperCase().trim();

      // ── Packages ─────────────────────────────────────────────────────────────
      const pkgMatch = line.match(/CREATE\s+(?:OR\s+REPLACE\s+)?PACKAGE\s+(?:(BODY)\s+)?(\w+(?:\.\w+)?)/i);
      if (pkgMatch) {
        const isBody = !!pkgMatch[1];
        currentPackage = pkgMatch[2].toUpperCase().split('.').pop()!;
        objects.push({ type: isBody ? 'PACKAGE_BODY' : 'PACKAGE', name: currentPackage, file: file.relativePath, line: lineNum, tablesRead: [], tablesWritten: [] });
        continue;
      }

      // ── CREATE PROCEDURE ─────────────────────────────────────────────────────
      const procMatch = line.match(/CREATE\s+(?:OR\s+REPLACE\s+)?PROCEDURE\s+((?:\w+\.)?(\w+))\s*(\([^)]*\))?/i);
      if (procMatch) {
        const fullName = procMatch[1].toUpperCase();
        const simpleName = procMatch[2].toUpperCase();
        const pkgPart = fullName.includes('.') ? fullName.split('.')[0] : currentPackage;
        const params = procMatch[3]?.replace(/\s+/g, ' ').slice(0, 100);
        currentObject = simpleName;
        objects.push({ type: 'PROCEDURE', name: simpleName, packageName: pkgPart, params, file: file.relativePath, line: lineNum, ...getAccess(simpleName) });
        continue;
      }

      // ── PROCEDURE inside package spec/body (no CREATE) ────────────────────────
      const pkgProcMatch = line.match(/^\s*PROCEDURE\s+(\w+)\s*(\([^)]*\))?/i);
      if (pkgProcMatch && currentPackage && !upper.startsWith('CREATE')) {
        const name = pkgProcMatch[1].toUpperCase();
        const params = pkgProcMatch[2]?.replace(/\s+/g, ' ').slice(0, 100);
        currentObject = name;
        objects.push({ type: 'PROCEDURE', name, packageName: currentPackage, params, file: file.relativePath, line: lineNum, ...getAccess(name) });
        continue;
      }

      // ── CREATE FUNCTION ──────────────────────────────────────────────────────
      const funcMatch = line.match(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+((?:\w+\.)?(\w+))\s*(\([^)]*\))?\s*RETURN\s+(\w+)/i);
      if (funcMatch) {
        const simpleName = funcMatch[2].toUpperCase();
        const pkgPart = funcMatch[1].includes('.') ? funcMatch[1].split('.')[0].toUpperCase() : currentPackage;
        const params = funcMatch[3]?.replace(/\s+/g, ' ').slice(0, 100);
        const returnType = funcMatch[4].toUpperCase();
        currentObject = simpleName;
        objects.push({ type: 'FUNCTION', name: simpleName, packageName: pkgPart, params, returnType, file: file.relativePath, line: lineNum, ...getAccess(simpleName) });
        continue;
      }

      // ── FUNCTION inside package ───────────────────────────────────────────────
      const pkgFuncMatch = line.match(/^\s*FUNCTION\s+(\w+)\s*(\([^)]*\))?\s*RETURN\s+(\w+)/i);
      if (pkgFuncMatch && currentPackage && !upper.startsWith('CREATE')) {
        const name = pkgFuncMatch[1].toUpperCase();
        currentObject = name;
        objects.push({ type: 'FUNCTION', name, packageName: currentPackage, returnType: pkgFuncMatch[3].toUpperCase(), file: file.relativePath, line: lineNum, ...getAccess(name) });
        continue;
      }

      // ── CREATE TRIGGER ───────────────────────────────────────────────────────
      const trigMatch = line.match(/CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+(\w+)/i);
      if (trigMatch) {
        const name = trigMatch[1].toUpperCase();
        currentObject = name;
        objects.push({ type: 'TRIGGER', name, file: file.relativePath, line: lineNum, ...getAccess(name) });
        continue;
      }

      // ── CREATE VIEW ──────────────────────────────────────────────────────────
      const viewMatch = line.match(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:FORCE\s+)?(?:NO\s+FORCE\s+)?VIEW\s+(\w+(?:\.\w+)?)/i);
      if (viewMatch) {
        const name = viewMatch[1].toUpperCase().split('.').pop()!;
        currentObject = name;
        objects.push({ type: 'VIEW', name, file: file.relativePath, line: lineNum, ...getAccess(name) });
        continue;
      }

      // ── CREATE SEQUENCE ──────────────────────────────────────────────────────
      const seqMatch = line.match(/CREATE\s+(?:GLOBAL\s+TEMPORARY\s+)?SEQUENCE\s+(\w+(?:\.\w+)?)/i);
      if (seqMatch) {
        const name = seqMatch[1].toUpperCase().split('.').pop()!;
        objects.push({ type: 'SEQUENCE', name, file: file.relativePath, line: lineNum, tablesRead: [], tablesWritten: [] });
        continue;
      }

      // ── CREATE INDEX ─────────────────────────────────────────────────────────
      const indexMatch = line.match(/CREATE\s+(?:UNIQUE\s+|BITMAP\s+)?INDEX\s+(\w+)\s+ON\s+(\w+(?:\.\w+)?)/i);
      if (indexMatch) {
        const name = indexMatch[1].toUpperCase();
        const onTable = indexMatch[2].toUpperCase().split('.').pop()!;
        objects.push({ type: 'INDEX', name, file: file.relativePath, line: lineNum, tablesRead: [onTable], tablesWritten: [] });
        continue;
      }

      // ── CREATE SYNONYM ───────────────────────────────────────────────────────
      const synMatch = line.match(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:PUBLIC\s+)?SYNONYM\s+(\w+)\s+FOR\s+(\w+(?:\.\w+)?)/i);
      if (synMatch) {
        const name = synMatch[1].toUpperCase();
        objects.push({ type: 'SYNONYM', name, file: file.relativePath, line: lineNum, tablesRead: [], tablesWritten: [] });
        continue;
      }

      // ── Calls inside procedure/function body ─────────────────────────────────
      if (currentObject) {
        // pkg.procedure(args) or pkg.function(args)
        const callMatch = line.match(/(?:^|;\s*|THEN\s+|ELSE\s+|BEGIN\s+)(\w+)\.(\w+)\s*(?:\(|;)/i);
        if (callMatch && !upper.includes('CREATE') && !['IF', 'ELSIF', 'WHILE', 'FOR', 'LOOP'].includes(callMatch[1].toUpperCase())) {
          calls.push({ callerObject: currentObject, calledObject: callMatch[2].toUpperCase(), calledPackage: callMatch[1].toUpperCase(), file: file.relativePath, line: lineNum, isDynamic: false });
        }

        // EXECUTE IMMEDIATE — dynamic SQL
        if (/EXECUTE\s+IMMEDIATE/i.test(line)) {
          const dynMatch = line.match(/EXECUTE\s+IMMEDIATE\s+['"](.{0,60})/i);
          calls.push({ callerObject: currentObject, calledObject: dynMatch ? dynMatch[1].slice(0, 40) : 'DYNAMIC_SQL', file: file.relativePath, line: lineNum, isDynamic: true });
        }
      }

      // Reset currentObject on END;
      if (/^\s*END\s*;/i.test(line) || /^\s*END\s+\w+\s*;/i.test(line)) {
        currentObject = undefined;
      }
    }
  }

  return { objects, calls };
}
