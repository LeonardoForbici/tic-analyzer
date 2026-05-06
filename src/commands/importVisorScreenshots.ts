import * as vscode from 'vscode';
export async function importVisorScreenshotsCommand(): Promise<void> {
  await vscode.window.showInformationMessage('Importação de screenshots para Visor disponível via .tic-code/reversa/inputs/visor.');
}
