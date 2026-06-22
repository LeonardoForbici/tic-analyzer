/**
 * ROI — traduz débito técnico e análise em TEMPO e DINHEIRO. O argumento que
 * CTO/FinOps entende: "esta dívida custa ~X dev-days / R$ Y", "os PRs já
 * pouparam Z horas de investigação de impacto". Estimativas transparentes,
 * ancoradas no `debtScore` já calculado e numa taxa-hora configurável.
 */
import type { FileMetrics } from './computeMetrics';
import type { ProjectModule } from './detectModules';

export interface RoiConfig {
  hourlyRate: number;
  currency: string;
  hoursPerDebtPoint: number;
}

// Startup brasileira: default em Reais, taxa-hora de dev sênior carregada.
export const DEFAULT_ROI: RoiConfig = { hourlyRate: 90, currency: 'R$', hoursPerDebtPoint: 0.5 };

/** Minutos poupados por entidade cross-tier que NÃO precisou ser rastreada à mão. */
const MIN_PER_IMPACTED_ENTITY = 5;

export interface RoiModule { module: string; hours: number; cost: number; debtScore: number; }
export interface RoiFile { file: string; debtScore: number; hours: number; cost: number; reasons: string[]; }

export interface RoiResult {
  currency: string;
  hourlyRate: number;
  hoursPerDebtPoint: number;
  remediationHours: number;
  devDays: number;
  debtCost: number;
  totalDebtScore: number;
  byModule: RoiModule[];
  /** Drill-down por arquivo (top por custo) com o PORQUÊ da dívida. */
  topFiles: RoiFile[];
  hoursSaved: number;
  savedCost: number;
  /** savedCost − debtCost (positivo = o investimento na ferramenta já se pagou). */
  net: number;
}

export function resolveRoiConfig(raw: Partial<RoiConfig> | undefined): RoiConfig {
  return {
    hourlyRate: typeof raw?.hourlyRate === 'number' && raw.hourlyRate > 0 ? raw.hourlyRate : DEFAULT_ROI.hourlyRate,
    currency: typeof raw?.currency === 'string' && raw.currency ? raw.currency : DEFAULT_ROI.currency,
    hoursPerDebtPoint: typeof raw?.hoursPerDebtPoint === 'number' && raw.hoursPerDebtPoint > 0 ? raw.hoursPerDebtPoint : DEFAULT_ROI.hoursPerDebtPoint
  };
}

/** Explica, em PT, POR QUE um arquivo tem dívida (espelha a fórmula de debtScore). */
function debtReasons(m: FileMetrics): string[] {
  const r: string[] = [];
  if (m.cyclomaticComplexity > 20) r.push(`complexidade ${m.cyclomaticComplexity} (alta)`);
  if (m.linesOfCode > 1500) r.push(`${m.linesOfCode.toLocaleString('pt-BR')} linhas (arquivo gigante)`);
  else if (m.linesOfCode > 500) r.push(`${m.linesOfCode.toLocaleString('pt-BR')} linhas (arquivo grande)`);
  if (m.couplingOut > 15) r.push(`${m.couplingOut} dependências de saída (acoplamento)`);
  if (m.couplingIn > 5) r.push(`${m.couplingIn} arquivos dependem dele`);
  return r;
}

interface PrHistoryEntry { totalImpacted?: number; }

export function computeRoi(
  fileMetrics: FileMetrics[],
  modules: ProjectModule[],
  prHistory: PrHistoryEntry[],
  rawConfig: Partial<RoiConfig> | undefined
): RoiResult {
  const cfg = resolveRoiConfig(rawConfig);

  // ── Remediação: débito → horas → custo ──────────────────────────────────────
  const hoursByFile = new Map<string, number>();
  const debtByFile = new Map<string, number>();
  let remediationHours = 0;
  let totalDebtScore = 0;
  for (const m of fileMetrics) {
    const debt = m.debtScore ?? 0;
    if (debt <= 0) continue;
    const h = debt * cfg.hoursPerDebtPoint;
    hoursByFile.set(m.file, h);
    debtByFile.set(m.file, debt);
    remediationHours += h;
    totalDebtScore += debt;
  }

  // por módulo
  const byModule: RoiModule[] = [];
  for (const mod of modules) {
    let h = 0, debt = 0;
    for (const f of mod.files) { h += hoursByFile.get(f.relativePath) ?? 0; debt += debtByFile.get(f.relativePath) ?? 0; }
    if (h <= 0) continue;
    byModule.push({ module: mod.name, hours: Math.round(h * 10) / 10, cost: Math.round(h * cfg.hourlyRate), debtScore: debt });
  }
  byModule.sort((a, b) => b.cost - a.cost);

  // por arquivo (drill-down com o porquê)
  const topFiles: RoiFile[] = fileMetrics
    .filter((m) => (m.debtScore ?? 0) > 0)
    .sort((a, b) => (b.debtScore ?? 0) - (a.debtScore ?? 0))
    .slice(0, 40)
    .map((m) => {
      const h = (m.debtScore ?? 0) * cfg.hoursPerDebtPoint;
      return { file: m.file, debtScore: m.debtScore ?? 0, hours: Math.round(h * 10) / 10, cost: Math.round(h * cfg.hourlyRate), reasons: debtReasons(m) };
    });

  // ── Economia: horas que os PRs pouparam de investigação manual ──────────────
  const impactedTotal = prHistory.reduce((s, p) => s + (p.totalImpacted ?? 0), 0);
  const hoursSaved = (impactedTotal * MIN_PER_IMPACTED_ENTITY) / 60;

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const debtCost = Math.round(remediationHours * cfg.hourlyRate);
  const savedCost = Math.round(hoursSaved * cfg.hourlyRate);

  return {
    currency: cfg.currency,
    hourlyRate: cfg.hourlyRate,
    hoursPerDebtPoint: cfg.hoursPerDebtPoint,
    remediationHours: round1(remediationHours),
    devDays: round1(remediationHours / 8),
    debtCost,
    totalDebtScore,
    byModule: byModule.slice(0, 20),
    topFiles,
    hoursSaved: round1(hoursSaved),
    savedCost,
    net: savedCost - debtCost
  };
}

/**
 * Recalcula custos para uma nova taxa-hora/moeda SEM re-analisar (as horas não
 * dependem da taxa). Base do ajuste instantâneo de ROI no app.
 */
export function rescaleRoi(roi: RoiResult, newRate: number, newCurrency: string): RoiResult {
  const rate = newRate > 0 ? newRate : roi.hourlyRate;
  return {
    ...roi,
    hourlyRate: rate,
    currency: newCurrency || roi.currency,
    debtCost: Math.round(roi.remediationHours * rate),
    savedCost: Math.round(roi.hoursSaved * rate),
    net: Math.round(roi.hoursSaved * rate) - Math.round(roi.remediationHours * rate),
    byModule: roi.byModule.map((m) => ({ ...m, cost: Math.round(m.hours * rate) })),
    topFiles: roi.topFiles.map((f) => ({ ...f, cost: Math.round(f.hours * rate) }))
  };
}
