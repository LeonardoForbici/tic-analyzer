/**
 * Centraliza todos os caminhos do motor Reversa embutido no TIC Coder Lite.
 * Créditos: Reversa by Sandeco — MIT License (adapted)
 *
 * Mapeamentos obrigatórios:
 *   .reversa/          → .tic-code/reversa/
 *   _reversa_sdd/      → .tic-code/reverse-engineering/
 */

import * as path from 'node:path';
import * as vscode from 'vscode';

// ── Caminhos dos assets embutidos em resources/reversa/ ──────────────────────

export function getReversaResourcesBase(extensionUri: vscode.Uri): string {
  return path.join(extensionUri.fsPath, 'resources', 'reversa');
}

export function getAgentSkillPath(extensionUri: vscode.Uri, agentName: string): string {
  return path.join(getReversaResourcesBase(extensionUri), 'agents', agentName, 'SKILL.md');
}

export function getManifestPath(extensionUri: vscode.Uri): string {
  return path.join(getReversaResourcesBase(extensionUri), 'lib', 'manifest.json');
}

export function getSddTemplatePath(extensionUri: vscode.Uri): string {
  return path.join(getReversaResourcesBase(extensionUri), 'templates', 'sdd-template.md');
}

// ── Caminhos de saída dentro de .tic-code/ ───────────────────────────────────

/** Raiz do .tic-code/reversa/ — equivalente ao .reversa/ do Reversa original */
export const REVERSA_DIR = '.tic-code/reversa' as const;

/** Pasta de saída SDD — equivalente ao _reversa_sdd/ do Reversa original */
export const SDD_DIR = '.tic-code/reverse-engineering' as const;

/** Pasta de contexto estruturado — equivalente ao .reversa/context/ */
export const CONTEXT_DIR = '.tic-code/reversa/context' as const;

/** Pasta de configuração interna */
export const CONFIG_DIR = '.tic-code/reversa/_config' as const;

// Arquivos do estado do motor
export const STATE_FILE = `${REVERSA_DIR}/state.json` as const;
export const CONFIG_FILE = `${REVERSA_DIR}/config.json` as const;
export const PLAN_FILE = `${REVERSA_DIR}/plan.md` as const;
export const VERSION_FILE = `${REVERSA_DIR}/version` as const;

// Arquivos de contexto
export const SURFACE_JSON = `${CONTEXT_DIR}/surface.json` as const;
export const MODULES_JSON = `${CONTEXT_DIR}/modules.json` as const;
export const GRAPH_JSON = `${CONTEXT_DIR}/graph.json` as const;
export const RISKS_JSON = `${CONTEXT_DIR}/risks.json` as const;
export const WORKSPACE_SUMMARY_JSON = `${CONTEXT_DIR}/workspace-summary.json` as const;

// Arquivos de configuração interna
export const MANIFEST_FILE = `${CONFIG_DIR}/manifest.yaml` as const;
export const FILES_MANIFEST_JSON = `${CONFIG_DIR}/files-manifest.json` as const;

// Arquivos SDD principais
export const SDD_FILES = {
  inventory: `${SDD_DIR}/inventory.md`,
  dependencies: `${SDD_DIR}/dependencies.md`,
  codeAnalysis: `${SDD_DIR}/code-analysis.md`,
  dataDictionary: `${SDD_DIR}/data-dictionary.md`,
  domain: `${SDD_DIR}/domain.md`,
  stateMachines: `${SDD_DIR}/state-machines.md`,
  permissions: `${SDD_DIR}/permissions.md`,
  architecture: `${SDD_DIR}/architecture.md`,
  c4Context: `${SDD_DIR}/c4-context.md`,
  c4Containers: `${SDD_DIR}/c4-containers.md`,
  c4Components: `${SDD_DIR}/c4-components.md`,
  erdComplete: `${SDD_DIR}/erd-complete.md`,
  confidenceReport: `${SDD_DIR}/confidence-report.md`,
  gaps: `${SDD_DIR}/gaps.md`,
  questions: `${SDD_DIR}/questions.md`,
  dynamic: `${SDD_DIR}/dynamic.md`,
  operationalContracts: `${SDD_DIR}/operational-contracts.md`,
  businessRules: `${SDD_DIR}/business-rules.md`,
  traceabilitySpecImpact: `${SDD_DIR}/traceability/spec-impact-matrix.md`,
  traceabilityCodeSpec: `${SDD_DIR}/traceability/code-spec-matrix.md`,
  traceabilityRiskImpact: `${SDD_DIR}/traceability/risk-impact-matrix.md`
} as const;

// Subpastas SDD
export const SDD_DIRS = [
  `${SDD_DIR}/sdd`,
  `${SDD_DIR}/openapi`,
  `${SDD_DIR}/user-stories`,
  `${SDD_DIR}/adrs`,
  `${SDD_DIR}/flowcharts`,
  `${SDD_DIR}/sequences`,
  `${SDD_DIR}/ui`,
  `${SDD_DIR}/database`,
  `${SDD_DIR}/design-system`,
  `${SDD_DIR}/traceability`
] as const;

/** Resolve um caminho SDD relativo à raiz do workspace */
export function resolveSddPath(workspaceRoot: string, relativePath: string): string {
  return path.join(workspaceRoot, relativePath);
}

/** Retorna vscode.Uri para um caminho dentro do workspace */
export function toWorkspaceUri(workspaceFolder: vscode.WorkspaceFolder, relativePath: string): vscode.Uri {
  return vscode.Uri.joinPath(workspaceFolder.uri, ...relativePath.split('/'));
}
