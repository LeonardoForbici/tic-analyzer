/**
 * Ingestão de decisões de reunião — vincula "o que foi decidido numa reunião"
 * a entidades de código, reaproveitando a memória permanente (memoryStore.ts,
 * Frente B) em vez de criar um segundo sistema de memória paralelo.
 *
 * A extração de decisões do transcript é feita pelo AGENTE que chama a tool
 * `ingest_meeting` (MCP) — não pelo motor local, que é zero-tokens de IA por
 * princípio. Este módulo só persiste e liga o que já veio estruturado.
 *
 * Um arquivo por reunião (`.tic-code/meetings/<id>.json`, nunca truncado) +
 * um índice leve (`.tic-code/meetings-index.json`) para listagem rápida —
 * evita de saída o erro do FIFO puro que a Frente B corrigiu retroativamente
 * em memory.json.
 */
import * as fs from 'fs';
import * as path from 'path';
import { appendMemory } from './memoryStore';
import type { OutOfScopeDecision } from '../checkArchRules';

export const MEETINGS_DIR = 'meetings';
export const MEETINGS_INDEX_FILE = 'meetings-index.json';
const MAX_SOURCE_TEXT_CHARS = 20_000;

export type MeetingDecisionType = 'decision' | 'action-item' | 'risk-flagged' | 'out-of-scope';

export interface MeetingDecisionInput {
  summary: string;
  entity?: string;
  decisionType: MeetingDecisionType;
  owner?: string;
  dueDate?: string;
  rationale?: string;
}

export interface MeetingDecision extends MeetingDecisionInput {
  id: string;
}

export interface MeetingRecord {
  id: string;
  ts: string;
  title: string;
  participants?: string[];
  /** Truncado a ~20KB — guardado só para auditoria, não para NLP local. */
  sourceText?: string;
  decisions: MeetingDecision[];
}

export interface MeetingIndexEntry {
  id: string;
  ts: string;
  title: string;
  decisionCount: number;
}

function meetingsDir(ticCodeDir: string): string {
  return path.join(ticCodeDir, MEETINGS_DIR);
}

function loadIndex(ticCodeDir: string): MeetingIndexEntry[] {
  const file = path.join(ticCodeDir, MEETINGS_INDEX_FILE);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveIndex(ticCodeDir: string, entries: MeetingIndexEntry[]): void {
  fs.writeFileSync(path.join(ticCodeDir, MEETINGS_INDEX_FILE), JSON.stringify(entries, null, 2), 'utf8');
}

/** Grava uma reunião (arquivo próprio, nunca truncado) e atualiza o índice leve. */
export function saveMeeting(
  ticCodeDir: string,
  input: { title: string; participants?: string[]; sourceText?: string; decisions: MeetingDecisionInput[] }
): MeetingRecord {
  const id = `meeting::${Date.now().toString(36)}::${Math.random().toString(36).slice(2, 6)}`;
  const ts = new Date().toISOString();
  const record: MeetingRecord = {
    id,
    ts,
    title: input.title,
    participants: input.participants,
    sourceText: input.sourceText?.slice(0, MAX_SOURCE_TEXT_CHARS),
    decisions: input.decisions.map((d, i) => ({ id: `${id}::d${i}`, ...d }))
  };

  const dir = meetingsDir(ticCodeDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(record, null, 2), 'utf8');

  const index = loadIndex(ticCodeDir);
  index.push({ id, ts, title: record.title, decisionCount: record.decisions.length });
  saveIndex(ticCodeDir, index);

  return record;
}

export function loadMeetings(ticCodeDir: string, limit = 20): MeetingIndexEntry[] {
  return loadIndex(ticCodeDir).slice(-limit).reverse();
}

export function loadMeeting(ticCodeDir: string, id: string): MeetingRecord | null {
  const file = path.join(meetingsDir(ticCodeDir), `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export interface IngestDecisionsResult {
  memoryEntriesCreated: number;
  outOfScopeSuggestions: OutOfScopeDecision[];
}

/**
 * Ponte para a memória permanente (Frente B): cada decisão com `entity` vira
 * uma entrada em memory.json (`kind: 'decision'`, `source: 'meeting:<id>'`).
 * Decisões `out-of-scope` NÃO gravam sozinhas — retornam uma sugestão no
 * formato de `.tic-rules.json` para o usuário/agente mesclar conscientemente
 * (evita que uma reunião altere unilateralmente a governança do projeto).
 */
export function ingestDecisions(ticCodeDir: string, meeting: MeetingRecord): IngestDecisionsResult {
  let memoryEntriesCreated = 0;
  const outOfScopeSuggestions: OutOfScopeDecision[] = [];

  for (const d of meeting.decisions) {
    if (d.decisionType === 'out-of-scope') {
      outOfScopeSuggestions.push({
        id: `meeting-${meeting.id}-${d.id}`.replace(/[^a-zA-Z0-9-]/g, '-'),
        decision: d.summary,
        reason: d.rationale ?? `Registrado na reunião "${meeting.title}"`,
        date: meeting.ts.slice(0, 10)
      });
      continue;
    }
    if (!d.entity) continue;
    appendMemory(ticCodeDir, {
      entity: d.entity,
      kind: 'decision',
      summary: d.summary,
      detail: [d.rationale, d.owner ? `responsável: ${d.owner}` : null, d.dueDate ? `prazo: ${d.dueDate}` : null]
        .filter(Boolean)
        .join(' · ') || undefined,
      source: `meeting:${meeting.id}`
    });
    memoryEntriesCreated++;
  }

  return { memoryEntriesCreated, outOfScopeSuggestions };
}
