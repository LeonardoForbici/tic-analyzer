/**
 * Orquestração de ponta a ponta do disparo de agente — o ponto de entrada
 * único usado tanto por server/index.ts (produto: projeto analisado dispara
 * agente ao detectar risco/violação) quanto por cli/index.ts (`self-heal`:
 * o próprio tic-analyzer dispara ao detectar falha de CI). A diferença entre
 * os dois casos é só QUAIS matches são passados — o restante (guardrails,
 * brief, chamada ao GitHub) é o mesmo código.
 */
import * as path from 'path';
import type { ActivityEvent } from '../store/activityLog';
import { evaluateTriggers, type AgentTriggerConfig, type TriggerMatch } from '../triggers/evaluateTriggers';
import type { GhClient } from '../github/ghClient';
import { queryMemory } from '../store/memoryStore';
import { loadDispatchLog, type DispatchRecord } from '../store/dispatchLog';
import { decideDispatch } from './dispatcher';
import { dispatchToGithub } from './ghDispatch';
import { openIndexDb, INDEX_DB_FILE } from '../store/indexDb';
import { buildAgentBrief } from '../../mcp/agentBrief';
import { inferRepoSlug } from '../github/repoSlug';

export interface RunAgentDispatchResult {
  matched: number;
  records: DispatchRecord[];
}

/** Monta um AGENT-BRIEF para a entidade (ou um brief genérico de projeto se não houver entidade). */
function buildBriefFor(ticCodeDir: string, entity: string | undefined, fallbackTitle: string): string {
  if (!entity) return `# ${fallbackTitle}\n\nGatilho de projeto (sem entidade específica) — ver activity.json para detalhes.`;
  const db = openIndexDb(path.join(ticCodeDir, INDEX_DB_FILE));
  if (!db) return `# ${fallbackTitle}\n\nEntidade: ${entity}\n\n(index.db indisponível para brief completo — rode a análise novamente.)`;
  try {
    const brief = buildAgentBrief(db, ticCodeDir, entity);
    return brief ?? `# ${fallbackTitle}\n\nEntidade: ${entity} (não encontrada no grafo de impacto).`;
  } finally {
    db.close();
  }
}

export async function runAgentDispatch(
  projectPath: string,
  ticCodeDir: string,
  matches: TriggerMatch[],
  config: AgentTriggerConfig,
  client: GhClient
): Promise<RunAgentDispatchResult> {
  if (matches.length === 0) return { matched: 0, records: [] };

  const repo = config.repo ?? inferRepoSlug(projectPath);
  if (!repo) return { matched: matches.length, records: [] };

  const recentMemory = new Map<string, ReturnType<typeof queryMemory>>();
  for (const m of matches) {
    if (m.entity && !recentMemory.has(m.entity)) recentMemory.set(m.entity, queryMemory(ticCodeDir, m.entity, 10));
  }
  const recentDispatches = loadDispatchLog(ticCodeDir);

  const decisions = decideDispatch(matches, recentMemory, recentDispatches, config);
  const records: DispatchRecord[] = [];
  for (const decision of decisions) {
    const brief = buildBriefFor(ticCodeDir, decision.entity, decision.match.event.title);
    records.push(await dispatchToGithub(ticCodeDir, client, decision, config, { repo, brief }));
  }
  return { matched: matches.length, records };
}

/** Constrói os matches a partir de eventos de atividade (caso "produto": pipeline detectou algo no projeto analisado). */
export function matchesFromEvents(events: ActivityEvent[], on: AgentTriggerConfig['on']): TriggerMatch[] {
  return evaluateTriggers(events, on);
}
