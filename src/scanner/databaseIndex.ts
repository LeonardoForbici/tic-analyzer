/**
 * Construção do índice de banco de dados para PLSQL Enterprise Mode.
 * Transforma PlSqlInventory em índices estruturados e ranqueados por criticidade.
 */

import type { PlSqlInventory } from './detectPlSql';
import type { DatabaseConfig } from '../utils/config';
import {
  computeTableScore,
  computePackageScore,
  getRiskLevel,
  CRITICAL_NAME_PATTERNS_DEFAULT,
  type DbRiskLevel,
} from './rankDatabaseObjects';

export type { DbRiskLevel };

export interface TableIndexItem {
  name: string;
  schema?: string;
  file: string;
  line?: number;
  referencedBy: string[];
  readCount: number;
  writeCount: number;
  triggerCount: number;
  packageCount: number;
  procedureCount: number;
  riskLevel: DbRiskLevel;
  criticalityScore: number;
  reasons: string[];
}

export interface TriggerIndexItem {
  name: string;
  tableName?: string;
  event?: string;
  timing?: string;
  file: string;
  riskLevel: DbRiskLevel;
  writesTables: string[];
  readsTables: string[];
}

export interface PackageIndexItem {
  name: string;
  file: string;
  procedures: string[];
  functions: string[];
  tablesRead: string[];
  tablesWritten: string[];
  riskLevel: DbRiskLevel;
  criticalityScore: number;
}

export interface ViewIndexItem {
  name: string;
  file: string;
  line?: number;
}

export interface ProcedureIndexItem {
  name: string;
  file: string;
  line?: number;
  parentName?: string;
  tablesRead: string[];
  tablesWritten: string[];
}

export interface FunctionIndexItem {
  name: string;
  file: string;
  line?: number;
  parentName?: string;
}

export interface CriticalObjectRef {
  type: string;
  name: string;
  score: number;
  riskLevel: DbRiskLevel;
  file: string;
}

export interface DatabaseIndex {
  tables: TableIndexItem[];
  views: ViewIndexItem[];
  packages: PackageIndexItem[];
  procedures: ProcedureIndexItem[];
  functions: FunctionIndexItem[];
  triggers: TriggerIndexItem[];
  totalTables: number;
  totalPackages: number;
  totalProcedures: number;
  totalFunctions: number;
  totalTriggers: number;
  totalViews: number;
  criticalObjects: CriticalObjectRef[];
  generatedAt: string;
  largeModeActive: boolean;
}

export function buildDatabaseIndex(plsql: PlSqlInventory, config: DatabaseConfig): DatabaseIndex {
  const criticalPatterns =
    config.criticalNamePatterns.length > 0 ? config.criticalNamePatterns : CRITICAL_NAME_PATTERNS_DEFAULT;

  // Mapas para lookup eficiente
  const entityById = new Map(plsql.entities.map((e) => [e.id, e]));
  const entityNameById = new Map(plsql.entities.map((e) => [e.id, e.name]));

  // Mapas de dependências de tabelas: tableName.toUpperCase() -> conjunto de sourceIds de rotinas
  const tableDepsReaders = new Map<string, Set<string>>();
  const tableDepsWriters = new Map<string, Set<string>>();

  for (const dep of plsql.dependencies) {
    if (dep.targetKind === 'table') {
      const key = dep.targetName.toUpperCase();
      if (dep.edgeType === 'READS_TABLE') {
        const s = tableDepsReaders.get(key) ?? new Set<string>();
        s.add(dep.sourceId);
        tableDepsReaders.set(key, s);
      } else if (dep.edgeType === 'WRITES_TABLE') {
        const s = tableDepsWriters.get(key) ?? new Set<string>();
        s.add(dep.sourceId);
        tableDepsWriters.set(key, s);
      }
    }
  }

  // Entidades trigger para contagem
  const triggerEntities = plsql.entities.filter((e) => e.kind === 'trigger');

  // ---- Construir tabelas ----
  const tableMap = new Map<string, { name: string; file: string; line?: number; readCount: number; writeCount: number }>();

  for (const ref of plsql.tableReferences) {
    const key = ref.name.toUpperCase();
    tableMap.set(key, { name: ref.name, file: ref.files[0] ?? '', readCount: ref.reads, writeCount: ref.writes });
  }

  for (const entity of plsql.entities.filter((e) => e.kind === 'table')) {
    const key = entity.name.toUpperCase();
    const existing = tableMap.get(key);
    tableMap.set(key, {
      name: entity.name,
      file: entity.file,
      line: entity.line,
      readCount: existing?.readCount ?? 0,
      writeCount: existing?.writeCount ?? 0,
    });
  }

  const tables: TableIndexItem[] = [];
  for (const [key, partial] of tableMap) {
    const readers = tableDepsReaders.get(key) ?? new Set<string>();
    const writers = tableDepsWriters.get(key) ?? new Set<string>();

    const triggerCount = triggerEntities.filter((t) => t.targetTable?.toUpperCase() === key).length;

    const pkgSet = new Set<string>();
    for (const id of [...readers, ...writers]) {
      const parentName = entityById.get(id)?.parentName;
      if (parentName) {
        pkgSet.add(parentName.toUpperCase());
      }
    }

    const procSet = new Set<string>();
    for (const id of [...readers, ...writers]) {
      const e = entityById.get(id);
      if (e?.kind === 'procedure') {
        procSet.add(id);
      }
    }

    const referencedBy = [
      ...[...readers].map((id) => entityNameById.get(id)).filter((v): v is string => v !== undefined),
      ...[...writers].map((id) => entityNameById.get(id)).filter((v): v is string => v !== undefined),
    ]
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 50);

    const { score, reasons } = computeTableScore(partial.name, {
      readCount: partial.readCount,
      writeCount: partial.writeCount,
      triggerCount,
      packageCount: pkgSet.size,
      procedureCount: procSet.size,
      criticalPatterns,
    });

    tables.push({
      name: partial.name,
      schema: extractSchema(partial.name),
      file: partial.file,
      line: partial.line,
      referencedBy,
      readCount: partial.readCount,
      writeCount: partial.writeCount,
      triggerCount,
      packageCount: pkgSet.size,
      procedureCount: procSet.size,
      riskLevel: getRiskLevel(score),
      criticalityScore: score,
      reasons,
    });
  }

  tables.sort((a, b) => b.criticalityScore - a.criticalityScore || a.name.localeCompare(b.name));

  // ---- Construir triggers ----
  const triggers: TriggerIndexItem[] = triggerEntities.map((entity) => {
    const relevantDeps = plsql.dependencies.filter((d) => d.sourceId === entity.id);
    const writesTables = relevantDeps.filter((d) => d.edgeType === 'WRITES_TABLE').map((d) => d.targetName);
    const readsTables = relevantDeps.filter((d) => d.edgeType === 'READS_TABLE').map((d) => d.targetName);
    const score = (writesTables.length > 0 ? 20 : 0) + (readsTables.length > 1 ? 10 : 0);
    return {
      name: entity.name,
      tableName: entity.targetTable,
      file: entity.file,
      riskLevel: getRiskLevel(score),
      writesTables,
      readsTables,
    };
  });

  // ---- Construir packages ----
  const packageMap = new Map<
    string,
    {
      entity: (typeof plsql.entities)[0];
      procedures: string[];
      functions: string[];
      tablesRead: Set<string>;
      tablesWritten: Set<string>;
    }
  >();

  for (const entity of plsql.entities) {
    if (entity.kind === 'package' || entity.kind === 'package_body') {
      const key = entity.name.toUpperCase();
      if (!packageMap.has(key)) {
        packageMap.set(key, { entity, procedures: [], functions: [], tablesRead: new Set(), tablesWritten: new Set() });
      }
    }
  }

  for (const entity of plsql.entities) {
    if ((entity.kind === 'procedure' || entity.kind === 'function') && entity.parentName) {
      const pkg = packageMap.get(entity.parentName.toUpperCase());
      if (pkg) {
        if (entity.kind === 'procedure') {
          pkg.procedures.push(entity.name);
        } else {
          pkg.functions.push(entity.name);
        }
      }
    }
  }

  for (const dep of plsql.dependencies) {
    if (dep.targetKind === 'table') {
      const entity = entityById.get(dep.sourceId);
      if (!entity) {
        continue;
      }
      const pkgName =
        entity.parentName ??
        (entity.kind === 'package' || entity.kind === 'package_body' ? entity.name : undefined);
      if (pkgName) {
        const pkg = packageMap.get(pkgName.toUpperCase());
        if (pkg) {
          if (dep.edgeType === 'READS_TABLE') {
            pkg.tablesRead.add(dep.targetName);
          } else if (dep.edgeType === 'WRITES_TABLE') {
            pkg.tablesWritten.add(dep.targetName);
          }
        }
      }
    }
  }

  const packages: PackageIndexItem[] = [];
  for (const [, pkg] of packageMap) {
    const { score } = computePackageScore(pkg.entity.name, {
      tablesWrittenCount: pkg.tablesWritten.size,
      tablesReadCount: pkg.tablesRead.size,
      procedureCount: pkg.procedures.length,
      criticalPatterns,
    });

    packages.push({
      name: pkg.entity.name,
      file: pkg.entity.file,
      procedures: pkg.procedures.slice(0, 100),
      functions: pkg.functions.slice(0, 100),
      tablesRead: [...pkg.tablesRead].slice(0, 50),
      tablesWritten: [...pkg.tablesWritten].slice(0, 50),
      riskLevel: getRiskLevel(score),
      criticalityScore: score,
    });
  }

  packages.sort((a, b) => b.criticalityScore - a.criticalityScore || a.name.localeCompare(b.name));

  // ---- Construir procedures ----
  const procedures: ProcedureIndexItem[] = plsql.entities
    .filter((e) => e.kind === 'procedure')
    .map((entity) => {
      const deps = plsql.dependencies.filter((d) => d.sourceId === entity.id);
      return {
        name: entity.name,
        file: entity.file,
        line: entity.line,
        parentName: entity.parentName,
        tablesRead: deps.filter((d) => d.edgeType === 'READS_TABLE').map((d) => d.targetName),
        tablesWritten: deps.filter((d) => d.edgeType === 'WRITES_TABLE').map((d) => d.targetName),
      };
    });

  // ---- Construir functions ----
  const functions: FunctionIndexItem[] = plsql.entities
    .filter((e) => e.kind === 'function')
    .map((entity) => ({ name: entity.name, file: entity.file, line: entity.line, parentName: entity.parentName }));

  // ---- Construir views ----
  const views: ViewIndexItem[] = plsql.entities
    .filter((e) => e.kind === 'view')
    .map((entity) => ({ name: entity.name, file: entity.file, line: entity.line }));

  // ---- Objetos críticos (unificados de tabelas, packages, triggers) ----
  const criticalObjects: CriticalObjectRef[] = [
    ...tables
      .filter((t) => t.criticalityScore > 20)
      .slice(0, config.maxCriticalTables)
      .map((t) => ({ type: 'table', name: t.name, score: t.criticalityScore, riskLevel: t.riskLevel, file: t.file })),
    ...packages
      .filter((p) => p.criticalityScore > 15)
      .slice(0, 50)
      .map((p) => ({ type: 'package', name: p.name, score: p.criticalityScore, riskLevel: p.riskLevel, file: p.file })),
    ...triggers
      .filter((t) => t.riskLevel === 'high' || t.riskLevel === 'critical')
      .slice(0, 50)
      .map((t) => ({ type: 'trigger', name: t.name, score: 30, riskLevel: t.riskLevel, file: t.file })),
  ].sort((a, b) => b.score - a.score);

  return {
    tables,
    views,
    packages,
    procedures,
    functions,
    triggers,
    totalTables: tables.length,
    totalPackages: packages.length,
    totalProcedures: procedures.length,
    totalFunctions: functions.length,
    totalTriggers: triggers.length,
    totalViews: views.length,
    criticalObjects,
    generatedAt: new Date().toISOString(),
    largeModeActive: config.largeMode,
  };
}

function extractSchema(name: string): string | undefined {
  const dot = name.indexOf('.');
  return dot > 0 ? name.slice(0, dot) : undefined;
}
