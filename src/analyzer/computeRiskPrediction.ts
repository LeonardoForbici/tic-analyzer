/**
 * Manutenção preditiva: prevê onde o próximo bug tende a nascer cruzando
 * churn do git (arquivos que mais mudam + commits corretivos) com as métricas
 * estáticas já computadas (complexidade ciclomática e acoplamento).
 *
 * 100% local: lê `git log` do próprio repositório; sem git, a fase é pulada.
 */
import { execSync } from 'child_process';
import type { FileMetrics } from './computeMetrics';

export interface FileChurn {
  commits: number;
  /** Commits cuja mensagem indica correção (fix/bug/hotfix/corrige/conserta). */
  fixes: number;
}

export interface RiskPrediction {
  file: string;
  /** 0–100 — quanto maior, maior a chance de bug no próximo PR. */
  score: number;
  churn: number;
  fixes: number;
  complexity: number;
  coupling: number;
  reasons: string[];
}

const FIX_RE = /\b(fix|bug|hotfix|corrige|conserta|patch|defect)\b/i;

/** Churn por arquivo nos últimos N dias. Retorna null quando não há git. */
export function collectChurn(projectPath: string, days = 90): Map<string, FileChurn> | null {
  let raw: string;
  try {
    raw = execSync(`git log --since=${days}.days --name-only --pretty=format:%H|%s`, {
      cwd: projectPath, encoding: 'utf8', timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch {
    return null;
  }

  const churn = new Map<string, FileChurn>();
  let isFix = false;
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const sep = line.indexOf('|');
    if (sep > 0 && /^[0-9a-f]{40}\|/.test(line)) {
      isFix = FIX_RE.test(line.slice(sep + 1));
      continue;
    }
    const entry = churn.get(line) ?? { commits: 0, fixes: 0 };
    entry.commits++;
    if (isFix) entry.fixes++;
    churn.set(line, entry);
  }
  return churn;
}

/**
 * Score preditivo (função pura, testável): pesos normalizados pelo máximo do
 * projeto — churn 40%, fixes 20%, complexidade 20%, acoplamento 20%.
 */
export function predictRisk(
  churn: Map<string, FileChurn>,
  fileMetrics: FileMetrics[],
  topN = 50
): RiskPrediction[] {
  if (fileMetrics.length === 0) return [];
  const maxChurn = Math.max(1, ...[...churn.values()].map((c) => c.commits));
  const maxFixes = Math.max(1, ...[...churn.values()].map((c) => c.fixes));
  const maxComplexity = Math.max(1, ...fileMetrics.map((f) => f.cyclomaticComplexity));
  const maxCoupling = Math.max(1, ...fileMetrics.map((f) => f.couplingIn + f.couplingOut));

  const out: RiskPrediction[] = [];
  for (const f of fileMetrics) {
    const c = churn.get(f.file) ?? { commits: 0, fixes: 0 };
    const coupling = f.couplingIn + f.couplingOut;
    const score = Math.round(
      ((c.commits / maxChurn) * 0.4 +
        (c.fixes / maxFixes) * 0.2 +
        (f.cyclomaticComplexity / maxComplexity) * 0.2 +
        (coupling / maxCoupling) * 0.2) * 100
    );
    if (score === 0) continue;
    const reasons: string[] = [];
    if (c.commits > 0) reasons.push(`mudou ${c.commits}× em 90 dias`);
    if (c.fixes > 0) reasons.push(`${c.fixes} commit(s) de correção`);
    if (f.cyclomaticComplexity >= 10) reasons.push(`complexidade ${f.cyclomaticComplexity}`);
    if (coupling >= 10) reasons.push(`acoplamento ${coupling}`);
    out.push({
      file: f.file, score, churn: c.commits, fixes: c.fixes,
      complexity: f.cyclomaticComplexity, coupling, reasons
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, topN);
}
