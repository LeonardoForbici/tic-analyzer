import * as vscode from 'vscode';
export async function importTracerInputsCommand(): Promise<void> {
  await vscode.window.showInformationMessage('Importação de logs/traces para Tracer disponível via .tic-code/reversa/inputs/tracer.');
}
