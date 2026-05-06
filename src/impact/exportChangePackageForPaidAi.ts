import * as vscode from 'vscode';
export async function exportChangePackageForPaidAiCommand(): Promise<void> {
  const root=vscode.workspace.workspaceFolders?.[0]; if(!root) return;
  const uri=vscode.Uri.joinPath(root.uri,'.tic-code','impact','latest-ai-change-package.md');
  try { const doc=await vscode.workspace.openTextDocument(uri); await vscode.window.showTextDocument(doc); }
  catch { vscode.window.showWarningMessage('Pacote ainda não gerado. Rode Analisar Impacto por Imagem/Tela.'); }
}
