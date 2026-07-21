/**
 * Log operacional dos disparos de agente (Frente A) — `.tic-code/dispatch-log.json`.
 *
 * Diferente de `memoryStore.ts` (conhecimento persistente, nunca descartado),
 * este é um log operacional: FIFO cap 200 é aceitável aqui, o que importa é
 * "o que foi disparado recentemente" para o dispatcher aplicar rate-limit e
 * idempotência — não histórico de longuíssimo prazo.
 */
import * as fs from 'fs';
import * as path from 'path';

export const DISPATCH_LOG_FILE = 'dispatch-log.json';
const MAX_ENTRIES = 200;

export type DispatchStatus = 'dispatched' | 'skipped' | 'failed';

export interface DispatchRecord {
  id: string;
  ts: string;
  entity?: string;
  trigger: string;
  repo?: string;
  mode: string;
  issueNumber?: number;
  prNumber?: number;
  status: DispatchStatus;
  reason?: string;
}

export function loadDispatchLog(ticCodeDir: string): DispatchRecord[] {
  const file = path.join(ticCodeDir, DISPATCH_LOG_FILE);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendDispatchRecord(ticCodeDir: string, record: Omit<DispatchRecord, 'id' | 'ts'>): DispatchRecord {
  const all = loadDispatchLog(ticCodeDir);
  const full: DispatchRecord = {
    id: `dsp::${Date.now().toString(36)}::${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    ...record
  };
  all.push(full);
  fs.mkdirSync(ticCodeDir, { recursive: true });
  fs.writeFileSync(path.join(ticCodeDir, DISPATCH_LOG_FILE), JSON.stringify(all.slice(-MAX_ENTRIES), null, 2), 'utf8');
  return full;
}
