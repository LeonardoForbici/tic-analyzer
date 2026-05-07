import * as path from 'path';
import { analyzeScreenshotFile, ScreenshotConfidence } from './screenshotRecognition';
import type { ScreenshotVisionEvidence } from './localVision';

export interface VisorShot {
  fileName: string;
  sourcePath: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  format: string;
  viewport: string;
  orientation: string;
  probableScreen: string;
  screenType: string;
  uiState: string;
  flowStage?: number;
  confidence: ScreenshotConfidence;
  recognitionScore: number;
  description: string;
  candidateTerms: string[];
  routeCandidates: string[];
  componentCandidates: string[];
  signals: string[];
  warnings: string[];
  visualSignature: string;
  primaryAction?: string;
  localVision?: ScreenshotVisionEvidence;
}

export function analyzeVisorScreenshots(files: string[]): VisorShot[] {
  return files.map((file, index) => {
    const recognition = analyzeScreenshotFile(file, index);
    return {
      fileName: path.basename(file),
      sourcePath: file,
      width: recognition.metadata.width,
      height: recognition.metadata.height,
      sizeBytes: recognition.metadata.sizeBytes,
      format: recognition.metadata.format,
      viewport: recognition.metadata.viewport,
      orientation: recognition.metadata.orientation,
      probableScreen: recognition.probableScreen,
      screenType: recognition.screenType,
      uiState: recognition.uiState,
      flowStage: recognition.flowStage,
      confidence: recognition.confidence,
      recognitionScore: recognition.recognitionScore,
      description: recognition.description,
      candidateTerms: recognition.candidateTerms,
      routeCandidates: recognition.routeCandidates,
      componentCandidates: recognition.componentCandidates,
      signals: recognition.signals,
      warnings: recognition.warnings,
      visualSignature: recognition.metadata.visualSignature,
      primaryAction: recognition.primaryAction
    };
  });
}
