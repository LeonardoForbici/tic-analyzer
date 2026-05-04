/**
 * Gerador de matrizes de rastreabilidade para Programação Reversa
 * Inspiração: Writer / Reversa Tracer do Reversa by Sandeco (MIT)
 *
 * Regra: risco técnico → risks.md / risk-impact-matrix.md
 *        regra de negócio → business-rules.md
 *        contrato operacional → operational-contracts.md
 *        lacuna → gaps.md
 *        pergunta → questions.md
 * Nunca mapear package-lock.json para business-rules.md.
 */

import type { ReverseEngineeringInput, CodeSpecMatrixRow, RiskImpactMatrixRow, BusinessRuleCandidate } from './reverseEngineeringTypes';
import { classifyFileToModule } from './generateCodeAnalysis';

export function generateTraceability(
  input: ReverseEngineeringInput,
  businessRules: BusinessRuleCandidate[]
): { codeSpecMatrix: CodeSpecMatrixRow[]; riskImpactMatrix: RiskImpactMatrixRow[] } {
  const codeSpecMatrix = buildCodeSpecMatrix(input, businessRules);
  const riskImpactMatrix = buildRiskImpactMatrix(input);
  return { codeSpecMatrix, riskImpactMatrix };
}

function buildCodeSpecMatrix(input: ReverseEngineeringInput, businessRules: BusinessRuleCandidate[]): CodeSpecMatrixRow[] {
  const rows: CodeSpecMatrixRow[] = [];
  const { inventory } = input;

  // Controllers → contratos de API
  for (const controller of inventory.javaSpring.files.filter((f) => f.kind === 'controller')) {
    rows.push({
      code: controller.path,
      spec: `api-contracts.md#${controller.className}`,
      kind: 'contrato-api',
      confidence: 'confirmado',
      risk: controller.endpoints.length > 10 ? 'alto' : 'baixo',
      notes: `${controller.endpoints.length} endpoint(s)`
    });
  }

  // Regras de negócio confirmadas/inferidas → business-rules.md
  for (const rule of businessRules.slice(0, 20)) {
    for (const file of rule.sourceFiles) {
      // Nunca mapear lock files para business-rules.md
      const lower = file.toLowerCase();
      if (
        lower.endsWith('package-lock.json') ||
        lower.endsWith('yarn.lock') ||
        lower.endsWith('pnpm-lock.yaml')
      ) {
        continue;
      }
      rows.push({
        code: file,
        spec: `business-rules.md#${rule.id}`,
        kind: 'regra-negocio',
        confidence: rule.confidence,
        risk: rule.confidence === 'lacuna' ? 'alto' : 'medio',
        notes: rule.rule.slice(0, 60)
      });
    }
  }

  // PL/SQL triggers → regras de negócio no banco
  for (const trigger of inventory.plsql.entities.filter((e) => e.kind === 'trigger').slice(0, 10)) {
    rows.push({
      code: `${trigger.file}:${trigger.line}`,
      spec: `plsql-analysis.md#triggers`,
      kind: 'trigger-plsql',
      confidence: 'confirmado',
      risk: 'alto',
      notes: trigger.targetTable ? `ON ${trigger.targetTable}` : ''
    });
  }

  // Riscos técnicos críticos → risks.md (NÃO business-rules.md)
  for (const risk of input.risks.filter((r) => r.level === 'critical' || r.level === 'high').slice(0, 15)) {
    const lower = risk.file.toLowerCase();
    if (
      lower.endsWith('package-lock.json') ||
      lower.endsWith('yarn.lock') ||
      lower.endsWith('pnpm-lock.yaml')
    ) {
      continue;
    }
    const { name: moduleName } = classifyFileToModule(risk.file);
    rows.push({
      code: risk.file + (risk.line ? `:${risk.line}` : ''),
      spec: `traceability/risk-impact-matrix.md`,
      kind: 'risco-tecnico',
      confidence: 'confirmado',
      risk: risk.level === 'critical' ? 'critico' : 'alto',
      notes: `${moduleName}: ${risk.title.slice(0, 50)}`
    });
  }

  return rows;
}

function buildRiskImpactMatrix(input: ReverseEngineeringInput): RiskImpactMatrixRow[] {
  const rows: RiskImpactMatrixRow[] = [];
  const { risks } = input;

  for (const risk of risks.slice(0, 30)) {
    // Excluir lock files do matrix de risco (ruído sem valor operacional)
    const lower = risk.file.toLowerCase();
    if (
      lower.endsWith('package-lock.json') ||
      lower.endsWith('yarn.lock') ||
      lower.endsWith('pnpm-lock.yaml')
    ) {
      continue;
    }

    const { name: moduleName } = classifyFileToModule(risk.file);
    rows.push({
      risk: `${risk.level.toUpperCase()}: ${risk.title}`,
      file: risk.file + (risk.line ? `:${risk.line}` : ''),
      module: moduleName,
      impact: riskLevelToImpact(risk.level),
      relatedSpec: inferRelatedSpec(risk),
      recommendation: risk.recommendation
    });
  }

  return rows;
}

export function renderCodeSpecMatrixMd(rows: CodeSpecMatrixRow[], projectName: string): string {
  const lines: string[] = [];
  lines.push(`# Matriz Código ↔ Especificação: ${projectName}`);
  lines.push('');
  lines.push('> Gerado por TIC Coder Lite — Modo Lite.');
  lines.push('> Inspiração metodológica: Writer/Tracer do Reversa by Sandeco (MIT).');
  lines.push('');
  lines.push('> **Legenda de tipo:**');
  lines.push('> - `regra-negocio` → `business-rules.md`');
  lines.push('> - `risco-tecnico` → `traceability/risk-impact-matrix.md` e `risks.md`');
  lines.push('> - `contrato-api` → `api-contracts.md`');
  lines.push('> - `trigger-plsql` → `plsql-analysis.md`');
  lines.push('');

  if (rows.length === 0) {
    lines.push('- Nenhuma rastreabilidade detectada 🔴 LACUNA');
    return lines.join('\n');
  }

  // Separar por tipo
  const businessRuleRows = rows.filter((r) => r.kind === 'regra-negocio');
  const technicalRiskRows = rows.filter((r) => r.kind === 'risco-tecnico');
  const apiRows = rows.filter((r) => r.kind === 'contrato-api');
  const otherRows = rows.filter((r) => !['regra-negocio', 'risco-tecnico', 'contrato-api'].includes(r.kind));

  if (apiRows.length > 0) {
    lines.push('## Contratos de API');
    lines.push('');
    lines.push('| Código | Spec | Confiança | Risco | Observações |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const row of apiRows) {
      const badge = row.confidence === 'confirmado' ? '🟢' : row.confidence === 'inferido' ? '🟡' : '🔴';
      lines.push(`| ${row.code} | ${row.spec} | ${badge} | ${row.risk} | ${row.notes} |`);
    }
    lines.push('');
  }

  if (businessRuleRows.length > 0) {
    lines.push('## Regras de Negócio');
    lines.push('');
    lines.push('| Código | Spec | Confiança | Observações |');
    lines.push('| --- | --- | --- | --- |');
    for (const row of businessRuleRows) {
      const badge = row.confidence === 'confirmado' ? '🟢' : row.confidence === 'inferido' ? '🟡' : '🔴';
      lines.push(`| ${row.code} | ${row.spec} | ${badge} | ${row.notes} |`);
    }
    lines.push('');
  }

  if (technicalRiskRows.length > 0) {
    lines.push('## Riscos Técnicos');
    lines.push('');
    lines.push('> ℹ️ Riscos técnicos NÃO são regras de negócio. Consulte `risks.md` para detalhes.');
    lines.push('');
    lines.push('| Código | Spec | Severidade | Módulo |');
    lines.push('| --- | --- | --- | --- |');
    for (const row of technicalRiskRows) {
      lines.push(`| ${row.code} | ${row.spec} | ${row.risk} | ${row.notes} |`);
    }
    lines.push('');
  }

  if (otherRows.length > 0) {
    lines.push('## Outros');
    lines.push('');
    lines.push('| Código | Spec | Tipo | Confiança | Observações |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const row of otherRows) {
      const badge = row.confidence === 'confirmado' ? '🟢' : row.confidence === 'inferido' ? '🟡' : '🔴';
      lines.push(`| ${row.code} | ${row.spec} | ${row.kind} | ${badge} | ${row.notes} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function renderRiskImpactMatrixMd(rows: RiskImpactMatrixRow[], projectName: string): string {
  const lines: string[] = [];
  lines.push(`# Matriz Risco ↔ Impacto: ${projectName}`);
  lines.push('');
  lines.push('> Gerado por TIC Coder Lite — Modo Lite.');
  lines.push('> Inspiração metodológica: Reviewer do Reversa by Sandeco (MIT).');
  lines.push('');
  lines.push('> ℹ️ Esta matriz lista **riscos técnicos** — não regras de negócio.');
  lines.push('> Para regras de negócio, consulte `business-rules.md`.');
  lines.push('');

  if (rows.length === 0) {
    lines.push('- Nenhum risco detectado 🟢');
    return lines.join('\n');
  }

  lines.push('| Risco | Arquivo | Módulo | Impacto | Spec Relacionada | Recomendação |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    lines.push(`| ${row.risk} | ${row.file} | ${row.module} | ${row.impact} | ${row.relatedSpec} | ${row.recommendation} |`);
  }

  return lines.join('\n');
}

function riskLevelToImpact(level: string): string {
  switch (level) {
    case 'critical': return 'Crítico — bloqueia operação';
    case 'high': return 'Alto — afeta confiabilidade';
    case 'medium': return 'Médio — afeta qualidade';
    default: return 'Baixo — melhorias futuras';
  }
}

function inferRelatedSpec(risk: { title: string; file: string; category?: string }): string {
  if (risk.category === 'plsql') return 'plsql-analysis.md';
  if (risk.title.toLowerCase().includes('sql')) return 'database-analysis.md';
  if (risk.title.toLowerCase().includes('circular') || risk.title.toLowerCase().includes('dependênc')) return 'architecture.md';
  if (risk.title.toLowerCase().includes('endpoint') || risk.title.toLowerCase().includes('controller')) return 'api-contracts.md';
  return 'code-analysis.md';
}
