import * as path from 'path';
import * as vscode from 'vscode';
import { analyzeScreenshotWithLocalVision } from '../reversa-engine/visor/localVision';
import { analyzeScreenshotFile } from '../reversa-engine/visor/screenshotRecognition';
import { buildScreenFingerprint } from './screenFingerprint';
import { ScreenImpactInput } from './impactTypes';
import { normalizeRoute } from './routeMatcher';
import { getScreenDir, writeLatestScreenInput, writeScreenInput } from './screenInputStore';

export async function importImpactScreenshotCommand(): Promise<ScreenImpactInput | undefined> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) return undefined;

  const pick = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { Images: ['png', 'jpg', 'jpeg', 'webp'] },
    title: 'Impacto por tela: importar screenshot'
  });
  if (!pick?.[0]) return undefined;

  const id = `screen-${Date.now()}`;
  const recognition = analyzeScreenshotFile(pick[0].fsPath);
  const url = await vscode.window.showInputBox({ prompt: 'URL da tela (opcional)' });
  const changeDescription = await vscode.window.showInputBox({
    prompt: 'Descricao da mudanca desejada',
    placeHolder: 'Ex: ajustar validacao do campo limite de credito'
  });
  if (!changeDescription) return undefined;

  const inferredScreenName = recognition.probableScreen !== 'Tela nao identificada' ? recognition.probableScreen : undefined;
  const visibleTermsDefault = recognition.candidateTerms.slice(0, 14).join(', ');
  const visibleTermsRaw = await vscode.window.showInputBox({
    prompt: 'Palavras visiveis/candidatas (separadas por virgula)',
    value: visibleTermsDefault
  });
  const visibleTerms = parseCommaList(visibleTermsRaw);

  const userHints = {
    screenName: await vscode.window.showInputBox({ prompt: 'Nome da tela (opcional)', value: inferredScreenName }),
    visibleTerms: visibleTerms.length ? visibleTerms : recognition.candidateTerms,
    mainAction: await vscode.window.showInputBox({ prompt: 'Acao principal (opcional)', value: recognition.primaryAction }),
    targetElement: await vscode.window.showInputBox({ prompt: 'Elemento alvo (opcional)', value: recognition.screenType !== 'unknown' ? recognition.screenType : undefined }),
    targetField: await vscode.window.showInputBox({ prompt: 'Campo/regra alvo (opcional)' }),
    targetRule: await vscode.window.showInputBox({ prompt: 'Regra alvo (opcional)' })
  };

  const dir = getScreenDir(root, id);
  const shotDir = vscode.Uri.joinPath(dir, 'screenshot');
  await vscode.workspace.fs.createDirectory(shotDir);
  const fileName = path.basename(pick[0].fsPath || 'imagem-importada.png');
  const dest = vscode.Uri.joinPath(shotDir, fileName);
  await vscode.workspace.fs.writeFile(dest, await vscode.workspace.fs.readFile(pick[0]));
  const localVision = await analyzeScreenshotWithLocalVision(dest.fsPath, recognition);

  const input: ScreenImpactInput = {
    id,
    url,
    normalizedRoute: url ? normalizeRoute(url) : undefined,
    screenshotPath: dest.fsPath,
    screenshotFileName: fileName,
    changeDescription,
    userHints,
    localVision,
    createdAt: new Date().toISOString()
  };
  await writeScreenInput(root, input);
  await writeLatestScreenInput(root, input);
  const fingerprint = buildScreenFingerprint(input);
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, 'screen-fingerprint.json'), Buffer.from(JSON.stringify(fingerprint, null, 2), 'utf8'));
  return input;
}

function parseCommaList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
