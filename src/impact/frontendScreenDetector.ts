import * as vscode from 'vscode';
import { FrontendScreenMatch, ScreenFingerprint } from './impactTypes';

const WEAK_TERMS = new Set([
  'app',
  'page',
  'screen',
  'view',
  'form',
  'list',
  'detail',
  'desktop',
  'mobile',
  'tablet',
  'standard',
  'unknown'
]);

export async function detectFrontendScreen(_root: vscode.WorkspaceFolder, fingerprint: ScreenFingerprint): Promise<FrontendScreenMatch[]> {
  const files = await vscode.workspace.findFiles('**/*.{tsx,ts,jsx,js,html,css,scss}', '**/{node_modules,dist,build,.git,.tic-code}/**', 8000);
  const out: FrontendScreenMatch[] = [];

  for (const file of files) {
    const rel = vscode.workspace.asRelativePath(file, false);
    const text = Buffer.from(await vscode.workspace.fs.readFile(file)).toString('utf8');
    const match = scoreFrontendFile(rel, text, fingerprint);
    if (match.matchScore >= 28) out.push(match);
  }

  return out
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 30);
}

function scoreFrontendFile(rel: string, text: string, fingerprint: ScreenFingerprint): FrontendScreenMatch {
  const relLower = normalize(rel);
  const textLower = normalize(text);
  let score = 0;
  const signals: string[] = [];
  const matchedBy: FrontendScreenMatch['matchedBy'] = [];
  let componentName: string | undefined;

  const add = (points: number, signal: string, by: FrontendScreenMatch['matchedBy'][number]) => {
    score += points;
    signals.push(signal);
    matchedBy.push(by);
  };

  if (fingerprint.normalizedRoute) {
    const route = normalize(fingerprint.normalizedRoute);
    const routeSlug = route.replace(/^\//, '').replace(/\//g, '-');
    if (textLower.includes(route) || relLower.includes(routeSlug)) add(65, `exact-route:${fingerprint.normalizedRoute}`, 'exact-route');
  }

  for (const route of fingerprint.candidateRoutes.slice(0, 12)) {
    const routeSlug = normalize(route).replace(/^\//, '').replace(/\//g, '-');
    if (!routeSlug || routeSlug.length < 3) continue;
    if (relLower.includes(routeSlug)) add(26, `route-file:${route}`, 'route-pattern');
    else if (textLower.includes(normalize(route))) add(22, `route-text:${route}`, 'route-pattern');
  }

  for (const component of fingerprint.candidateComponents.slice(0, 24)) {
    const componentLower = normalize(component);
    const kebab = normalize(component.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-'));
    if (relLower.includes(componentLower) || relLower.includes(kebab)) {
      componentName = componentName ?? component;
      add(24, `component-file:${component}`, 'component-name');
    } else if (textLower.includes(componentLower)) {
      componentName = componentName ?? component;
      add(18, `component-text:${component}`, 'component-name');
    }
  }

  const usefulTerms = fingerprint.candidateKeywords.filter(isUsefulTerm).slice(0, 34);
  for (const term of usefulTerms) {
    const normalized = normalize(term);
    if (relLower.includes(normalized)) add(12, `filename:${term}`, 'filename');
    if (containsWord(textLower, normalized)) add(7, `term:${term}`, 'visible-term');
  }

  for (const term of fingerprint.userHints.visibleTerms ?? []) {
    const normalized = normalize(term);
    if (normalized.length >= 3 && containsWord(textLower, normalized)) add(9, `visible-hint:${term}`, 'label');
  }

  const localVision = fingerprint.localVision;
  if (localVision) {
    for (const term of [...localVision.visibleText, ...localVision.uiElements, ...localVision.actions].slice(0, 40)) {
      const normalized = normalize(term);
      if (normalized.length >= 3 && containsWord(textLower, normalized)) add(10, `vision:${term}`, 'label');
    }
    for (const component of localVision.componentCandidates.slice(0, 16)) {
      const normalized = normalize(component);
      if (normalized.length >= 3 && (relLower.includes(normalized) || textLower.includes(normalized))) {
        componentName = componentName ?? component;
        add(18, `vision-component:${component}`, 'component-name');
      }
    }
  }

  const visual = fingerprint.visualRecognition;
  if (visual) {
    for (const signal of [visual.screenType, visual.uiState, visual.primaryAction].filter((item): item is string => Boolean(item))) {
      const normalized = normalize(signal);
      if (normalized.length >= 3 && textLower.includes(normalized)) add(8, `visual:${signal}`, 'inferred');
    }
  }

  return {
    route: fingerprint.normalizedRoute || fingerprint.candidateRoutes[0],
    file: rel,
    componentName,
    matchScore: Math.min(score, 100),
    matchedSignals: unique(signals).slice(0, 24),
    confidence: score >= 70 ? 'CONFIRMED' : score >= 28 ? 'INFERRED' : 'GAP',
    evidence: unique(signals).slice(0, 24),
    matchedBy: uniqueMatchedBy(matchedBy.length ? matchedBy : ['inferred'])
  };
}

function isUsefulTerm(term: string): boolean {
  const normalized = normalize(term);
  return normalized.length >= 3 && !WEAK_TERMS.has(normalized) && !/^\d+$/.test(normalized);
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function containsWord(text: string, term: string): boolean {
  if (!term) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(term)}([^a-z0-9]|$)`).test(text);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function uniqueMatchedBy(values: FrontendScreenMatch['matchedBy']): FrontendScreenMatch['matchedBy'] {
  return [...new Set(values)] as FrontendScreenMatch['matchedBy'];
}
