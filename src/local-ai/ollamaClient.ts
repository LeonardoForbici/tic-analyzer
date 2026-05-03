export interface OllamaClientOptions {
  baseUrl: string;
  model: string;
}

export interface OllamaGenerateOptions {
  temperature?: number;
  numPredict?: number;
}

export interface OllamaModel {
  name: string;
}

// ── Model selection ──────────────────────────────────────────────────────────

export type TaskType =
  | 'module-summary'
  | 'risk-explanation'
  | 'questions-gaps'
  | 'agent-context'
  | 'plsql-analysis'
  | 'business-rules'
  | 'domain-analysis'
  | 'state-machines'
  | 'permissions'
  | 'critical-files';

export type LocalAiSelectionMode = 'auto' | 'fast' | 'quality';

export interface ModelResolution {
  /** Resolved model name to pass to Ollama. Empty string means no model available. */
  model: string;
  /** Human-readable label shown in the WebView log. */
  label: string;
  /** Reason for the model selection (shown in WebView log). */
  reason: string;
}

export interface LocalAiTaskLogEntry {
  task: TaskType;
  taskLabel: string;
  model: string;
  reason: string;
  timestamp: string;
}

export const TASK_LABELS: Record<TaskType, string> = {
  'module-summary':   'Resumo de módulos',
  'risk-explanation': 'Explicação de riscos',
  'questions-gaps':   'Perguntas e lacunas',
  'agent-context':    'Contexto para IA',
  'plsql-analysis':   'Análise PL/SQL',
  'business-rules':   'Regras de negócio',
  'domain-analysis':  'Análise de domínio',
  'state-machines':   'Máquinas de estado',
  'permissions':      'Permissões',
  'critical-files':   'Arquivos críticos'
};

const QUALITY_TASK_SET = new Set<TaskType>([
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
export function resolveModelForTask(
  task: TaskType,
  mode: LocalAiSelectionMode,
  fastModel: string,
  qualityModel: string,
  availableModels: string[],
  /** If set (non-empty), always use this model regardless of mode. */
  overrideModel?: string
): ModelResolution {
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
  } else {
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

export class OllamaClient {
  constructor(private readonly options: OllamaClientOptions) {}

  get modelName(): string { return this.options.model; }

  async listModels(): Promise<OllamaModel[]> {
    const response = await fetch(`${trimTrailingSlash(this.options.baseUrl)}/api/tags`, {
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      throw new Error(`Ollama health check failed with HTTP ${response.status}.`);
    }

    const data = await response.json() as { models?: OllamaModel[] };
    return data.models ?? [];
  }

  async generate(prompt: string, options: OllamaGenerateOptions = {}): Promise<string> {
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

    const data = await response.json() as { response?: string; error?: string };
    if (data.error) {
      throw new Error(data.error);
    }

    return (data.response ?? '').trim();
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
