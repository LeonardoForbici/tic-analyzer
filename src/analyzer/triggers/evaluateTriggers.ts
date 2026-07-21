/**
 * Avaliador puro de gatilhos de agente — espelha `notify.ts::selectAlertable`,
 * mas decide DISPARO DE AGENTE CORRETIVO em vez de notificação passiva.
 *
 * Do ponto de vista deste módulo, "self-healing do próprio tic-analyzer" e
 * "feature de produto para projetos analisados" são a MESMA coisa: qual
 * projeto está sendo analisado é irrelevante aqui — só a config
 * (`.tic-rules.json` → seção `agents`) muda quais gatilhos ficam ligados.
 *
 * Config em `.tic-rules.json` → seção `agents` (ver checkArchRules.ts).
 */
import type { ActivityEvent } from '../store/activityLog';

export type AgentDispatchMode = 'issue-only' | 'assign-copilot' | 'create-pr-with-copilot';

export interface AgentTriggerConfig {
  enabled: boolean;
  on?: {
    healthDrop?: number;
    newCriticalRisk?: boolean;
    newRuleViolation?: boolean;
    /** Não vem de ActivityEvent — usado pelo comando `self-heal` quando a própria CI falhou. */
    ciFailure?: boolean;
    buildFailure?: boolean;
  };
  mode: AgentDispatchMode;
  /** owner/repo — se ausente, é inferido via inferRepoSlug(projectPath). */
  repo?: string;
  /** Rate-limit diário de disparos (default 5). */
  maxDispatchesPerDay?: number;
  /** Exige que a issue já tenha esse label antes de disparar (guardrail extra, opcional). */
  requireHumanLabel?: string;
}

export interface TriggerMatch {
  event: ActivityEvent;
  entity?: string;
}

/** Filtra os eventos que cruzam os limiares configurados para disparo de agente. */
export function evaluateTriggers(events: ActivityEvent[], on: AgentTriggerConfig['on'] = {}): TriggerMatch[] {
  const out: TriggerMatch[] = [];
  for (const e of events) {
    if (e.type === 'health-down' && typeof on.healthDrop === 'number') {
      const m = e.title.match(/caiu\s+([\d.]+)/);
      const drop = m ? Number(m[1]) : 0;
      if (drop >= on.healthDrop) out.push({ event: e, entity: e.entity });
    } else if (e.type === 'risk-new' && on.newCriticalRisk && e.severity === 'critical') {
      out.push({ event: e, entity: e.entity });
    } else if (e.type === 'rule-violation' && on.newRuleViolation && e.severity === 'critical') {
      out.push({ event: e, entity: e.entity });
    } else if (e.type === 'ci-failure' && on.ciFailure) {
      out.push({ event: e, entity: e.entity });
    } else if (e.type === 'build-failure' && on.buildFailure) {
      out.push({ event: e, entity: e.entity });
    }
  }
  return out;
}
