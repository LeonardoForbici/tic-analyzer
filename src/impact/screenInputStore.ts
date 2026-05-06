import * as vscode from 'vscode';
import { ScreenImpactInput } from './impactTypes';
export async function writeScreenInput(root: vscode.WorkspaceFolder, input: ScreenImpactInput): Promise<string> {
  const dir = vscode.Uri.joinPath(root.uri, '.tic-code', 'impact'); await vscode.workspace.fs.createDirectory(dir);
  const uri = vscode.Uri.joinPath(dir, 'screen-input.json');
  await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(input, null, 2), 'utf8')); return uri.fsPath;
}
