/**
 * Alertas outbound — a "voz externa" do sistema vivo. Quando um evento cruza um
 * limiar configurado, dispara para Slack (Incoming Webhook) e/ou um webhook JSON
 * genérico. Best-effort: falha de rede nunca quebra a análise.
 *
 * Config em `.tic-rules.json` → seção `alerts` (ver checkArchRules.ts).
 */
import type { ActivityEvent } from './store/activityLog';

export interface AlertConfig {
  slackWebhook?: string;
  webhook?: string;
  on?: {
    healthDrop?: number;        // dispara se health caiu >= N pontos
    newCriticalRisk?: boolean;  // dispara em risco critical novo
    newRuleViolation?: boolean; // dispara em violação de regra (error) nova
  };
}

/** Filtra os eventos que cruzam os limiares configurados. */
export function selectAlertable(events: ActivityEvent[], on: AlertConfig['on'] = {}): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  for (const e of events) {
    if (e.type === 'health-down' && typeof on.healthDrop === 'number') {
      const m = e.title.match(/caiu\s+([\d.]+)/);
      const drop = m ? Number(m[1]) : 0;
      if (drop >= on.healthDrop) out.push(e);
    } else if (e.type === 'risk-new' && on.newCriticalRisk && e.severity === 'critical') {
      out.push(e);
    } else if (e.type === 'rule-violation' && on.newRuleViolation && e.severity === 'critical') {
      out.push(e);
    }
  }
  return out;
}

export interface DispatchResult { channel: 'slack' | 'webhook'; ok: boolean; count: number; }

/**
 * Envia os eventos alertáveis. `fetch` nativo (Node 18+), timeout curto.
 * Retorna o que foi enviado (para registrar `alert-sent` no log).
 */
export async function dispatchAlerts(
  events: ActivityEvent[],
  config: AlertConfig | undefined,
  projectName: string
): Promise<DispatchResult[]> {
  if (!config) return [];
  const alertable = selectAlertable(events, config.on);
  if (alertable.length === 0) return [];

  const results: DispatchResult[] = [];
  const post = async (url: string, body: unknown): Promise<boolean> => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  };

  if (config.slackWebhook) {
    const text = [`*TIC Analyzer — ${projectName}*`, ...alertable.map((e) => `${icon(e.severity)} ${e.title}${e.detail ? ` (${e.detail})` : ''}`)].join('\n');
    results.push({ channel: 'slack', ok: await post(config.slackWebhook, { text }), count: alertable.length });
  }
  if (config.webhook) {
    const body = { project: projectName, ts: new Date().toISOString(), events: alertable };
    results.push({ channel: 'webhook', ok: await post(config.webhook, body), count: alertable.length });
  }
  return results;
}

function icon(sev: ActivityEvent['severity']): string {
  return sev === 'critical' ? '🔴' : sev === 'warn' ? '🟠' : 'ℹ️';
}
