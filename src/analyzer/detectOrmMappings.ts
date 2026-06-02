/**
 * Mapeamento ORM (JPA/Hibernate) + extração SQL multi-dialeto.
 *
 * Liga o código Java às TABELAS (não só a procedures PL/SQL): entidades
 * `@Entity`/`@Table`, repositórios Spring Data (`JpaRepository<Entity, Id>`) e
 * SQL em `@Query`/`createNativeQuery`. O extrator de tabelas é dialeto-aware
 * (Oracle/Postgres/SQLServer): lida com `schema.tab`, `"x"`, `` `x` `` e
 * `[dbo].[x]`.
 *
 * NB: é um extrator de statements SQL, não uma gramática completa — suficiente
 * para resolver quais tabelas cada ponto do código toca, em qualquer dialeto.
 */
import * as fs from 'fs';
import { Parser } from 'node-sql-parser';
import type { ScannedFile } from './scanFiles';

const sqlParser = new Parser();
// Ordem de tentativa de dialeto (cobre SQL Server/Postgres/MySQL/Oracle-DML).
const SQL_DIALECTS = ['transactsql', 'postgresql', 'mysql', 'mariadb'];

export interface EntityMapping {
  entityClass: string;
  table: string;
  file: string;
}

export interface RepoEntity {
  file: string;
  entity: string;
}

export type AccessMode = 'read' | 'write' | 'access';

export interface TableAccess {
  fromFile: string;
  table: string;
  mode: AccessMode;
  confidence: '🟢' | '🟡';
  line: number;
}

export interface ColumnAccess {
  fromFile: string;
  table: string;
  column: string;
  mode: AccessMode;
  confidence: '🟢' | '🟡';
}

export interface OrmAnalysis {
  entities: EntityMapping[];
  repos: RepoEntity[];
  tableAccess: TableAccess[];
  columnAccess: ColumnAccess[];
}

const JVM_EXTS = new Set(['.java', '.kt']);

const SQL_NON_TABLES = new Set([
  'DUAL', 'SELECT', 'WHERE', 'SET', 'VALUES', 'INTO', 'FROM', 'JOIN', 'ON', 'AND',
  'OR', 'NOT', 'NULL', 'AS', 'BY', 'GROUP', 'ORDER', 'HAVING', 'UNION', 'ALL',
  'EXCEPT', 'INTERSECT', 'WITH', 'USING', 'CROSS', 'INNER', 'OUTER', 'LEFT',
  'RIGHT', 'FULL', 'NATURAL', 'LATERAL', 'TABLE', 'ONLY', 'LIMIT', 'OFFSET'
]);

// Identificador opcionalmente qualificado, com quoting de cada dialeto.
const IDENT = String.raw`(?:\[[^\]]+\]|"[^"]+"|\`[^\`]+\`|\w+)(?:\.(?:\[[^\]]+\]|"[^"]+"|\`[^\`]+\`|\w+))*`;

export function detectOrmMappings(files: ScannedFile[]): OrmAnalysis {
  const entities: EntityMapping[] = [];
  const repos: RepoEntity[] = [];
  const rawAccess: TableAccess[] = [];
  const columnAccess: ColumnAccess[] = [];

  for (const file of files) {
    if (!JVM_EXTS.has(file.extension)) continue;
    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }
    if (!/@Entity|Repository|@Query|createNativeQuery|createQuery|@Table/.test(content)) continue;

    const lines = content.split('\n');

    // @Entity → classe + tabela (default = nome da classe)
    if (/@Entity\b/.test(content)) {
      const tableMatch = content.match(/@Table\s*\(\s*(?:[^)]*\bname\s*=\s*)?["']([^"']+)["']/);
      const classMatch = content.match(/(?:public\s+|abstract\s+)*class\s+(\w+)/);
      if (classMatch) {
        const entityClass = classMatch[1];
        entities.push({ entityClass, table: (tableMatch?.[1] ?? entityClass).toUpperCase(), file: file.relativePath });
      }
    }

    // Spring Data: interface X extends JpaRepository<Entity, Id>
    const repoMatch = content.match(/interface\s+\w+[^{]*\bextends\s+[^{]*Repository\s*<\s*(\w+)/);
    if (repoMatch) repos.push({ file: file.relativePath, entity: repoMatch[1] });

    // SQL em @Query("..."), createNativeQuery("..."), createQuery("...")
    for (let i = 0; i < lines.length; i++) {
      // Aceita @Query("..."), @Query(value = "...", nativeQuery = true), createNativeQuery("...")
      const sqlMatches = lines[i].matchAll(/(?:@Query|createNativeQuery|createQuery)\s*\([^)"']*["']([^"']{6,})["']/g);
      for (const m of sqlMatches) {
        const access = parseSqlAccess(m[1]);
        for (const ref of access.tables) {
          rawAccess.push({ fromFile: file.relativePath, table: ref.table, mode: ref.mode, confidence: '🟢', line: i + 1 });
        }
        for (const col of access.columns) {
          if (col.table) columnAccess.push({ fromFile: file.relativePath, table: col.table, column: col.column, mode: col.mode, confidence: '🟢' });
        }
      }
    }
  }

  // Repositório Spring Data → tabela da entidade (CRUD implícito).
  const tableByEntity = new Map(entities.map((e) => [e.entityClass.toUpperCase(), e.table]));
  for (const repo of repos) {
    const table = tableByEntity.get(repo.entity.toUpperCase());
    if (table) rawAccess.push({ fromFile: repo.file, table, mode: 'access', confidence: '🟢', line: 1 });
  }

  // JPQL referencia ENTIDADES, não tabelas: mapeia para a tabela quando casar.
  const mapTable = (t: string) => tableByEntity.get(t.toUpperCase()) ?? t.toUpperCase();
  const tableAccess = dedupe(rawAccess.map((a) => ({ ...a, table: mapTable(a.table) })));
  const cols = dedupeCols(columnAccess.map((c) => ({ ...c, table: mapTable(c.table) })));

  return { entities, repos, tableAccess, columnAccess: cols };
}

/**
 * Extrai tabelas + colunas de um statement SQL via parser AST real
 * (node-sql-parser), tentando os dialetos. Cai para regex em JPQL/PL-SQL/binds
 * Oracle que o parser não engole — preservando recall sem perder precisão.
 */
export function parseSqlAccess(sql: string): { tables: Array<{ table: string; mode: AccessMode }>; columns: Array<{ table?: string; column: string; mode: AccessMode }> } {
  const cleaned = sql.replace(/:\w+/g, '0').replace(/\?\d+/g, '0'); // binds Oracle/JDBC
  for (const database of SQL_DIALECTS) {
    try {
      const { tableList, columnList } = sqlParser.parse(cleaned, { database });
      const tables = tableList.map(parseTableEntry).filter((t): t is { table: string; mode: AccessMode } => !!t);
      const single = tables.length === 1 ? tables[0].table : undefined;
      const columns = columnList
        .map((c) => parseColumnEntry(c, single))
        .filter((c): c is { table?: string; column: string; mode: AccessMode } => !!c);
      return { tables: dedupeTables(tables), columns };
    } catch {
      // tenta o próximo dialeto
    }
  }
  return { tables: extractSqlTables(sql), columns: [] };
}

// node-sql-parser: tableList = "mode::schema::table", columnList = "mode::table::column"
function parseTableEntry(entry: string): { table: string; mode: AccessMode } | null {
  const [mode, , table] = entry.split('::');
  if (!table || table === 'null') return null;
  return { table: table.toUpperCase(), mode: toMode(mode) };
}

function parseColumnEntry(entry: string, singleTable?: string): { table?: string; column: string; mode: AccessMode } | null {
  const [mode, table, column] = entry.split('::');
  if (!column || column === '(.*)' || column === '*') return null;
  const tbl = table && table !== 'null' ? table.toUpperCase() : singleTable;
  return { table: tbl, column: column.toUpperCase(), mode: toMode(mode) };
}

function toMode(m: string): AccessMode {
  return m === 'select' ? 'read' : 'write';
}

function dedupeTables(tables: Array<{ table: string; mode: AccessMode }>): Array<{ table: string; mode: AccessMode }> {
  const seen = new Set<string>();
  return tables.filter((t) => { const k = `${t.table}|${t.mode}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

function dedupeCols(cols: ColumnAccess[]): ColumnAccess[] {
  const seen = new Set<string>();
  return cols.filter((c) => { const k = `${c.fromFile}|${c.table}|${c.column}|${c.mode}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Extrai referências de tabela de um statement SQL (multi-dialeto). */
export function extractSqlTables(sql: string): Array<{ table: string; mode: AccessMode }> {
  const out: Array<{ table: string; mode: AccessMode }> = [];
  const add = (raw: string | undefined, mode: AccessMode) => {
    if (!raw) return;
    const name = lastSegment(raw);
    if (name && !SQL_NON_TABLES.has(name)) out.push({ table: name, mode });
  };
  const scan = (re: RegExp, mode: AccessMode) => {
    for (const m of sql.matchAll(re)) add(m[1], mode);
  };
  scan(new RegExp(String.raw`\bFROM\s+(${IDENT})`, 'gi'), 'read');
  scan(new RegExp(String.raw`\bJOIN\s+(${IDENT})`, 'gi'), 'read');
  scan(new RegExp(String.raw`\bINSERT\s+INTO\s+(${IDENT})`, 'gi'), 'write');
  scan(new RegExp(String.raw`\bUPDATE\s+(${IDENT})`, 'gi'), 'write');
  scan(new RegExp(String.raw`\bDELETE\s+FROM\s+(${IDENT})`, 'gi'), 'write');
  scan(new RegExp(String.raw`\bMERGE\s+INTO\s+(${IDENT})`, 'gi'), 'write');
  return out;
}

function lastSegment(qualified: string): string {
  const seg = qualified.split('.').pop() ?? qualified;
  return seg.replace(/^[\["'`]+|[\]"'`]+$/g, '').toUpperCase();
}

function dedupe(access: TableAccess[]): TableAccess[] {
  const seen = new Set<string>();
  const out: TableAccess[] = [];
  for (const a of access) {
    const key = `${a.fromFile}|${a.table}|${a.mode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}
