/**
 * Self-delta + loop de aprendizado preditivo.
 *
 * Compara a análise ATUAL com a ANTERIOR (snapshot + analysis.json) e produz a
 * lista de eventos de atividade: o que mudou desde a última vez. Diferente do
 * `compareAnalyses` (base vs head de um PR), aqui é o projeto consigo mesmo ao
 * longo do tempo — a memória do sistema vivo.
 *
 * Funções puras (sem I/O), testáveis isoladamente.
 */
import { makeEvent, type ActivityEvent } from './store/activityLog';
import { appendMemory } from './store/memoryStore';
import type { RiskPrediction } from './computeRiskPrediction';
import type { FileChurn } from './computeRiskPrediction';

interface RiskItem { level: string; title: string; file: string; }
interface ArchViolationItem { ruleId: string; severity: string; from: string; to: string; }

export interface DeltaSnapshot {
  score: number;
  counts: { risks: number; violations: number; modules: number; hotspots: number };
}
export interface DeltaAnalysis {
  risks?: { items?: RiskItem[] };
  archViolations?: { items?: ArchViolationItem[] };
  modules?: Array<{ name: string }>;
}
export interface DeltaInput {
  snapshot: DeltaSnapshot;
  analysis: DeltaAnalysis;
}

const riskKey = (r: RiskItem) => `${r.file}::${r.title}::${r.level}`;
const ruleKey = (v: ArchViolationItem) => `${v.ruleId}::${v.from}::${v.to}`;

/** Eventos que descrevem a mudança de `prev` → `cur`. `prev` null = primeira análise. */
export function computeSelfDelta(prev: DeltaInput | null, cur: DeltaInput): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  if (!prev) return events; // primeira análise: só o evento 'analysis' (emitido fora)

  // ── Health ───────────────────────────────────────────────────────────────
  const d = Math.round((cur.snapshot.score - prev.snapshot.score) * 10) / 10;
  if (d !== 0) {
    const sev = d <= -10 ? 'critical' : d < 0 ? 'warn' : 'info';
    events.push(makeEvent(
      d > 0 ? 'health-up' : 'health-down', sev,
      `Health ${d > 0 ? 'subiu' : 'caiu'} ${Math.abs(d)} ponto(s) — agora ${cur.snapshot.score}/100`,
      `era ${prev.snapshot.score}/100`
    ));
  }

  // ── Riscos novos (por arquivo+título+nível) ────────────────────────────────
  const prevRisks = new Set((prev.analysis.risks?.items ?? []).map(riskKey));
  for (const r of cur.analysis.risks?.items ?? []) {
    if (prevRisks.has(riskKey(r))) continue;
    const sev = r.level === 'critical' ? 'critical' : r.level === 'high' ? 'warn' : 'info';
    events.push(makeEvent('risk-new', sev, `Risco novo (${r.level}): ${r.title}`, undefined, `file:${r.file}`));
  }

  // ── Violações de regra novas ───────────────────────────────────────────────
  const prevRules = new Set((prev.analysis.archViolations?.items ?? []).map(ruleKey));
  for (const v of cur.analysis.archViolations?.items ?? []) {
    if (prevRules.has(ruleKey(v))) continue;
    events.push(makeEvent('rule-violation', v.severity === 'error' ? 'critical' : 'warn',
      `Regra "${v.ruleId}" violada`, `${v.from} → ${v.to}`, `file:${v.from}`));
  }

  // ── Módulos add/removidos ──────────────────────────────────────────────────
  const prevMods = new Set((prev.analysis.modules ?? []).map((m) => m.name));
  const curMods = new Set((cur.analysis.modules ?? []).map((m) => m.name));
  for (const m of curMods) if (!prevMods.has(m)) events.push(makeEvent('module-added', 'info', `Módulo novo: ${m}`));
  for (const m of prevMods) if (!curMods.has(m)) events.push(makeEvent('module-removed', 'info', `Módulo removido: ${m}`));

  // ── Triagem (delta de contagem) ────────────────────────────────────────────
  // (itens em si são gerados na fase triage; aqui só resumimos o crescimento)
  return events;
}

export interface PredictionAccuracy {
  confirmed: number;
  total: number;
  hitRate: number;
  history: Array<{ ts: string; file: string }>;
}

/**
 * Loop de aprendizado: arquivos que a análise ANTERIOR marcou como alto risco
 * (score ≥ 60) e que DESDE ENTÃO ganharam commit(s) de fix ou viraram risco novo
 * → a predição se confirmou. Atualiza a taxa de acerto acumulada.
 */
export function computePredictionFeedback(
  prevPrediction: RiskPrediction[],
  curChurn: Map<string, FileChurn> | null,
  newRiskFiles: Set<string>,
  prevAccuracy: PredictionAccuracy | null,
  ticCodeDir?: string
): { events: ActivityEvent[]; accuracy: PredictionAccuracy } {
  const acc: PredictionAccuracy = prevAccuracy
    ? { ...prevAccuracy, history: [...prevAccuracy.history] }
    : { confirmed: 0, total: 0, hitRate: 0, history: [] };
  const events: ActivityEvent[] = [];
  const flagged = prevPrediction.filter((p) => p.score >= 60);
  const alreadySeen = new Set(acc.history.map((h) => h.file));

  for (const p of flagged) {
    if (alreadySeen.has(p.file)) continue;
    const churn = curChurn?.get(p.file);
    const gainedFix = churn ? churn.fixes > p.fixes : false;
    const becameRisk = newRiskFiles.has(p.file);
    if (gainedFix || becameRisk) {
      acc.confirmed++;
      acc.total++;
      const nowTs = new Date().toISOString();
      acc.history.push({ ts: nowTs, file: p.file });
      const detail = `score era ${p.score} (${p.reasons.join(', ')}) — ${gainedFix ? 'recebeu fix' : 'virou risco'}`;
      events.push(makeEvent('prediction-confirmed', 'info',
        `Predição confirmada: ${p.file.split('/').pop()}`, detail, `file:${p.file}`));
      // Grava outcome automático na memória persistente.
      if (ticCodeDir) {
        appendMemory(ticCodeDir, {
          entity: `file:${p.file}`,
          kind: 'outcome',
          summary: `Predição de risco confirmada (score ${p.score})`,
          detail,
          result: 'worked',
          source: 'pipeline-auto'
        });
      }
    }
  }
  acc.hitRate = acc.total > 0 ? Math.round((acc.confirmed / acc.total) * 100) / 100 : 0;
  if (acc.history.length > 300) acc.history = acc.history.slice(-300);
  return { events, accuracy: acc };
}
