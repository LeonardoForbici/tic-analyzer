/**
 * Dispatcher compartilhado — a peça mais crítica da Frente A. Decide, de
 * forma pura e testável, se um gatilho elegível (evaluateTriggers.ts) deve
 * de fato virar uma issue/PR de agente, aplicando os guardrails do padrão
 * "failure tiering + permission boundaries" (não é sobre ter o modelo mais
 * esperto, é sobre nunca deixar o sistema se auto-disparar em loop):
 *
 *   1. rate-limit diário (maxDispatchesPerDay)
 *   2. idempotência por entity+trigger+dia (não redisparar a cada ciclo de
 *      watch mode de 15s)
 *   3. circuit breaker: se a memória (Frente B) já mostra ≥2 outcomes
 *      'failed' recentes para a mesma entidade, escala para humano em vez
 *      de tentar de novo sozinho
 *
 * Função pura — sem I/O, sem chamada de rede. Quem consome (server/index.ts,
 * cli/index.ts self-heal) fornece os dados já carregados (memória via
 * recall, dispatch-log via loadDispatchLog).
 */
import type { TriggerMatch, AgentTriggerConfig } from '../triggers/evaluateTriggers';
import type { MemoryEntry } from '../store/memoryStore';
import type { DispatchRecord } from '../store/dispatchLog';

const DEFAULT_MAX_PER_DAY = 5;
const FAILURE_CIRCUIT_BREAKER = 2;

export interface DispatchDecision {
  shouldDispatch: boolean;
  reason: string;
  entity?: string;
  match: TriggerMatch;
}

function entityKey(entity: string | undefined): string {
  return entity ?? 'project';
}

function triggerKey(entity: string | undefined, triggerType: string): string {
  return `${entityKey(entity)}::${triggerType}`;
}

function todayKey(ts: string): string {
  return ts.slice(0, 10);
}

/**
 * `recentMemory` é um mapa entity → entradas de memória recentes (via
 * `queryMemory`/`recall_deep` — Frente B); `recentDispatches` vem de
 * `loadDispatchLog`. Ambos são fornecidos pelo caller (impuro).
 */
export function decideDispatch(
  matches: TriggerMatch[],
  recentMemory: Map<string, MemoryEntry[]>,
  recentDispatches: DispatchRecord[],
  config: AgentTriggerConfig,
  now: Date = new Date()
): DispatchDecision[] {
  const today = todayKey(now.toISOString());
  const dispatchedToday = recentDispatches.filter((d) => d.status === 'dispatched' && todayKey(d.ts) === today);
  const dispatchedKeysToday = new Set(dispatchedToday.map((d) => triggerKey(d.entity, d.trigger)));
  const maxPerDay = config.maxDispatchesPerDay ?? DEFAULT_MAX_PER_DAY;
  let countToday = dispatchedToday.length;

  const decisions: DispatchDecision[] = [];
  for (const match of matches) {
    const key = triggerKey(match.entity, match.event.type);

    if (dispatchedKeysToday.has(key)) {
      decisions.push({ shouldDispatch: false, reason: 'já disparado hoje para esta entidade/gatilho (idempotência)', entity: match.entity, match });
      continue;
    }

    if (countToday >= maxPerDay) {
      decisions.push({ shouldDispatch: false, reason: `limite diário de disparos atingido (${maxPerDay})`, entity: match.entity, match });
      continue;
    }

    const mem = match.entity ? recentMemory.get(match.entity) ?? [] : [];
    const recentFailures = mem.filter((m) => m.result === 'failed').length;
    if (recentFailures >= FAILURE_CIRCUIT_BREAKER) {
      decisions.push({
        shouldDispatch: false,
        reason: `${recentFailures} tentativa(s) anterior(es) já falharam para esta entidade — escalando para humano (circuit breaker)`,
        entity: match.entity,
        match
      });
      continue;
    }

    decisions.push({ shouldDispatch: true, reason: 'gatilho elegível', entity: match.entity, match });
    dispatchedKeysToday.add(key);
    countToday++;
  }
  return decisions;
}
