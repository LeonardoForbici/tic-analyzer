import * as path from 'path';
import * as vscode from 'vscode';
import { normalizeRoute } from './routeMatcher';
import { buildScreenFingerprint } from './screenFingerprint';
import { ScreenImpactInput } from './impactTypes';
import { getScreenDir, writeScreenInput } from './screenInputStore';

export async function importImpactScreenshotCommand(): Promise<ScreenImpactInput | undefined> {
  const root = vscode.workspace.workspaceFolders?.[0]; if (!root) return;
  const pick = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { Images: ['png', 'jpg', 'jpeg', 'webp'] } });
  if (!pick?.[0]) return;
  const id = `screen-${Date.now()}`;
  const url = await vscode.window.showInputBox({ prompt: 'URL da tela (opcional)' });
  const changeDescription = await vscode.window.showInputBox({ prompt: 'Descrição da mudança desejada' }); if (!changeDescription) return;
  const userHints = {
    screenName: await vscode.window.showInputBox({ prompt: 'Nome da tela (opcional)' }),
    visibleTerms: (await vscode.window.showInputBox({ prompt: 'Palavras visíveis (separadas por vírgula)' }))?.split(',').map((x) => x.trim()).filter(Boolean),
    mainAction: await vscode.window.showInputBox({ prompt: 'Ação principal (opcional)' }),
    targetElement: await vscode.window.showInputBox({ prompt: 'Elemento alvo (opcional)' }),
    targetField: await vscode.window.showInputBox({ prompt: 'Campo/regra alvo (opcional)' }),
    targetRule: await vscode.window.showInputBox({ prompt: 'Regra alvo (opcional)' })
  };
  const dir = getScreenDir(root, id); const shotDir = vscode.Uri.joinPath(dir, 'screenshot'); await vscode.workspace.fs.createDirectory(shotDir);
  const fileName = path.basename(pick[0].fsPath || 'imagem-importada.png'); const dest = vscode.Uri.joinPath(shotDir, fileName);
  await vscode.workspace.fs.writeFile(dest, await vscode.workspace.fs.readFile(pick[0]));
  const input: ScreenImpactInput = { id, url, normalizedRoute: url ? normalizeRoute(url) : undefined, screenshotPath: dest.fsPath, screenshotFileName: fileName, changeDescription, userHints, createdAt: new Date().toISOString() };
  await writeScreenInput(root, input);
  const fingerprint = buildScreenFingerprint(input);
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, 'screen-fingerprint.json'), Buffer.from(JSON.stringify(fingerprint, null, 2), 'utf8'));
  return input;
}
