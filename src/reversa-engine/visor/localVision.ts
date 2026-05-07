import * as fs from 'fs/promises';
import { getLocalAiSettings } from '../../local-ai/checkOllamaStatus';
import { OllamaClient } from '../../local-ai/ollamaClient';
import type { ScreenshotConfidence, ScreenshotRecognition } from './screenshotRecognition';

export interface ScreenshotVisionEvidence {
  provider: 'ollama';
  enabled: boolean;
  attempted: boolean;
  model?: string;
  confidence: ScreenshotConfidence;
  screenName?: string;
  summary?: string;
  visibleText: string[];
  uiElements: string[];
  actions: string[];
  routeCandidates: string[];
  componentCandidates: string[];
  warnings: string[];
  rawResponse?: string;
}

interface RawVisionResponse {
  screenName?: unknown;
  summary?: unknown;
  visibleText?: unknown;
  uiElements?: unknown;
  actions?: unknown;
  routeCandidates?: unknown;
  componentCandidates?: unknown;
  confidence?: unknown;
  warnings?: unknown;
}

export async function analyzeScreenshotWithLocalVision(
  filePath: string,
  deterministic: ScreenshotRecognition
): Promise<ScreenshotVisionEvidence> {
  const settings = getLocalAiSettings();
  const base = {
    provider: 'ollama' as const,
    visibleText: [],
    uiElements: [],
    actions: [],
    routeCandidates: [],
    componentCandidates: []
  };

  if (!settings.enabled) {
    return {
      ...base,
      enabled: false,
      attempted: false,
      confidence: 'GAP',
      warnings: ['GAP: IA Local desativada; visao por Ollama nao executada.']
    };
  }

  if (!settings.visionEnabled) {
    return {
      ...base,
      enabled: false,
      attempted: false,
      model: settings.visionModel,
      confidence: 'GAP',
      warnings: ['GAP: reconhecimento vision desativado em ticCoderLite.localAi.visionEnabled.']
    };
  }

  const model = settings.visionModel.trim();
  if (!model) {
    return {
      ...base,
      enabled: true,
      attempted: false,
      confidence: 'GAP',
      warnings: ['GAP: ticCoderLite.localAi.visionModel nao configurado.']
    };
  }

  try {
    const client = new OllamaClient({ baseUrl: settings.ollamaUrl, model });
    const availableModels = (await client.listModels()).map((item) => item.name);
    if (!availableModels.includes(model)) {
      return {
        ...base,
        enabled: true,
        attempted: false,
        model,
        confidence: 'GAP',
        warnings: [`GAP: modelo vision nao encontrado no Ollama. Instale com: ollama pull ${model}`]
      };
    }

    const image = await fs.readFile(filePath);
    const prompt = buildVisionPrompt(deterministic);
    const rawResponse = await client.generateWithImages(prompt, [image.toString('base64')], {
      temperature: 0.05,
      numPredict: 900,
      timeoutMs: 180000
    });
    const parsed = parseVisionResponse(rawResponse);
    const evidence = normalizeVisionEvidence(parsed, rawResponse, model);
    if (evidence.confidence === 'GAP') {
      evidence.warnings.push('GAP: modelo vision respondeu sem evidencias suficientes.');
    }
    return evidence;
  } catch (error) {
    return {
      ...base,
      enabled: true,
      attempted: true,
      model,
      confidence: 'GAP',
      warnings: [`GAP: falha ao executar visao local Ollama: ${String(error)}`]
    };
  }
}

function buildVisionPrompt(deterministic: ScreenshotRecognition): string {
  return `Voce e o agente Visor do TIC Coder Lite.
Analise a screenshot de um sistema legado e responda SOMENTE JSON valido, sem markdown.
Nao invente regra de negocio. Se nao conseguir ler algo com confianca, use listas vazias e confidence "GAP".

Contexto deterministico:
- arquivo: ${deterministic.fileName}
- dimensao: ${deterministic.metadata.width ?? 'GAP'}x${deterministic.metadata.height ?? 'GAP'}
- viewport: ${deterministic.metadata.viewport}
- tela provavel por nome/metadados: ${deterministic.probableScreen}
- tipo inferido: ${deterministic.screenType}
- estado inferido: ${deterministic.uiState}
- termos candidatos: ${deterministic.candidateTerms.slice(0, 20).join(', ') || 'GAP'}

Formato obrigatorio:
{
  "screenName": "nome curto da tela ou GAP",
  "summary": "descricao objetiva da tela",
  "visibleText": ["textos visiveis realmente lidos"],
  "uiElements": ["componentes visiveis: botao, tabela, campo, menu, modal"],
  "actions": ["acoes provaveis observadas na UI"],
  "routeCandidates": ["/rotas/candidatas"],
  "componentCandidates": ["ComponentName"],
  "confidence": "CONFIRMED|INFERRED|GAP",
  "warnings": ["lacunas ou incertezas"]
}`;
}

function parseVisionResponse(raw: string): RawVisionResponse {
  const trimmed = raw.trim();
  const direct = tryParseJson(trimmed);
  if (direct) return direct;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    const parsed = tryParseJson(fenced.trim());
    if (parsed) return parsed;
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const parsed = tryParseJson(trimmed.slice(start, end + 1));
    if (parsed) return parsed;
  }

  return { warnings: ['GAP: resposta vision nao estava em JSON valido.'] };
}

function tryParseJson(value: string): RawVisionResponse | undefined {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed ? parsed as RawVisionResponse : undefined;
  } catch {
    return undefined;
  }
}

function normalizeVisionEvidence(raw: RawVisionResponse, rawResponse: string, model: string): ScreenshotVisionEvidence {
  const visibleText = stringArray(raw.visibleText).slice(0, 40);
  const uiElements = stringArray(raw.uiElements).slice(0, 30);
  const actions = stringArray(raw.actions).slice(0, 20);
  const routeCandidates = normalizeRoutes(stringArray(raw.routeCandidates)).slice(0, 16);
  const componentCandidates = stringArray(raw.componentCandidates).slice(0, 24);
  const warnings = stringArray(raw.warnings);
  const confidence = normalizeConfidence(raw.confidence, visibleText, uiElements, actions);

  return {
    provider: 'ollama',
    enabled: true,
    attempted: true,
    model,
    confidence,
    screenName: stringValue(raw.screenName),
    summary: stringValue(raw.summary),
    visibleText,
    uiElements,
    actions,
    routeCandidates,
    componentCandidates,
    warnings,
    rawResponse: rawResponse.slice(0, 6000)
  };
}

function normalizeConfidence(value: unknown, visibleText: string[], uiElements: string[], actions: string[]): ScreenshotConfidence {
  if (value === 'CONFIRMED' || value === 'INFERRED' || value === 'GAP') return value;
  if (visibleText.length >= 3 && uiElements.length >= 2) return 'CONFIRMED';
  if (visibleText.length > 0 || uiElements.length > 0 || actions.length > 0) return 'INFERRED';
  return 'GAP';
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() && value.trim() !== 'GAP' ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
}

function normalizeRoutes(values: string[]): string[] {
  return values.map((value) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }).filter(Boolean);
}
