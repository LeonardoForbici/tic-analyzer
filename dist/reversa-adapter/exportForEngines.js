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
exports.detectAiEnginesCommand = detectAiEnginesCommand;
exports.exportForEngineCommand = exportForEngineCommand;
exports.exportForEngine = exportForEngine;
const vscode = __importStar(require("vscode"));
const analyzeProject_1 = require("../commands/analyzeProject");
const writeTicCodeFolder_1 = require("../exporters/writeTicCodeFolder");
const detectEngines_1 = require("./detectEngines");
const generateAgentsMd_1 = require("./generateAgentsMd");
const generateClaudeMd_1 = require("./generateClaudeMd");
const generateCopilotInstructions_1 = require("./generateCopilotInstructions");
const generateCursorRules_1 = require("./generateCursorRules");
const generateGeminiMd_1 = require("./generateGeminiMd");
const reversaAssetLoader_1 = require("./reversaAssetLoader");
const safeWriter_1 = require("./safeWriter");
async function detectAiEnginesCommand() {
    const root = (0, analyzeProject_1.getWorkspaceRoot)();
    if (!root) {
        vscode.window.showWarningMessage('Abra uma pasta de workspace antes de detectar engines de IA.');
        return undefined;
    }
    const engines = await (0, detectEngines_1.detectEngines)(root.uri.fsPath);
    const detected = engines.filter((engine) => engine.detected);
    const message = detected.length
        ? `IA Padrão detectou engines: ${detected.map((engine) => engine.name).join(', ')}.`
        : 'IA Padrão não encontrou engines suportadas por comando, pasta ou arquivo de entrada.';
    vscode.window.showInformationMessage(message);
    return engines;
}
async function exportForEngineCommand(context, engineId) {
    const root = (0, analyzeProject_1.getWorkspaceRoot)();
    if (!root) {
        vscode.window.showWarningMessage('Abra uma pasta de workspace antes de exportar contexto para IA.');
        return undefined;
    }
    const summary = (0, analyzeProject_1.getLastAnalysis)(context) ?? await (0, analyzeProject_1.analyzeWorkspace)(root);
    await (0, writeTicCodeFolder_1.writeTicCodeFolder)(root, summary, context.extensionUri);
    const engine = await (0, detectEngines_1.detectEngineById)(root.uri.fsPath, engineId);
    if (!engine) {
        vscode.window.showErrorMessage(`Exportação de engine não suportada pelo TIC Coder Lite: ${engineId}`);
        return undefined;
    }
    const assets = (0, reversaAssetLoader_1.loadReversaAssets)(context.extensionUri);
    const result = await exportForEngine(root, summary, engine, assets, context.extensionUri);
    await context.globalState.update('ticCoderLite.lastAnalysis', summary);
    vscode.commands.executeCommand('ticCoderLite.refreshSidebar');
    vscode.window.showInformationMessage(`IA Padrão: ${engine.name} ${translateAction(result.action)} ${result.targetFile}.`);
    return result;
}
function translateAction(action) {
    return {
        created: 'criou',
        updated: 'atualizou',
        skipped: 'ignorou',
        appended: 'acrescentou em',
        overwritten: 'sobrescreveu'
    }[action] ?? action;
}
async function exportForEngine(root, summary, engine, assets, extensionUri) {
    const writer = new safeWriter_1.SafeWriter(root);
    const resolvedAssets = assets ?? (0, reversaAssetLoader_1.loadReversaAssets)();
    const content = generateEngineContent(engine.id, summary, resolvedAssets, extensionUri);
    const result = await writer.writeFile(engine.entryFile, content);
    return {
        engine,
        targetFile: engine.entryFile,
        action: result.action
    };
}
function generateEngineContent(engineId, summary, assets, extensionUri) {
    switch (engineId) {
        case 'claude-code':
            return (0, generateClaudeMd_1.generateClaudeMd)(summary, assets, extensionUri);
        case 'codex':
            return (0, generateAgentsMd_1.generateAgentsMd)(summary, assets, extensionUri);
        case 'cursor':
            return (0, generateCursorRules_1.generateCursorRules)(summary, assets, extensionUri);
        case 'github-copilot':
            return (0, generateCopilotInstructions_1.generateCopilotInstructions)(summary, assets, extensionUri);
        case 'gemini-cli':
            return (0, generateGeminiMd_1.generateGeminiMd)(summary, assets, extensionUri);
        case 'aider':
            return (0, generateAgentsMd_1.generateAgentsMd)(summary, assets, extensionUri).replace('para Codex', 'para Aider');
    }
}
//# sourceMappingURL=exportForEngines.js.map