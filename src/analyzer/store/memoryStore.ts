/**
 * Memória persistente entre análises — indexada por entidade.
 *
 * Complementa o `activityLog.ts` (delta cronológico global) com um store
 * consultável por entidade: "o que já foi tentado/decidido/resolvido para
 * este arquivo, módulo ou procedure?"
 *
 * Vive em `.tic-code/memory.json` (append-only, cap 1000 entradas "quentes").
 * O excedente não é descartado: vai para `.tic-code/memory-archive/<yyyy-Www>.jsonl`
 * (nunca truncado), consultável via `queryArchivedMemory`. Escrito por:
 *   - Agentes via MCP tool `remember`/`link_memory_github`
 *   - Pipeline automaticamente ao confirmar predições (outcome automático)
 * Lido via MCP tools `recall`/`recall_deep`/`find_memory_by_github` e
 * injetado em `get_agent_brief`.
 */
import * as fs from 'fs';
import * as path from 'path';

export const MEMORY_FILE = 'memory.json';
export const MEMORY_ARCHIVE_DIR = 'memory-archive';
const MAX_ENTRIES = 1000;

export type MemoryKind = 'decision' | 'fix-attempt' | 'outcome' | 'note';
export type MemoryResult = 'worked' | 'failed' | 'unknown';
export type GithubLinkKind = 'pr' | 'commit' | 'issue';

export interface GithubLink {
  kind: GithubLinkKind;
  repo: string;
  number?: number;
  sha?: string;
  url: string;
  title?: string;
  state?: string;
  /** Ausente = ainda não confirmado contra a API real (ver githubLinkVerifier.ts). */
  verifiedAt?: string;
}

export interface MemoryEntry {
  id: string;
  ts: string;
  entity: string;
  kind: MemoryKind;
  summary: string;
  detail?: string;
  result?: MemoryResult;
  source?: string;
  refs?: string[];
  githubLinks?: GithubLink[];
}

export function loadMemory(ticCodeDir: string): MemoryEntry[] {
  const file = path.join(ticCodeDir, MEMORY_FILE);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMemory(ticCodeDir: string, entries: MemoryEntry[]): void {
  fs.mkdirSync(ticCodeDir, { recursive: true });
  fs.writeFileSync(path.join(ticCodeDir, MEMORY_FILE), JSON.stringify(entries, null, 2), 'utf8');
}

/** Semana ISO (yyyy-Www) do timestamp — chave de particionamento do arquivo morto. */
function isoWeekKey(ts: string): string {
  const d = new Date(ts);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Grava entradas que sairiam do cap FIFO em `.tic-code/memory-archive/<yyyy-Www>.jsonl`
 * (append, nunca truncado) — em vez de descartar silenciosamente o histórico
 * mais antigo, como o array em memória faria sozinho (padrão Letta/Mem0:
 * arquivar para storage externo paginável, não descartar).
 */
export function archiveOverflow(ticCodeDir: string, overflowEntries: MemoryEntry[]): void {
  if (overflowEntries.length === 0) return;
  const dir = path.join(ticCodeDir, MEMORY_ARCHIVE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const byWeek = new Map<string, MemoryEntry[]>();
  for (const entry of overflowEntries) {
    const key = isoWeekKey(entry.ts);
    const list = byWeek.get(key) ?? [];
    list.push(entry);
    byWeek.set(key, list);
  }
  for (const [week, entries] of byWeek) {
    const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
    fs.appendFileSync(path.join(dir, `${week}.jsonl`), lines, 'utf8');
  }
}

/** Varre `.tic-code/memory-archive/*.jsonl` por entradas relacionadas a uma entidade. */
export function queryArchivedMemory(ticCodeDir: string, entity: string, limit = 20): MemoryEntry[] {
  const dir = path.join(ticCodeDir, MEMORY_ARCHIVE_DIR);
  if (!fs.existsSync(dir)) return [];
  const q = entity.toLowerCase();
  const results: MemoryEntry[] = [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
  for (const file of files) {
    const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const entry: MemoryEntry = JSON.parse(line);
        if (entry.entity.toLowerCase().includes(q) || q.includes(entry.entity.toLowerCase())) results.push(entry);
      } catch {
        // linha corrompida — ignora
      }
    }
  }
  return results.slice(-limit).reverse();
}

export function appendMemory(ticCodeDir: string, entry: Omit<MemoryEntry, 'id' | 'ts'>): MemoryEntry {
  const all = loadMemory(ticCodeDir);
  const full: MemoryEntry = {
    id: `mem::${Date.now().toString(36)}::${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    ...entry
  };
  all.push(full);

  // Roda a manutenção (dedup) antes de decidir o que arquivar, para não
  // arquivar duplicatas que a manutenção normal já teria descartado.
  const { deduped } = runMemoryMaintenance(all);
  const overflow = deduped.length > MAX_ENTRIES ? deduped.slice(0, deduped.length - MAX_ENTRIES) : [];
  if (overflow.length) archiveOverflow(ticCodeDir, overflow);
  saveMemory(ticCodeDir, deduped.slice(-MAX_ENTRIES));
  return full;
}

/** Atualiza uma entrada existente (ex.: anexa githubLinks quando o PR é criado depois da decisão já ter sido lembrada). */
export function updateMemoryEntry(ticCodeDir: string, id: string, patch: Partial<Pick<MemoryEntry, 'githubLinks' | 'result'>>): MemoryEntry | null {
  const all = loadMemory(ticCodeDir);
  const idx = all.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  saveMemory(ticCodeDir, all);
  return all[idx];
}

/** Retorna entradas relacionadas a uma entidade (match exato ou substring). */
export function queryMemory(ticCodeDir: string, entity: string, limit = 20): MemoryEntry[] {
  const all = loadMemory(ticCodeDir);
  const q = entity.toLowerCase();
  return all.filter((e) => e.entity.toLowerCase().includes(q) || q.includes(e.entity.toLowerCase()))
    .slice(-limit)
    .reverse(); // mais recentes primeiro
}

export interface GithubMemoryQuery {
  repo?: string;
  pr?: number;
  commit?: string;
  issue?: number;
}

/** Busca reversa: "o que o tic-analyzer sabe sobre esta PR/commit/issue?" (base do Decision Guardian, Frente D4). */
export function findMemoryByGithub(ticCodeDir: string, query: GithubMemoryQuery, includeArchived = false): MemoryEntry[] {
  const matches = (e: MemoryEntry) =>
    (e.githubLinks ?? []).some((link) => {
      if (query.repo && link.repo !== query.repo) return false;
      if (query.pr !== undefined) return link.kind === 'pr' && link.number === query.pr;
      if (query.commit !== undefined) return link.kind === 'commit' && link.sha === query.commit;
      if (query.issue !== undefined) return link.kind === 'issue' && link.number === query.issue;
      return true; // só filtro de repo
    });

  const hot = loadMemory(ticCodeDir).filter(matches).reverse();
  if (!includeArchived) return hot;

  const dir = path.join(ticCodeDir, MEMORY_ARCHIVE_DIR);
  if (!fs.existsSync(dir)) return hot;
  const archived: MemoryEntry[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
    for (const line of fs.readFileSync(path.join(dir, file), 'utf8').split('\n').filter(Boolean)) {
      try {
        const entry: MemoryEntry = JSON.parse(line);
        if (matches(entry)) archived.push(entry);
      } catch {
        // linha corrompida — ignora
      }
    }
  }
  return [...hot, ...archived.reverse()];
}

/**
 * Dream-cycle: consolida entradas duplicadas (mesma entity+summary) e detecta
 * contradições (dois outcomes opostos para a mesma entity). Retorna um relatório
 * de manutenção sem I/O — o caller grava se quiser.
 */
export function runMemoryMaintenance(entries: MemoryEntry[]): {
  deduped: MemoryEntry[];
  contradictions: Array<{ entity: string; entries: MemoryEntry[] }>;
} {
  // Dedup: agrupa por entity+kind+summary (normalizado), mantém mais recente
  const seen = new Map<string, MemoryEntry>();
  for (const e of entries) {
    const key = `${e.entity}::${e.kind}::${e.summary.toLowerCase().slice(0, 80)}`;
    const existing = seen.get(key);
    if (!existing || e.ts > existing.ts) seen.set(key, e);
  }
  const deduped = [...seen.values()].sort((a, b) => a.ts.localeCompare(b.ts));

  // Contradições: entity com outcomes 'worked' e 'failed'
  const byEntity = new Map<string, MemoryEntry[]>();
  for (const e of deduped) {
    if (!e.result) continue;
    const list = byEntity.get(e.entity) ?? [];
    list.push(e);
    byEntity.set(e.entity, list);
  }
  const contradictions: Array<{ entity: string; entries: MemoryEntry[] }> = [];
  for (const [entity, list] of byEntity) {
    const hasWorked = list.some((e) => e.result === 'worked');
    const hasFailed = list.some((e) => e.result === 'failed');
    if (hasWorked && hasFailed) contradictions.push({ entity, entries: list });
  }

  return { deduped, contradictions };
}
