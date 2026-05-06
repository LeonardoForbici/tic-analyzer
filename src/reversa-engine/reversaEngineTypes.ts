/**
 * Tipos do motor Reversa embutido no TIC Coder Lite.
 * Créditos: Reversa by Sandeco — MIT License (adapted)
 */

export type ReversaPhaseId =
  | 'reconnaissance'
  | 'excavation'
  | 'interpretation'
  | 'synthesis'
  | 'generation'
  | 'review'
  | 'data';

export type ReversaAgentStatusValue = 'pending' | 'running' | 'completed' | 'failed';
export type ReversaExecutionMode = 'deterministic' | 'user-input' | 'ai-assisted';
export type ReversaPhaseStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ReversaAgentStatus {
  id: string;
  name: string;
  role: string;
  status: ReversaAgentStatusValue;
  executionMode: ReversaExecutionMode;
  requiredInputs: string[];
  receivedInputs: string[];
  generatedFiles: string[];
  errors: string[];
  warnings: string[];
  confidenceSummary: { confirmed: number; inferred: number; gaps: number };
  startedAt?: string;
  finishedAt?: string;
  lastRunAt?: string;
}

export interface ReversaPhase {
  id: ReversaPhaseId;
  label: string;
  agent: string;
  status: ReversaPhaseStatus;
  completedAt?: string;
  artifacts?: string[];
}

export interface ReversaCheckpoint {
  completedAt: string;
  files: string[];
  modulesAnalyzed?: string[];
}

export interface ReversaState {
  version: string;
  project: string;
  engine: 'tic-coder-lite';
  docLevel: 'essencial' | 'completo' | 'detalhado';
  outputFolder: '.tic-code/reverse-engineering';
  contextDir: '.tic-code/reversa/context';
  phase: ReversaPhaseId;
  completed: ReversaPhaseId[];
  pending: ReversaPhaseId[];
  phases: ReversaPhase[];
  agents: Record<string, ReversaAgentStatus>;
  checkpoints: Partial<Record<string, ReversaCheckpoint>>;
  createdFiles: string[];
  createdAt: string;
  updatedAt: string;
  agentFiles?: string[];
}

export interface ReversaConfig {
  projectName: string;
  rootPath: string;
  outputDir: '.tic-code/reverse-engineering';
  contextDir: '.tic-code/reversa/context';
  reversaDir: '.tic-code/reversa';
  engines: string[];
  localAi: {
    enabled: boolean;
    defaultModel: string;
    qualityModel: string;
  };
  createdAt: string;
}

export interface ReversaSurface {
  generatedAt: string;
  projectRoot: string;
  languages: Array<{ name: string; extensions: string[]; fileCount: number }>;
  primaryLanguage: string;
  frameworks: Array<{ name: string; version?: string; source: string }>;
  packageManager: string;
  entryPoints: Array<{ path: string; type: string }>;
  configFiles: string[];
  databaseHints: Array<{ path: string; type: string }>;
  testFramework?: string;
  testFileCount: number;
  modules: string[];
  totalFiles: number;
  totalLines: number;
}

export interface ReversaModulesContext {
  generatedAt: string;
  modules: Array<{
    name: string;
    path: string;
    fileCount: number;
    language: string;
    mainFiles: string[];
    dependencies: string[];
    confidence: '🟢' | '🟡' | '🔴';
  }>;
}

export interface ReversaEngineResult {
  stateFile: string;
  configFile: string;
  planFile: string;
  contextFiles: string[];
  sddFiles: string[];
  agentFiles: string[];
}
