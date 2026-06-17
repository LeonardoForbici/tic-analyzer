/**
 * Memória persistente entre análises — indexada por entidade.
 *
 * Complementa o `activityLog.ts` (delta cronológico global) com um store
 * consultável por entidade: "o que já foi tentado/decidido/resolvido para
 * este arquivo, módulo ou procedure?"
 *
 * Vive em `.tic-code/memory.json` (append-only, cap 1000 entradas).
 * Escrito por:
 *   - Agentes via MCP tool `remember`
 *   - Pipeline automaticamente ao confirmar predições (outcome automático)
 * Lido via MCP tool `recall` e injetado em `get_agent_brief`.
 */
import * as fs from 'fs';
import * as path from 'path';

export const MEMORY_FILE = 'memory.json';
const MAX_ENTRIES = 1000;

export type MemoryKind = 'decision' | 'fix-attempt' | 'outcome' | 'note';
export type MemoryResult = 'worked' | 'failed' | 'unknown';

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

export function appendMemory(ticCodeDir: string, entry: Omit<MemoryEntry, 'id' | 'ts'>): MemoryEntry {
  const all = loadMemory(ticCodeDir);
  const full: MemoryEntry = {
    id: `mem::${Date.now().toString(36)}::${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    ...entry
  };
  all.push(full);
  saveMemory(ticCodeDir, all.slice(-MAX_ENTRIES));
  return full;
}

/** Retorna entradas relacionadas a uma entidade (match exato ou substring). */
export function queryMemory(ticCodeDir: string, entity: string, limit = 20): MemoryEntry[] {
  const all = loadMemory(ticCodeDir);
  const q = entity.toLowerCase();
  return all.filter((e) => e.entity.toLowerCase().includes(q) || q.includes(e.entity.toLowerCase()))
    .slice(-limit)
    .reverse(); // mais recentes primeiro
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
