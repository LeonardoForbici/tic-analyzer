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

export async function writeLatestScreenInput(root: vscode.WorkspaceFolder, input: ScreenImpactInput): Promise<void> {
  const latest = {
    screenId: input.id,
    screenshotPath: input.screenshotPath,
    screenshotFileName: input.screenshotFileName,
    createdAt: input.createdAt,
    input
  };
  const uri = vscode.Uri.joinPath(root.uri, '.tic-code', 'impact', 'latest-screen-input.json');
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root.uri, '.tic-code', 'impact'));
  await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(latest, null, 2), 'utf8'));
}

export async function readScreenInput(root: vscode.WorkspaceFolder, screenId: string): Promise<ScreenImpactInput | undefined> {
  try {
    const uri = vscode.Uri.joinPath(root.uri, '.tic-code', 'impact', 'screens', screenId, 'screen-input.json');
    const raw = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
    return JSON.parse(raw) as ScreenImpactInput;
  } catch {
    return undefined;
  }
}

export async function readLatestScreenInput(root: vscode.WorkspaceFolder): Promise<ScreenImpactInput | undefined> {
  try {
    const uri = vscode.Uri.joinPath(root.uri, '.tic-code', 'impact', 'latest-screen-input.json');
    const raw = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
    const latest = JSON.parse(raw) as { screenId?: string; input?: ScreenImpactInput };
    if (latest.input) return latest.input;
    if (latest.screenId) return readScreenInput(root, latest.screenId);
    return undefined;
  } catch {
    return undefined;
  }
}
