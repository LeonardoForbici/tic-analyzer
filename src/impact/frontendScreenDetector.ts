import * as vscode from 'vscode';
import { FrontendScreenMatch, ScreenFingerprint } from './impactTypes';

export async function detectFrontendScreen(_root: vscode.WorkspaceFolder, fingerprint: ScreenFingerprint): Promise<FrontendScreenMatch[]> {
  const files = await vscode.workspace.findFiles('**/*.{tsx,ts,jsx,js,html,css,scss}', '**/{node_modules,dist,build,.git,.tic-code}/**', 8000);
  const out: FrontendScreenMatch[] = [];
  for (const f of files) {
    const rel = vscode.workspace.asRelativePath(f, false); const text = Buffer.from(await vscode.workspace.fs.readFile(f)).toString('utf8').toLowerCase();
    let score = 0; const signals: string[] = []; const by: FrontendScreenMatch['matchedBy'] = [];
    if (fingerprint.normalizedRoute && text.includes(fingerprint.normalizedRoute.toLowerCase())) { score += 50; signals.push('rota exata'); by.push('exact-route'); }
    fingerprint.candidateKeywords.forEach((k) => { if (text.includes(k) || rel.toLowerCase().includes(k)) { score += 10; signals.push(`term:${k}`); by.push('visible-term'); } });
    if (score >= 30) out.push({ route: fingerprint.normalizedRoute, file: rel, matchScore: score, matchedSignals: signals, confidence: score >= 60 ? 'CONFIRMED' : 'INFERRED', evidence: signals, matchedBy: by.length ? by : ['inferred'] });
  }
  return out.sort((a, b) => b.matchScore - a.matchScore).slice(0, 30);
}
