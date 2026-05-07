import * as path from 'path';
import { analyzeScreenshotFile } from '../reversa-engine/visor/screenshotRecognition';
import { ScreenFingerprint, ScreenImpactInput } from './impactTypes';

export function buildScreenFingerprint(input: ScreenImpactInput): ScreenFingerprint {
  const words = new Set<string>();
  const add = (value?: string) => tokenize(value).forEach((word) => words.add(word));

  add(input.screenshotFileName);
  add(input.url);
  add(input.changeDescription);
  add(input.userHints.screenName);
  add(input.userHints.mainAction);
  add(input.userHints.targetElement);
  add(input.userHints.targetField);
  add(input.userHints.targetRule);
  (input.userHints.visibleTerms ?? []).forEach(add);

  const recognition = input.screenshotPath ? analyzeScreenshotFile(input.screenshotPath) : undefined;
  if (recognition) {
    add(recognition.probableScreen);
    add(recognition.screenType);
    add(recognition.uiState);
    add(recognition.primaryAction);
    recognition.candidateTerms.forEach(add);
    recognition.routeCandidates.forEach(add);
    recognition.componentCandidates.forEach(add);
  }
  if (input.localVision) {
    add(input.localVision.screenName);
    add(input.localVision.summary);
    input.localVision.visibleText.forEach(add);
    input.localVision.uiElements.forEach(add);
    input.localVision.actions.forEach(add);
    input.localVision.routeCandidates.forEach(add);
    input.localVision.componentCandidates.forEach(add);
  }

  const ext = input.screenshotFileName ? path.extname(input.screenshotFileName).replace('.', '') : recognition?.metadata.extension;
  const candidateKeywords = unique([...words, ...(recognition?.candidateTerms ?? [])]);
  const candidateRoutes = unique([
    input.normalizedRoute,
    ...(recognition?.routeCandidates ?? []),
    ...(input.localVision?.routeCandidates ?? [])
  ].filter((item): item is string => Boolean(item)));
  const candidateComponents = unique([
    ...candidateKeywords.filter((item) => /page|view|screen|form|list|card|modal|dashboard|auth|detail|table|grid/i.test(item)),
    ...(recognition?.componentCandidates ?? []),
    ...(input.localVision?.componentCandidates ?? [])
  ]);
  const candidateApiCalls = candidateKeywords.filter((item) => /api|http|get|post|put|delete|patch|fetch|axios/i.test(item));

  return {
    id: input.id,
    screenshotPath: input.screenshotPath,
    screenshotFileName: input.screenshotFileName,
    screenshotMetadata: {
      extension: ext,
      sizeBytes: recognition?.metadata.sizeBytes,
      width: recognition?.metadata.width,
      height: recognition?.metadata.height,
      aspectRatio: recognition?.metadata.aspectRatio,
      viewport: recognition?.metadata.viewport,
      orientation: recognition?.metadata.orientation,
      imageFormat: recognition?.metadata.format,
      visualSignature: recognition?.metadata.visualSignature,
      recognitionScore: recognition?.recognitionScore,
      confidence: recognition?.confidence
    },
    url: input.url,
    normalizedRoute: input.normalizedRoute,
    changeDescription: input.changeDescription,
    userHints: input.userHints,
    imageMode: 'local-reference',
    visionEnabled: false,
    visualRecognition: recognition
      ? {
          probableScreen: recognition.probableScreen,
          screenType: recognition.screenType,
          uiState: recognition.uiState,
          primaryAction: recognition.primaryAction,
          routeCandidates: recognition.routeCandidates,
          componentCandidates: recognition.componentCandidates,
          signals: recognition.signals,
          warnings: recognition.warnings
        }
      : undefined,
    localVision: input.localVision,
    candidateKeywords,
    candidateRoutes,
    candidateComponents,
    candidateApiCalls,
    createdAt: input.createdAt
  };
}

function tokenize(value?: string): string[] {
  if (!value) return [];
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9_-]+/i)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
