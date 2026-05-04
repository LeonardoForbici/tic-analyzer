import * as vscode from 'vscode';
import type { ProjectSummary } from '../types';
import type { ReversaAssets } from './reversaAssetLoader';
import { generateAgentContract } from '../reversa-engine/generateReversaAgentContracts';

export function generateCopilotInstructions(summary: ProjectSummary, _assets: ReversaAssets, extensionUri?: vscode.Uri): string {
  return generateAgentContract(summary, {
    engine: 'github-copilot',
    targetFile: '.github/copilot-instructions.md',
    engineInstruction: 'Use these instructions as repository context for suggestions, edits, and chat answers.',
    compact: true
  }, extensionUri);
}
