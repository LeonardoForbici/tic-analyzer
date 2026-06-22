/**
 * Ownership, bus-factor e onboarding — o custo invisível de "conhecimento".
 *
 * Cruza autoria do git (quem tocou cada arquivo) com a importância (impacto +
 * débito) já calculada para responder: quem domina cada módulo, qual é o
 * conhecimento em risco (arquivo crítico com 1 só autor — se a pessoa sair,
 * dói), e quanto tempo de ramp-up cada módulo exige. 100% local.
 */
import { execSync } from 'child_process';
import type { FileMetrics } from './computeMetrics';
import type { ProjectModule } from './detectModules';

export interface FileAuthorship {
  authors: Map<string, number>; // autor → nº de commits
  primaryAuthor: string;
  lastTouchDaysAgo: number;
}

export interface ModuleOwnership {
  module: string;
  primaryOwner: string;
  ownershipPct: number;   // % dos commits do dono principal
  authorCount: number;
  busFactor: number;      // nº de autores que cobrem 50%+ dos commits
  onboardingHours: number;
  difficulty: 'baixa' | 'média' | 'alta';
}

export interface KnowledgeRisk {
  file: string;
  author: string;
  reason: string;         // por que é crítico (impacto/débito)
  lastTouchDaysAgo: number;
}

export interface OwnershipResult {
  modules: ModuleOwnership[];
  knowledgeRisk: KnowledgeRisk[];
  startHere: string[];    // módulos centrais de baixa dificuldade (onboarding)
  /** rel_path → autor principal (roteamento de revisor). */
  fileOwner: Record<string, string>;
}

/** Autoria por arquivo via git log dos últimos N dias. Null quando não há git. */
export function collectAuthorship(projectPath: string, days = 365): Map<string, FileAuthorship> | null {
  let raw: string;
  try {
    raw = execSync(`git log --since=${days}.days --no-merges --date=unix --format=%H|%an|%ad --name-only`, {
      cwd: projectPath, encoding: 'utf8', timeout: 45_000,
      maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch {
    return null;
  }

  const now = Date.now();
  const map = new Map<string, FileAuthorship>();
  let author = '';
  let whenMs = now;
  for (const line of raw.split('\n')) {
    if (!line) continue;
    if (/^[0-9a-f]{40}\|/.test(line)) {
      const parts = line.split('|');
      author = (parts[1] ?? '').trim() || 'desconhecido';
      const unix = Number(parts[2]);
      whenMs = Number.isFinite(unix) ? unix * 1000 : now;
      continue;
    }
    const entry = map.get(line) ?? { authors: new Map(), primaryAuthor: '', lastTouchDaysAgo: Infinity };
    entry.authors.set(author, (entry.authors.get(author) ?? 0) + 1);
    const days2 = Math.floor((now - whenMs) / 86_400_000);
    if (days2 < entry.lastTouchDaysAgo) entry.lastTouchDaysAgo = days2;
    map.set(line, entry);
  }
  // resolve autor principal por arquivo
  for (const a of map.values()) {
    a.primaryAuthor = [...a.authors.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'desconhecido';
  }
  return map;
}

function busFactorOf(authors: Map<string, number>): number {
  const total = [...authors.values()].reduce((s, v) => s + v, 0);
  if (total === 0) return 0;
  const sorted = [...authors.values()].sort((a, b) => b - a);
  let acc = 0, n = 0;
  for (const c of sorted) { acc += c; n++; if (acc / total >= 0.5) break; }
  return n;
}

export function computeOwnership(
  authorship: Map<string, FileAuthorship>,
  fileMetrics: FileMetrics[],
  modules: ProjectModule[]
): OwnershipResult {
  const metricByFile = new Map(fileMetrics.map((m) => [m.file, m]));
  const fileOwner: Record<string, string> = {};
  for (const [file, a] of authorship) fileOwner[file] = a.primaryAuthor;

  // ── Ownership por módulo ────────────────────────────────────────────────────
  const moduleOut: ModuleOwnership[] = [];
  for (const mod of modules) {
    const authors = new Map<string, number>();
    let complexitySum = 0, count = 0;
    for (const f of mod.files) {
      const a = authorship.get(f.relativePath);
      if (a) for (const [au, c] of a.authors) authors.set(au, (authors.get(au) ?? 0) + c);
      const m = metricByFile.get(f.relativePath);
      if (m) { complexitySum += m.cyclomaticComplexity; count++; }
    }
    const total = [...authors.values()].reduce((s, v) => s + v, 0);
    if (total === 0) continue;
    const [primaryOwner, ownerCommits] = [...authors.entries()].sort((x, y) => y[1] - x[1])[0];
    const bf = busFactorOf(authors);
    const avgComplexity = count > 0 ? complexitySum / count : 0;
    // ramp-up: tamanho × complexidade, penalizado por bus-factor baixo
    const onboardingHours = Math.round(
      (mod.fileCount * 0.3 + avgComplexity * 1.5) * (bf <= 1 ? 1.5 : 1)
    );
    const difficulty: ModuleOwnership['difficulty'] =
      onboardingHours > 40 ? 'alta' : onboardingHours > 16 ? 'média' : 'baixa';
    moduleOut.push({
      module: mod.name,
      primaryOwner,
      ownershipPct: Math.round((ownerCommits / total) * 100),
      authorCount: authors.size,
      busFactor: bf,
      onboardingHours,
      difficulty
    });
  }
  moduleOut.sort((a, b) => b.onboardingHours - a.onboardingHours);

  // ── Conhecimento em risco: arquivo crítico com 1 só autor ───────────────────
  const knowledgeRisk: KnowledgeRisk[] = [];
  for (const [file, a] of authorship) {
    if (a.authors.size > 1) continue;
    const m = metricByFile.get(file);
    const importance = (m?.couplingIn ?? 0) + (m?.debtScore ?? 0);
    if (importance < 8) continue; // só o que dói
    const reasons: string[] = [];
    if ((m?.couplingIn ?? 0) >= 5) reasons.push(`${m!.couplingIn} dependentes`);
    if ((m?.debtScore ?? 0) >= 10) reasons.push(`débito ${m!.debtScore}`);
    knowledgeRisk.push({
      file, author: a.primaryAuthor,
      reason: reasons.join(', ') || 'arquivo importante',
      lastTouchDaysAgo: a.lastTouchDaysAgo === Infinity ? -1 : a.lastTouchDaysAgo
    });
  }
  knowledgeRisk.sort((a, b) => {
    const ma = metricByFile.get(a.file), mb = metricByFile.get(b.file);
    return ((mb?.couplingIn ?? 0) + (mb?.debtScore ?? 0)) - ((ma?.couplingIn ?? 0) + (ma?.debtScore ?? 0));
  });

  // ── "Comece por aqui": módulos de baixa dificuldade ─────────────────────────
  const startHere = moduleOut
    .filter((m) => m.difficulty === 'baixa')
    .slice(0, 5)
    .map((m) => m.module);

  return { modules: moduleOut, knowledgeRisk: knowledgeRisk.slice(0, 30), startHere, fileOwner };
}

/** Roteamento de revisor: dono(s) provável(is) dos arquivos mudados. */
export function suggestReviewers(fileOwner: Record<string, string>, files: string[]): Array<{ author: string; files: string[] }> {
  const byAuthor = new Map<string, string[]>();
  for (const f of files) {
    const owner = fileOwner[f];
    if (!owner) continue;
    byAuthor.set(owner, [...(byAuthor.get(owner) ?? []), f]);
  }
  return [...byAuthor.entries()]
    .map(([author, fs]) => ({ author, files: fs }))
    .sort((a, b) => b.files.length - a.files.length);
}
