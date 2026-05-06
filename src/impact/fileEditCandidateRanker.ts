import { FileEditCandidate, ScreenImpactResult } from './impactTypes';

export function rankFileEditCandidates(result: Pick<ScreenImpactResult, 'frontendMatches'|'backendEndpoints'|'databaseImpact'>): FileEditCandidate[] {
  const out: FileEditCandidate[] = [];
  result.frontendMatches.forEach((m) => m.file !== 'N/A' && out.push({ file: m.file, category: 'edit', stack: 'frontend', reason: 'Match de tela por fingerprint/rota.', confidence: m.confidence, changeType: 'component', priority: 1, evidence: m.evidence }));
  result.backendEndpoints.forEach((b) => b.controllerFile !== 'N/A' && out.push({ file: b.controllerFile, category: 'review-before-edit', stack: 'backend', reason: 'Endpoint relacionado à chamada API.', confidence: b.confidence, changeType: 'endpoint', priority: 3, evidence: b.evidence }));
  result.databaseImpact.sqlFiles.forEach((s) => out.push({ file: s, category: 'possibly-impacted', stack: 'database', reason: 'Recurso SQL/PLSQL relacionado no trace.', confidence: result.databaseImpact.confidence, changeType: 'sql', priority: 4, evidence: result.databaseImpact.evidence }));
  return out;
}
