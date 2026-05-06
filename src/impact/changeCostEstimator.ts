import * as vscode from 'vscode';
export async function estimateChangeCostWithLocalAiCommand(): Promise<void> {
  vscode.window.showInformationMessage('Estimativa com IA Local: use latest-ai-change-package.md como entrada para Ollama.');
}
