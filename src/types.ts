import type { LightweightGraph } from './scanner/buildGraph';
import type { ArchitectureInventory } from './scanner/detectStack';
import type { RiskReport } from './scanner/detectRisks';
import type { ScanResult } from './scanner/scanWorkspace';

export type DetectedProjectKind = 'backend' | 'frontend' | 'mobile' | 'infra' | 'shared' | 'database' | 'unknown';

export interface DetectedProject {
  id: string;
  name: string;
  rootPath: string;
  relativePath: string;
  kind: DetectedProjectKind;
  stack: string[];
  evidence: string[];
  files: number;
  risks: number;
}

export type LanguageStats = Record<string, number>;

export interface AgentEngine {
  id: string;
  name: string;
  entryFile: string;
  detected: boolean;
}

/**
 * Resumo de análise de um projeto específico dentro do workspace.
 * Contém contexto e artefatos focados em um único subprojeto.
 */
export interface ProjectContextSummary {
  projectId: string;
  projectName: string;
  projectKind: DetectedProjectKind;
  rootPath: string;
  relativePath: string;
  generatedAt: string;
  files: number;
  lines: number;
  languages: LanguageStats;
  stack: string[];
  scan: ScanResult;
  inventory: ArchitectureInventory;
  graph: LightweightGraph;
  risks: RiskReport;
}

/**
 * Resumo global do workspace, com informações consolidadas.
 * Contém metadados globais e referências para artefatos por projeto.
 */
export interface WorkspaceSummary {
  workspaceName: string;
  rootPath: string;
  generatedAt: string;
  totalFiles: number;
  totalLines: number;
  languages: LanguageStats;
  topDirectories: Array<{ name: string; files: number }>;
  packageManagers: string[];
  detectedAgentEngines: AgentEngine[];
  keyFiles: string[];
  detectedProjects: DetectedProject[];
  // Artefatos globais
  scan: ScanResult;
  inventory: ArchitectureInventory;
  graph: LightweightGraph;
  risks: RiskReport;
  // Metadados de projetos
  projectSummaries?: Record<string, ProjectContextSummary>;
}

/**
 * Legado: ProjectSummary agora aponta para WorkspaceSummary.
 * Mantido para compatibilidade.
 */
export type ProjectSummary = WorkspaceSummary;

export interface AgentContext {
  summary: ProjectSummary;
  markdown: string;
}

export interface SidebarState {
  lastAnalysis?: ProjectSummary;
  selectedProjectId?: string;
}

