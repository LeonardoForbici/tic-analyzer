import * as fs from 'fs';
import * as path from 'path';
import type { ScannedFile } from './scanFiles';
import type { StackInfo } from './detectStack';
import type { ProjectModule } from './detectModules';
import type { EndpointFound } from './detectEndpoints';
import type { DependencyGraph } from './buildDependencyGraph';
import type { RiskFinding } from './detectRisks';
import type { FileMetrics, ProjectMetrics } from './computeMetrics';
import type { LayerViolation } from './detectLayerViolations';
import type { PatternMatch } from './detectPatterns';
import type { InheritanceTree } from './detectInheritance';
import type { DbSchema } from './detectDbSchema';
import type { ImpactIndex } from './buildImpactIndex';
import type { TransactionBoundary } from './detectTransactions';
import type { BatchJob } from './detectBatchJobs';
import type { AngularModule, NgRxItem } from './detectAngularModules';
import type { HealthScore } from './computeHealthScore';

export interface ExportData {
  projectName: string;
  projectPath: string;
  files: ScannedFile[];
  totalLines: number;
  stack: StackInfo;
  modules: ProjectModule[];
  endpoints: EndpointFound[];
  graph: DependencyGraph;
  risks: RiskFinding[];
  metrics: ProjectMetrics;
  fileMetrics: FileMetrics[];
  violations: LayerViolation[];
  patternMatches: PatternMatch[];
  inheritanceTree: InheritanceTree;
  dbSchema: DbSchema;
  impactIndex: ImpactIndex;
  quickContextTokens: number;
  transactionBoundaries: TransactionBoundary[];
  batchJobs: BatchJob[];
  angularModules: AngularModule[];
  ngrxItems: NgRxItem[];
  deadComponents: Array<{ file: string; type: 'react' | 'angular' }>;
  health?: HealthScore;
  /** Governança: violações de regra (.tic-rules.json). */
  archViolations?: { items: unknown[]; errorCount: number; warnCount: number; ruleCount: number };
  /** Predição de risco (top 20). */
  riskPrediction?: unknown[];
}

export function exportAnalysis(ticCodeDir: string, data: ExportData): void {
  const risksByLevel = (level: string) => data.risks.filter((r) => r.level === level).length;

  const analysis = {
    version: '2.0',
    analyzedAt: new Date().toISOString(),
    health: data.health,
    archViolations: data.archViolations,
    riskPrediction: data.riskPrediction,
    project: {
      name: data.projectName,
      totalFiles: data.files.length,
      totalLines: data.totalLines,
      quickContextTokens: data.quickContextTokens
    },
    stack: {
      primaryLanguage: data.stack.primaryLanguage,
      languages: data.stack.languages,
      frameworks: data.stack.frameworks,
      packageManagers: data.stack.packageManagers
    },
    modules: data.modules.map((m) => ({
      name: m.name,
      fileCount: m.fileCount,
      languages: m.languages,
      path: m.path
    })),
    endpoints: data.endpoints.map((e) => ({
      method: e.method,
      path: e.path,
      file: e.file,
      line: e.line,
      controller: e.controller
    })),
    graph: {
      nodeCount: data.graph.nodes.length,
      edgeCount: data.graph.edges.length
    },
    metrics: {
      hotspotCount: data.metrics.hotspotCount,
      totalDebt: data.metrics.totalDebt,
      violationCount: data.violations.length,
      topHotspots: data.fileMetrics
        .filter((fm) => fm.hotspot)
        .sort((a, b) => b.debtScore - a.debtScore)
        .slice(0, 20)
        .map((fm) => ({
          file: fm.file,
          complexity: fm.cyclomaticComplexity,
          debtScore: fm.debtScore,
          couplingIn: fm.couplingIn
        }))
    },
    violations: data.violations.map((v) => ({
      type: v.type,
      severity: v.severity,
      from: v.from,
      to: v.to,
      detail: v.detail
    })),
    patterns: data.patternMatches.reduce<Record<string, number>>((acc, p) => {
      acc[p.pattern] = (acc[p.pattern] ?? 0) + 1;
      return acc;
    }, {}),
    dbSchema: {
      tableCount: data.dbSchema.totalTables,
      detectedVia: data.dbSchema.detectedVia,
      tables: data.dbSchema.tables.map((t) => ({
        name: t.name,
        columnCount: t.columns.length,
        primaryKeys: t.primaryKeys,
        foreignKeyCount: (t.foreignKeys?.length ?? 0) + t.columns.filter((c) => c.foreignKey).length,
        sourceType: t.sourceType
      }))
    },
    inheritance: {
      classCount: data.inheritanceTree.classes.length,
      maxDepth: data.inheritanceTree.maxDepth,
      abstractCount: data.inheritanceTree.classes.filter((c) => c.isAbstract).length,
      interfaceCount: data.inheritanceTree.classes.filter((c) => c.isInterface).length
    },
    risks: {
      total: data.risks.length,
      critical: risksByLevel('critical'),
      high: risksByLevel('high'),
      medium: risksByLevel('medium'),
      low: risksByLevel('low'),
      // Lista por arquivo+regra (sem linha — linhas deslocam) p/ delta entre análises (PR review)
      items: data.risks.map((r) => ({ level: r.level, title: r.title, file: r.file }))
    },
    impact: {
      indexedFiles: Object.keys(data.impactIndex).length,
      topImpact: Object.entries(data.impactIndex)
        .sort((a, b) => b[1].transitiveCount - a[1].transitiveCount)
        .slice(0, 10)
        .map(([file, entry]) => ({
          file,
          directCount: entry.directCount,
          transitiveCount: entry.transitiveCount
        }))
    },
    spring: {
      transactionCount: data.transactionBoundaries.length,
      requiresNewCount: data.transactionBoundaries.filter((t) => t.propagation === 'REQUIRES_NEW').length,
      batchJobCount: data.batchJobs.length,
      scheduledCount: data.batchJobs.filter((b) => b.type === 'scheduled').length,
      asyncCount: data.batchJobs.filter((b) => b.type === 'async').length
    },
    angular: {
      moduleCount: data.angularModules.length,
      lazyRouteCount: data.angularModules.reduce((sum, m) => sum + m.lazyRoutes.length, 0),
      ngrxActionCount: data.ngrxItems.filter((n) => n.type === 'action').length,
      ngrxReducerCount: data.ngrxItems.filter((n) => n.type === 'reducer').length,
      ngrxEffectCount: data.ngrxItems.filter((n) => n.type === 'effect').length
    },
    deadCode: {
      componentCount: data.deadComponents.length
    }
  };

  fs.writeFileSync(path.join(ticCodeDir, 'analysis.json'), JSON.stringify(analysis, null, 2), 'utf8');
}
