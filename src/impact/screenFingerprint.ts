import * as path from 'path';
import * as fs from 'fs';
import { ScreenFingerprint, ScreenImpactInput } from './impactTypes';

export function buildScreenFingerprint(input: ScreenImpactInput): ScreenFingerprint {
  const words = new Set<string>();
  const add = (v?: string) => v?.toLowerCase().split(/[^a-z0-9áéíóúãõâêôç_-]+/i).filter(Boolean).forEach((w) => words.add(w));
  add(input.screenshotFileName); add(input.url); add(input.changeDescription); add(input.userHints.screenName); add(input.userHints.mainAction); add(input.userHints.targetElement); add(input.userHints.targetField); add(input.userHints.targetRule);
  (input.userHints.visibleTerms ?? []).forEach(add);
  const ext = input.screenshotFileName ? path.extname(input.screenshotFileName).replace('.', '') : undefined;
  const sizeBytes = input.screenshotPath && fs.existsSync(input.screenshotPath) ? fs.statSync(input.screenshotPath).size : undefined;
  return { id: input.id, screenshotPath: input.screenshotPath, screenshotFileName: input.screenshotFileName, screenshotMetadata: { extension: ext, sizeBytes }, url: input.url, normalizedRoute: input.normalizedRoute, changeDescription: input.changeDescription, userHints: input.userHints, imageMode: 'local-reference', visionEnabled: false, candidateKeywords: [...words], candidateRoutes: input.normalizedRoute ? [input.normalizedRoute] : [], candidateComponents: [...words].filter((x) => /page|view|screen|player|form|list|card|modal/i.test(x)), candidateApiCalls: [...words].filter((x) => /api|http|get|post|put|delete|patch/i.test(x)), createdAt: input.createdAt };
}
