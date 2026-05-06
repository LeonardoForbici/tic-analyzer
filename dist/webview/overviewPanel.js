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
exports.openOverviewPanel = openOverviewPanel;
const vscode = __importStar(require("vscode"));
const analyzeProject_1 = require("../commands/analyzeProject");
const checkOllamaStatus_1 = require("../local-ai/checkOllamaStatus");
const writeTicCodeFolder_1 = require("../exporters/writeTicCodeFolder");
const detectEngines_1 = require("../reversa-adapter/detectEngines");
const overviewHtml_1 = require("./overviewHtml");
async function openOverviewPanel(context) {
    const root = (0, analyzeProject_1.getWorkspaceRoot)();
    if (!root) {
        vscode.window.showWarningMessage('Abra uma pasta de workspace antes de abrir o TIC Coder Lite.');
        return;
    }
    let summary = (0, analyzeProject_1.getLastAnalysis)(context);
    if (!summary) {
        const analyzeLabel = 'Analisar Workspace';
        const action = await vscode.window.showInformationMessage('Ainda não há análise do Modo Lite. O Modo Lite funciona sem IA, banco, Docker ou servidor.', analyzeLabel);
        if (action !== analyzeLabel) {
            return;
        }
        const newSummary = await (0, analyzeProject_1.analyzeWorkspace)(root);
        if (!newSummary) {
            vscode.window.showErrorMessage('Falha ao analisar workspace.');
            return;
        }
        summary = newSummary;
        await (0, writeTicCodeFolder_1.writeTicCodeFolder)(root, summary, context.extensionUri);
        await context.globalState.update('ticCoderLite.lastAnalysis', summary);
    }
    const panel = vscode.window.createWebviewPanel('ticCoderLiteOverview', 'Reversa Engine — TIC Coder Lite', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
    await render(panel, context, root, summary);
    panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
            case 'analyzeProject':
                await vscode.commands.executeCommand('ticCoderLite.analyzeProject');
                const latestAnalysis = (0, analyzeProject_1.getLastAnalysis)(context);
                if (latestAnalysis) {
                    summary = latestAnalysis;
                    await render(panel, context, root, summary);
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
            case 'openSettings':
                await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:tic.tic-coder-lite');
                break;
        }
    });
}
async function applyBeginnerSetup() {
    const config = vscode.workspace.getConfiguration('ticCoderLite');
    const target = vscode.ConfigurationTarget.Workspace;
    await config.update('localAi.enabled', false, target);
    await config.update('scan.maxFiles', 30000, target);
    await config.update('scan.maxFileSizeKb', 512, target);
    await config.update('output.openAfterScan', false, target);
    await config.update('exports.safeWriteMode', 'ask', target);
}
async function setLocalAiEnabled(enabled) {
    const config = vscode.workspace.getConfiguration('ticCoderLite');
    await config.update('localAi.enabled', enabled, vscode.ConfigurationTarget.Workspace);
    if (enabled) {
        const currentModel = config.get('localAi.model', '');
        if (!currentModel) {
            await config.update('localAi.model', 'qwen2.5-coder:3b', vscode.ConfigurationTarget.Workspace);
        }
        await config.update('localAi.ollamaUrl', 'http://localhost:11434', vscode.ConfigurationTarget.Workspace);
    }
}
async function render(panel, context, root, summary) {
    const engines = await (0, detectEngines_1.detectEngines)(root.uri.fsPath);
    const agentContextPreview = await readTextIfExists(vscode.Uri.joinPath(root.uri, '.tic-code', 'agent-context.md'));
    const localAiLogRaw = await readTextIfExists(vscode.Uri.joinPath(root.uri, '.tic-code', 'local-ai-log.json'));
    let localAiTaskLog;
    if (localAiLogRaw) {
        try {
            localAiTaskLog = JSON.parse(localAiLogRaw);
        }
        catch {
            localAiTaskLog = undefined;
        }
    }
    const aiSettings = (0, checkOllamaStatus_1.getLocalAiSettings)();
    const localAiConfig = {
        model: aiSettings.model,
        fastModel: aiSettings.fastModel,
        qualityModel: aiSettings.qualityModel,
        mode: aiSettings.mode,
        enabled: aiSettings.enabled
    };
    panel.webview.html = (0, overviewHtml_1.renderOverviewHtml)({
        summary,
        engines,
        agentContextPreview: agentContextPreview.slice(0, 2600),
        nonce: getNonce(),
        localAiTaskLog,
        localAiConfig
    });
    await context.globalState.update('ticCoderLite.lastAnalysis', summary);
}
async function readTextIfExists(uri) {
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        return Buffer.from(bytes).toString('utf8');
    }
    catch {
        return '';
    }
}
function getNonce() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i += 1) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}
//# sourceMappingURL=overviewPanel.js.map