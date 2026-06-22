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
import { suggestReviewers } from '../analyzer/computeOwnership';

export const REPORT_MARKER = '<!-- tic-analyzer-report -->';

interface RiskItem { level: string; title: string; file: string; }
interface ViolationItem { type: string; severity: string; from: string; to?: string; detail?: string; }

interface ArchViolationItem { ruleId: string; severity: string; description?: string; from: string; to: string; }
interface RiskFlag { file: string; score: number; reasons: string[]; }

export interface PrReviewResult {
  changedFiles: string[];
  newRisks: RiskItem[];
  newViolations: ViolationItem[];
  /** Violações de regra (.tic-rules.json) introduzidas pelo PR. */
  newRuleViolations: ArchViolationItem[];
  healthBase: number | null;
  healthHead: number | null;
  healthDelta: number | null;
  /** Blast radius por arquivo mudado (do index.db do head). */
  impacts: Array<{ file: string; totalAffected: number; byKind: Record<string, number>; top: string[] }>;
  totalImpacted: number;
  /** Arquivos mudados que estão no topo do risco preditivo (churn×acoplamento). */
  riskFlags: RiskFlag[];
  /** Perguntas de grilling (skill grill-with-docs) — confronto código/docs. */
  grilling: string[];
  /** Mudança atinge o limiar de ADR da skill (blast alto + cruza camadas). */
  adrSuggested: boolean;
  /** Revisor(es) sugerido(s) por ownership dos arquivos mudados. */
  reviewers: Array<{ author: string; files: string[] }>;
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
const ruleViolationKey = (v: ArchViolationItem) => `${v.ruleId}::${v.from}::${v.to}`;

export function compareAnalyses(baseDir: string, headDir: string, changedFiles: string[]): PrReviewResult {
  const base = readAnalysis(baseDir);
  const head = readAnalysis(headDir);

  const baseRisks = new Set<string>(((base?.risks?.items ?? []) as RiskItem[]).map(riskKey));
  const headRiskItems = (head?.risks?.items ?? []) as RiskItem[];
  const newRisks = headRiskItems.filter((r) => !baseRisks.has(riskKey(r)));

  const baseViol = new Set<string>(((base?.violations ?? []) as ViolationItem[]).map(violationKey));
  const headViolItems = (head?.violations ?? []) as ViolationItem[];
  const newViolations = headViolItems.filter((v) => !baseViol.has(violationKey(v)));

  // Regras de arquitetura (.tic-rules.json): delta por ruleId+aresta
  const baseRule = new Set<string>(((base?.archViolations?.items ?? []) as ArchViolationItem[]).map(ruleViolationKey));
  const headRuleItems = (head?.archViolations?.items ?? []) as ArchViolationItem[];
  const newRuleViolations = headRuleItems.filter((v) => !baseRule.has(ruleViolationKey(v)));

  // Predição: arquivos mudados que aparecem no topo do risco preditivo do head
  const riskFlags: RiskFlag[] = [];
  const predictions = ((head?.riskPrediction ?? []) as Array<{ file: string; score: number; reasons: string[] }>);
  const predByFile = new Map(predictions.map((p) => [p.file, p]));
  for (const file of changedFiles) {
    const p = predByFile.get(file);
    if (p && p.score >= 50) riskFlags.push({ file, score: p.score, reasons: p.reasons });
  }

  // Health: do analysis.json (sempre presente na versão atual) ou do snapshot
  const healthBase = base?.health?.score ?? lastSnapshotScore(baseDir);
  const healthHead = head?.health?.score ?? lastSnapshotScore(headDir);
  const healthDelta = healthBase !== null && healthHead !== null
    ? Math.round((healthHead - healthBase) * 10) / 10
    : null;

  // Impacto cross-tier dos arquivos mudados, via index.db do head
  const impacts: PrReviewResult['impacts'] = [];
  const allImpacted = new Set<string>();
  const crossTierHits: Array<{ file: string; target: string; kind: string; modules: string[] }> = [];
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
        // Downstream cross-tier: o que este arquivo USA na camada de dados
        // (procedure/tabela/coluna) — base das perguntas de grilling
        const fwd = db.prepare(
          `SELECT to_id, to_kind FROM impact_edges
           WHERE from_id = ? AND to_kind IN ('plsql','table','column') LIMIT 1`
        ).get(`file:${file}`) as { to_id: string; to_kind: string } | undefined;
        if (fwd) crossTierHits.push({ file, target: fwd.to_id, kind: fwd.to_kind, modules: Object.keys(blast.byModule) });
      }
    } finally {
      db.close();
    }
  }
  impacts.sort((a, b) => b.totalAffected - a.totalAffected);

  // ── Grilling (skill grill-with-docs): perguntas nascidas de contradições do
  // grafo + confronto com docs geradas + decisões out-of-scope registradas ──
  const grilling: string[] = [];
  const shortId = (id: string) => id.slice(id.indexOf(':') + 1);
  for (const hit of crossTierHits.slice(0, 3)) {
    if (hit.kind === 'table' || hit.kind === 'column') {
      grilling.push(`\`${hit.file}\` foi alterado e acessa a ${hit.kind === 'table' ? 'tabela' : 'coluna'} \`${shortId(hit.target)}\` — cenário: um INSERT/UPDATE nessa tabela (e os triggers dela) continua válido após esta mudança?`);
    } else {
      grilling.push(`\`${hit.file}\` foi alterado e chama \`${shortId(hit.target)}\` (PL/SQL) — os parâmetros e efeitos da procedure continuam compatíveis com a mudança?`);
    }
  }
  // Docs: business-rules.md dos módulos afetados
  const modulesAsked = new Set<string>();
  for (const hit of crossTierHits) {
    for (const mod of hit.modules) {
      if (modulesAsked.has(mod) || grilling.length >= 5) continue;
      const rulesDoc = path.join(headDir, '.tic-code', 'modules', mod, 'business-rules.md');
      if (fs.existsSync(rulesDoc)) {
        const count = (fs.readFileSync(rulesDoc, 'utf8').match(/^\|/gm) ?? []).length;
        grilling.push(`O módulo \`${mod}\` tem ${Math.max(0, count - 2)} regra(s) de negócio registrada(s) em \`business-rules.md\` — alguma é afetada por este PR?`);
        modulesAsked.add(mod);
      }
    }
  }
  // Out-of-scope: decisão registrada tocada pela mudança
  const archConfig = readArchConfig(headDir);
  for (const d of archConfig.outOfScope) {
    if (grilling.length >= 5) break;
    const touched = changedFiles.some((f) => d.decision.toLowerCase().includes((f.split('/').pop() ?? '').toLowerCase().replace(/\.\w+$/, '')));
    if (touched) grilling.push(`Decisão registrada \`${d.id}\` ("${d.decision}") pode estar sendo reaberta por este PR — confirma que está fora dela?`);
  }
  // ADRs existentes no repo
  if (grilling.length < 5 && crossTierHits.length > 0 && fs.existsSync(path.join(headDir, 'docs', 'adr'))) {
    grilling.push('O repositório mantém ADRs em `docs/adr/` — esta mudança contraria (ou deveria atualizar) alguma decisão registrada?');
  }

  // Limiar de ADR da skill: difícil de reverter + surpreendente + trade-off real
  // (proxy: blast radius alto E atravessa camadas)
  const adrSuggested = impacts.some((i) => i.totalAffected >= 20) && crossTierHits.length > 0;

  // Revisor sugerido por ownership (autoria git) dos arquivos mudados
  let reviewers: PrReviewResult['reviewers'] = [];
  try {
    const own = JSON.parse(fs.readFileSync(path.join(headDir, '.tic-code', 'ownership.json'), 'utf8'));
    if (own?.fileOwner) reviewers = suggestReviewers(own.fileOwner, changedFiles).slice(0, 3);
  } catch { /* sem ownership */ }

  return {
    changedFiles,
    newRisks,
    newViolations,
    newRuleViolations,
    healthBase,
    healthHead,
    healthDelta,
    impacts,
    totalImpacted: impacts.reduce((s, i) => s + i.totalAffected, 0),
    riskFlags,
    grilling: grilling.slice(0, 5),
    adrSuggested,
    reviewers
  };
}

function readArchConfig(dir: string): { outOfScope: Array<{ id: string; decision: string }> } {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, '.tic-code', 'arch-violations.json'), 'utf8'));
    return { outOfScope: Array.isArray(parsed.outOfScope) ? parsed.outOfScope : [] };
  } catch {
    return { outOfScope: [] };
  }
}

export interface PrHistoryEntry {
  date: string;
  changedFiles: number;
  totalImpacted: number;
  newRisks: number;
  newViolations: number;
  newRuleViolations: number;
  healthDelta: number | null;
  gateFailed: boolean;
}

/** Histórico de PR reviews — alimenta o Dashboard de Governança (Recent PRs). */
export function appendPrHistory(headDir: string, result: PrReviewResult, gate?: GateResult): void {
  const file = path.join(headDir, '.tic-code', 'pr-history.json');
  let entries: PrHistoryEntry[] = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(parsed)) entries = parsed;
  } catch { /* primeiro registro */ }
  entries.push({
    date: new Date().toISOString(),
    changedFiles: result.changedFiles.length,
    totalImpacted: result.totalImpacted,
    newRisks: result.newRisks.length,
    newViolations: result.newViolations.length,
    newRuleViolations: result.newRuleViolations.length,
    healthDelta: result.healthDelta,
    gateFailed: gate?.failed ?? false
  });
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(entries.slice(-100)), 'utf8');
  } catch { /* diretório somente leitura: histórico é best-effort */ }
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
    } else if (gate === 'new-rule-violations') {
      const errs = result.newRuleViolations.filter((v) => v.severity === 'error');
      if (errs.length > 0) reasons.push(`${errs.length} violação(ões) de regra de arquitetura nova(s) (.tic-rules.json)`);
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
    `| Regras de arquitetura violadas (novas) | ${result.newRuleViolations.length}${result.newRuleViolations.some((v) => v.severity === 'error') ? ' ⚠️' : ''} |`,
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

  if (result.newRuleViolations.length > 0) {
    lines.push('<details><summary><b>🏛️ Regras de arquitetura violadas (.tic-rules.json)</b></summary>', '');
    for (const v of result.newRuleViolations.slice(0, 20)) {
      lines.push(`- ${v.severity === 'error' ? '🔴' : '🟡'} **${v.ruleId}**: \`${v.from}\` → \`${v.to}\`${v.description ? ` — ${v.description}` : ''}`);
    }
    lines.push('', '</details>', '');
  }

  if (result.riskFlags.length > 0) {
    lines.push('<details><summary><b>🔮 Risco preditivo (churn × acoplamento)</b></summary>', '');
    for (const f of result.riskFlags.slice(0, 10)) {
      lines.push(`- ⚠️ \`${f.file}\` — score ${f.score}: ${f.reasons.join(', ')}`);
    }
    lines.push('', '</details>', '');
  }

  if (result.grilling.length > 0) {
    lines.push('<details><summary><b>🔥 Grilling — perguntas antes do merge</b></summary>', '');
    lines.push('*This was generated by AI during triage.*', '');
    result.grilling.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
    if (result.adrSuggested) {
      lines.push('', '> 📐 Esta mudança atinge o limiar de ADR (difícil de reverter + cruza camadas + trade-off real) — considere registrar a decisão em `docs/adr/`.');
    }
    lines.push('', '</details>', '');
  }

  if (result.reviewers.length > 0) {
    lines.push(`👤 **Revisor sugerido:** ${result.reviewers.map((r) => `${r.author} (${r.files.length})`).join(' · ')}`, '');
  }

  lines.push('---');
  lines.push('_Análise 100% local (zero tokens de IA). Arquivos renomeados podem aparecer como riscos "novos"._');
  return lines.join('\n');
}
