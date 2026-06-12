/**
 * Health score do projeto (0–100, maior = mais saudável) — composição
 * determinística das análises já computadas na pipeline, sem IA.
 *
 * Cada dimensão vira uma penalidade normalizada (com teto) para que projetos
 * de tamanhos muito diferentes sejam comparáveis e o score seja estável entre
 * execuções com o mesmo código.
 */
import type { ProjectMetrics } from './computeMetrics';
import type { RiskFinding } from './detectRisks';
import type { LayerViolation } from './detectLayerViolations';
import type { GraphEdge } from './buildDependencyGraph';

export interface HealthBreakdown {
  /** Pontos descontados do score (0 = dimensão saudável). */
  penalty: number;
  /** Valor bruto que originou a penalidade (p/ exibição). */
  raw: number;
  /** Teto da penalidade desta dimensão. */
  max: number;
}

export interface HealthScore {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'E';
  breakdown: Record<string, HealthBreakdown>;
}

export interface HealthInput {
  totalFiles: number;
  totalLines: number;
  metrics: ProjectMetrics;
  risks: RiskFinding[];
  violations: LayerViolation[];
  /** Violações extras (regras .tic-rules.json severity error) — mesma dimensão. */
  extraViolations?: number;
  deadComponents: number;
  deadPlsql: number;
  edges: GraphEdge[];
}

const RISK_WEIGHT: Record<RiskFinding['level'], number> = { critical: 4, high: 2, medium: 0.5, low: 0.1 };

export function computeHealthScore(input: HealthInput): HealthScore {
  const lines = Math.max(1, input.totalLines);
  const files = Math.max(1, input.totalFiles);
  const breakdown: Record<string, HealthBreakdown> = {};

  const dim = (name: string, raw: number, penalty: number, max: number) => {
    const p = Math.round(Math.min(max, Math.max(0, penalty)) * 10) / 10;
    breakdown[name] = { penalty: p, raw: Math.round(raw * 100) / 100, max };
    return p;
  };

  // Dívida técnica: debt por KLOC (computeMetrics soma debtScore por arquivo)
  const debtPerKloc = input.metrics.totalDebt / (lines / 1000);
  let total = dim('debt', debtPerKloc, debtPerKloc / 2, 25);

  // Riscos ponderados por severidade, por KLOC
  const riskScore = input.risks.reduce((s, r) => s + RISK_WEIGHT[r.level], 0);
  const riskPerKloc = riskScore / (lines / 1000);
  total += dim('risks', riskScore, riskPerKloc * 2, 25);

  // Violações arquiteturais (circulares, frontend→backend, regras custom) por 100 arquivos
  const violCount = input.violations.length + (input.extraViolations ?? 0);
  const violPer100 = (violCount / files) * 100;
  total += dim('violations', violCount, violPer100 * 2, 15);

  // Dead code (componentes + PL/SQL morto) como % dos arquivos
  const dead = input.deadComponents + input.deadPlsql;
  const deadPct = (dead / files) * 100;
  total += dim('deadCode', dead, deadPct, 10);

  // Acoplamento: % de arquivos com fan-in+fan-out alto (>20)
  const highCoupling = input.metrics.files.filter((f) => f.couplingIn + f.couplingOut > 20).length;
  const couplingPct = (highCoupling / files) * 100;
  total += dim('coupling', highCoupling, couplingPct, 15);

  // Qualidade da resolução: % de arestas apenas heurísticas (inferred)
  const totalEdges = input.edges.length;
  const inferred = input.edges.filter((e) => e.confidence !== 'resolved').length;
  const inferredPct = totalEdges > 0 ? (inferred / totalEdges) * 100 : 0;
  total += dim('resolution', inferredPct, inferredPct / 10, 10);

  const score = Math.max(0, Math.round((100 - total) * 10) / 10);
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'E';
  return { score, grade, breakdown };
}
