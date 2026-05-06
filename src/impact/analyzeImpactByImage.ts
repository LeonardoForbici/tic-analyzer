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
import { ScreenImpactResult } from './impactTypes';
import { importImpactScreenshotCommand } from './importImpactScreenshot';

export async function analyzeImpactByImageCommand(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]; if (!root) return;
  const input = await importImpactScreenshotCommand(); if (!input) return;
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
  const writes: Array<[vscode.Uri,string]> = [
    [vscode.Uri.joinPath(screenDir, 'impact-by-screen.json'), JSON.stringify(result, null, 2)],
    [vscode.Uri.joinPath(screenDir, 'impact-by-screen.md'), generateImpactReport(result)],
    [vscode.Uri.joinPath(screenDir, 'files-to-edit.json'), JSON.stringify(result.fileCandidates, null, 2)],
    [vscode.Uri.joinPath(screenDir, 'safe-implementation-prompt.md'), safePrompt],
    [vscode.Uri.joinPath(screenDir, 'ai-change-package.json'), JSON.stringify(aiPackage, null, 2)],
    [vscode.Uri.joinPath(screenDir, 'ai-change-package.md'), '# Pacote Seguro para IA — Estimativa/Implementação\n\nNão assuma visão da imagem. Use metadados textuais.'],
    [vscode.Uri.joinPath(impactDir, 'latest-screen-impact.json'), JSON.stringify(result, null, 2)],
    [vscode.Uri.joinPath(impactDir, 'latest-screen-impact.md'), generateImpactReport(result)],
    [vscode.Uri.joinPath(impactDir, 'latest-ai-change-package.json'), JSON.stringify(aiPackage, null, 2)],
    [vscode.Uri.joinPath(impactDir, 'latest-ai-change-package.md'), '# Pacote Seguro para IA — Estimativa/Implementação\n\nVocê receberá um pacote filtrado de impacto técnico.']
  ];
  for (const [u, c] of writes) await vscode.workspace.fs.writeFile(u, Buffer.from(c, 'utf8'));
}
