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
exports.getLocalAiSettings = getLocalAiSettings;
exports.checkOllamaStatus = checkOllamaStatus;
const vscode = __importStar(require("vscode"));
const ollamaClient_1 = require("./ollamaClient");
function getLocalAiSettings() {
    const config = vscode.workspace.getConfiguration('ticCoderLite.localAi');
    return {
        enabled: config.get('enabled', false),
        ollamaUrl: config.get('ollamaUrl', 'http://localhost:11434'),
        model: config.get('model', 'qwen2.5-coder:3b'),
        fastModel: config.get('fastModel', 'qwen2.5-coder:3b'),
        qualityModel: config.get('qualityModel', 'qwen2.5-coder:7b'),
        mode: config.get('mode', 'fast'),
        visionEnabled: config.get('visionEnabled', true),
        visionModel: config.get('visionModel', 'llava:7b')
    };
}
async function checkOllamaStatus(settings = getLocalAiSettings()) {
    if (!settings.enabled) {
        return {
            ok: false,
            enabled: false,
            url: settings.ollamaUrl,
            model: settings.fastModel,
            models: [],
            fastModelAvailable: false,
            qualityModelAvailable: false,
            visionModelAvailable: false,
            message: 'A IA Local esta desativada nas configuracoes. O Modo Lite continua funcionando normalmente.'
        };
    }
    try {
        const client = new ollamaClient_1.OllamaClient({ baseUrl: settings.ollamaUrl, model: settings.fastModel });
        const models = (await client.listModels()).map((model) => model.name);
        const fastModelAvailable = models.includes(settings.fastModel);
        const qualityModelAvailable = models.includes(settings.qualityModel);
        const visionModelAvailable = settings.visionEnabled && models.includes(settings.visionModel);
        const anyAvailable = fastModelAvailable || qualityModelAvailable;
        let message;
        if (anyAvailable) {
            const available = [
                fastModelAvailable ? settings.fastModel : null,
                qualityModelAvailable ? settings.qualityModel : null,
                visionModelAvailable ? `${settings.visionModel} (vision)` : null
            ].filter(Boolean).join(', ');
            message = `Ollama disponivel com: ${available}.`;
        }
        else {
            message = `Ollama esta em execucao, mas nenhum modelo configurado foi encontrado. Instale com: ollama pull ${settings.fastModel}`;
        }
        return {
            ok: anyAvailable,
            enabled: true,
            url: settings.ollamaUrl,
            model: settings.fastModel,
            models,
            fastModelAvailable,
            qualityModelAvailable,
            visionModelAvailable,
            message
        };
    }
    catch {
        return {
            ok: false,
            enabled: true,
            url: settings.ollamaUrl,
            model: settings.fastModel,
            models: [],
            fastModelAvailable: false,
            qualityModelAvailable: false,
            visionModelAvailable: false,
            message: `Ollama nao esta acessivel em ${settings.ollamaUrl}. Inicie o Ollama localmente ou continue usando o Modo Lite sem IA.`
        };
    }
}
//# sourceMappingURL=checkOllamaStatus.js.map