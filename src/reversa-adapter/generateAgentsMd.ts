import * as vscode from 'vscode';
import type { ProjectSummary } from '../types';
import type { ReversaAssets } from './reversaAssetLoader';
import { generateAgentContract } from '../reversa-engine/generateReversaAgentContracts';

export function generateAgentsMd(summary: ProjectSummary, _assets: ReversaAssets, extensionUri?: vscode.Uri): string {
  return generateAgentContract(summary, {
    engine: 'codex',
    targetFile: 'AGENTS.md',
    engineInstruction: 'Leia este arquivo antes de planejar ou editar.',
    compact: false
  }, extensionUri);
}

/** @deprecated Use generateAgentContract diretamente */
export function baseEngineContext(
  engineName: string,
  targetFile: string,
  summary: ProjectSummary,
  engineInstruction: string,
  _assets?: ReversaAssets,
  extensionUri?: vscode.Uri
): string {
  // Map legacy engine names to AgentContractEngine
  const engineMap: Record<string, 'codex' | 'claude-code' | 'github-copilot' | 'cursor' | 'gemini-cli' | 'aider'> = {
    'Codex': 'codex',
    'Claude Code': 'claude-code',
    'GitHub Copilot': 'github-copilot',
    'Cursor': 'cursor',
    'Gemini CLI': 'gemini-cli',
    'Aider': 'aider'
  };
  const engine = engineMap[engineName] ?? 'codex';
  return generateAgentContract(summary, { engine, targetFile, engineInstruction, compact: false }, extensionUri);
}
