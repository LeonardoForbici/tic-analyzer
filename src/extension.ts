import * as vscode from 'vscode';
import { analyzeProject, getLastAnalysis } from './commands/analyzeProject';
import { enhanceWithLocalAi } from './commands/enhanceWithLocalAi';
import { exportAgentsMd } from './commands/exportAgentsMd';
import { generateAgentContext } from './commands/generateAgentContext';
import { openOverview } from './commands/openOverview';
import { importTracerInputsCommand } from './commands/importTracerInputs';
import { importVisorScreenshotsCommand } from './commands/importVisorScreenshots';
import { detectAiEnginesCommand, exportForEngineCommand } from './reversa-adapter/exportForEngines';
import { analyzeImpactByImageCommand } from './impact/analyzeImpactByImage';
import { importImpactScreenshotCommand } from './impact/importImpactScreenshot';
import { estimateChangeCostWithLocalAiCommand } from './impact/changeCostEstimator';
import { exportChangePackageForPaidAiCommand } from './impact/exportChangePackageForPaidAi';
import { ProjectSummary } from './types';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new TicCoderLiteTreeProvider(context);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('ticCoderLite.sidebar', provider),
    vscode.commands.registerCommand('ticCoderLite.refreshSidebar', () => provider.refresh()),
    vscode.commands.registerCommand('ticCoderLite.analyzeProject', async () => {
      await analyzeProject(context);
      provider.refresh();
    }),
    vscode.commands.registerCommand('ticCoderLite.openOverview', () => openOverview(context)),
    vscode.commands.registerCommand('ticCoderLite.generateAgentContext', () => generateAgentContext(context)),
    vscode.commands.registerCommand('ticCoderLite.exportAgentsMd', () => exportAgentsMd(context)),
    vscode.commands.registerCommand('ticCoderLite.detectAiEngines', () => detectAiEnginesCommand()),
    vscode.commands.registerCommand('ticCoderLite.exportForCodex', () => exportForEngineCommand(context, 'codex')),
    vscode.commands.registerCommand('ticCoderLite.exportForClaude', () => exportForEngineCommand(context, 'claude-code')),
    vscode.commands.registerCommand('ticCoderLite.exportForCopilot', () => exportForEngineCommand(context, 'github-copilot')),
    vscode.commands.registerCommand('ticCoderLite.exportForCursor', () => exportForEngineCommand(context, 'cursor')),
    vscode.commands.registerCommand('ticCoderLite.exportForGemini', () => exportForEngineCommand(context, 'gemini-cli')),
    vscode.commands.registerCommand('ticCoderLite.enhanceWithLocalAi', () => enhanceWithLocalAi())
    ,vscode.commands.registerCommand('ticCoderLite.importTracerInputs', () => importTracerInputsCommand())
    ,vscode.commands.registerCommand('ticCoderLite.importVisorScreenshots', () => importVisorScreenshotsCommand())
    ,vscode.commands.registerCommand('ticCoderLite.analyzeImpactByImage', () => analyzeImpactByImageCommand())
    ,vscode.commands.registerCommand('ticCoderLite.importImpactScreenshot', () => importImpactScreenshotCommand())
    ,vscode.commands.registerCommand('ticCoderLite.estimateChangeCostWithLocalAi', () => estimateChangeCostWithLocalAiCommand())
    ,vscode.commands.registerCommand('ticCoderLite.exportChangePackageForPaidAi', () => exportChangePackageForPaidAiCommand())
  );
}

export function deactivate(): void {
  // Não há serviços em segundo plano. O TIC Coder Lite é local-first.
}

class TicCoderLiteTreeProvider implements vscode.TreeDataProvider<TicCoderLiteItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TicCoderLiteItem | undefined | null | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(element: TicCoderLiteItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TicCoderLiteItem): TicCoderLiteItem[] {
    if (element) {
      return element.children;
    }

    const summary = getLastAnalysis(this.context);
    if (!summary) {
      return [
        commandItem('Analisar Workspace', 'ticCoderLite.analyzeProject', 'Scan determinístico sem IA, banco, Docker ou servidor'),
        commandItem('Abrir Visão dos 3 Modos', 'ticCoderLite.openOverview', 'Mostrar Modo Lite, IA Padrão e IA Local')
      ];
    }

    return [
      commandItem('Analisar Workspace', 'ticCoderLite.analyzeProject', 'Atualizar scan local determinístico'),
      commandItem('Abrir Visão dos 3 Modos', 'ticCoderLite.openOverview', 'Mostrar Modo Lite, IA Padrão e IA Local'),
      commandItem('Modo Lite: Gerar Contexto', 'ticCoderLite.generateAgentContext', 'Gravar .tic-code/agent-context.md sem IA'),
      commandItem('IA Padrão: Detectar Engines', 'ticCoderLite.detectAiEngines', 'Detectar Codex, Claude Code, Copilot, Cursor, Gemini e Aider'),
      commandItem('IA Padrão: Exportar para Codex', 'ticCoderLite.exportForCodex', 'Gravar ou mesclar AGENTS.md'),
      commandItem('IA Local: Melhorar com Ollama', 'ticCoderLite.enhanceWithLocalAi', 'Usar Ollama opcional com modelo pequeno para melhorar o contexto .tic-code'),
      commandItem('IA Padrão: Exportar AGENTS.md', 'ticCoderLite.exportAgentsMd', 'Gravar ou atualizar AGENTS.md'),
      commandItem('Impacto por Imagem/Tela: Analisar', 'ticCoderLite.analyzeImpactByImage', 'Mapear frontend → backend → SQL/PLSQL por URL de tela'),
      summaryItem(summary)
    ];
  }
}

class TicCoderLiteItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    readonly children: TicCoderLiteItem[] = []
  ) {
    super(label, collapsibleState);
  }
}

function commandItem(label: string, command: string, tooltip: string): TicCoderLiteItem {
  const item = new TicCoderLiteItem(label, vscode.TreeItemCollapsibleState.None);
  item.command = { command, title: label };
  item.tooltip = tooltip;
  item.iconPath = new vscode.ThemeIcon('play');
  return item;
}

function summaryItem(summary: ProjectSummary): TicCoderLiteItem {
  const languageChildren = Object.entries(summary.languages)
    .slice(0, 8)
    .map(([language, count]) => leaf(`${language}: ${count}`, 'symbol-keyword'));

  const directoryChildren = summary.topDirectories
    .slice(0, 8)
    .map((directory) => leaf(`${directory.name}: ${directory.files}`, 'folder'));

  const agentChildren = summary.detectedAgentEngines
    .filter((engine) => engine.detected)
    .map((engine) => leaf(`${engine.name}: ${engine.entryFile}`, 'hubot'));

  return new TicCoderLiteItem('Última Análise', vscode.TreeItemCollapsibleState.Expanded, [
    leaf('Modos: Lite pronto / IA Padrão exporta / IA Local opcional', 'rocket'),
    leaf(`Arquivos: ${summary.totalFiles}`, 'files'),
    leaf(`Linhas: ${summary.totalLines}`, 'list-flat'),
    leaf(`Grafo: ${summary.graph.stats.nodeCount} nós / ${summary.graph.stats.edgeCount} arestas`, 'type-hierarchy'),
    leaf(`Riscos: ${summary.risks.summary.total}`, 'warning'),
    new TicCoderLiteItem('Linguagens', vscode.TreeItemCollapsibleState.Collapsed, languageChildren),
    new TicCoderLiteItem('Diretórios', vscode.TreeItemCollapsibleState.Collapsed, directoryChildren),
    new TicCoderLiteItem('Engines de IA', vscode.TreeItemCollapsibleState.Collapsed, agentChildren.length ? agentChildren : [leaf('Nenhuma detectada', 'circle-slash')])
  ]);
}

function leaf(label: string, icon: string): TicCoderLiteItem {
  const item = new TicCoderLiteItem(label, vscode.TreeItemCollapsibleState.None);
  item.iconPath = new vscode.ThemeIcon(icon);
  return item;
}
