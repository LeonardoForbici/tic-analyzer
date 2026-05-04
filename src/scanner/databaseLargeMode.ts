/**
 * PLSQL Enterprise Mode / Database Large Mode
 * Orquestra indexação e sumarização para projetos com bases muito grandes (> 1000 tabelas).
 * Garante que o grafo visual e a IA Local recebam apenas contexto filtrado e reduzido.
 */

import type { PlSqlInventory } from './detectPlSql';
import type { DatabaseConfig } from '../utils/config';
import { buildDatabaseIndex } from './databaseIndex';
import type { DatabaseIndex } from './databaseIndex';

export interface DatabaseSummary {
  totalTables: number;
  totalPackages: number;
  totalProcedures: number;
  totalFunctions: number;
  totalTriggers: number;
  totalViews: number;
  totalCriticalObjects: number;
  topCriticalTables: Array<{ name: string; score: number; riskLevel: string }>;
  topCriticalPackages: Array<{ name: string; score: number; riskLevel: string }>;
  criticalTriggers: Array<{ name: string; tableName?: string; riskLevel: string }>;
  schemaCount: number;
  schemas: string[];
  largeModeActive: boolean;
  generatedAt: string;
}

export interface DatabaseGraphSummaryNode {
  id: string;
  label: string;
  type: string;
  score: number;
  riskLevel: string;
}

export interface DatabaseGraphSummaryEdge {
  from: string;
  to: string;
  type: string;
}

export interface DatabaseGraphSummary {
  nodes: DatabaseGraphSummaryNode[];
  edges: DatabaseGraphSummaryEdge[];
  totalTablesIndexed: number;
  visualNodeCount: number;
  generatedAt: string;
}

export function buildDatabaseSummary(index: DatabaseIndex): DatabaseSummary {
  const schemas = new Set<string>();
  for (const table of index.tables) {
    if (table.schema) {
      schemas.add(table.schema);
    }
  }

  return {
    totalTables: index.totalTables,
    totalPackages: index.totalPackages,
    totalProcedures: index.totalProcedures,
    totalFunctions: index.totalFunctions,
    totalTriggers: index.totalTriggers,
    totalViews: index.totalViews,
    totalCriticalObjects: index.criticalObjects.length,
    topCriticalTables: index.tables
      .slice(0, 20)
      .map((t) => ({ name: t.name, score: t.criticalityScore, riskLevel: t.riskLevel })),
    topCriticalPackages: index.packages
      .slice(0, 10)
      .map((p) => ({ name: p.name, score: p.criticalityScore, riskLevel: p.riskLevel })),
    criticalTriggers: index.triggers
      .filter((t) => t.riskLevel === 'high' || t.riskLevel === 'critical')
      .slice(0, 20)
      .map((t) => ({ name: t.name, tableName: t.tableName, riskLevel: t.riskLevel })),
    schemaCount: schemas.size,
    schemas: [...schemas].sort(),
    largeModeActive: index.largeModeActive,
    generatedAt: index.generatedAt,
  };
}

export function buildDatabaseGraphSummary(index: DatabaseIndex, config: DatabaseConfig): DatabaseGraphSummary {
  const maxTables = config.maxTablesInGraph;
  const maxNodes = config.maxVisualNodes;
  const nodes: DatabaseGraphSummaryNode[] = [];
  const edges: DatabaseGraphSummaryEdge[] = [];
  const addedIds = new Set<string>();

  // Adicionar schemas como meta-nós
  const schemas = new Set<string>();
  for (const table of index.tables) {
    if (table.schema) {
      schemas.add(table.schema);
    }
  }

  for (const schema of schemas) {
    if (nodes.length >= maxNodes) {
      break;
    }
    const id = `schema:${schema}`;
    nodes.push({ id, label: schema, type: 'schema', score: 100, riskLevel: 'low' });
    addedIds.add(id);
  }

  // Adicionar top packages críticos
  for (const pkg of index.packages.slice(0, 20)) {
    if (nodes.length >= maxNodes) {
      break;
    }
    const id = `pkg:${pkg.name}`;
    nodes.push({ id, label: pkg.name, type: 'package', score: pkg.criticalityScore, riskLevel: pkg.riskLevel });
    addedIds.add(id);
  }

  // Adicionar triggers críticos
  for (const trigger of index.triggers.filter((t) => t.riskLevel === 'high' || t.riskLevel === 'critical').slice(0, 20)) {
    if (nodes.length >= maxNodes) {
      break;
    }
    const id = `trg:${trigger.name}`;
    nodes.push({ id, label: trigger.name, type: 'trigger', score: 30, riskLevel: trigger.riskLevel });
    addedIds.add(id);
    if (trigger.tableName) {
      edges.push({ from: id, to: `tbl:${trigger.tableName.toUpperCase()}`, type: 'TRIGGERS_ON' });
    }
  }

  // Adicionar top tabelas críticas (limitado por maxTablesInGraph)
  const remaining = maxNodes - nodes.length;
  const tablesToShow = index.tables.slice(0, Math.min(maxTables, remaining));
  for (const table of tablesToShow) {
    const id = `tbl:${table.name.toUpperCase()}`;
    nodes.push({ id, label: table.name, type: 'table', score: table.criticalityScore, riskLevel: table.riskLevel });
    addedIds.add(id);
    if (table.schema) {
      edges.push({ from: `schema:${table.schema}`, to: id, type: 'CONTAINS' });
    }
  }

  // Arestas de packages para tabelas que leem/escrevem
  for (const pkg of index.packages.slice(0, 20)) {
    const pkgId = `pkg:${pkg.name}`;
    if (!addedIds.has(pkgId)) {
      continue;
    }
    for (const tableName of pkg.tablesWritten.slice(0, 5)) {
      const tableId = `tbl:${tableName.toUpperCase()}`;
      if (addedIds.has(tableId)) {
        edges.push({ from: pkgId, to: tableId, type: 'WRITES_TABLE' });
      }
    }
    for (const tableName of pkg.tablesRead.slice(0, 3)) {
      const tableId = `tbl:${tableName.toUpperCase()}`;
      if (addedIds.has(tableId)) {
        edges.push({ from: pkgId, to: tableId, type: 'READS_TABLE' });
      }
    }
  }

  return {
    nodes,
    edges,
    totalTablesIndexed: index.totalTables,
    visualNodeCount: nodes.length,
    generatedAt: index.generatedAt,
  };
}

export interface DatabaseLargeModeData {
  index: DatabaseIndex;
  summary: DatabaseSummary;
  graphSummary: DatabaseGraphSummary;
}

export function buildDatabaseLargeModeData(plsql: PlSqlInventory, config: DatabaseConfig): DatabaseLargeModeData {
  const index = buildDatabaseIndex(plsql, config);
  const summary = buildDatabaseSummary(index);
  const graphSummary = buildDatabaseGraphSummary(index, config);
  return { index, summary, graphSummary };
}

/**
 * Filtra o contexto para IA Local — nunca envia a base inteira.
 * Retorna apenas objetos críticos, top packages, top triggers e top tabelas.
 */
export function buildFilteredAiContext(index: DatabaseIndex, config: DatabaseConfig): object {
  return {
    largeModeActive: index.largeModeActive,
    topCriticalTables: index.tables.slice(0, Math.min(50, config.maxCriticalTables)).map((t) => ({
      name: t.name,
      riskLevel: t.riskLevel,
      score: t.criticalityScore,
      reasons: t.reasons,
      readCount: t.readCount,
      writeCount: t.writeCount,
      triggerCount: t.triggerCount,
    })),
    topPackages: index.packages.slice(0, 20).map((p) => ({
      name: p.name,
      riskLevel: p.riskLevel,
      score: p.criticalityScore,
      tablesWritten: p.tablesWritten.slice(0, 10),
      tablesRead: p.tablesRead.slice(0, 10),
      procedureCount: p.procedures.length,
    })),
    topTriggers: index.triggers
      .filter((t) => t.riskLevel !== 'low')
      .slice(0, 20)
      .map((t) => ({ name: t.name, tableName: t.tableName, riskLevel: t.riskLevel })),
    criticalObjects: index.criticalObjects.slice(0, 30),
  };
}
