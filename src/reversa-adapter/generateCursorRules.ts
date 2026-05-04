import * as vscode from 'vscode';
import type { ProjectSummary } from '../types';
import type { ReversaAssets } from './reversaAssetLoader';
import { generateAgentContract } from '../reversa-engine/generateReversaAgentContracts';

export function generateCursorRules(summary: ProjectSummary, _assets: ReversaAssets, extensionUri?: vscode.Uri): string {
  return generateAgentContract(summary, {
    engine: 'cursor',
    targetFile: '.cursorrules',
    engineInstruction: 'Apply these project rules when proposing edits or generating code in Cursor.',
    compact: true
  }, extensionUri);
}
