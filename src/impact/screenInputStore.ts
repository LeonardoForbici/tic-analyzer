import * as vscode from 'vscode';
import { ScreenImpactInput } from './impactTypes';

export function getScreenDir(root: vscode.WorkspaceFolder, screenId: string): vscode.Uri {
  return vscode.Uri.joinPath(root.uri, '.tic-code', 'impact', 'screens', screenId);
}

export async function writeScreenInput(root: vscode.WorkspaceFolder, input: ScreenImpactInput): Promise<vscode.Uri> {
  const dir = getScreenDir(root, input.id);
  await vscode.workspace.fs.createDirectory(dir);
  const uri = vscode.Uri.joinPath(dir, 'screen-input.json');
  await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(input, null, 2), 'utf8'));
  return uri;
}
