import * as vscode from 'vscode';
import { buildAiChangePackage } from './aiChangePackageBuilder';
import { detectApiCalls } from './apiCallDetector';
import { matchBackendEndpoints } from './backendEndpointMatcher';
import { traceBackendFlow } from './backendFlowTracer';
import { traceDatabaseImpact } from './databaseImpactTracer';
import { detectFrontendScreen } from './frontendScreenDetector';
import { generateFilesToEditReport } from './generateFilesToEditReport';
import { generateImpactReport } from './generateImpactReport';
import { generateSafeImplementationPrompt } from './generateSafeImplementationPrompt';
import { estimateImpact } from './impactEstimator';
import { ScreenFingerprint, ScreenImpactInput, ScreenImpactResult } from './impactTypes';
import { importImpactScreenshotCommand } from './importImpactScreenshot';
import { rankFileEditCandidates } from './fileEditCandidateRanker';
import { normalizeRoute } from './routeMatcher';
import { buildScreenFingerprint } from './screenFingerprint';
import { readLatestScreenInput } from './screenInputStore';

export interface ImpactAnalysisPayload {
  url?: string;
  changeDescription?: string;
  screenName?: string;
  visibleTerms?: string[];
  mainAction?: string;
  targetElement?: string;
  targetField?: string;
  targetRule?: string;
  id?: string;
  screenshotPath?: string;
  screenshotFileName?: string;
  createdAt?: string;
  useLatestScreenInput?: boolean;
}

export async function analyzeImpactByImageCommand(payload?: ImpactAnalysisPayload): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) return;

  const input = await resolveInput(root, payload);
  if (!input) return;

  const fingerprint = buildScreenFingerprint(input);
  const frontendMatches = await detectFrontendScreen(root, fingerprint);
  const apiCalls = await detectApiCalls(frontendMatches);
  const backendEndpoints = await matchBackendEndpoints(apiCalls);
  const backendFlow = await traceBackendFlow(backendEndpoints);
  const databaseImpact = await traceDatabaseImpact(backendFlow);
  const gaps = buildGaps(input, fingerprint, frontendMatches.length);
  const questions = buildQuestions(input, fingerprint, frontendMatches.length);
  const impactEstimate = estimateImpact({ frontendMatches, apiCalls, backendEndpoints, backendFlow, databaseImpact, input, gaps, questions });
  const generatedFiles = buildGeneratedFiles(input.id);
  const result: ScreenImpactResult = {
    input,
    fingerprint,
    frontendMatches,
    apiCalls,
    backendEndpoints,
    backendFlow,
    databaseImpact,
    fileCandidates: [],
    impactEstimate,
    gaps,
    questions,
    generatedFiles
  };
  result.fileCandidates = rankFileEditCandidates(result);

  const safePrompt = generateSafeImplementationPrompt(result);
  const aiPackage = buildAiChangePackage(result, safePrompt);
  const screenDir = vscode.Uri.joinPath(root.uri, '.tic-code', 'impact', 'screens', input.id);
  const impactDir = vscode.Uri.joinPath(root.uri, '.tic-code', 'impact');
  await vscode.workspace.fs.createDirectory(screenDir);
  await vscode.workspace.fs.createDirectory(impactDir);

  const filesToEditMd = generateFilesToEditReport(result);
  const frontTrace = { frontendMatches, apiCalls, visualRecognition: fingerprint.visualRecognition, localVision: fingerprint.localVision };
  const backTrace = { backendEndpoints, backendFlow };
  const dbTrace = databaseImpact;
  const aiMd = generateRichAiPackageMd(result, filesToEditMd, safePrompt);
  const writes: Array<[vscode.Uri, string]> = [
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
  for (const [uri, content] of writes) {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  }

  vscode.window.showInformationMessage(`Impacto por tela: ${frontendMatches.length} match(es) frontend, score ${impactEstimate.score}.`);
}

async function resolveInput(root: vscode.WorkspaceFolder, payload?: ImpactAnalysisPayload): Promise<ScreenImpactInput | undefined> {
  if (payload?.useLatestScreenInput) {
    const latest = await readLatestScreenInput(root);
    if (!latest) {
      vscode.window.showWarningMessage('Nenhum screenshot de impacto importado ainda.');
      return undefined;
    }
    return latest;
  }

  if (!payload) {
    const shouldImport = await vscode.window.showQuickPick(['Sim', 'Nao'], { placeHolder: 'Deseja importar screenshot antes da analise?' });
    if (shouldImport === 'Sim') {
      return importImpactScreenshotCommand();
    }
    const url = await vscode.window.showInputBox({ prompt: 'URL da tela (opcional)' });
    const changeDescription = await vscode.window.showInputBox({ prompt: 'Descricao da mudanca desejada' });
    if (!changeDescription) return undefined;
    return {
      id: `screen-${Date.now()}`,
      url,
      normalizedRoute: url ? normalizeRoute(url) : undefined,
      changeDescription,
      userHints: {},
      createdAt: new Date().toISOString()
    };
  }

  return {
    id: payload.id ?? `screen-${Date.now()}`,
    url: clean(payload.url),
    normalizedRoute: payload.url ? normalizeRoute(payload.url) : undefined,
    screenshotPath: clean(payload.screenshotPath),
    screenshotFileName: clean(payload.screenshotFileName),
    changeDescription: payload.changeDescription ?? '',
    userHints: {
      screenName: clean(payload.screenName),
      visibleTerms: payload.visibleTerms,
      mainAction: clean(payload.mainAction),
      targetElement: clean(payload.targetElement),
      targetField: clean(payload.targetField),
      targetRule: clean(payload.targetRule)
    },
    createdAt: payload.createdAt ?? new Date().toISOString()
  };
}

function buildGaps(input: ScreenImpactInput, fingerprint: ScreenFingerprint, frontendMatchCount: number): string[] {
  const gaps: string[] = [];
  if (!input.screenshotPath) gaps.push('GAP: screenshot nao importado; analise depende de URL e pistas textuais.');
  if (!frontendMatchCount) gaps.push('GAP: sem match frontend para rota/fingerprint visual.');
  if (!fingerprint.candidateKeywords.length) gaps.push('GAP: sem termos candidatos suficientes para correlacionar tela e codigo.');
  for (const warning of fingerprint.visualRecognition?.warnings ?? []) {
    if (warning.startsWith('GAP:')) gaps.push(warning);
  }
  for (const warning of fingerprint.localVision?.warnings ?? []) {
    if (warning.startsWith('GAP:')) gaps.push(warning);
  }
  return [...new Set(gaps)];
}

function buildQuestions(input: ScreenImpactInput, fingerprint: ScreenFingerprint, frontendMatchCount: number): string[] {
  const questions: string[] = [];
  if (!input.screenshotPath) questions.push('Importar screenshot da tela para aumentar a confianca do mapeamento?');
  if (!input.normalizedRoute) questions.push('Qual rota/URL real representa esta tela?');
  if (!input.userHints.targetElement) questions.push('Qual componente ou elemento da tela e o alvo da mudanca?');
  if (!frontendMatchCount) questions.push('Qual arquivo frontend renderiza esta tela?');
  if (fingerprint.visualRecognition) {
    questions.push(`Confirmar se a tela inferida "${fingerprint.visualRecognition.probableScreen}" esta correta.`);
  }
  if (fingerprint.localVision?.confidence === 'INFERRED') {
    questions.push('Confirmar textos e elementos extraidos pela visao local antes de tratar como regra.');
  }
  return [...new Set(questions)];
}

function buildGeneratedFiles(screenId: string): string[] {
  const base = `.tic-code/impact/screens/${screenId}`;
  return [
    `${base}/screen-input.json`,
    `${base}/screen-fingerprint.json`,
    `${base}/impact-by-screen.json`,
    `${base}/impact-by-screen.md`,
    `${base}/files-to-edit.json`,
    `${base}/files-to-edit.md`,
    `${base}/frontend-trace.json`,
    `${base}/backend-trace.json`,
    `${base}/database-trace.json`,
    `${base}/safe-implementation-prompt.md`,
    `${base}/ai-change-package.json`,
    `${base}/ai-change-package.md`,
    '.tic-code/impact/latest-screen-impact.json',
    '.tic-code/impact/latest-screen-impact.md',
    '.tic-code/impact/latest-files-to-edit.json',
    '.tic-code/impact/latest-files-to-edit.md',
    '.tic-code/impact/latest-ai-change-package.json',
    '.tic-code/impact/latest-ai-change-package.md'
  ];
}

function generateRichAiPackageMd(result: ScreenImpactResult, filesToEditMd: string, safePrompt: string): string {
  const visual = result.fingerprint.visualRecognition;
  const localVision = result.fingerprint.localVision;
  const metadata = result.fingerprint.screenshotMetadata;
  return `# Pacote Seguro para IA - Estimativa/Implementacao

## Observacao sobre imagem
A imagem esta salva localmente em:
${result.input.screenshotPath ?? 'N/A'}

Esta IA pode nao conseguir visualizar imagens. Use os metadados textuais, reconhecimento local e rastreabilidade abaixo.

## Tela
- URL: ${result.input.url ?? 'N/A'}
- Nome da tela: ${result.input.userHints.screenName ?? visual?.probableScreen ?? 'N/A'}
- Screenshot path: ${result.input.screenshotPath ?? 'N/A'}
- Dimensao: ${metadata.width && metadata.height ? `${metadata.width}x${metadata.height}` : 'N/A'}
- Viewport: ${metadata.viewport ?? 'N/A'}
- Assinatura visual: ${metadata.visualSignature ?? 'N/A'}
- Reconhecimento: ${visual ? `${visual.probableScreen} / ${visual.screenType} / ${visual.uiState}` : 'N/A'}
- Vision local: ${localVision ? `${localVision.model ?? 'N/A'} / ${localVision.confidence}` : 'N/A'}
- Textos vision: ${(localVision?.visibleText ?? []).join(', ') || 'N/A'}
- Palavras visiveis/candidatas: ${(result.input.userHints.visibleTerms ?? result.fingerprint.candidateKeywords).join(', ') || 'N/A'}
- Mudanca desejada: ${result.input.changeDescription}

## Impacto tecnico
- nivel: ${result.impactEstimate.level}
- score: ${result.impactEstimate.score}
- esforco estimado: ${result.impactEstimate.estimatedEffort.label}
- confianca: ${result.frontendMatches.length ? 'mista CONFIRMED/INFERRED' : 'GAP'}

${filesToEditMd}

## Frontend trace
- matches: ${result.frontendMatches.length}
- apis: ${result.apiCalls.length}
- sinais visuais: ${(visual?.signals ?? []).join(' | ') || 'N/A'}
- sinais vision: ${(localVision?.uiElements ?? []).join(' | ') || 'N/A'}

## Backend trace
- endpoints: ${result.backendEndpoints.length}
- fluxo: ${result.backendFlow.length}

## Database trace
- sql files: ${result.databaseImpact.sqlFiles.length}

## Prompt seguro de implementacao
${safePrompt}
`;
}

function clean(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
