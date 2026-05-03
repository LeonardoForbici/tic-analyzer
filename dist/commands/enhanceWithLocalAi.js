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
exports.enhanceWithLocalAi = enhanceWithLocalAi;
const vscode = __importStar(require("vscode"));
const checkOllamaStatus_1 = require("../local-ai/checkOllamaStatus");
const enhanceAgentContext_1 = require("../local-ai/enhanceAgentContext");
const enhanceModuleSummary_1 = require("../local-ai/enhanceModuleSummary");
const ollamaClient_1 = require("../local-ai/ollamaClient");
const analyzeProject_1 = require("./analyzeProject");
async function enhanceWithLocalAi() {
    const root = (0, analyzeProject_1.getWorkspaceRoot)();
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
    const settings = (0, checkOllamaStatus_1.getLocalAiSettings)();
    const status = await (0, checkOllamaStatus_1.checkOllamaStatus)(settings);
    if (!status.ok) {
        vscode.window.showInformationMessage(status.message);
        return;
    }
    const taskLog = [];
    /** Returns a resolved OllamaClient for the given task, or throws if no model is available. */
    function clientForTask(task) {
        // If user explicitly set localAi.model, honour it as an override
        const override = settings.model !== settings.fastModel ? settings.model : undefined;
        const resolution = (0, ollamaClient_1.resolveModelForTask)(task, settings.mode, settings.fastModel, settings.qualityModel, status.models, override);
        taskLog.push({
            task,
            taskLabel: ollamaClient_1.TASK_LABELS[task],
            model: resolution.label,
            reason: resolution.reason,
            timestamp: new Date().toISOString()
        });
        if (!resolution.model) {
            throw new Error(`Modelo local não encontrado. Instale com: ollama pull ${settings.fastModel}`);
        }
        return new ollamaClient_1.OllamaClient({ baseUrl: settings.ollamaUrl, model: resolution.model });
    }
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `TIC Coder Lite: IA Local (modo ${settings.mode})`,
        cancellable: false
    }, async (progress) => {
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
        const agentContextAi = await (0, enhanceAgentContext_1.enhanceAgentContext)(agentContextClient, {
            projectName,
            agentContext,
            risksMarkdown,
            architectureMarkdown,
            confidenceReport
        });
        progress.report({ message: 'Gerando perguntas de validação humana' });
        const questionsClient = clientForTask('questions-gaps');
        const questionsAi = await (0, enhanceAgentContext_1.enhanceQuestions)(questionsClient, {
            projectName,
            agentContext,
            risksMarkdown,
            architectureMarkdown,
            confidenceReport
        });
        progress.report({ message: 'Resumindo módulos' });
        const modulesClient = clientForTask('module-summary');
        const moduleSummariesAi = await (0, enhanceModuleSummary_1.enhanceModuleSummary)(modulesClient, {
            projectName,
            modulesJson,
            graphJson,
            risksJson
        });
        await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(ticCodeDir, 'agent-context.ai.md'), Buffer.from(agentContextAi, 'utf8'));
        await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(ticCodeDir, 'questions.ai.md'), Buffer.from(questionsAi, 'utf8'));
        await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(ticCodeDir, 'module-summaries.ai.md'), Buffer.from(moduleSummariesAi, 'utf8'));
        // Persist task log so the WebView can display which model was used
        await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(ticCodeDir, 'local-ai-log.json'), Buffer.from(JSON.stringify(taskLog, null, 2), 'utf8'));
    });
    const modelsUsed = [...new Set(taskLog.map((e) => e.model))].join(', ');
    vscode.window.showInformationMessage(`Modo IA Local concluído. Modelos usados: ${modelsUsed}. Resultados em .tic-code/`);
}
async function exists(uri) {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    }
    catch {
        return false;
    }
}
async function readText(uri) {
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        return Buffer.from(bytes).toString('utf8');
    }
    catch {
        return '';
    }
}
//# sourceMappingURL=enhanceWithLocalAi.js.map