/**
 * What-If Impact Analyzer — tipos e interfaces
 *
 * Responde perguntas como:
 *   "O que acontece se eu mudar o campo `valor` de Double para BigDecimal?"
 *   "E se eu remover o endpoint GET /api/clientes?"
 *   "E se eu renomear o componente PessoaForm?"
 */

export type WhatIfChangeKind =
  | 'field-type-change'   // Mudar tipo de um campo (Double → BigDecimal)
  | 'field-rename'        // Renomear campo
  | 'field-remove'        // Remover campo
  | 'method-signature'    // Mudar assinatura de método
  | 'endpoint-change'     // Mudar rota/método HTTP
  | 'endpoint-remove'     // Remover endpoint
  | 'class-rename'        // Renomear classe/componente
  | 'dependency-change'   // Mudar dependência (import/injeção)
  | 'generic';            // Hipótese livre em linguagem natural

export type WhatIfConfidence = 'CONFIRMED' | 'INFERRED' | 'GAP';

export type WhatIfImpactLayer =
  | 'frontend'
  | 'backend'
  | 'service'
  | 'repository'
  | 'sql'
  | 'test'
  | 'config'
  | 'contract'
  | 'business-rule'
  | 'unknown';

export type WhatIfBreakRisk = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface WhatIfQuery {
  /** Texto livre do usuário: "e se eu mudar campo X de Double para BigDecimal?" */
  hypothesis: string;
  /** Símbolo principal identificado (campo, método, classe, endpoint) */
  targetSymbol?: string;
  /** Tipo de mudança inferido */
  changeKind: WhatIfChangeKind;
  /** Tipo/valor antes da mudança (ex: "Double") */
  fromValue?: string;
  /** Tipo/valor depois da mudança (ex: "BigDecimal") */
  toValue?: string;
  /** Arquivo de origem onde o símbolo está definido */
  targetFile?: string;
}

export interface WhatIfImpactNode {
  /** Arquivo impactado */
  file: string;
  /** Camada arquitetural */
  layer: WhatIfImpactLayer;
  /** Por que este arquivo é impactado */
  reason: string;
  /** Trecho de evidência (arquivo:linha ou símbolo) */
  evidence: string[];
  /** Risco de quebra */
  breakRisk: WhatIfBreakRisk;
  /** Confiança da detecção */
  confidence: WhatIfConfidence;
  /** Ação recomendada para este arquivo */
  recommendedAction: string;
}

export interface WhatIfBusinessRuleImpact {
  ruleId: string;
  rule: string;
  impactDescription: string;
  confidence: WhatIfConfidence;
}

export interface WhatIfImpactResult {
  query: WhatIfQuery;
  generatedAt: string;
  /** Todos os arquivos impactados organizados por camada */
  impactedNodes: WhatIfImpactNode[];
  /** Regras de negócio que dependem do símbolo alterado */
  impactedBusinessRules: WhatIfBusinessRuleImpact[];
  /** Resumo por camada */
  layerSummary: Record<WhatIfImpactLayer, number>;
  /** Nível de risco geral */
  overallRisk: WhatIfBreakRisk;
  /** Score de impacto 0-100 */
  impactScore: number;
  /** Lacunas — o que não foi possível determinar */
  gaps: string[];
  /** Perguntas para validação humana */
  questions: string[];
  /** Estimativa de esforço */
  effortEstimate: {
    minHours: number;
    maxHours: number;
    label: string;
  };
}
