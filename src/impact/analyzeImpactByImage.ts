import * as vscode from 'vscode';
import { detectFrontendScreen } from './frontendScreenDetector';
import { detectApiCalls } from './apiCallDetector';
import { matchBackendEndpoints } from './backendEndpointMatcher';
import { traceBackendFlow } from './backendFlowTracer';
import { traceDatabaseImpact } from './databaseImpactTracer';
import { estimateImpact } from './impactEstimator';
import { generateImpactReport } from './generateImpactReport';
import { buildScreenFingerprint } from './screenFingerprint';
import { buildAiChangePackage } from './aiChangePackageBuilder';
import { rankFileEditCandidates } from './fileEditCandidateRanker';
import { generateSafeImplementationPrompt } from './generateSafeImplementationPrompt';
import { ScreenImpactInput, ScreenImpactResult } from './impactTypes';
import { importImpactScreenshotCommand } from './importImpactScreenshot';
import { normalizeRoute } from './routeMatcher';
import { generateFilesToEditReport } from './generateFilesToEditReport';

export interface ImpactAnalysisPayload {
  url?: string; changeDescription?: string; screenName?: string; visibleTerms?: string[];
  mainAction?: string; targetElement?: string; targetField?: string; targetRule?: string;
}

export async function analyzeImpactByImageCommand(payload?: ImpactAnalysisPayload): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]; if (!root) return;
  const input = await resolveInput(payload); if (!input) return;
  const fingerprint = buildScreenFingerprint(input);
  const frontendMatches = await detectFrontendScreen(root, fingerprint);
  const apiCalls = await detectApiCalls(frontendMatches);
  const backendEndpoints = await matchBackendEndpoints(apiCalls);
  const backendFlow = await traceBackendFlow(backendEndpoints);
  const databaseImpact = await traceDatabaseImpact(backendFlow);
  const gaps = frontendMatches.length ? [] : ['🔴 LACUNA: sem match frontend'];
  const questions = ['Qual componente exato representa o elemento da imagem?'];
  const impactEstimate = estimateImpact({ frontendMatches, apiCalls, backendEndpoints, backendFlow, databaseImpact, input, gaps, questions });
  const result: ScreenImpactResult = { input, fingerprint, frontendMatches, apiCalls, backendEndpoints, backendFlow, databaseImpact, fileCandidates: [], impactEstimate, gaps, questions, generatedFiles: [] };
  result.fileCandidates = rankFileEditCandidates(result);
  const safePrompt = generateSafeImplementationPrompt(result);
  const aiPackage = buildAiChangePackage(result, safePrompt);
  const screenDir = vscode.Uri.joinPath(root.uri, '.tic-code', 'impact', 'screens', input.id);
  const impactDir = vscode.Uri.joinPath(root.uri, '.tic-code', 'impact');
  await vscode.workspace.fs.createDirectory(screenDir); await vscode.workspace.fs.createDirectory(impactDir);
  const filesToEditMd = generateFilesToEditReport(result);
  const frontTrace = { frontendMatches, apiCalls };
  const backTrace = { backendEndpoints, backendFlow };
  const dbTrace = databaseImpact;
  const aiMd = generateRichAiPackageMd(result, filesToEditMd, safePrompt);
  const writes: Array<[vscode.Uri,string]> = [
    [vscode.Uri.joinPath(screenDir, 'screen-input.json'), JSON.stringify(input, null, 2)],
    [vscode.Uri.joinPath(screenDir, 'screen-fingerprint.json'), JSON.stringify(fingerprint, null, 2)],
    [vscode.Uri.joinPath(screenDir, 'impact-by-screen.json'), JSON.stringify(result, null, 2)],
    [vscode.Uri.joinPath(screenDir, 'impact-by-screen.md'), generateImpactReport(result)],
    [vscode.Uri.joinPath(screenDir, 'files-to-edit.json'), JSON.stringify(result.fileCandidates, null, 2)],
    [vscode.Uri.joinPath(screenDir, 'files-to-edit.md'), filesToEditMd],
    [vscode.Uri.joinPath(screenDir, 'frontend-trace.json'), JSON.stringify(frontTrace, null, 2)],
    [vscode.Uri.joinPath(screenDir, 'backend-trace.json'), JSON.stringify(backTrace, null, 2)],
    [vscode.Uri.joinPath(screenDir, 'database-trace.json'), JSON.stringify(dbTrace, null, 2)],
    [vscode.Uri.joinPath(screenDir, 'safe-implementation-prompt.md'), safePrompt],
    [vscode.Uri.joinPath(screenDir, 'ai-change-package.json'), JSON.stringify(aiPackage, null, 2)],
    [vscode.Uri.joinPath(screenDir, 'ai-change-package.md'), aiMd],
    [vscode.Uri.joinPath(impactDir, 'latest-screen-impact.json'), JSON.stringify(result, null, 2)],
    [vscode.Uri.joinPath(impactDir, 'latest-screen-impact.md'), generateImpactReport(result)],
    [vscode.Uri.joinPath(impactDir, 'latest-files-to-edit.json'), JSON.stringify(result.fileCandidates, null, 2)],
    [vscode.Uri.joinPath(impactDir, 'latest-files-to-edit.md'), filesToEditMd],
    [vscode.Uri.joinPath(impactDir, 'latest-ai-change-package.json'), JSON.stringify(aiPackage, null, 2)],
    [vscode.Uri.joinPath(impactDir, 'latest-ai-change-package.md'), aiMd]
  ];
  for (const [u, c] of writes) await vscode.workspace.fs.writeFile(u, Buffer.from(c, 'utf8'));
}

async function resolveInput(payload?: ImpactAnalysisPayload): Promise<ScreenImpactInput | undefined> {
  if (!payload) {
    const url = await vscode.window.showInputBox({ prompt: 'URL da tela (opcional)' });
    const changeDescription = await vscode.window.showInputBox({ prompt: 'Descrição da mudança desejada' }); if (!changeDescription) return;
    const shouldImport = await vscode.window.showQuickPick(['Não', 'Sim'], { placeHolder: 'Deseja importar screenshot?' });
    if (shouldImport === 'Sim') {
      const imported = await importImpactScreenshotCommand();
      if (imported) return imported;
    }
    return { id: `screen-${Date.now()}`, url, normalizedRoute: url ? normalizeRoute(url) : undefined, changeDescription, userHints: {}, createdAt: new Date().toISOString() };
  }
  return { id: `screen-${Date.now()}`, url: payload.url, normalizedRoute: payload.url ? normalizeRoute(payload.url) : undefined, screenshotPath: undefined, screenshotFileName: undefined, changeDescription: payload.changeDescription ?? '', userHints: { screenName: payload.screenName, visibleTerms: payload.visibleTerms, mainAction: payload.mainAction, targetElement: payload.targetElement, targetField: payload.targetField, targetRule: payload.targetRule }, createdAt: new Date().toISOString() };
}

function generateRichAiPackageMd(result: ScreenImpactResult, filesToEditMd: string, safePrompt: string): string { return `# Pacote Seguro para IA — Estimativa/Implementação\n\n## Observação sobre imagem\nA imagem está salva localmente em:\n${result.input.screenshotPath ?? 'N/A'}\n\nEsta IA pode não conseguir visualizar imagens.\nUse os metadados textuais e rastreabilidade abaixo.\n\n## Tela\n- URL: ${result.input.url ?? 'N/A'}\n- Nome da tela: ${result.input.userHints.screenName ?? 'N/A'}\n- Screenshot path: ${result.input.screenshotPath ?? 'N/A'}\n- Palavras visíveis: ${(result.input.userHints.visibleTerms ?? []).join(', ') || 'N/A'}\n- Mudança desejada: ${result.input.changeDescription}\n\n## Impacto técnico\n- nível: ${result.impactEstimate.level}\n- score: ${result.impactEstimate.score}\n- esforço estimado: ${result.impactEstimate.estimatedEffort.label}\n- confiança: ${result.frontendMatches.length ? '🟢/🟡 misto' : '🔴 LACUNA'}\n\n${filesToEditMd}\n\n## Frontend trace\n- matches: ${result.frontendMatches.length}\n- apis: ${result.apiCalls.length}\n\n## Backend trace\n- endpoints: ${result.backendEndpoints.length}\n- fluxo: ${result.backendFlow.length}\n\n## Database trace\n- sql files: ${result.databaseImpact.sqlFiles.length}\n\n## Prompt seguro de implementação\n${safePrompt}\n`; }
