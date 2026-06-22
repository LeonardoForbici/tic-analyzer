import { execSync } from 'child_process';

/**
 * Análise temporal via histórico do git — a dimensão "comportamental" que falta
 * aos analisadores puramente estáticos (é o núcleo do CodeScene).
 *
 * 100% offline: lê `git log` localmente, zero rede e zero tokens de IA.
 * Resiliente: se a pasta não for um repositório git (ou o git não existir),
 * retorna `available: false` sem quebrar o pipeline.
 *
 * Produz:
 *   - churn por arquivo (nº de commits, linhas +/-, idade, autoria)
 *   - change coupling (arquivos que mudam juntos no mesmo commit)
 *   - knowledge map / bus factor por módulo (risco de pessoa-chave)
 */

export interface FileChurn {
  file: string;
  commits: number;
  linesAdded: number;
  linesDeleted: number;
  firstCommit: string; // YYYY-MM-DD
  lastCommit: string;   // YYYY-MM-DD
  ageDays: number;
  authors: number;
  mainAuthor: string;
  mainAuthorPct: number; // % dos commits do arquivo feitos pelo autor principal
}

export interface ChangeCouplePair {
  a: string;
  b: string;
  coChanges: number; // commits em que a e b mudaram juntos
  degree: number;    // coChanges / min(commits_a, commits_b) — 0..1
}

export interface ModuleKnowledge {
  module: string;
  authors: number;
  busFactor: number; // nº mínimo de autores que cobrem >50% das mudanças (1-2 = risco)
  mainAuthor: string;
  mainAuthorPct: number;
}

export interface GitHistory {
  available: boolean;
  reason?: string;
  analyzedCommits: number;
  rangeFrom: string;
  rangeTo: string;
  churn: FileChurn[];
  coupling: ChangeCouplePair[];
  knowledge: ModuleKnowledge[];
}

export interface GitHistoryOptions {
  knownFiles: Set<string>;
  /** file (relativePath) → nome do módulo, para agregar knowledge/bus factor. */
  fileModule?: Map<string, string>;
  /** Limite de commits lidos (repos enormes). Default 4000 ou TIC_GIT_MAX_COMMITS. */
  maxCommits?: number;
  /**
   * Commits que tocam mais arquivos que isto são ignorados no cálculo de change
   * coupling (merges gigantes/reformatações geram ruído). Default 40.
   */
  maxFilesPerCommit?: number;
}

interface CommitInfo {
  author: string;
  date: string;
  files: string[]; // apenas arquivos conhecidos
}

const REC = '\x01'; // início de registro de commit
const SEP = '\x02'; // separador de campos

function emptyHistory(reason: string): GitHistory {
  return { available: false, reason, analyzedCommits: 0, rangeFrom: '', rangeTo: '', churn: [], coupling: [], knowledge: [] };
}

/** Resolve a notação de rename do numstat para o caminho final.
 *  Ex.: `src/{old => new}/x.ts` → `src/new/x.ts`; `a.ts => b.ts` → `b.ts`. */
function normalizeRenamePath(p: string): string {
  if (p.includes('{') && p.includes('=>')) {
    return p.replace(/\{[^}]*=>\s*([^}]*)\}/g, '$1').replace(/\/\//g, '/');
  }
  if (p.includes(' => ')) {
    return p.split(' => ').pop()!.trim();
  }
  return p;
}

function daysBetween(from: string, to: Date): number {
  const f = new Date(from + 'T00:00:00Z').getTime();
  if (Number.isNaN(f)) return 0;
  return Math.max(0, Math.round((to.getTime() - f) / 86_400_000));
}

export function analyzeGitHistory(projectPath: string, options: GitHistoryOptions): GitHistory {
  const { knownFiles, fileModule } = options;
  const maxCommits = options.maxCommits ?? (Number(process.env.TIC_GIT_MAX_COMMITS) || 4000);
  const maxFilesPerCommit = options.maxFilesPerCommit ?? 40;

  // É um repositório git?
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: projectPath, stdio: 'pipe', timeout: 5000 });
  } catch {
    return emptyHistory('não é um repositório git (ou git indisponível)');
  }

  let raw: string;
  try {
    raw = execSync(
      `git log --no-merges --max-count=${maxCommits} --numstat --date=short --pretty=format:${REC}%H${SEP}%an${SEP}%ad`,
      { cwd: projectPath, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 120_000 }
    );
  } catch (err) {
    return emptyHistory(`falha ao ler git log: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Parse do log ────────────────────────────────────────────────────────────
  const churnAcc = new Map<string, ChurnAcc>();
  const commits: CommitInfo[] = [];
  let current: CommitInfo | null = null;

  for (const line of raw.split('\n')) {
    if (line.startsWith(REC)) {
      if (current) commits.push(current);
      const [, author = '?', date = ''] = line.slice(1).split(SEP);
      current = { author, date, files: [] };
      continue;
    }
    if (!current || !line.trim()) continue;
    // numstat: <added>\t<deleted>\t<path>
    const tab1 = line.indexOf('\t');
    if (tab1 < 0) continue;
    const tab2 = line.indexOf('\t', tab1 + 1);
    if (tab2 < 0) continue;
    const addStr = line.slice(0, tab1);
    const delStr = line.slice(tab1 + 1, tab2);
    const file = normalizeRenamePath(line.slice(tab2 + 1).trim());
    if (!knownFiles.has(file)) continue;
    const added = addStr === '-' ? 0 : parseInt(addStr, 10) || 0;
    const deleted = delStr === '-' ? 0 : parseInt(delStr, 10) || 0;
    current.files.push(file);
    // guarda +/- na 1ª posição livre via marcador paralelo (ver acumuladores abaixo)
    accumulate(churnAcc, file, current.author, current.date, added, deleted);
  }
  if (current) commits.push(current);

  if (commits.length === 0) {
    return emptyHistory('sem commits analisáveis para os arquivos do projeto');
  }

  // ── Change coupling (co-ocorrência no mesmo commit) ─────────────────────────
  const coChange = new Map<string, number>(); // "a\x00b" (a<b) → contagem
  for (const c of commits) {
    const uniq = [...new Set(c.files)];
    if (uniq.length < 2 || uniq.length > maxFilesPerCommit) continue;
    uniq.sort();
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const key = uniq[i] + '\x00' + uniq[j];
        coChange.set(key, (coChange.get(key) ?? 0) + 1);
      }
    }
  }

  const now = new Date();

  // ── Churn por arquivo ───────────────────────────────────────────────────────
  const churn: FileChurn[] = [];
  for (const [file, acc] of churnAcc) {
    const authorsSorted = [...acc.authors.entries()].sort((a, b) => b[1] - a[1]);
    const mainAuthor = authorsSorted[0]?.[0] ?? '?';
    const mainAuthorPct = acc.commits > 0 ? Math.round((authorsSorted[0]?.[1] ?? 0) / acc.commits * 100) : 0;
    churn.push({
      file,
      commits: acc.commits,
      linesAdded: acc.added,
      linesDeleted: acc.deleted,
      firstCommit: acc.firstDate,
      lastCommit: acc.lastDate,
      ageDays: daysBetween(acc.firstDate, now),
      authors: acc.authors.size,
      mainAuthor,
      mainAuthorPct
    });
  }
  churn.sort((a, b) => b.commits - a.commits);

  // ── Change coupling: degree e top-N ─────────────────────────────────────────
  const commitsOf = (f: string) => churnAcc.get(f)?.commits ?? 0;
  const coupling: ChangeCouplePair[] = [];
  for (const [key, co] of coChange) {
    if (co < 2) continue; // ruído de co-mudança única
    const [a, b] = key.split('\x00');
    const denom = Math.min(commitsOf(a), commitsOf(b));
    if (denom === 0) continue;
    const degree = Math.round((co / denom) * 100) / 100;
    if (degree < 0.3) continue; // só acoplamentos relevantes
    coupling.push({ a, b, coChanges: co, degree });
  }
  coupling.sort((x, y) => y.degree - x.degree || y.coChanges - x.coChanges);
  const topCoupling = coupling.slice(0, 200);

  // ── Knowledge map / bus factor por módulo ───────────────────────────────────
  const knowledge: ModuleKnowledge[] = fileModule
    ? computeModuleKnowledge(churnAcc, fileModule)
    : [];

  const dates = commits.map((c) => c.date).filter(Boolean).sort();

  return {
    available: true,
    analyzedCommits: commits.length,
    rangeFrom: dates[0] ?? '',
    rangeTo: dates[dates.length - 1] ?? '',
    churn,
    coupling: topCoupling,
    knowledge
  };
}

// ── Acumulador de churn (módulo-escopo, recriado por chamada via fábrica) ──────
interface ChurnAcc {
  commits: number;
  added: number;
  deleted: number;
  firstDate: string;
  lastDate: string;
  authors: Map<string, number>;
}

function accumulate(map: Map<string, ChurnAcc>, file: string, author: string, date: string, added: number, deleted: number): void {
  let a = map.get(file);
  if (!a) {
    a = { commits: 0, added: 0, deleted: 0, firstDate: date, lastDate: date, authors: new Map() };
    map.set(file, a);
  }
  a.commits++;
  a.added += added;
  a.deleted += deleted;
  // git log vem do mais recente para o mais antigo
  if (date && date < a.firstDate) a.firstDate = date;
  if (date && date > a.lastDate) a.lastDate = date;
  a.authors.set(author, (a.authors.get(author) ?? 0) + 1);
}

function computeModuleKnowledge(churnMap: Map<string, ChurnAcc>, fileModule: Map<string, string>): ModuleKnowledge[] {
  const perModule = new Map<string, Map<string, number>>(); // módulo → (autor → touches)
  for (const [file, acc] of churnMap) {
    const mod = fileModule.get(file);
    if (!mod) continue;
    let authors = perModule.get(mod);
    if (!authors) { authors = new Map(); perModule.set(mod, authors); }
    for (const [author, n] of acc.authors) {
      authors.set(author, (authors.get(author) ?? 0) + n);
    }
  }

  const result: ModuleKnowledge[] = [];
  for (const [mod, authors] of perModule) {
    const sorted = [...authors.entries()].sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, n]) => s + n, 0);
    if (total === 0) continue;
    // bus factor: quantos autores (do topo) são precisos para passar de 50%
    let cumulative = 0;
    let busFactor = 0;
    for (const [, n] of sorted) {
      cumulative += n;
      busFactor++;
      if (cumulative / total > 0.5) break;
    }
    result.push({
      module: mod,
      authors: sorted.length,
      busFactor,
      mainAuthor: sorted[0][0],
      mainAuthorPct: Math.round((sorted[0][1] / total) * 100)
    });
  }
  // ordena por risco: menor bus factor primeiro, depois maior concentração
  result.sort((a, b) => a.busFactor - b.busFactor || b.mainAuthorPct - a.mainAuthorPct);
  return result;
}
