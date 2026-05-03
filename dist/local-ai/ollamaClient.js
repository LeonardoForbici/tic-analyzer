"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaClient = exports.TASK_LABELS = void 0;
exports.resolveModelForTask = resolveModelForTask;
exports.TASK_LABELS = {
    'module-summary': 'Resumo de módulos',
    'risk-explanation': 'Explicação de riscos',
    'questions-gaps': 'Perguntas e lacunas',
    'agent-context': 'Contexto para IA',
    'plsql-analysis': 'Análise PL/SQL',
    'business-rules': 'Regras de negócio',
    'domain-analysis': 'Análise de domínio',
    'state-machines': 'Máquinas de estado',
    'permissions': 'Permissões',
    'critical-files': 'Arquivos críticos'
};
const QUALITY_TASK_SET = new Set([
    'plsql-analysis',
    'business-rules',
    'domain-analysis',
    'state-machines',
    'permissions',
    'critical-files'
]);
/**
 * Resolves which model to use for a given task according to mode + fallback rules:
 * 1. mode=fast  → always fastModel
 * 2. mode=quality → always qualityModel
 * 3. mode=auto → qualityModel for complex tasks, fastModel for simple tasks
 * 4. If preferred model unavailable → fall back to the other one
 * 5. If neither available → returns empty model with install hint
 */
function resolveModelForTask(task, mode, fastModel, qualityModel, availableModels, 
/** If set (non-empty), always use this model regardless of mode. */
overrideModel) {
    // Explicit model override wins over everything
    if (overrideModel) {
        if (availableModels.includes(overrideModel)) {
            return { model: overrideModel, label: overrideModel, reason: 'Modelo configurado em localAi.model' };
        }
        return {
            model: '',
            label: 'nenhum',
            reason: `Modelo não encontrado no Ollama. Instale com: ollama pull ${overrideModel}`
        };
    }
    const wantsQuality = mode === 'quality' || (mode === 'auto' && QUALITY_TASK_SET.has(task));
    if (wantsQuality) {
        if (availableModels.includes(qualityModel)) {
            return { model: qualityModel, label: `${qualityModel} (quality)`, reason: 'Tarefa complexa — usando qualityModel' };
        }
        if (availableModels.includes(fastModel)) {
            return { model: fastModel, label: `${fastModel} (fallback de quality)`, reason: `${qualityModel} não encontrado — usando fastModel como fallback` };
        }
    }
    else {
        if (availableModels.includes(fastModel)) {
            return { model: fastModel, label: `${fastModel} (fast)`, reason: 'Usando fastModel' };
        }
        if (availableModels.includes(qualityModel)) {
            return { model: qualityModel, label: `${qualityModel} (fallback de fast)`, reason: `${fastModel} não encontrado — usando qualityModel como fallback` };
        }
    }
    const installModel = fastModel || 'qwen2.5-coder:3b';
    return {
        model: '',
        label: 'nenhum',
        reason: `Modelo não encontrado no Ollama. Instale com: ollama pull ${installModel}`
    };
}
// ── HTTP client ──────────────────────────────────────────────────────────────
class OllamaClient {
    options;
    constructor(options) {
        this.options = options;
    }
    get modelName() { return this.options.model; }
    async listModels() {
        const response = await fetch(`${trimTrailingSlash(this.options.baseUrl)}/api/tags`, {
            signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) {
            throw new Error(`Ollama health check failed with HTTP ${response.status}.`);
        }
        const data = await response.json();
        return data.models ?? [];
    }
    async generate(prompt, options = {}) {
        const response = await fetch(`${trimTrailingSlash(this.options.baseUrl)}/api/generate`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                model: this.options.model,
                prompt,
                stream: false,
                options: {
                    temperature: options.temperature ?? 0.2,
                    num_predict: options.numPredict ?? 1200
                }
            }),
            signal: AbortSignal.timeout(120000)
        });
        if (!response.ok) {
            throw new Error(`Ollama generation failed with HTTP ${response.status}.`);
        }
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }
        return (data.response ?? '').trim();
    }
}
exports.OllamaClient = OllamaClient;
function trimTrailingSlash(value) {
    return value.replace(/\/+$/, '');
}
//# sourceMappingURL=ollamaClient.js.map