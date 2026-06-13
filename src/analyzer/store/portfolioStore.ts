/**
 * Registro GLOBAL de portfólio — vive FORA de qualquer `.tic-code/` (em
 * `~/.tic-analyzer/portfolio.json` ou `TIC_PORTFOLIO_DIR`), para o painel
 * executivo comparar saúde/risco/drift/custo de VÁRIOS repositórios.
 *
 * Cada análise (app, CLI ou serve) faz `upsertProject` com um resumo compacto
 * lido do `analysis.json` do projeto. O painel não reabre cada análise — lê o
 * registro (rápido) e pode mandar re-analisar sob demanda.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

export const PORTFOLIO_FILE = 'portfolio.json';

export interface ProjectSummary {
  id: string;            // hash do caminho absoluto
  name: string;
  path: string;
  analyzedAt: string;
  healthScore: number | null;
  healthGrade: string | null;
  totalFiles: number;
  totalLines: number;
  risks: { total: number; critical: number; high: number };
  archErrors: number;
  debtCost: number | null;
  currency: string;
  hoursSaved: number | null;
}

export function portfolioDir(): string {
  return process.env.TIC_PORTFOLIO_DIR || path.join(os.homedir(), '.tic-analyzer');
}

function portfolioPath(): string {
  return path.join(portfolioDir(), PORTFOLIO_FILE);
}

export function projectId(projectPath: string): string {
  return crypto.createHash('sha1').update(path.resolve(projectPath)).digest('hex').slice(0, 12);
}

export function loadPortfolio(): ProjectSummary[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(portfolioPath(), 'utf8'));
    return Array.isArray(parsed?.projects) ? parsed.projects : [];
  } catch {
    return [];
  }
}

function save(projects: ProjectSummary[]): void {
  try {
    fs.mkdirSync(portfolioDir(), { recursive: true });
    fs.writeFileSync(portfolioPath(), JSON.stringify({ projects }, null, 2), 'utf8');
  } catch { /* best-effort */ }
}

/** Monta o resumo do projeto a partir do `.tic-code/analysis.json`. Null se não analisado. */
export function summarizeProject(projectPath: string): ProjectSummary | null {
  let analysis: any;
  try {
    analysis = JSON.parse(fs.readFileSync(path.join(projectPath, '.tic-code', 'analysis.json'), 'utf8'));
  } catch {
    return null;
  }
  return {
    id: projectId(projectPath),
    name: analysis.project?.name ?? path.basename(projectPath),
    path: path.resolve(projectPath),
    analyzedAt: analysis.analyzedAt ?? new Date().toISOString(),
    healthScore: analysis.health?.score ?? null,
    healthGrade: analysis.health?.grade ?? null,
    totalFiles: analysis.project?.totalFiles ?? 0,
    totalLines: analysis.project?.totalLines ?? 0,
    risks: {
      total: analysis.risks?.total ?? 0,
      critical: analysis.risks?.critical ?? 0,
      high: analysis.risks?.high ?? 0
    },
    archErrors: analysis.archViolations?.errorCount ?? 0,
    debtCost: analysis.roi?.debtCost ?? null,
    currency: analysis.roi?.currency ?? 'US$',
    hoursSaved: analysis.roi?.hoursSaved ?? null
  };
}

/** Insere/atualiza um projeto no portfólio (idempotente por caminho). */
export function upsertProject(projectPath: string): ProjectSummary | null {
  const summary = summarizeProject(projectPath);
  if (!summary) return null;
  const all = loadPortfolio().filter((p) => p.id !== summary.id);
  all.push(summary);
  all.sort((a, b) => (a.healthScore ?? 101) - (b.healthScore ?? 101)); // pior saúde primeiro
  save(all);
  return summary;
}

export function removeProject(id: string): void {
  save(loadPortfolio().filter((p) => p.id !== id));
}
