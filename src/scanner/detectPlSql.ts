import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { RiskFinding } from './detectRisks';
import type { ScanResult } from './scanWorkspace';

export const PL_SQL_EXTENSIONS = new Set(['.sql', '.pks', '.pkb', '.prc', '.fnc', '.pkg', '.trg', '.pls', '.plsql']);

export type PlSqlEntityKind =
  | 'package'
  | 'package_body'
  | 'procedure'
  | 'function'
  | 'trigger'
  | 'view'
  | 'table'
  | 'cursor'
  | 'type'
  | 'synonym';

export type PlSqlDependencyEdgeType = 'CALLS' | 'READS_TABLE' | 'WRITES_TABLE' | 'TRIGGERS_ON' | 'DEFINES' | 'USES_CURSOR';

export interface PlSqlEntity {
  id: string;
  name: string;
  kind: PlSqlEntityKind;
  file: string;
  line: number;
  endLine?: number;
  parentName?: string;
  targetTable?: string;
}

export interface PlSqlDependency {
  sourceId: string;
  targetName: string;
  targetKind: 'routine' | 'table' | 'cursor';
  edgeType: PlSqlDependencyEdgeType;
  file: string;
  line?: number;
  evidence: string;
}

export interface PlSqlInventory {
  detected: boolean;
  files: string[];
  entities: PlSqlEntity[];
  dependencies: PlSqlDependency[];
  tableReferences: Array<{ name: string; reads: number; writes: number; files: string[] }>;
  counts: Record<PlSqlEntityKind, number>;
}

const EMPTY_COUNTS: Record<PlSqlEntityKind, number> = {
  package: 0,
  package_body: 0,
  procedure: 0,
  function: 0,
  trigger: 0,
  view: 0,
  table: 0,
  cursor: 0,
  type: 0,
  synonym: 0
};

const CRITICAL_TABLE_WORDS = ['pagamento', 'fatura', 'nota', 'nfe', 'fiscal', 'boleto', 'usuario', 'permissao', 'estoque'];

export function isPlSqlFileExtension(extension: string): boolean {
  return PL_SQL_EXTENSIONS.has(extension.toLowerCase());
}

export interface DetectPlSqlOptions {
  /** Limite de arquivos SQL/PL/SQL a processar. Default 100000. */
  maxSqlFiles?: number;
}

export async function detectPlSql(scan: ScanResult, options: DetectPlSqlOptions = {}): Promise<PlSqlInventory> {
  const maxSqlFiles = options.maxSqlFiles ?? 100000;
  const allFiles = scan.files.filter((file) => isPlSqlFileExtension(file.extension));
  const files = allFiles.slice(0, maxSqlFiles);
  const entities: PlSqlEntity[] = [];
  const dependencies: PlSqlDependency[] = [];
  const tableRefs = new Map<string, { name: string; reads: number; writes: number; files: Set<string> }>();

  for (const file of files) {
    const content = await readText(path.join(scan.rootPath, file.relativePath));
    if (!content.trim()) {
      continue;
    }

    const fileEntities = extractEntities(file.relativePath, content);
    entities.push(...fileEntities);
    for (const dependency of extractDependencies(file.relativePath, content, fileEntities)) {
      dependencies.push(dependency);
      if (dependency.targetKind === 'table') {
        const key = normalizeName(dependency.targetName);
        const current = tableRefs.get(key) ?? { name: key, reads: 0, writes: 0, files: new Set<string>() };
        if (dependency.edgeType === 'READS_TABLE') {
          current.reads += 1;
        } else if (dependency.edgeType === 'WRITES_TABLE') {
          current.writes += 1;
        }
        current.files.add(file.relativePath);
        tableRefs.set(key, current);
      }
    }
  }

  const counts = { ...EMPTY_COUNTS };
  for (const entity of entities) {
    counts[entity.kind] += 1;
  }

  return {
    detected: entities.length > 0 || files.length > 0,
    files: files.map((file) => file.relativePath),
    entities,
    dependencies,
    tableReferences: [...tableRefs.values()]
      .map((item) => ({ name: item.name, reads: item.reads, writes: item.writes, files: [...item.files].sort() }))
      .sort((a, b) => b.reads + b.writes - (a.reads + a.writes) || a.name.localeCompare(b.name)),
    counts
  };
}

export async function detectPlSqlRisks(scan: ScanResult, inventory: PlSqlInventory): Promise<RiskFinding[]> {
  const risks: RiskFinding[] = [];
  const plsqlFiles = scan.files.filter((file) => isPlSqlFileExtension(file.extension));

  for (const file of plsqlFiles) {
    const content = await readText(path.join(scan.rootPath, file.relativePath));
    const upper = stripComments(content).toUpperCase();
    const entities = inventory.entities.filter((entity) => entity.file === file.relativePath);
    const inRoutineOrPackage = entities.some((entity) => ['package_body', 'procedure', 'function'].includes(entity.kind));

    addPatternRisk(risks, file.relativePath, content, /\bEXECUTE\s+IMMEDIATE\b/gi, 'plsql-execute-immediate', 'high', 'Uso de EXECUTE IMMEDIATE', 'SQL dinâmico pode ocultar dependências e introduzir risco de injection.', 'Prefira SQL estático ou valide/binde todos os valores do SQL dinâmico.');
    addPatternRisk(risks, file.relativePath, content, /\bDBMS_JOB\b|\bDBMS_SCHEDULER\b/gi, 'plsql-job-scheduler', 'medium', 'Uso de job/scheduler no banco', 'Rotinas agendadas podem executar regras de negócio fora da aplicação.', 'Documente janela, frequência, dono funcional e impacto antes de alterar.');
    addPatternRisk(risks, file.relativePath, content, /\bPRAGMA\s+AUTONOMOUS_TRANSACTION\b/gi, 'plsql-autonomous-transaction', 'high', 'Uso de autonomous transaction', 'Transações autônomas podem confirmar dados fora do fluxo transacional principal.', 'Revise consistência transacional e efeitos colaterais antes de mudar.');
    addPatternRisk(risks, file.relativePath, content, /\bEXECUTE\s+IMMEDIATE\b[\s\S]{0,240}\|\|/gi, 'plsql-dynamic-sql-concat', 'critical', 'SQL dinâmico com concatenação', 'SQL dinâmico concatenado pode causar injection e comportamento frágil.', 'Use bind variables e whitelists explícitas para nomes dinâmicos.');

    if (inRoutineOrPackage) {
      addPatternRisk(risks, file.relativePath, content, /\bCOMMIT\b/gi, 'plsql-commit-in-routine', 'high', 'COMMIT dentro de rotina PL/SQL', 'COMMIT em procedure/function/package pode quebrar transações controladas pela aplicação.', 'Deixe o controle transacional no chamador ou documente claramente a exceção.');
      addPatternRisk(risks, file.relativePath, content, /\bROLLBACK\b/gi, 'plsql-rollback-in-routine', 'high', 'ROLLBACK dentro de rotina PL/SQL', 'ROLLBACK em procedure/function/package pode desfazer trabalho fora do escopo esperado.', 'Evite rollback interno ou isole o contrato transacional da rotina.');
    }

    for (const whenOthers of findWhenOthersBlocks(content)) {
      if (!/\bRAISE\b/i.test(whenOthers.block)) {
        risks.push(plsqlRisk('plsql-when-others-no-raise', 'high', 'WHEN OTHERS sem RAISE', file.relativePath, whenOthers.line, 'Exceções genéricas podem ser engolidas e esconder falhas críticas.', 'Registre contexto e use RAISE ou trate exceções específicas.', whenOthers.evidence));
      }
    }

    for (const trigger of entities.filter((entity) => entity.kind === 'trigger')) {
      if (/\b(INSERT|UPDATE|DELETE|MERGE)\b/i.test(content)) {
        risks.push(plsqlRisk('plsql-trigger-mutates-data', 'high', 'Trigger alterando dados', file.relativePath, trigger.line, 'Trigger com DML pode esconder regra de negócio e efeitos colaterais no banco.', 'Documente a regra, tabela alvo e impacto transacional antes de alterar.', trigger.name));
      }
    }

    for (const entity of entities.filter((item) => item.kind === 'package_body')) {
      if (file.lines > 1500) {
        risks.push(plsqlRisk('plsql-large-package-body', 'medium', 'Package body com mais de 1500 linhas', file.relativePath, entity.line, `O package body tem ${file.lines} linhas.`, 'Mapeie procedures internas e extraia responsabilidades antes de mudanças amplas.', entity.name));
      }
    }

    for (const entity of entities.filter((item) => item.kind === 'procedure' || item.kind === 'function')) {
      const entityLines = entity.endLine && entity.endLine > entity.line ? entity.endLine - entity.line + 1 : file.lines;
      if (entityLines > 300) {
        risks.push(plsqlRisk('plsql-large-routine', 'high', 'Procedure/function com mais de 300 linhas', file.relativePath, entity.line, `A rotina ${entity.name} tem aproximadamente ${entityLines} linhas.`, 'Divida a rotina em unidades menores e valide contratos antes de editar.', entity.name));
      }
      if (entityLines > 120 && !/\bEXCEPTION\b/i.test(content)) {
        risks.push(plsqlRisk('plsql-large-routine-no-exception', 'medium', 'Rotina grande sem EXCEPTION', file.relativePath, entity.line, 'Rotina grande sem bloco EXCEPTION explícito pode falhar sem tratamento local.', 'Avalie tratamento de erro, logging e contrato com o chamador.', entity.name));
      }
    }

    for (const reference of inventory.tableReferences.filter((item) => item.files.includes(file.relativePath))) {
      if (CRITICAL_TABLE_WORDS.some((word) => normalizeName(reference.name).includes(word.toUpperCase()))) {
        risks.push(plsqlRisk('plsql-critical-table-dependency', 'critical', 'Dependência direta com tabela crítica', file.relativePath, undefined, `O arquivo referencia tabela crítica (${reference.name}).`, 'Valide regra de negócio, transação e impacto com o responsável funcional antes de alterar.', reference.name));
      }
    }

    if (upper.includes('BEGIN') && !entities.length && file.extension === '.sql') {
      risks.push(plsqlRisk('plsql-anonymous-block', 'low', 'Bloco PL/SQL anônimo em arquivo SQL', file.relativePath, undefined, 'Blocos anônimos podem conter regra operacional não versionada como procedure/package.', 'Revise se a lógica deveria estar documentada ou encapsulada em objeto nomeado.', 'BEGIN'));
    }
  }

  return dedupeRisks(risks);
}

function extractEntities(file: string, content: string): PlSqlEntity[] {
  const clean = stripComments(content);
  const entities: PlSqlEntity[] = [];
  const createPatterns: Array<{ kind: PlSqlEntityKind; pattern: RegExp }> = [
    { kind: 'package_body', pattern: /\bCREATE\s+(?:OR\s+REPLACE\s+)?PACKAGE\s+BODY\s+([A-Z0-9_$#."-]+)/gi },
    { kind: 'package', pattern: /\bCREATE\s+(?:OR\s+REPLACE\s+)?PACKAGE\s+(?!BODY\b)([A-Z0-9_$#."-]+)/gi },
    { kind: 'procedure', pattern: /\bCREATE\s+(?:OR\s+REPLACE\s+)?PROCEDURE\s+([A-Z0-9_$#."-]+)/gi },
    { kind: 'function', pattern: /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([A-Z0-9_$#."-]+)/gi },
    { kind: 'trigger', pattern: /\bCREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+([A-Z0-9_$#."-]+)/gi },
    { kind: 'view', pattern: /\bCREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+([A-Z0-9_$#."-]+)/gi },
    { kind: 'table', pattern: /\bCREATE\s+(?:GLOBAL\s+TEMPORARY\s+)?TABLE\s+([A-Z0-9_$#."-]+)/gi },
    { kind: 'type', pattern: /\bCREATE\s+(?:OR\s+REPLACE\s+)?TYPE\s+([A-Z0-9_$#."-]+)/gi },
    { kind: 'synonym', pattern: /\bCREATE\s+(?:OR\s+REPLACE\s+)?SYNONYM\s+([A-Z0-9_$#."-]+)/gi }
  ];

  for (const { kind, pattern } of createPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(clean)) !== null) {
      const name = normalizeName(match[1]);
      entities.push({
        id: entityId(kind, name, file),
        name,
        kind,
        file,
        line: lineAt(content, match.index),
        targetTable: kind === 'trigger' ? extractTriggerTable(clean.slice(match.index, match.index + 900)) : undefined
      });
    }
  }

  const packageParent = entities.find((entity) => entity.kind === 'package_body' || entity.kind === 'package')?.name;
  const internalPatterns: Array<{ kind: PlSqlEntityKind; pattern: RegExp }> = [
    { kind: 'procedure', pattern: /\bPROCEDURE\s+([A-Z0-9_$#."-]+)\b/gi },
    { kind: 'function', pattern: /\bFUNCTION\s+([A-Z0-9_$#."-]+)\b/gi },
    { kind: 'cursor', pattern: /\bCURSOR\s+([A-Z0-9_$#."-]+)\s+IS\b/gi }
  ];

  for (const { kind, pattern } of internalPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(clean)) !== null) {
      if (looksLikeCreatePrefix(clean, match.index)) {
        continue;
      }
      const name = normalizeName(match[1]);
      const parentName = packageParent;
      const matchIndex = match.index;
      const id = entityId(kind, parentName ? `${parentName}.${name}` : name, file, matchIndex);
      if (entities.some((entity) => entity.id === id || (entity.name === name && entity.kind === kind && entity.line === lineAt(content, matchIndex)))) {
        continue;
      }
      entities.push({
        id,
        name: parentName ? `${parentName}.${name}` : name,
        kind,
        file,
        line: lineAt(content, matchIndex),
        endLine: findRoutineEndLine(content, matchIndex),
        parentName
      });
    }
  }

  return entities.sort((a, b) => a.line - b.line || a.kind.localeCompare(b.kind));
}

function extractDependencies(file: string, content: string, entities: PlSqlEntity[]): PlSqlDependency[] {
  const clean = stripComments(content);
  const source = chooseDependencySource(file, entities);
  const dependencies: PlSqlDependency[] = [];

  for (const item of matchAll(/\b(?:FROM|JOIN)\s+([A-Z0-9_$#."-]+)/gi, clean)) {
    dependencies.push(dependency(source.id, normalizeName(item.match[1]), 'table', 'READS_TABLE', file, lineAt(content, item.index), item.match[0]));
  }
  for (const item of matchAll(/\b(?:UPDATE|INSERT\s+INTO|MERGE\s+INTO|DELETE\s+FROM)\s+([A-Z0-9_$#."-]+)/gi, clean)) {
    dependencies.push(dependency(source.id, normalizeName(item.match[1]), 'table', 'WRITES_TABLE', file, lineAt(content, item.index), item.match[0]));
  }
  for (const trigger of entities.filter((entity) => entity.kind === 'trigger' && entity.targetTable)) {
    dependencies.push(dependency(trigger.id, trigger.targetTable ?? '', 'table', 'TRIGGERS_ON', file, trigger.line, trigger.name));
  }
  for (const cursor of entities.filter((entity) => entity.kind === 'cursor')) {
    dependencies.push(dependency(source.id, cursor.name, 'cursor', 'USES_CURSOR', file, cursor.line, cursor.name));
  }
  for (const item of matchAll(/\b([A-Z0-9_$#"]+)\s*\.\s*([A-Z0-9_$#"]+)\s*\(/gi, clean)) {
    const targetName = `${normalizeName(item.match[1])}.${normalizeName(item.match[2])}`;
    if (!isSqlKeyword(targetName)) {
      dependencies.push(dependency(source.id, targetName, 'routine', 'CALLS', file, lineAt(content, item.index), item.match[0]));
    }
  }

  return dedupeDependencies(dependencies);
}

function chooseDependencySource(file: string, entities: PlSqlEntity[]): PlSqlEntity {
  return entities.find((entity) => ['package_body', 'package', 'procedure', 'function', 'trigger'].includes(entity.kind)) ?? {
    id: entityId('procedure', `ANONIMO:${file}`, file),
    name: `ANONIMO:${file}`,
    kind: 'procedure',
    file,
    line: 1
  };
}

function dependency(sourceId: string, targetName: string, targetKind: PlSqlDependency['targetKind'], edgeType: PlSqlDependencyEdgeType, file: string, line: number | undefined, evidence: string): PlSqlDependency {
  return { sourceId, targetName, targetKind, edgeType, file, line, evidence: evidence.replace(/\s+/g, ' ').trim().slice(0, 180) };
}

function extractTriggerTable(fragment: string): string | undefined {
  return fragment.match(/\b(?:BEFORE|AFTER|INSTEAD\s+OF)\b[\s\S]{0,500}?\bON\s+([A-Z0-9_$#."-]+)/i)?.[1]?.replace(/"/g, '').toUpperCase();
}

function findWhenOthersBlocks(content: string): Array<{ line: number; block: string; evidence: string }> {
  const blocks = [];
  const pattern = /\bWHEN\s+OTHERS\s+THEN\b([\s\S]*?)(?=\bWHEN\b|\bEND\b\s*;|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    blocks.push({
      line: lineAt(content, match.index),
      block: match[0],
      evidence: match[0].replace(/\s+/g, ' ').trim().slice(0, 220)
    });
  }
  return blocks;
}

function addPatternRisk(risks: RiskFinding[], file: string, content: string, pattern: RegExp, id: string, level: RiskFinding['level'], title: string, reason: string, recommendation: string): void {
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    risks.push(plsqlRisk(id, level, title, file, lineAt(content, match.index), reason, recommendation, match[0]));
  }
}

function plsqlRisk(id: string, level: RiskFinding['level'], title: string, file: string, line: number | undefined, reason: string, recommendation: string, evidence: string): RiskFinding {
  return {
    id,
    level,
    title,
    file,
    line,
    reason,
    recommendation,
    evidence: evidence.replace(/\s+/g, ' ').trim().slice(0, 240),
    category: 'plsql'
  };
}

function entityId(kind: PlSqlEntityKind, name: string, file: string, offset = 0): string {
  return `plsql:${kind}:${normalizeName(name)}:${file}:${offset}`;
}

function normalizeName(value: string): string {
  return value.replace(/"/g, '').replace(/\s+/g, '').toUpperCase();
}

function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ');
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split(/\r\n|\r|\n/).length;
}

function findRoutineEndLine(content: string, startIndex: number): number | undefined {
  const rest = content.slice(startIndex);
  const match = rest.match(/\bEND(?:\s+[A-Z0-9_$#"]+)?\s*;/i);
  return match?.index === undefined ? undefined : lineAt(content, startIndex + match.index);
}

function looksLikeCreatePrefix(content: string, index: number): boolean {
  return /\bCREATE\s+(?:OR\s+REPLACE\s+)?$/i.test(content.slice(Math.max(0, index - 40), index));
}

function isSqlKeyword(value: string): boolean {
  return ['DBMS_OUTPUT.PUT_LINE', 'COUNT', 'SUM', 'MIN', 'MAX', 'NVL', 'TO_DATE', 'TO_CHAR'].includes(value.toUpperCase());
}

function matchAll(pattern: RegExp, content: string): Array<{ match: RegExpExecArray; index: number }> {
  const matches = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    matches.push({ match, index: match.index });
  }
  return matches;
}

function dedupeDependencies(dependencies: PlSqlDependency[]): PlSqlDependency[] {
  const seen = new Set<string>();
  return dependencies.filter((item) => {
    const key = `${item.sourceId}|${item.edgeType}|${item.targetName}|${item.line ?? 0}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeRisks(risks: RiskFinding[]): RiskFinding[] {
  const seen = new Set<string>();
  return risks.filter((risk) => {
    const key = `${risk.id}|${risk.file}|${risk.line ?? 0}|${risk.evidence}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function readText(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}
