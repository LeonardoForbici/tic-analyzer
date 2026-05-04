import * as vscode from 'vscode';
import { generateAgentContextMd } from '../exporters/generateAgentContextMd';
import { writeTicCodeFolder } from '../exporters/writeTicCodeFolder';
import { AgentContext, ProjectSummary } from '../types';
import { analyzeWorkspace, getLastAnalysis, getWorkspaceRoot } from './analyzeProject';

export async function generateAgentContext(context: vscode.ExtensionContext): Promise<AgentContext | undefined> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showWarningMessage('Abra uma pasta de workspace antes de gerar o contexto para IA.');
    return undefined;
  }

  const summary = getLastAnalysis(context) ?? await analyzeWorkspace(root);
  const agentContext = buildAgentContext(summary);
  const artifacts = await writeTicCodeFolder(root, summary, context.extensionUri);

  await context.globalState.update('ticCoderLite.lastAnalysis', summary);
  vscode.commands.executeCommand('ticCoderLite.refreshSidebar');

  const document = await vscode.workspace.openTextDocument(artifacts.agentContextMd);
  await vscode.window.showTextDocument(document, { preview: false });
  vscode.window.showInformationMessage('Modo Lite gerou .tic-code/agent-context.md sem IA.');
  return agentContext;
}

export function buildAgentContext(summary: ProjectSummary): AgentContext {
  return { summary, markdown: generateAgentContextMd(summary) };
}
