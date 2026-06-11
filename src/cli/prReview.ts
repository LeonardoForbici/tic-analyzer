/**
 * Comparação de duas análises (base vs head) para o PR review automático.
 *
 * Funções puras sobre os artefatos `.tic-code/` já gerados — sem chamadas ao
 * GitHub (o comentário sticky é responsabilidade do composite action, via
 * `gh api`). O markdown sai com o marker `<!-- tic-analyzer-report -->` para o
 * action localizar e ATUALIZAR o comentário em vez de criar outro.
 */
import * as fs from 'fs';
import * as path from 'path';
import { openIndexDb, INDEX_DB_FILE } from '../analyzer/store/indexDb';
import { queryBlastRadius } from '../analyzer/store/impactQueries';
import { loadSnapshots } from '../analyzer/store/snapshots';

export const REPORT_MARKER = '<!-- tic-analyzer-report -->';

interface RiskItem { level: string; title: string; file: string; }
interface ViolationItem { type: string; severity: string; from: string; to?: string; detail?: string; }

export interface PrReviewResult {
  changedFiles: string[];
  newRisks: RiskItem[];
  newViolations: ViolationItem[];
  healthBase: number | null;
  healthHead: number | null;
  healthDelta: number | null;
  /** Blast radius por arquivo mudado (do index.db do head). */
  impacts: Array<{ file: string; totalAffected: number; byKind: Record<string, number>; top: string[] }>;
  totalImpacted: number;
}

export interface GateResult {
  failed: boolean;
  reasons: string[];
}

function readAnalysis(dir: string): any | null {
  const p = path.join(dir, '.tic-code', 'analysis.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

const riskKey = (r: RiskItem) => `${r.file}::${r.title}::${r.level}`;
const violationKey = (v: ViolationItem) => `${v.type}::${v.from}::${v.to ?? ''}`;

export function compareAnalyses(baseDir: string, headDir: string, changedFiles: string[]): PrReviewResult {
  const base = readAnalysis(baseDir);
  const head = readAnalysis(headDir);

  const baseRisks = new Set<string>(((base?.risks?.items ?? []) as RiskItem[]).map(riskKey));
  const headRiskItems = (head?.risks?.items ?? []) as RiskItem[];
  const newRisks = headRiskItems.filter((r) => !baseRisks.has(riskKey(r)));

  const baseViol = new Set<string>(((base?.violations ?? []) as ViolationItem[]).map(violationKey));
  const headViolItems = (head?.violations ?? []) as ViolationItem[];
  const newViolations = headViolItems.filter((v) => !baseViol.has(violationKey(v)));

  // Health: do analysis.json (sempre presente na versão atual) ou do snapshot
  const healthBase = base?.health?.score ?? lastSnapshotScore(baseDir);
  const healthHead = head?.health?.score ?? lastSnapshotScore(headDir);
  const healthDelta = healthBase !== null && healthHead !== null
    ? Math.round((healthHead - healthBase) * 10) / 10
    : null;

  // Impacto cross-tier dos arquivos mudados, via index.db do head
  const impacts: PrReviewResult['impacts'] = [];
  const allImpacted = new Set<string>();
  const db = openIndexDb(path.join(headDir, '.tic-code', INDEX_DB_FILE));
  if (db) {
    try {
      for (const file of changedFiles.slice(0, 50)) {
        const blast = queryBlastRadius(db, file, 5);
        if (!blast || blast.totalAffected === 0) continue;
        impacts.push({
          file,
          totalAffected: blast.totalAffected,
          byKind: blast.byKind,
          top: blast.top.slice(0, 3).map((t) => t.id)
        });
        for (const t of blast.top) allImpacted.add(t.id);
      }
    } finally {
      db.close();
    }
  }
  impacts.sort((a, b) => b.totalAffected - a.totalAffected);

  return {
    changedFiles,
    newRisks,
    newViolations,
    healthBase,
    healthHead,
    healthDelta,
    impacts,
    totalImpacted: impacts.reduce((s, i) => s + i.totalAffected, 0)
  };
}

function lastSnapshotScore(dir: string): number | null {
  const snaps = loadSnapshots(path.join(dir, '.tic-code'));
  return snaps.length > 0 ? snaps[snaps.length - 1].score : null;
}

/**
 * Avalia gates de qualidade. Formato: "new-high-risks,health-drop:5"
 * - new-high-risks: falha se o PR introduz risco critical/high novo
 * - new-violations: falha se introduz violação arquitetural nova
 * - health-drop:N: falha se o health score cair mais que N pontos
 */
export function evaluateGates(result: PrReviewResult, gateSpec: string): GateResult {
  const reasons: string[] = [];
  for (const gate of gateSpec.split(',').map((g) => g.trim()).filter(Boolean)) {
    if (gate === 'new-high-risks') {
      const bad = result.newRisks.filter((r) => r.level === 'critical' || r.level === 'high');
      if (bad.length > 0) reasons.push(`${bad.length} risco(s) critical/high novo(s)`);
    } else if (gate === 'new-violations') {
      if (result.newViolations.length > 0) reasons.push(`${result.newViolations.length} violação(ões) arquitetural(is) nova(s)`);
    } else if (gate.startsWith('health-drop:')) {
      const limit = Number(gate.slice('health-drop:'.length));
      if (Number.isFinite(limit) && result.healthDelta !== null && result.healthDelta < -limit) {
        reasons.push(`health score caiu ${Math.abs(result.healthDelta)} pontos (limite ${limit})`);
      }
    }
  }
  return { failed: reasons.length > 0, reasons };
}

const LEVEL_ICON: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' };

export function formatPrComment(result: PrReviewResult, gate?: GateResult): string {
  const lines: string[] = [
    REPORT_MARKER,
    '## 🔍 TIC Analyzer — análise de impacto do PR',
    '',
    '| | |',
    '| --- | --- |',
    `| Arquivos modificados | ${result.changedFiles.length} |`,
    `| Entidades impactadas (cross-tier) | ${result.totalImpacted} |`,
    `| Riscos novos | ${result.newRisks.length}${result.newRisks.some((r) => r.level === 'critical' || r.level === 'high') ? ' ⚠️' : ''} |`,
    `| Violações arquiteturais novas | ${result.newViolations.length} |`,
    `| Health score | ${result.healthHead ?? '—'}${result.healthDelta !== null ? ` (${result.healthDelta >= 0 ? '+' : ''}${result.healthDelta} vs base ${result.healthBase})` : ''} |`,
    ''
  ];

  if (gate?.failed) {
    lines.push(`> ❌ **Quality gate falhou:** ${gate.reasons.join('; ')}`, '');
  }

  if (result.impacts.length > 0) {
    lines.push('<details><summary><b>💥 Impacto por arquivo modificado</b></summary>', '');
    lines.push('| Arquivo | Afetados | Composição |', '| --- | --- | --- |');
    for (const i of result.impacts.slice(0, 20)) {
      const comp = Object.entries(i.byKind).map(([k, v]) => `${k}: ${v}`).join(', ');
      lines.push(`| \`${i.file}\` | ${i.totalAffected} | ${comp} |`);
    }
    if (result.impacts.length > 20) lines.push(`| ... | e mais ${result.impacts.length - 20} arquivos | |`);
    lines.push('', '</details>', '');
  }

  if (result.newRisks.length > 0) {
    lines.push('<details><summary><b>⚠️ Riscos novos introduzidos</b></summary>', '');
    for (const r of result.newRisks.slice(0, 20)) {
      lines.push(`- ${LEVEL_ICON[r.level] ?? '•'} **${r.title}** — \`${r.file}\``);
    }
    if (result.newRisks.length > 20) lines.push(`- ... e mais ${result.newRisks.length - 20}`);
    lines.push('', '</details>', '');
  }

  if (result.newViolations.length > 0) {
    lines.push('<details><summary><b>🏛️ Violações arquiteturais novas</b></summary>', '');
    for (const v of result.newViolations.slice(0, 20)) {
      lines.push(`- **${v.type}** (${v.severity}): \`${v.from}\`${v.to ? ` → \`${v.to}\`` : ''}${v.detail ? ` — ${v.detail}` : ''}`);
    }
    lines.push('', '</details>', '');
  }

  lines.push('---');
  lines.push('_Análise 100% local (zero tokens de IA). Arquivos renomeados podem aparecer como riscos "novos"._');
  return lines.join('\n');
}
