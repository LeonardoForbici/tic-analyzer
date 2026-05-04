import * as path from 'node:path';
import * as vscode from 'vscode';
import { writeTicCodeFolder } from '../exporters/writeTicCodeFolder';
import { buildGraph } from '../scanner/buildGraph';
import { detectStack } from '../scanner/detectStack';
import { detectRisks } from '../scanner/detectRisks';
import { scanWorkspace } from '../scanner/scanWorkspace';
import { AgentEngine, ProjectSummary } from '../types';
import { getTicCoderLiteConfig } from '../utils/config';
import { logError, logInfo, logWarn, showOutputChannel } from '../utils/outputChannel';
import { getWorkspaceRoot } from '../utils/workspace';

export { getWorkspaceRoot } from '../utils/workspace';

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript React',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript React',
  '.java': 'Java',
  '.sql': 'SQL / PL/SQL',
  '.pks': 'Oracle PL/SQL',
  '.pkb': 'Oracle PL/SQL',
  '.prc': 'Oracle PL/SQL',
  '.fnc': 'Oracle PL/SQL',
  '.pkg': 'Oracle PL/SQL',
  '.trg': 'Oracle PL/SQL',
  '.pls': 'Oracle PL/SQL',
  '.plsql': 'Oracle PL/SQL',
  '.json': 'JSON',
  '.xml': 'XML',
  '.yml': 'YAML',
  '.yaml': 'YAML',
  '.md': 'Markdown'
};

const AGENT_ENGINES: Array<Omit<AgentEngine, 'detected'>> = [
  { id: 'codex', name: 'Codex', entryFile: 'AGENTS.md' },
  { id: 'claude-code', name: 'Claude Code', entryFile: 'CLAUDE.md' },
  { id: 'cursor', name: 'Cursor', entryFile: '.cursorrules' },
  { id: 'gemini-cli', name: 'Gemini CLI', entryFile: 'GEMINI.md' },
  { id: 'github-copilot', name: 'GitHub Copilot', entryFile: '.github/copilot-instructions.md' },
  { id: 'aider', name: 'Aider', entryFile: 'CONVENTIONS.md' }
];

const PACKAGE_MANAGER_FILES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'requirements.txt',
  'pyproject.toml',
  'poetry.lock',
  'pom.xml',
  'build.gradle',
  'Cargo.toml',
  'go.mod'
];

const KEY_FILE_NAMES = new Set([
  'package.json',
  'tsconfig.json',
  'README.md',
  'pyproject.toml',
  'requirements.txt',
  'pom.xml',
  'build.gradle',
  'Cargo.toml',
  'go.mod',
  'docker-compose.yml',
  'AGENTS.md',
  'CLAUDE.md'
]);

export async function analyzeProject(context: vscode.ExtensionContext): Promise<ProjectSummary | undefined> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showWarningMessage('Abra uma pasta de workspace antes de executar o TIC Coder Lite.');
    return undefined;
  }

  const config = getTicCoderLiteConfig();
  logInfo(`Análise do workspace iniciada em ${root.uri.fsPath}`);
  logInfo(`Limites do scan: maxFiles=${config.scan.maxFiles}, maxFileSizeKb=${config.scan.maxFileSizeKb}`);

  try {
    const summary = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'TIC Coder Lite: analisando workspace',
        cancellable: true
      },
      async (progress, token) => analyzeWorkspaceInternal(root, { progress, token })
    );

    progressLogWriteArtifacts();
    await writeTicCodeFolder(root, summary, context.extensionUri);
    await context.globalState.update('ticCoderLite.lastAnalysis', summary);
    vscode.commands.executeCommand('ticCoderLite.refreshSidebar');

    if (config.output.openAfterScan) {
      showOutputChannel();
    }

    logInfo(`Análise do workspace concluída: ${summary.totalFiles} arquivos, ${summary.totalLines} linhas, ${summary.risks.summary.total} riscos, ${summary.detectedProjects?.length ?? 0} projetos detectados.`);
    vscode.window.showInformationMessage(
      `✓ Modo Lite: ${summary.totalFiles} arquivos analisados sem IA, banco, Docker ou servidor. ${summary.detectedProjects?.length ?? 0} subprojeto(s) detectado(s).`
    );
    return summary;
  } catch (error) {
    if (isCancellation(error)) {
      logWarn('Análise cancelada pelo usuário.');
      vscode.window.showInformationMessage('Análise do TIC Coder Lite cancelada. Nenhum arquivo do projeto foi alterado.');
      return undefined;
    }

    logError('Falha na análise do workspace.', error);
    showOutputChannel();
    vscode.window.showErrorMessage('O TIC Coder Lite não conseguiu analisar este workspace. Veja a saída "TIC Coder Lite" para detalhes.');
    return undefined;
  }
}

export interface AnalyzeWorkspaceOptions {
  progress?: vscode.Progress<{ message?: string; increment?: number }>;
  token?: vscode.CancellationToken;
}

// Exportar com nome original para compatibilidade
export async function analyzeWorkspace(root: vscode.WorkspaceFolder, options: AnalyzeWorkspaceOptions = {}): Promise<ProjectSummary> {
  return analyzeWorkspaceInternal(root, options);
}

export async function analyzeWorkspaceInternal(root: vscode.WorkspaceFolder, options: AnalyzeWorkspaceOptions = {}): Promise<ProjectSummary> {
  const config = getTicCoderLiteConfig();
  options.progress?.report({ message: 'Escaneando arquivos', increment: 5 });
  const scan = await scanWorkspace(root, {
    config: config.scan,
    token: options.token,
    progress: options.progress,
    logger: {
      info: logInfo,
      warn: logWarn,
      error: logError
    }
  });
  if (!scan) {
    throw new Error('Nenhuma pasta de workspace está aberta.');
  }

  throwIfCancelled(options.token);
  const languages: Record<string, number> = {};
  const directories = new Map<string, number>();
  const keyFiles: string[] = [];
  options.progress?.report({ message: 'Detectando stack e módulos', increment: 20 });
  const inventory = await detectStack(scan, { plsql: { maxSqlFiles: config.database.maxSqlFiles } });
  throwIfCancelled(options.token);
  options.progress?.report({ message: 'Montando grafo', increment: 20 });
  const graph = await buildGraph(scan, inventory, { token: options.token, database: config.database });
  throwIfCancelled(options.token);
  options.progress?.report({ message: 'Detectando riscos determinísticos', increment: 20 });
  const risks = await detectRisks(scan, inventory, graph, { token: options.token });
  scan.riskSummary = risks.summary;

  for (const file of scan.files) {
    const relative = file.relativePath;
    const extension = file.extension;
    const language = LANGUAGE_BY_EXTENSION[extension] ?? 'Outros';
    languages[language] = (languages[language] ?? 0) + 1;

    const firstSegment = relative.split('/')[0] || '.';
    directories.set(firstSegment, (directories.get(firstSegment) ?? 0) + 1);

    if (KEY_FILE_NAMES.has(path.basename(relative)) || KEY_FILE_NAMES.has(relative)) {
      keyFiles.push(relative);
    }
  }

  // Detectar subprojetos e adicionar à summary
  const { detectProjects } = await import('../scanner/detectProjects');
  const detectedProjects = detectProjects(scan, risks);

  return {
    workspaceName: scan.projectName,
    rootPath: scan.rootPath,
    generatedAt: scan.scannedAt,
    totalFiles: scan.totals.files,
    totalLines: scan.totals.lines,
    languages: sortRecord(languages),
    topDirectories: [...directories.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, count]) => ({ name, files: count })),
    packageManagers: await detectPackageManagers(root.uri),
    detectedAgentEngines: await detectAgentEngines(root.uri),
    keyFiles: keyFiles.sort().slice(0, 40),
    detectedProjects,
    scan,
    inventory,
    graph,
    risks
  };
}

export function getLastAnalysis(context: vscode.ExtensionContext): ProjectSummary | undefined {
  return context.globalState.get<ProjectSummary>('ticCoderLite.lastAnalysis');
}

async function detectPackageManagers(root: vscode.Uri): Promise<string[]> {
  const found: string[] = [];
  for (const file of PACKAGE_MANAGER_FILES) {
    if (await exists(vscode.Uri.joinPath(root, file))) {
      found.push(file);
    }
  }
  return found;
}

async function detectAgentEngines(root: vscode.Uri): Promise<AgentEngine[]> {
  const engines: AgentEngine[] = [];
  for (const engine of AGENT_ENGINES) {
    engines.push({
      ...engine,
      detected: await exists(vscode.Uri.joinPath(root, engine.entryFile))
    });
  }
  return engines;
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

function sortRecord(input: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(input).sort((a, b) => b[1] - a[1]));
}

function throwIfCancelled(token?: vscode.CancellationToken): void {
  if (token?.isCancellationRequested) {
    throw new Error('TIC_CODER_LITE_CANCELLED');
  }
}

function isCancellation(error: unknown): boolean {
  return error instanceof Error && error.message === 'TIC_CODER_LITE_CANCELLED';
}

function progressLogWriteArtifacts(): void {
  logInfo('Gravando artefatos .tic-code.');
}
