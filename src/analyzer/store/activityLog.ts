/**
 * Linha do tempo de atividade — o "batimento" do sistema vivo.
 *
 * Cada análise registra o que MUDOU (não o estado, mas o delta): health subiu/
 * caiu, risco novo, regra violada, item de triagem, módulo adicionado, predição
 * confirmada. Append-only em `.tic-code/activity.json` (cap 500), consumido pela
 * aba Atividade, pelo push SSE e pela tool MCP `get_activity`.
 */
import * as fs from 'fs';
import * as path from 'path';

export const ACTIVITY_FILE = 'activity.json';
const MAX_EVENTS = 500;

export type ActivityType =
  | 'analysis'
  | 'health-up'
  | 'health-down'
  | 'risk-new'
  | 'rule-violation'
  | 'triage-new'
  | 'module-added'
  | 'module-removed'
  | 'prediction-confirmed'
  | 'memory-contradiction'
  | 'alert-sent';

export type ActivitySeverity = 'info' | 'warn' | 'critical';

export interface ActivityEvent {
  ts: string;
  type: ActivityType;
  severity: ActivitySeverity;
  title: string;
  detail?: string;
  entity?: string;
}

export function loadActivity(ticCodeDir: string, limit?: number): ActivityEvent[] {
  const file = path.join(ticCodeDir, ACTIVITY_FILE);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const arr: ActivityEvent[] = Array.isArray(parsed) ? parsed : [];
    return limit ? arr.slice(-limit) : arr;
  } catch {
    return [];
  }
}

/** Acrescenta eventos (já com `ts`) ao log, respeitando o cap. Retorna os gravados. */
export function appendEvents(ticCodeDir: string, events: ActivityEvent[]): ActivityEvent[] {
  if (events.length === 0) return [];
  const all = loadActivity(ticCodeDir);
  all.push(...events);
  const trimmed = all.slice(-MAX_EVENTS);
  try {
    fs.mkdirSync(ticCodeDir, { recursive: true });
    fs.writeFileSync(path.join(ticCodeDir, ACTIVITY_FILE), JSON.stringify(trimmed, null, 2), 'utf8');
  } catch { /* best-effort */ }
  return events;
}

export function makeEvent(
  type: ActivityType,
  severity: ActivitySeverity,
  title: string,
  detail?: string,
  entity?: string
): ActivityEvent {
  return { ts: new Date().toISOString(), type, severity, title, detail, entity };
}
