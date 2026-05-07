export interface OllamaClientOptions {
  baseUrl: string;
  model: string;
}

export interface OllamaGenerateOptions {
  temperature?: number;
  numPredict?: number;
  timeoutMs?: number;
}

export interface OllamaModel {
  name: string;
}

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
  | 'critical-files'
  | 'screenshot-vision';

export type LocalAiSelectionMode = 'auto' | 'fast' | 'quality';

export interface ModelResolution {
  model: string;
  label: string;
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
  'module-summary': 'Resumo de modulos',
  'risk-explanation': 'Explicacao de riscos',
  'questions-gaps': 'Perguntas e lacunas',
  'agent-context': 'Contexto para IA',
  'plsql-analysis': 'Analise PL/SQL',
  'business-rules': 'Regras de negocio',
  'domain-analysis': 'Analise de dominio',
  'state-machines': 'Maquinas de estado',
  'permissions': 'Permissoes',
  'critical-files': 'Arquivos criticos',
  'screenshot-vision': 'Reconhecimento de screenshot'
};

const QUALITY_TASK_SET = new Set<TaskType>([
  'plsql-analysis',
  'business-rules',
  'domain-analysis',
  'state-machines',
  'permissions',
  'critical-files'
]);

export function resolveModelForTask(
  task: TaskType,
  mode: LocalAiSelectionMode,
  fastModel: string,
  qualityModel: string,
  availableModels: string[],
  overrideModel?: string
): ModelResolution {
  if (overrideModel) {
    if (availableModels.includes(overrideModel)) {
      return { model: overrideModel, label: overrideModel, reason: 'Modelo configurado em localAi.model' };
    }
    return {
      model: '',
      label: 'nenhum',
      reason: `Modelo nao encontrado no Ollama. Instale com: ollama pull ${overrideModel}`
    };
  }

  const wantsQuality = mode === 'quality' || (mode === 'auto' && QUALITY_TASK_SET.has(task));

  if (wantsQuality) {
    if (availableModels.includes(qualityModel)) {
      return { model: qualityModel, label: `${qualityModel} (quality)`, reason: 'Tarefa complexa - usando qualityModel' };
    }
    if (availableModels.includes(fastModel)) {
      return { model: fastModel, label: `${fastModel} (fallback de quality)`, reason: `${qualityModel} nao encontrado - usando fastModel como fallback` };
    }
  } else {
    if (availableModels.includes(fastModel)) {
      return { model: fastModel, label: `${fastModel} (fast)`, reason: 'Usando fastModel' };
    }
    if (availableModels.includes(qualityModel)) {
      return { model: qualityModel, label: `${qualityModel} (fallback de fast)`, reason: `${fastModel} nao encontrado - usando qualityModel como fallback` };
    }
  }

  const installModel = fastModel || 'qwen2.5-coder:3b';
  return {
    model: '',
    label: 'nenhum',
    reason: `Modelo nao encontrado no Ollama. Instale com: ollama pull ${installModel}`
  };
}

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
      signal: AbortSignal.timeout(options.timeoutMs ?? 120000)
    });

    if (!response.ok) {
      throw new Error(`Ollama generation failed with HTTP ${response.status}.`);
    }

    return readOllamaResponse(response);
  }

  async generateWithImages(prompt: string, imagesBase64: string[], options: OllamaGenerateOptions = {}): Promise<string> {
    const response = await fetch(`${trimTrailingSlash(this.options.baseUrl)}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.options.model,
        prompt,
        images: imagesBase64,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.1,
          num_predict: options.numPredict ?? 900
        }
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 180000)
    });

    if (!response.ok) {
      throw new Error(`Ollama vision generation failed with HTTP ${response.status}.`);
    }

    return readOllamaResponse(response);
  }
}

async function readOllamaResponse(response: Response): Promise<string> {
  const data = await response.json() as { response?: string; error?: string };
  if (data.error) {
    throw new Error(data.error);
  }
  return (data.response ?? '').trim();
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
