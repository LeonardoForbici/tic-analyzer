import { AiChangePackage, ScreenImpactResult } from './impactTypes';

export function buildAiChangePackage(result: ScreenImpactResult, safePrompt: string): AiChangePackage {
  return { screenSummary: `Tela ${result.input.userHints.screenName ?? result.input.normalizedRoute ?? result.input.id}`, requestedChange: result.input.changeDescription, impactSummary: `${result.impactEstimate.level} (${result.impactEstimate.score})`, filesToEdit: result.fileCandidates.filter((c) => c.category === 'edit'), filesToReview: result.fileCandidates.filter((c) => c.category === 'review-before-edit'), backendTrace: result.backendFlow, databaseTrace: result.databaseImpact, risks: result.impactEstimate.risks, gaps: result.gaps, questions: result.questions, safeImplementationPrompt: safePrompt, tokenBudgetHint: 'Use apenas os arquivos candidatos e rastros.', createdAt: new Date().toISOString() };
}
