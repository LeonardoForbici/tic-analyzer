import * as path from 'path';
import { ScannedFile, readFileSafe } from './scanFiles';

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  foreignKey?: { table: string; column: string };
}

export interface ForeignKeyInfo {
  column: string;
  refTable: string;
  refColumn: string;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  primaryKeys: string[];
  foreignKeys: ForeignKeyInfo[];
  sourceFile: string;
  sourceType: 'sql' | 'prisma' | 'typeorm' | 'jpa' | 'django' | 'sequelize';
}

export interface DbSchema {
  tables: TableInfo[];
  totalTables: number;
  detectedVia: string[];
}

export function detectDbSchema(files: ScannedFile[]): DbSchema {
  const tables: TableInfo[] = [];
  const detectedVia = new Set<string>();
  const seen = new Set<string>();

  const addTables = (newTables: TableInfo[], via: string) => {
    if (newTables.length === 0) return;
    detectedVia.add(via);
    for (const t of newTables) {
      const key = t.name.toLowerCase();
      if (!seen.has(key)) { seen.add(key); tables.push(t); }
    }
  };

  for (const file of files) {
    const rel = file.relativePath;
    const ext = file.extension;

    if (ext === '.sql' || ext === '.plsql' || ext === '.pls' || ext === '.pck') {
      const content = readFileSafe(file.absolutePath);
      addTables(parseSqlCreateTable(content, rel), 'SQL/Migrations');
      continue;
    }

    if (rel.endsWith('.prisma')) {
      const content = readFileSafe(file.absolutePath);
      addTables(parsePrismaSchema(content, rel), 'Prisma');
      continue;
    }

    if (ext === '.ts' || ext === '.js' || ext === '.tsx') {
      const content = readFileSafe(file.absolutePath);
      if (content.includes('@Entity') || (content.includes('@Table') && content.includes('@Column'))) {
        addTables(parseTypeOrmEntity(content, rel), 'TypeORM');
      } else if (content.includes('Model.init(') || content.includes('sequelize.define(')) {
        addTables(parseSequelizeModel(content, rel), 'Sequelize');
      }
      continue;
    }

    if (ext === '.java' || ext === '.kt') {
      const content = readFileSafe(file.absolutePath);
      if (content.includes('@Entity') || content.includes('@Table')) {
        addTables(parseJpaEntity(content, rel), 'JPA/Hibernate');
      }
      continue;
    }

    if (ext === '.py' && (rel.toLowerCase().includes('model') || rel.endsWith('models.py'))) {
      const content = readFileSafe(file.absolutePath);
      if (content.includes('models.Model') || content.includes('models.CharField') || content.includes('models.IntegerField')) {
        addTables(parseDjangoModels(content, rel), 'Django');
      }
      continue;
    }
  }

  return { tables, totalTables: tables.length, detectedVia: [...detectedVia] };
}

function parseSqlCreateTable(content: string, sourceFile: string): TableInfo[] {
  const tables: TableInfo[] = [];
  const createRe = /CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[\w"`.]+\.)?["'`]?(\w+)["'`]?\s*\(([\s\S]*?)\)\s*;/gi;
  let m;
  while ((m = createRe.exec(content)) !== null) {
    const tableName = m[1];
    const body = m[2];
    const columns: ColumnInfo[] = [];
    const primaryKeys: string[] = [];
    const foreignKeys: ForeignKeyInfo[] = [];

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim().replace(/,\s*$/, '');
      if (!line || line.startsWith('--')) continue;

      const pkConstr = line.match(/(?:CONSTRAINT\s+\w+\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkConstr) { pkConstr[1].split(',').forEach((c) => primaryKeys.push(c.trim().replace(/["`]/g, ''))); continue; }

      const fkConstr = line.match(/(?:CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\s*\((\w+)\)\s+REFERENCES\s+["'`]?(\w+)["'`]?\s*\((\w+)\)/i);
      if (fkConstr) { foreignKeys.push({ column: fkConstr[1], refTable: fkConstr[2], refColumn: fkConstr[3] }); continue; }

      if (/^\s*(CONSTRAINT|UNIQUE\s+KEY|INDEX|KEY)\b/i.test(line)) continue;

      const colM = line.match(/^["'`]?(\w+)["'`]?\s+(\w+(?:\s*\([^)]*\))?)/);
      if (colM) {
        const colName = colM[1];
        const colType = colM[2].toUpperCase();
        const isPk = /PRIMARY\s+KEY/i.test(line);
        if (isPk) primaryKeys.push(colName);
        const inlineFk = line.match(/REFERENCES\s+["'`]?(\w+)["'`]?\s*\((\w+)\)/i);
        columns.push({
          name: colName, type: colType,
          nullable: !(/NOT\s+NULL/i.test(line) || isPk),
          primaryKey: isPk, unique: /\bUNIQUE\b/i.test(line),
          foreignKey: inlineFk ? { table: inlineFk[1], column: inlineFk[2] } : undefined
        });
      }
    }

    if (columns.length > 0 || primaryKeys.length > 0) {
      tables.push({ name: tableName, columns: columns.slice(0, 30), primaryKeys, foreignKeys, sourceFile, sourceType: 'sql' });
    }
  }
  return tables;
}

function parsePrismaSchema(content: string, sourceFile: string): TableInfo[] {
  const tables: TableInfo[] = [];
  const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m;
  while ((m = modelRe.exec(content)) !== null) {
    const modelName = m[1];
    const body = m[2];
    const columns: ColumnInfo[] = [];
    const primaryKeys: string[] = [];

    for (const line of body.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('//') || t.startsWith('@@') || t.startsWith('@')) continue;
      const fM = t.match(/^(\w+)\s+(\w+)(\[])?(\?)?(\s+.*)?/);
      if (!fM) continue;
      const [, colName, colType, isArray, isOpt, rest] = fM;
      if (isArray) continue; // relation list
      const decorators = rest ?? '';
      const isPk = /@id\b/.test(decorators);
      const isUnique = /@unique\b/.test(decorators);
      if (isPk) primaryKeys.push(colName);
      columns.push({ name: colName, type: colType, nullable: isOpt === '?', primaryKey: isPk, unique: isUnique });
    }

    if (columns.length > 0) {
      tables.push({ name: modelName, columns: columns.slice(0, 30), primaryKeys, foreignKeys: [], sourceFile, sourceType: 'prisma' });
    }
  }
  return tables;
}

function parseTypeOrmEntity(content: string, sourceFile: string): TableInfo[] {
  const entityM = content.match(/@Entity\s*\(\s*['"`](\w+)['"`]\s*\)/);
  const tableM = content.match(/@Table\s*\(\s*['"`](\w+)['"`]\s*\)/);
  const classM = content.match(/(?:export\s+)?class\s+(\w+)/);

  let tableName = entityM?.[1] ?? tableM?.[1];
  if (!tableName && classM) {
    tableName = classM[1].replace(/Entity$/, '').replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  }
  if (!tableName) return [];

  const columns: ColumnInfo[] = [];
  const primaryKeys: string[] = [];

  const colRe = /((?:@(?:PrimaryGeneratedColumn|PrimaryColumn|Column|JoinColumn)[^)]*\)\s*)+)\s*(\w+)\s*[!?]?\s*:/g;
  let m;
  while ((m = colRe.exec(content)) !== null) {
    const decs = m[1];
    const colName = m[2];
    if (colName === 'constructor' || colName === 'class') continue;
    const isPk = /@PrimaryGeneratedColumn|@PrimaryColumn/.test(decs);
    if (isPk) primaryKeys.push(colName);
    columns.push({
      name: colName, type: 'unknown',
      nullable: /nullable\s*:\s*true/.test(decs),
      primaryKey: isPk, unique: /unique\s*:\s*true/.test(decs)
    });
  }

  if (columns.length === 0) return [];
  return [{ name: tableName, columns: columns.slice(0, 30), primaryKeys, foreignKeys: [], sourceFile, sourceType: 'typeorm' }];
}

function parseJpaEntity(content: string, sourceFile: string): TableInfo[] {
  const tableAnn = content.match(/@Table\s*\(\s*name\s*=\s*["'](\w+)["']/);
  const classM = content.match(/(?:public\s+)?class\s+(\w+)/);

  let tableName = tableAnn?.[1];
  if (!tableName && classM) {
    tableName = classM[1].replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  }
  if (!tableName) return [];

  const columns: ColumnInfo[] = [];
  const primaryKeys: string[] = [];

  const fieldRe = /((?:@Id\s*|@Column[^\n]*\n)+)\s*(?:(?:private|protected|public)\s+)?(?:final\s+)?(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*[;=]/g;
  let m;
  while ((m = fieldRe.exec(content)) !== null) {
    const ann = m[1];
    const fieldName = m[2];
    const isPk = /@Id/.test(ann);
    const colAnn = ann.match(/@Column\(([^)]*)\)/);
    const colName = colAnn?.[1]?.match(/name\s*=\s*["'](\w+)["']/)?.[1] ?? fieldName;
    if (isPk) primaryKeys.push(colName);
    columns.push({ name: colName, type: 'unknown', nullable: !isPk, primaryKey: isPk, unique: false });
  }

  if (columns.length === 0) return [];
  return [{ name: tableName, columns: columns.slice(0, 30), primaryKeys, foreignKeys: [], sourceFile, sourceType: 'jpa' }];
}

function parseDjangoModels(content: string, sourceFile: string): TableInfo[] {
  const tables: TableInfo[] = [];
  const classRe = /^class\s+(\w+)\s*\(\s*(?:models\.Model|Model)\s*\)\s*:/gm;
  let cm;
  while ((cm = classRe.exec(content)) !== null) {
    const modelName = cm[1];
    const startIdx = cm.index + cm[0].length;
    // Find next class or end of file
    const nextClass = /^class\s+\w+/m.exec(content.slice(startIdx));
    const body = nextClass ? content.slice(startIdx, startIdx + nextClass.index) : content.slice(startIdx);

    const columns: ColumnInfo[] = [];
    const primaryKeys: string[] = ['id'];

    const fieldRe = /^\s{4}(\w+)\s*=\s*models\.(\w+)\(([^)]*)\)/gm;
    let fm;
    while ((fm = fieldRe.exec(body)) !== null) {
      const [, colName, fieldType, opts] = fm;
      if (colName === 'Meta' || colName === 'class') continue;
      const isPk = /primary_key\s*=\s*True/.test(opts);
      if (isPk) primaryKeys.push(colName);
      const fkM = /ForeignKey|OneToOneField/.test(fieldType) ? opts.match(/['"](\w+)['"]\s*,/) : null;
      columns.push({
        name: colName, type: fieldType,
        nullable: /null\s*=\s*True/.test(opts),
        primaryKey: isPk, unique: /unique\s*=\s*True/.test(opts),
        foreignKey: fkM ? { table: fkM[1], column: 'id' } : undefined
      });
    }

    if (columns.length > 0) {
      tables.push({ name: modelName, columns: columns.slice(0, 30), primaryKeys, foreignKeys: [], sourceFile, sourceType: 'django' });
    }
  }
  return tables;
}

function parseSequelizeModel(content: string, sourceFile: string): TableInfo[] {
  // Model.init({ fieldName: { type: DataTypes.STRING, ... } }) or sequelize.define('name', {...})
  const defineM = content.match(/sequelize\.define\s*\(\s*['"`](\w+)['"`]\s*,\s*\{([\s\S]*?)\}\s*[,)]/);
  const initM = content.match(/Model\.init\s*\(\s*\{([\s\S]*?)\}\s*,\s*\{/);
  const classM = content.match(/class\s+(\w+)\s+extends\s+Model/);

  const body = defineM?.[2] ?? initM?.[1];
  let tableName = defineM?.[1];
  if (!tableName && classM) tableName = classM[1].replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  if (!tableName || !body) return [];

  const columns: ColumnInfo[] = [];
  const primaryKeys: string[] = [];

  const fieldRe = /(\w+)\s*:\s*\{([^}]+)\}/g;
  let m;
  while ((m = fieldRe.exec(body)) !== null) {
    const colName = m[1];
    const opts = m[2];
    const isPk = /primaryKey\s*:\s*true/.test(opts);
    if (isPk) primaryKeys.push(colName);
    columns.push({
      name: colName, type: opts.match(/DataTypes\.(\w+)/)?.[1] ?? 'unknown',
      nullable: /allowNull\s*:\s*true/.test(opts),
      primaryKey: isPk, unique: /unique\s*:\s*true/.test(opts)
    });
  }

  if (columns.length === 0) return [];
  return [{ name: tableName, columns: columns.slice(0, 30), primaryKeys, foreignKeys: [], sourceFile, sourceType: 'sequelize' }];
}

export function formatDbSchemaReport(schema: DbSchema): string {
  if (schema.tables.length === 0) return '# Schema de Banco de Dados\n\nNenhuma tabela/model detectada.\n';

  const lines = [
    '# Schema de Banco de Dados',
    '',
    `**${schema.totalTables} tabelas/models** detectadas via: ${schema.detectedVia.join(', ')}`,
    ''
  ];

  const sorted = [...schema.tables].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50);
  for (const table of sorted) {
    lines.push(`## \`${table.name}\``);
    lines.push(`*Fonte: \`${table.sourceFile}\` · ${table.sourceType}*`);
    lines.push('');
    if (table.columns.length > 0) {
      lines.push('| Coluna | Tipo | Nulo | PK | FK |');
      lines.push('| --- | --- | --- | --- | --- |');
      for (const col of table.columns) {
        const fk = col.foreignKey ? `→ ${col.foreignKey.table}.${col.foreignKey.column}` : '';
        lines.push(`| ${col.name} | ${col.type} | ${col.nullable ? '✓' : ''} | ${col.primaryKey ? '✓' : ''} | ${fk} |`);
      }
    }
    for (const fk of table.foreignKeys) {
      lines.push(`- FK: \`${fk.column}\` → \`${fk.refTable}.${fk.refColumn}\``);
    }
    lines.push('');
  }
  if (schema.tables.length > 50) lines.push(`*... e mais ${schema.tables.length - 50} tabelas*`);
  return lines.join('\n');
}

export function formatDbSchemaSummary(schema: DbSchema): string {
  if (schema.tables.length === 0) return 'Nenhuma tabela detectada.';
  const lines = [
    `# DB Schema — ${schema.totalTables} tabelas (${schema.detectedVia.join(', ')})`,
    '',
    '| Tabela | Colunas | Tipo |',
    '| --- | --- | --- |'
  ];
  for (const t of schema.tables.slice(0, 40)) {
    lines.push(`| ${t.name} | ${t.columns.length} | ${t.sourceType} |`);
  }
  if (schema.tables.length > 40) lines.push(`*... e mais ${schema.tables.length - 40} tabelas*`);
  return lines.join('\n');
}
