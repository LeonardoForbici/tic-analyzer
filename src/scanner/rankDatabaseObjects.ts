/**
 * Funções de pontuação e ranking de objetos de banco de dados PL/SQL.
 * Usadas pelo databaseIndex.ts para priorizar objetos críticos.
 */

export const CRITICAL_NAME_PATTERNS_DEFAULT: string[] = [
  'fatura',
  'pagamento',
  'boleto',
  'nota',
  'nfe',
  'fiscal',
  'cliente',
  'usuario',
  'permissao',
  'estoque',
  'pedido',
  'produto',
  'contrato',
];

export interface TableScoreInput {
  readCount: number;
  writeCount: number;
  triggerCount: number;
  packageCount: number;
  procedureCount: number;
  criticalPatterns: string[];
}

export interface ScoreResult {
  score: number;
  reasons: string[];
}

export function computeTableScore(name: string, input: TableScoreInput): ScoreResult {
  const reasons: string[] = [];
  let score = 0;
  const lower = name.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const pattern of input.criticalPatterns) {
    if (lower.includes(pattern.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
      score += 30;
      reasons.push(`Nome crítico: ${pattern}`);
      break;
    }
  }

  if (input.writeCount > 10) {
    score += 20;
    reasons.push(`Escrita por muitas rotinas (${input.writeCount})`);
  } else if (input.writeCount > 3) {
    score += 10;
  }

  if (input.readCount > 20) {
    score += 10;
    reasons.push(`Lida por muitas rotinas (${input.readCount})`);
  } else if (input.readCount > 5) {
    score += 5;
  }

  if (input.triggerCount > 0) {
    score += 15 * input.triggerCount;
    reasons.push(`Tem ${input.triggerCount} trigger(s)`);
  }

  if (input.packageCount > 5) {
    score += 15;
    reasons.push(`Usada em ${input.packageCount} packages`);
  } else if (input.packageCount > 1) {
    score += 5;
  }

  if (input.procedureCount > 5) {
    score += 10;
    reasons.push(`Usada em ${input.procedureCount} procedures`);
  }

  return { score, reasons };
}

export interface PackageScoreInput {
  tablesWrittenCount: number;
  tablesReadCount: number;
  procedureCount: number;
  criticalPatterns: string[];
}

export function computePackageScore(name: string, input: PackageScoreInput): ScoreResult {
  const reasons: string[] = [];
  let score = 0;
  const lower = name.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const pattern of input.criticalPatterns) {
    if (lower.includes(pattern.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
      score += 25;
      reasons.push(`Nome crítico: ${pattern}`);
      break;
    }
  }

  if (input.tablesWrittenCount > 5) {
    score += 20;
    reasons.push(`Escreve em ${input.tablesWrittenCount} tabelas`);
  } else if (input.tablesWrittenCount > 0) {
    score += input.tablesWrittenCount * 3;
  }

  if (input.tablesReadCount > 10) {
    score += 10;
    reasons.push(`Lê ${input.tablesReadCount} tabelas`);
  } else if (input.tablesReadCount > 3) {
    score += 5;
  }

  if (input.procedureCount > 20) {
    score += 10;
    reasons.push(`${input.procedureCount} procedures internas`);
  }

  return { score, reasons };
}

export type DbRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export function getRiskLevel(score: number): DbRiskLevel {
  if (score >= 60) {
    return 'critical';
  }
  if (score >= 35) {
    return 'high';
  }
  if (score >= 15) {
    return 'medium';
  }
  return 'low';
}
