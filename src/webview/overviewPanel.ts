import * as vscode from 'vscode';
import { analyzeWorkspace, getLastAnalysis, getWorkspaceRoot } from '../commands/analyzeProject';
import { getLocalAiSettings } from '../local-ai/checkOllamaStatus';
import { writeTicCodeFolder } from '../exporters/writeTicCodeFolder';
import { detectEngines } from '../reversa-adapter/detectEngines';
import type { ProjectSummary } from '../types';
import { renderOverviewHtml } from './overviewHtml';
import type { FileEditCandidate, ScreenImpactResult } from '../impact/impactTypes';

export async function openOverviewPanel(context: vscode.ExtensionContext): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showWarningMessage('Abra uma pasta de workspace antes de abrir o TIC Coder Lite.');
    return;
  }

  let summary = getLastAnalysis(context);
  if (!summary) {
    const analyzeLabel = 'Analisar Workspace';
    const action = await vscode.window.showInformationMessage('Ainda não há análise do Modo Lite. O Modo Lite funciona sem IA, banco, Docker ou servidor.', analyzeLabel);
    if (action !== analyzeLabel) {
      return;
    }
    const newSummary = await analyzeWorkspace(root);
    if (!newSummary) {
      vscode.window.showErrorMessage('Falha ao analisar workspace.');
      return;
    }
    summary = newSummary;
    await writeTicCodeFolder(root, summary, context.extensionUri);
    await context.globalState.update('ticCoderLite.lastAnalysis', summary);
  }

  const panel = vscode.window.createWebviewPanel(
    'ticCoderLiteOverview',
    'Reversa Engine — TIC Coder Lite',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  await render(panel, context, root, summary);

  panel.webview.onDidReceiveMessage(async (message) => {
    switch (message.command) {
      case 'analyzeProject':
      case 'analyzeWorkspace':
        await vscode.commands.executeCommand('ticCoderLite.analyzeProject');
        const latestAnalysis = getLastAnalysis(context);
        if (latestAnalysis) {
          summary = latestAnalysis;
          if (summary) { await render(panel, context, root, summary); }
        }
        break;
      case 'exportForCodex':
        await vscode.commands.executeCommand('ticCoderLite.exportForCodex');
        break;
      case 'exportForClaude':
        await vscode.commands.executeCommand('ticCoderLite.exportForClaude');
        break;
      case 'exportForCopilot':
        await vscode.commands.executeCommand('ticCoderLite.exportForCopilot');
        break;
      case 'exportForCursor':
        await vscode.commands.executeCommand('ticCoderLite.exportForCursor');
        break;
      case 'exportForGemini':
        await vscode.commands.executeCommand('ticCoderLite.exportForGemini');
        break;
      case 'enhanceLocalAi':
      case 'enhanceWithLocalAi':
        await vscode.commands.executeCommand('ticCoderLite.enhanceWithLocalAi');
        break;
      case 'setupBeginner':
        await applyBeginnerSetup();
        vscode.window.showInformationMessage('TIC Coder Lite: padrão recomendado aplicado. Você já pode usar Analisar Workspace.');
        break;
      case 'detectEngines':
        await vscode.commands.executeCommand('ticCoderLite.detectAiEngines');
        break;
      case 'enableLocalAi':
        await setLocalAiEnabled(true);
        vscode.window.showInformationMessage('TIC Coder Lite: IA Local ligada. Use Ollama com um modelo pequeno, como qwen2.5-coder:3b.');
        break;
      case 'disableLocalAi':
        await setLocalAiEnabled(false);
        vscode.window.showInformationMessage('TIC Coder Lite: IA Local desligada. O Modo Lite continua funcionando normalmente.');
        break;
      case 'importTracerInputs':
        await vscode.commands.executeCommand('ticCoderLite.importTracerInputs');
        break;
      case 'importVisorScreenshots':
        await vscode.commands.executeCommand('ticCoderLite.importVisorScreenshots');
        break;
      case 'analyzeImpactByImage':
        await vscode.commands.executeCommand('ticCoderLite.analyzeImpactByImage', message.payload);
        if (summary) { await render(panel, context, root, summary); }
        break;
      case 'importImpactScreenshot':
        await vscode.commands.executeCommand('ticCoderLite.importImpactScreenshot');
        if (summary) { await render(panel, context, root, summary); }
        break;
      case 'estimateChangeCostWithLocalAi':
        await vscode.commands.executeCommand('ticCoderLite.estimateChangeCostWithLocalAi');
        if (summary) { await render(panel, context, root, summary); }
        break;
      case 'exportChangePackageForPaidAi':
        await vscode.commands.executeCommand('ticCoderLite.exportChangePackageForPaidAi');
        break;

      case 'openTicCodeFolder':
        await openFolder(vscode.Uri.joinPath(root.uri, '.tic-code'));
        break;
      case 'openReverseEngineeringFolder':
        await openFolder(vscode.Uri.joinPath(root.uri, '.tic-code', 'reverse-engineering'));
        break;
      case 'openGeneratedFile':
        if (typeof message.path === 'string' && message.path.trim()) {
          await openFileFromWorkspace(root, message.path);
        }
        break;
      case 'openImpactReport':
        await openFileFromWorkspace(root, '.tic-code/impact/latest-screen-impact.md');
        break;
      case 'openImpactJson':
        await openFileFromWorkspace(root, '.tic-code/impact/latest-screen-impact.json');
        break;
      case 'openFilesToEdit':
        await openFilesToEdit(root, message.latestScreenId);
        break;
      case 'openAiChangePackage':
        await openFileFromWorkspace(root, '.tic-code/impact/latest-ai-change-package.md');
        break;
      case 'openSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:tic.tic-coder-lite');
        break;
    }
  });
}

async function applyBeginnerSetup(): Promise<void> {
  const config = vscode.workspace.getConfiguration('ticCoderLite');
  const target = vscode.ConfigurationTarget.Workspace;
  await config.update('localAi.enabled', false, target);
  await config.update('scan.maxFiles', 30000, target);
  await config.update('scan.maxFileSizeKb', 512, target);
  await config.update('output.openAfterScan', false, target);
  await config.update('exports.safeWriteMode', 'ask', target);
}

async function setLocalAiEnabled(enabled: boolean): Promise<void> {
  const config = vscode.workspace.getConfiguration('ticCoderLite');
  await config.update('localAi.enabled', enabled, vscode.ConfigurationTarget.Workspace);
  if (enabled) {
    const currentModel = config.get<string>('localAi.model', '');
    if (!currentModel) {
      await config.update('localAi.model', 'qwen2.5-coder:3b', vscode.ConfigurationTarget.Workspace);
    }
    await config.update('localAi.ollamaUrl', 'http://localhost:11434', vscode.ConfigurationTarget.Workspace);
  }
}

async function render(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, root: vscode.WorkspaceFolder, summary: ProjectSummary): Promise<void> {
  const engines = await detectEngines(root.uri.fsPath);
  const agentContextPreview = await readTextIfExists(vscode.Uri.joinPath(root.uri, '.tic-code', 'agent-context.md'));
  const localAiLogRaw = await readTextIfExists(vscode.Uri.joinPath(root.uri, '.tic-code', 'local-ai-log.json'));
  let localAiTaskLog: import('../local-ai/ollamaClient').LocalAiTaskLogEntry[] | undefined;
  if (localAiLogRaw) {
    try {
      localAiTaskLog = JSON.parse(localAiLogRaw) as import('../local-ai/ollamaClient').LocalAiTaskLogEntry[];
    } catch {
      localAiTaskLog = undefined;
    }
  }
  const aiSettings = getLocalAiSettings();
  const localAiConfig = {
    model: aiSettings.model,
    fastModel: aiSettings.fastModel,
    qualityModel: aiSettings.qualityModel,
    mode: aiSettings.mode,
    enabled: aiSettings.enabled
  };
  const reversaData = await loadReversaData(root);
  const impactData = await loadImpactData(root);
  panel.webview.html = renderOverviewHtml({
    summary,
    engines,
    agentContextPreview: agentContextPreview.slice(0, 2600),
    nonce: getNonce(),
    localAiTaskLog,
    localAiConfig,
    reversaData,
    impactData
  });
  await context.globalState.update('ticCoderLite.lastAnalysis', summary);
}

async function loadImpactData(root: vscode.WorkspaceFolder): Promise<{
  latestImpact: ScreenImpactResult | null;
  latestAiPackage: Record<string, unknown> | null;
  latestCostEstimate: Record<string, unknown> | null;
  latestFilesToEdit: FileEditCandidate[] | null;
}> {
  const parseJson = async <T>(uri: vscode.Uri): Promise<T | null> => {
    try {
      const content = await readTextIfExists(uri);
      if (!content.trim()) return null;
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  };
  const impactDir = vscode.Uri.joinPath(root.uri, '.tic-code', 'impact');
  return {
    latestImpact: await parseJson<ScreenImpactResult>(vscode.Uri.joinPath(impactDir, 'latest-screen-impact.json')),
    latestAiPackage: await parseJson<Record<string, unknown>>(vscode.Uri.joinPath(impactDir, 'latest-ai-change-package.json')),
    latestCostEstimate: await parseJson<Record<string, unknown>>(vscode.Uri.joinPath(impactDir, 'latest-cost-estimate.json')),
    latestFilesToEdit: await parseJson<FileEditCandidate[]>(vscode.Uri.joinPath(impactDir, 'latest-files-to-edit.json'))
  };
}

async function loadReversaData(root: vscode.WorkspaceFolder): Promise<{
  state: Record<string, unknown> | null;
  graph: { nodes?: unknown[]; edges?: unknown[] } | null;
  modules: unknown[] | null;
  risks: unknown[] | null;
}> {
  const parseJson = async <T>(uri: vscode.Uri): Promise<T | null> => {
    try {
      const content = await readTextIfExists(uri);
      if (!content.trim()) return null;
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  };

  const base = vscode.Uri.joinPath(root.uri, '.tic-code', 'reversa');
  const state = await parseJson<Record<string, unknown>>(vscode.Uri.joinPath(base, 'state.json'));
  const graph = await parseJson<{ nodes?: unknown[]; edges?: unknown[] }>(vscode.Uri.joinPath(base, 'context', 'graph.json'));
  const modules = await parseJson<unknown[]>(vscode.Uri.joinPath(base, 'context', 'modules.json'));
  const risks = await parseJson<unknown[]>(vscode.Uri.joinPath(base, 'context', 'risks.json'));
  return { state, graph, modules, risks };
}

async function readTextIfExists(uri: vscode.Uri): Promise<string> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return '';
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}


async function openFolder(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.commands.executeCommand('revealFileInOS', uri);
  } catch {
    vscode.window.showWarningMessage('Pasta indisponível no workspace atual.');
  }
}

async function openFileFromWorkspace(root: vscode.WorkspaceFolder, relativePath: string): Promise<void> {
  const clean = relativePath.replace(/^\/+/, '');
  const parts = clean.split('/').filter(Boolean);
  const target = vscode.Uri.joinPath(root.uri, ...parts);
  try {
    await vscode.workspace.fs.stat(target);
    const doc = await vscode.workspace.openTextDocument(target);
    await vscode.window.showTextDocument(doc, { preview: false });
  } catch {
    vscode.window.showWarningMessage(`Arquivo não gerado ainda: ${relativePath}`);
  }
}

async function openFilesToEdit(root: vscode.WorkspaceFolder, latestScreenId?: string): Promise<void> {
  const latestPath = '.tic-code/impact/latest-files-to-edit.md';
  const fallbackPath = `.tic-code/impact/screens/${latestScreenId || ''}/files-to-edit.md`;
  const latestUri = vscode.Uri.joinPath(root.uri, ...latestPath.split('/'));
  try {
    await vscode.workspace.fs.stat(latestUri);
    await openFileFromWorkspace(root, latestPath);
    return;
  } catch {
    await openFileFromWorkspace(root, fallbackPath);
  }
}
