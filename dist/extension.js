"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const analyzeProject_1 = require("./commands/analyzeProject");
const enhanceWithLocalAi_1 = require("./commands/enhanceWithLocalAi");
const exportAgentsMd_1 = require("./commands/exportAgentsMd");
const generateAgentContext_1 = require("./commands/generateAgentContext");
const openOverview_1 = require("./commands/openOverview");
const importTracerInputs_1 = require("./commands/importTracerInputs");
const importVisorScreenshots_1 = require("./commands/importVisorScreenshots");
const exportForEngines_1 = require("./reversa-adapter/exportForEngines");
const analyzeImpactByImage_1 = require("./impact/analyzeImpactByImage");
const importImpactScreenshot_1 = require("./impact/importImpactScreenshot");
const changeCostEstimator_1 = require("./impact/changeCostEstimator");
const exportChangePackageForPaidAi_1 = require("./impact/exportChangePackageForPaidAi");
const legacyAntibodyGenerator_1 = require("./change-firewall/legacyAntibodyGenerator");
const generateChangeSafetyReport_1 = require("./change-firewall/generateChangeSafetyReport");
const runChangeTwin_1 = require("./change-firewall/runChangeTwin");
const generateChangeApprovalPack_1 = require("./change-firewall/generateChangeApprovalPack");
const analyzeDependencyChange_1 = require("./dependency-impact/analyzeDependencyChange");
const analyzeWhatIf_1 = require("./commands/analyzeWhatIf");
function activate(context) {
    const provider = new TicCoderLiteTreeProvider(context);
    context.subscriptions.push(vscode.window.registerTreeDataProvider('ticCoderLite.sidebar', provider), vscode.commands.registerCommand('ticCoderLite.refreshSidebar', () => provider.refresh()), vscode.commands.registerCommand('ticCoderLite.analyzeProject', async () => {
        await (0, analyzeProject_1.analyzeProject)(context);
        provider.refresh();
    }), vscode.commands.registerCommand('ticCoderLite.openOverview', () => (0, openOverview_1.openOverview)(context)), vscode.commands.registerCommand('ticCoderLite.generateAgentContext', () => (0, generateAgentContext_1.generateAgentContext)(context)), vscode.commands.registerCommand('ticCoderLite.exportAgentsMd', () => (0, exportAgentsMd_1.exportAgentsMd)(context)), vscode.commands.registerCommand('ticCoderLite.detectAiEngines', () => (0, exportForEngines_1.detectAiEnginesCommand)()), vscode.commands.registerCommand('ticCoderLite.exportForCodex', () => (0, exportForEngines_1.exportForEngineCommand)(context, 'codex')), vscode.commands.registerCommand('ticCoderLite.exportForClaude', () => (0, exportForEngines_1.exportForEngineCommand)(context, 'claude-code')), vscode.commands.registerCommand('ticCoderLite.exportForCopilot', () => (0, exportForEngines_1.exportForEngineCommand)(context, 'github-copilot')), vscode.commands.registerCommand('ticCoderLite.exportForCursor', () => (0, exportForEngines_1.exportForEngineCommand)(context, 'cursor')), vscode.commands.registerCommand('ticCoderLite.exportForGemini', () => (0, exportForEngines_1.exportForEngineCommand)(context, 'gemini-cli')), vscode.commands.registerCommand('ticCoderLite.enhanceWithLocalAi', () => (0, enhanceWithLocalAi_1.enhanceWithLocalAi)()), vscode.commands.registerCommand('ticCoderLite.importTracerInputs', () => (0, importTracerInputs_1.importTracerInputsCommand)()), vscode.commands.registerCommand('ticCoderLite.importVisorScreenshots', () => (0, importVisorScreenshots_1.importVisorScreenshotsCommand)()), vscode.commands.registerCommand('ticCoderLite.analyzeImpactByImage', (payload) => (0, analyzeImpactByImage_1.analyzeImpactByImageCommand)(payload)), vscode.commands.registerCommand('ticCoderLite.importImpactScreenshot', () => (0, importImpactScreenshot_1.importImpactScreenshotCommand)()), vscode.commands.registerCommand('ticCoderLite.estimateChangeCostWithLocalAi', () => (0, changeCostEstimator_1.estimateChangeCostWithLocalAiCommand)()), vscode.commands.registerCommand('ticCoderLite.exportChangePackageForPaidAi', () => (0, exportChangePackageForPaidAi_1.exportChangePackageForPaidAiCommand)()), vscode.commands.registerCommand('ticCoderLite.openLatestImpactScreenshot', () => (0, exportChangePackageForPaidAi_1.openLatestImpactScreenshotCommand)()), vscode.commands.registerCommand('ticCoderLite.runChangeTwin', () => (0, runChangeTwin_1.runChangeTwinCommand)()), vscode.commands.registerCommand('ticCoderLite.generateLegacyAntibodies', () => (0, legacyAntibodyGenerator_1.generateLegacyAntibodiesCommand)()), vscode.commands.registerCommand('ticCoderLite.runChangeFirewallOnGitDiff', () => (0, runChangeTwin_1.runChangeFirewallOnGitDiffCommand)()), vscode.commands.registerCommand('ticCoderLite.openChangeFirewallReport', () => (0, generateChangeSafetyReport_1.openChangeFirewallReportCommand)()), vscode.commands.registerCommand('ticCoderLite.openLegacyAntibodies', () => (0, generateChangeSafetyReport_1.openLegacyAntibodiesCommand)()), vscode.commands.registerCommand('ticCoderLite.exportAiReviewPrompt', () => (0, generateChangeSafetyReport_1.exportAiReviewPromptCommand)()), vscode.commands.registerCommand('ticCoderLite.generateChangeApprovalPack', () => (0, generateChangeApprovalPack_1.generateChangeApprovalPackCommand)()), vscode.commands.registerCommand('ticCoderLite.openChangeApprovalPack', () => (0, generateChangeApprovalPack_1.openChangeApprovalPackCommand)()), vscode.commands.registerCommand('ticCoderLite.analyzeDependencyChange', (payload) => (0, analyzeDependencyChange_1.analyzeDependencyChangeCommand)(payload, context)), vscode.commands.registerCommand('ticCoderLite.openDepImpactReport', () => (0, analyzeDependencyChange_1.openDepImpactReportCommand)()), vscode.commands.registerCommand('ticCoderLite.openDepImpactMigrationPlan', () => (0, analyzeDependencyChange_1.openDepImpactMigrationPlanCommand)()), vscode.commands.registerCommand('ticCoderLite.openDepImpactApprovalPack', () => (0, analyzeDependencyChange_1.openDepImpactApprovalPackCommand)()), vscode.commands.registerCommand('ticCoderLite.analyzeWhatIf', () => (0, analyzeWhatIf_1.analyzeWhatIfCommand)(context)));
}
function deactivate() {
    // Não há serviços em segundo plano. O TIC Coder Lite é local-first.
}
class TicCoderLiteTreeProvider {
    context;
    onDidChangeTreeDataEmitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    constructor(context) {
        this.context = context;
    }
    refresh() {
        this.onDidChangeTreeDataEmitter.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return element.children;
        }
        const summary = (0, analyzeProject_1.getLastAnalysis)(this.context);
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
            commandItem('AI Change Firewall: Simular Mudanca', 'ticCoderLite.runChangeTwin', 'Gerar Change Twin sem alterar codigo'),
            commandItem('AI Change Firewall: Validar Diff', 'ticCoderLite.runChangeFirewallOnGitDiff', 'Cruzar diff local com regras, contratos e antibodies'),
            commandItem('What-If: Analisar Impacto de Mudança', 'ticCoderLite.analyzeWhatIf', 'Analisar todos os pontos impactados por uma mudança hipotética'),
            summaryItem(summary)
        ];
    }
}
class TicCoderLiteItem extends vscode.TreeItem {
    children;
    constructor(label, collapsibleState, children = []) {
        super(label, collapsibleState);
        this.children = children;
    }
}
function commandItem(label, command, tooltip) {
    const item = new TicCoderLiteItem(label, vscode.TreeItemCollapsibleState.None);
    item.command = { command, title: label };
    item.tooltip = tooltip;
    item.iconPath = new vscode.ThemeIcon('play');
    return item;
}
function summaryItem(summary) {
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
function leaf(label, icon) {
    const item = new TicCoderLiteItem(label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(icon);
    return item;
}
//# sourceMappingURL=extension.js.map