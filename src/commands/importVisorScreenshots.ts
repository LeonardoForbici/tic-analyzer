import * as vscode from 'vscode';
import * as path from 'path';
import { importVisorScreenshots } from '../reversa-engine/visor/importVisorScreenshots';
import { analyzeVisorScreenshots } from '../reversa-engine/visor/analyzeVisorScreenshots';
import { generateUiDocs } from '../reversa-engine/visor/generateUiDocs';
import { getWorkspaceRoot } from './analyzeProject';
import { updateAgentState } from './shared/updateAgentState';

export async function importVisorScreenshotsCommand(): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) return;
  try {
    const picks = await vscode.window.showOpenDialog({ canSelectMany: true, filters: { Images: ['png', 'jpg', 'jpeg', 'webp'] } });
    if (!picks?.length) {
      await updateAgentState(root, 'visor', { status: 'pending' });
      return;
    }
    const accepted = importVisorScreenshots(picks.map((p) => p.fsPath));
    const inputDir = vscode.Uri.joinPath(root.uri, '.tic-code', 'reversa', 'inputs', 'visor');
    await vscode.workspace.fs.createDirectory(inputDir);
    const copied: string[] = [];
    for (const file of accepted) {
      const dest = vscode.Uri.joinPath(inputDir, path.basename(file));
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(file));
      await vscode.workspace.fs.writeFile(dest, bytes);
      copied.push(dest.fsPath);
    }
    const analysis = analyzeVisorScreenshots(copied);
    const docs = generateUiDocs(analysis);
    const uiDir = vscode.Uri.joinPath(root.uri, '.tic-code', 'reverse-engineering', 'ui');
    await vscode.workspace.fs.createDirectory(uiDir);
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(uiDir, 'screenshots-index.md'), Buffer.from(docs.index, 'utf8'));
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(uiDir, 'ui-analysis.md'), Buffer.from(docs.analysis, 'utf8'));
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(uiDir, 'user-flows.md'), Buffer.from(docs.flows, 'utf8'));
    await updateAgentState(root, 'visor', { status: 'completed', receivedInputs: accepted.map((f) => path.basename(f)), generatedFiles: ['.tic-code/reverse-engineering/ui/screenshots-index.md', '.tic-code/reverse-engineering/ui/ui-analysis.md', '.tic-code/reverse-engineering/ui/user-flows.md'], warnings: [], errors: [] });
    vscode.window.showInformationMessage(`Visor: ${accepted.length} screenshot(s) importado(s) e documentação gerada.`);
  } catch (error) {
    await updateAgentState(root, 'visor', { status: 'failed', errors: [String(error)] });
    vscode.window.showErrorMessage('Visor: falha ao importar/analisar screenshots.');
  }
}
