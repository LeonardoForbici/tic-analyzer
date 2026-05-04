import * as vscode from 'vscode';
import type { ProjectSummary } from '../types';
import type { ReversaAssets } from './reversaAssetLoader';
import { generateAgentContract } from '../reversa-engine/generateReversaAgentContracts';

export function generateGeminiMd(summary: ProjectSummary, _assets: ReversaAssets, extensionUri?: vscode.Uri): string {
  return generateAgentContract(summary, {
    engine: 'gemini-cli',
    targetFile: 'GEMINI.md',
    engineInstruction: 'Use this local context before answering or modifying files through Gemini CLI.',
    compact: false
  }, extensionUri);
}
