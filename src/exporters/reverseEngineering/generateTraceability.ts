/**
 * Gerador de matrizes de rastreabilidade para Programação Reversa
 * Inspiração: Writer / Reversa Tracer do Reversa by Sandeco (MIT)
 */

import type { ReverseEngineeringInput, CodeSpecMatrixRow, RiskImpactMatrixRow, BusinessRuleCandidate } from './reverseEngineeringTypes';

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

  // Controllers -> contratos de API
  for (const controller of inventory.javaSpring.files.filter((f) => f.kind === 'controller')) {
    rows.push({
      code: controller.path,
      spec: `api-contracts.md#${controller.className}`,
      kind: 'controller',
      confidence: 'confirmado',
      risk: controller.endpoints.length > 10 ? 'alto' : 'baixo',
      notes: `${controller.endpoints.length} endpoint(s)`
    });
  }

  // Regras de negócio
  for (const rule of businessRules.slice(0, 20)) {
    for (const file of rule.sourceFiles) {
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

  // PL/SQL triggers -> regras de negócio no banco
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

  return rows;
}

function buildRiskImpactMatrix(input: ReverseEngineeringInput): RiskImpactMatrixRow[] {
  const rows: RiskImpactMatrixRow[] = [];
  const { risks, inventory } = input;

  for (const risk of risks.slice(0, 30)) {
    const module = inferModuleForFile(risk.file, inventory);
    rows.push({
      risk: `${risk.level.toUpperCase()}: ${risk.title}`,
      file: risk.file + (risk.line ? `:${risk.line}` : ''),
      module,
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

  if (rows.length === 0) {
    lines.push('- Nenhuma rastreabilidade detectada 🔴 LACUNA');
    return lines.join('\n');
  }

  lines.push('| Código | Spec Gerada | Tipo | Confiança | Risco | Observações |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    const badge = row.confidence === 'confirmado' ? '🟢' : row.confidence === 'inferido' ? '🟡' : '🔴';
    lines.push(`| ${row.code} | ${row.spec} | ${row.kind} | ${badge} | ${row.risk} | ${row.notes} |`);
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

function inferModuleForFile(file: string, inventory: ArchitectureInventory): string {
  for (const mod of inventory.modules) {
    if (mod.files.includes(file)) return mod.kind;
  }

  for (const jsFile of inventory.javaSpring.files) {
    if (jsFile.path === file) return jsFile.kind;
  }

  const lower = file.toLowerCase();
  if (lower.includes('controller')) return 'controller';
  if (lower.includes('service')) return 'service';
  if (lower.includes('repository') || lower.includes('repo')) return 'repository';
  if (lower.includes('entity') || lower.endsWith('.entity.ts')) return 'entity';
  if (lower.includes('frontend') || lower.includes('/src/')) return 'frontend';
  if (['.sql', '.pks', '.pkb', '.prc', '.fnc', '.trg'].some((ext) => lower.endsWith(ext))) return 'database';

  return 'desconhecido';
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
  if (risk.title.toLowerCase().includes('permiss') || risk.title.toLowerCase().includes('role')) return 'permissions.md';
  if (risk.title.toLowerCase().includes('arquitetura') || risk.title.toLowerCase().includes('import')) return 'architecture.md';
  return 'code-analysis.md';
}

// Import necessário
import type { ArchitectureInventory } from '../../scanner/detectStack';
