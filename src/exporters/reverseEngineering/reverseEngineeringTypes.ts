/**
 * Tipos para a camada de Programação Reversa / SDD (Software Definition Document)
 *
 * Inspiração metodológica: Reversa by Sandeco (MIT License)
 * Créditos: https://github.com/sandeco/reversa
 *
 * O TIC Coder Lite implementa programação reversa determinística local-first,
 * sem IA obrigatória, banco de dados, Docker ou servidor.
 */

import type { ScannedFile } from '../../scanner/scanFiles';
import type { PlSqlEntity, PlSqlInventory } from '../../scanner/detectPlSql';
import type { RiskFinding } from '../../scanner/detectRisks';
import type { ArchitectureInventory } from '../../scanner/detectStack';
import type { ScanResult } from '../../scanner/scanWorkspace';
import type { LightweightGraph } from '../../scanner/buildGraph';

/** Nível de confiança de uma afirmação extraída */
export type ConfidenceLevel = 'confirmado' | 'inferido' | 'lacuna';

/** Marcadores de confiança para exibição */
export const CONFIDENCE_BADGE: Record<ConfidenceLevel, string> = {
  confirmado: '🟢 CONFIRMADO',
  inferido: '🟡 INFERIDO',
  lacuna: '🔴 LACUNA'
};

/** Uma afirmação extraída com nível de confiança */
export interface ConfidentClaim {
  statement: string;
  confidence: ConfidenceLevel;
  evidence: string[];
  sourceFiles?: string[];
}

/** Item do inventário do projeto */
export interface InventoryItem {
  project: string;
  kind: string;
  stack: string[];
  languages: string[];
  frameworks: string[];
  entrypoints: string[];
  keyFiles: string[];
  totalFiles: number;
  totalLines: number;
  controllers: number;
  services: number;
  repositories: number;
  entities: number;
  endpoints: number;
  plsqlPackages: number;
  plsqlProcedures: number;
  plsqlTriggers: number;
}

/** Dependência detectada */
export interface DependencyItem {
  name: string;
  version?: string;
  kind: 'external' | 'internal';
  source: string;
  confidence: ConfidenceLevel;
}

/** Módulo detectado na análise de código */
export interface CodeModule {
  name: string;
  kind: string;
  files: string[];
  coupling: number;
  critical: boolean;
  confidence: ConfidenceLevel;
}

/** Candidato de domínio */
export interface DomainCandidate {
  name: string;
  evidence: string[];
  entities: string[];
  confidence: ConfidenceLevel;
}

/** Regra de negócio candidata */
export interface BusinessRuleCandidate {
  id: string;
  domain: string;
  rule: string;
  evidence: string[];
  sourceFiles: string[];
  confidence: ConfidenceLevel;
}

/** Transição de estado */
export interface StateTransition {
  from: string;
  to: string;
  trigger?: string;
  evidence: string[];
  confidence: ConfidenceLevel;
}

/** Máquina de estados candidata */
export interface StateMachineCandidate {
  entity: string;
  states: string[];
  transitions: StateTransition[];
  sourceFiles: string[];
  confidence: ConfidenceLevel;
}

/** Permissão candidata */
export interface PermissionCandidate {
  resource: string;
  action: string;
  role: string;
  source: string;
  confidence: ConfidenceLevel;
}

/** Contrato de API */
export interface ApiContract {
  method: string;
  path: string;
  controller: string;
  requestDto?: string;
  responseDto?: string;
  service?: string;
  risks: string[];
  confidence: ConfidenceLevel;
}

/** Campo de entidade */
export interface EntityField {
  name: string;
  type?: string;
  nullable?: boolean;
}

/** Item do dicionário de dados */
export interface DataDictionaryItem {
  entity: string;
  kind: 'entity' | 'table' | 'view' | 'dto';
  fields: EntityField[];
  relations: string[];
  source: string;
  confidence: ConfidenceLevel;
}

/** Lacuna identificada */
export interface GapItem {
  id: string;
  domain: string;
  description: string;
  kind: 'regra-negocio' | 'integracao' | 'permissao' | 'estado' | 'plsql' | 'geral';
  question: string;
  sourceFiles: string[];
}

/** Pergunta gerada para validação humana */
export interface QuestionItem {
  id: string;
  domain: string;
  question: string;
  context: string;
  priority: 'alta' | 'media' | 'baixa';
}

/** Linha da matriz código-spec */
export interface CodeSpecMatrixRow {
  code: string;
  spec: string;
  kind: string;
  confidence: ConfidenceLevel;
  risk: string;
  notes: string;
}

/** Linha da matriz risco-impacto */
export interface RiskImpactMatrixRow {
  risk: string;
  file: string;
  module: string;
  impact: string;
  relatedSpec: string;
  recommendation: string;
}

/** Contrato operacional de um módulo */
export interface OperationalContract {
  module: string;
  kind: string;
  responsibility: string;
  inputs: string[];
  outputs: string[];
  mainFiles: string[];
  internalDeps: string[];
  externalDeps: string[];
  knownRules: string[];
  risks: string[];
  gaps: string[];
  agentInstructions: string[];
}

/** Resultado completo da engenharia reversa */
export interface ReverseEngineeringResult {
  generatedAt: string;
  projectName: string;
  projectKind?: string;
  inventory: InventoryItem;
  dependencies: DependencyItem[];
  codeModules: CodeModule[];
  domains: DomainCandidate[];
  businessRules: BusinessRuleCandidate[];
  stateMachines: StateMachineCandidate[];
  permissions: PermissionCandidate[];
  apiContracts: ApiContract[];
  dataDictionary: DataDictionaryItem[];
  gaps: GapItem[];
  questions: QuestionItem[];
  codeSpecMatrix: CodeSpecMatrixRow[];
  riskImpactMatrix: RiskImpactMatrixRow[];
  hasPlSql: boolean;
  plsqlEntities?: PlSqlEntity[];
}

/** Entrada para os geradores de programação reversa */
export interface ReverseEngineeringInput {
  scan: ScanResult;
  inventory: ArchitectureInventory;
  graph: LightweightGraph;
  risks: RiskFinding[];
  plsql: PlSqlInventory;
  projectName: string;
  projectKind?: string;
  files?: ScannedFile[];
}
