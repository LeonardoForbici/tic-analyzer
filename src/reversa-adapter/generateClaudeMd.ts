import * as vscode from 'vscode';
import type { ProjectSummary } from '../types';
import type { ReversaAssets } from './reversaAssetLoader';
import { generateAgentContract } from '../reversa-engine/generateReversaAgentContracts';

export function generateClaudeMd(summary: ProjectSummary, _assets: ReversaAssets, extensionUri?: vscode.Uri): string {
  return generateAgentContract(summary, {
    engine: 'claude-code',
    targetFile: 'CLAUDE.md',
    engineInstruction: 'When the user asks you to modify this project, inspect the TIC Coder Lite context files first.',
    compact: false
  }, extensionUri);
}
