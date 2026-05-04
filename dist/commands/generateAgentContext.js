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
exports.generateAgentContext = generateAgentContext;
exports.buildAgentContext = buildAgentContext;
const vscode = __importStar(require("vscode"));
const generateAgentContextMd_1 = require("../exporters/generateAgentContextMd");
const writeTicCodeFolder_1 = require("../exporters/writeTicCodeFolder");
const analyzeProject_1 = require("./analyzeProject");
async function generateAgentContext(context) {
    const root = (0, analyzeProject_1.getWorkspaceRoot)();
    if (!root) {
        vscode.window.showWarningMessage('Abra uma pasta de workspace antes de gerar o contexto para IA.');
        return undefined;
    }
    const summary = (0, analyzeProject_1.getLastAnalysis)(context) ?? await (0, analyzeProject_1.analyzeWorkspace)(root);
    const agentContext = buildAgentContext(summary);
    const artifacts = await (0, writeTicCodeFolder_1.writeTicCodeFolder)(root, summary, context.extensionUri);
    await context.globalState.update('ticCoderLite.lastAnalysis', summary);
    vscode.commands.executeCommand('ticCoderLite.refreshSidebar');
    const document = await vscode.workspace.openTextDocument(artifacts.agentContextMd);
    await vscode.window.showTextDocument(document, { preview: false });
    vscode.window.showInformationMessage('Modo Lite gerou .tic-code/agent-context.md sem IA.');
    return agentContext;
}
function buildAgentContext(summary) {
    return { summary, markdown: (0, generateAgentContextMd_1.generateAgentContextMd)(summary) };
}
//# sourceMappingURL=generateAgentContext.js.map