import * as vscode from 'vscode';
import { type LocalAiSelectionMode, OllamaClient } from './ollamaClient';

export interface LocalAiSettings {
  enabled: boolean;
  ollamaUrl: string;
  /** @deprecated Use fastModel / qualityModel. Kept for backward compatibility. */
  model: string;
  fastModel: string;
  qualityModel: string;
  mode: LocalAiSelectionMode;
}

export interface OllamaStatus {
  ok: boolean;
  enabled: boolean;
  url: string;
  model: string;
  models: string[];
  fastModelAvailable: boolean;
  qualityModelAvailable: boolean;
  message: string;
}

export function getLocalAiSettings(): LocalAiSettings {
  const config = vscode.workspace.getConfiguration('ticCoderLite.localAi');
  return {
    enabled: config.get<boolean>('enabled', false),
    ollamaUrl: config.get<string>('ollamaUrl', 'http://localhost:11434'),
    model: config.get<string>('model', 'qwen2.5-coder:3b'),
    fastModel: config.get<string>('fastModel', 'qwen2.5-coder:3b'),
    qualityModel: config.get<string>('qualityModel', 'qwen2.5-coder:7b'),
    mode: config.get<LocalAiSelectionMode>('mode', 'fast')
  };
}

export async function checkOllamaStatus(settings = getLocalAiSettings()): Promise<OllamaStatus> {
  if (!settings.enabled) {
    return {
      ok: false,
      enabled: false,
      url: settings.ollamaUrl,
      model: settings.fastModel,
      models: [],
      fastModelAvailable: false,
      qualityModelAvailable: false,
      message: 'A IA Local está desativada nas configurações. O Modo Lite continua funcionando normalmente.'
    };
  }

  try {
    const client = new OllamaClient({ baseUrl: settings.ollamaUrl, model: settings.fastModel });
    const models = (await client.listModels()).map((m) => m.name);
    const fastModelAvailable = models.includes(settings.fastModel);
    const qualityModelAvailable = models.includes(settings.qualityModel);
    const anyAvailable = fastModelAvailable || qualityModelAvailable;

    let message: string;
    if (anyAvailable) {
      const available = [
        fastModelAvailable ? settings.fastModel : null,
        qualityModelAvailable ? settings.qualityModel : null
      ].filter(Boolean).join(', ');
      message = `Ollama disponível com: ${available}.`;
    } else {
      message = `Ollama está em execução, mas nenhum modelo configurado foi encontrado. Instale com: ollama pull ${settings.fastModel}`;
    }

    return {
      ok: anyAvailable,
      enabled: true,
      url: settings.ollamaUrl,
      model: settings.fastModel,
      models,
      fastModelAvailable,
      qualityModelAvailable,
      message
    };
  } catch {
    return {
      ok: false,
      enabled: true,
      url: settings.ollamaUrl,
      model: settings.fastModel,
      models: [],
      fastModelAvailable: false,
      qualityModelAvailable: false,
      message: `Ollama não está acessível em ${settings.ollamaUrl}. Inicie o Ollama localmente ou continue usando o Modo Lite sem IA.`
    };
  }
}
