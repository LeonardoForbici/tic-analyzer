import * as vscode from 'vscode';
import { checkOllamaStatus, getLocalAiSettings } from '../local-ai/checkOllamaStatus';
import { enhanceAgentContext, enhanceQuestions } from '../local-ai/enhanceAgentContext';
import { enhanceModuleSummary } from '../local-ai/enhanceModuleSummary';
import {
  type LocalAiTaskLogEntry,
  OllamaClient,
  resolveModelForTask,
  TASK_LABELS
} from '../local-ai/ollamaClient';
import { getWorkspaceRoot } from './analyzeProject';

export async function enhanceWithLocalAi(): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showWarningMessage('Abra uma pasta de workspace antes de usar o Modo IA Local.');
    return;
  }

  const ticCodeDir = vscode.Uri.joinPath(root.uri, '.tic-code');
  const scanUri = vscode.Uri.joinPath(ticCodeDir, 'scan.json');
  if (!await exists(scanUri)) {
    vscode.window.showInformationMessage('Execute a análise do Modo Lite antes de usar o Modo IA Local.');
    return;
  }

  const settings = getLocalAiSettings();
  const status = await checkOllamaStatus(settings);
  if (!status.ok) {
    vscode.window.showInformationMessage(status.message);
    return;
  }

  const taskLog: LocalAiTaskLogEntry[] = [];

  /** Returns a resolved OllamaClient for the given task, or throws if no model is available. */
  function clientForTask(task: keyof typeof TASK_LABELS): OllamaClient {
    // If user explicitly set localAi.model, honour it as an override
    const override = settings.model !== settings.fastModel ? settings.model : undefined;
    const resolution = resolveModelForTask(
      task,
      settings.mode,
      settings.fastModel,
      settings.qualityModel,
      status.models,
      override
    );
    taskLog.push({
      task,
      taskLabel: TASK_LABELS[task],
      model: resolution.label,
      reason: resolution.reason,
      timestamp: new Date().toISOString()
    });
    if (!resolution.model) {
      throw new Error(`Modelo local não encontrado. Instale com: ollama pull ${settings.fastModel}`);
    }
    return new OllamaClient({ baseUrl: settings.ollamaUrl, model: resolution.model });
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `TIC Coder Lite: IA Local (modo ${settings.mode})`,
      cancellable: false
    },
    async (progress) => {
      const projectName = root.name;
      progress.report({ message: 'Lendo arquivos de contexto .tic-code' });

      const agentContext = await readText(vscode.Uri.joinPath(ticCodeDir, 'agent-context.md'));
      const risksMarkdown = await readText(vscode.Uri.joinPath(ticCodeDir, 'risks.md'));
      const architectureMarkdown = await readText(vscode.Uri.joinPath(ticCodeDir, 'architecture.md'));
      const confidenceReport = await readText(vscode.Uri.joinPath(ticCodeDir, 'confidence-report.md'));
      const modulesJson = await readText(vscode.Uri.joinPath(ticCodeDir, 'modules.json'));
      const graphJson = await readText(vscode.Uri.joinPath(ticCodeDir, 'graph.json'));
      const risksJson = await readText(vscode.Uri.joinPath(ticCodeDir, 'risks.json'));

      progress.report({ message: 'Melhorando contexto para IA' });
      const agentContextClient = clientForTask('agent-context');
      const agentContextAi = await enhanceAgentContext(agentContextClient, {
        projectName,
        agentContext,
        risksMarkdown,
        architectureMarkdown,
        confidenceReport
      });

      progress.report({ message: 'Gerando perguntas de validação humana' });
      const questionsClient = clientForTask('questions-gaps');
      const questionsAi = await enhanceQuestions(questionsClient, {
        projectName,
        agentContext,
        risksMarkdown,
        architectureMarkdown,
        confidenceReport
      });

      progress.report({ message: 'Resumindo módulos' });
      const modulesClient = clientForTask('module-summary');
      const moduleSummariesAi = await enhanceModuleSummary(modulesClient, {
        projectName,
        modulesJson,
        graphJson,
        risksJson
      });

      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(ticCodeDir, 'agent-context.ai.md'),
        Buffer.from(agentContextAi, 'utf8')
      );
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(ticCodeDir, 'questions.ai.md'),
        Buffer.from(questionsAi, 'utf8')
      );
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(ticCodeDir, 'module-summaries.ai.md'),
        Buffer.from(moduleSummariesAi, 'utf8')
      );

      // Persist task log so the WebView can display which model was used
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(ticCodeDir, 'local-ai-log.json'),
        Buffer.from(JSON.stringify(taskLog, null, 2), 'utf8')
      );
    }
  );

  const modelsUsed = [...new Set(taskLog.map((e) => e.model))].join(', ');
  vscode.window.showInformationMessage(
    `Modo IA Local concluído. Modelos usados: ${modelsUsed}. Resultados em .tic-code/`
  );
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function readText(uri: vscode.Uri): Promise<string> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return '';
  }
}
