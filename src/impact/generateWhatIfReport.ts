/**
 * Gerador de relatório Markdown para o What-If Impact Analyzer
 * Organizado por camada: Frontend → API → Service → SQL → Testes → Regras de Negócio
 */

import type { WhatIfImpactResult, WhatIfImpactNode, WhatIfImpactLayer, WhatIfBreakRisk } from './whatIfTypes';

export function generateWhatIfReport(result: WhatIfImpactResult): string {
  const { query, impactedNodes, impactedBusinessRules, overallRisk, impactScore, effortEstimate, gaps, questions } = result;

  const riskBadge = riskEmoji(overallRisk);
  const totalDirect = impactedNodes.filter((n) => n.confidence === 'CONFIRMED').length;
  const totalInferred = impactedNodes.filter((n) => n.confidence === 'INFERRED').length;

  const layerOrder: WhatIfImpactLayer[] = ['sql', 'backend', 'service', 'repository', 'contract', 'business-rule', 'frontend', 'test', 'config', 'unknown'];

  const sections: string[] = [
    `# What-If Impact Analysis`,
    '',
    `> **Hipótese:** ${query.hypothesis}`,
    `> **Símbolo-alvo:** \`${query.targetSymbol ?? 'não identificado'}\``,
    `> **Tipo de mudança:** ${query.changeKind}${query.fromValue ? ` (${query.fromValue} → ${query.toValue})` : ''}`,
    `> **Gerado em:** ${result.generatedAt}`,
    '',
    '---',
    '',
    '## Resumo Executivo',
    '',
    `| Dimensão | Valor |`,
    `|---|---|`,
    `| Risco geral | ${riskBadge} **${overallRisk}** |`,
    `| Score de impacto | ${impactScore}/100 |`,
    `| Esforço estimado | ${effortEstimate.label} |`,
    `| Arquivos diretamente impactados | ${totalDirect} (CONFIRMED) |`,
    `| Arquivos indiretamente impactados | ${totalInferred} (INFERRED) |`,
    `| Regras de negócio afetadas | ${impactedBusinessRules.length} |`,
    `| Lacunas | ${gaps.length} |`,
    '',
    renderLayerSummaryTable(result),
    '',
    '---',
    ''
  ];

  // Seções por camada
  for (const layer of layerOrder) {
    const nodes = impactedNodes.filter((n) => n.layer === layer);
    if (nodes.length === 0) continue;
    sections.push(...renderLayerSection(layer, nodes));
  }

  // Regras de negócio
  if (impactedBusinessRules.length > 0) {
    sections.push('## Regras de Negócio Afetadas', '');
    for (const rule of impactedBusinessRules) {
      sections.push(`### ${rule.ruleId}: ${rule.rule}`);
      sections.push(`- **Impacto:** ${rule.impactDescription}`);
      sections.push(`- **Confiança:** ${confidenceEmoji(rule.confidence)} ${rule.confidence}`);
      sections.push('');
    }
    sections.push('---', '');
  }

  // Lacunas
  if (gaps.length > 0) {
    sections.push('## Lacunas', '');
    for (const gap of gaps) sections.push(`- ${gap}`);
    sections.push('');
  }

  // Perguntas para validação humana
  if (questions.length > 0) {
    sections.push('## Perguntas para Validação Humana', '');
    for (let i = 0; i < questions.length; i++) {
      sections.push(`${i + 1}. ${questions[i]}`);
    }
    sections.push('');
  }

  sections.push('---', '');
  sections.push('## Como usar este relatório', '');
  sections.push('1. Comece pelos itens **CRITICAL** e **HIGH** — são os que mais provavelmente vão quebrar');
  sections.push('2. Para SQL/PLSQL: abra cada arquivo e busque por cast, comparação e aritmética com o campo');
  sections.push('3. Para contratos de API: verifique se clientes externos dependem do tipo atual');
  sections.push('4. Responda as perguntas de validação antes de commitar a mudança');
  sections.push('5. Atualize os testes dos arquivos marcados como `test`');
  sections.push('');
  sections.push('*Gerado pelo TIC Coder Lite — What-If Impact Analyzer*');

  return sections.join('\n') + '\n';
}

function renderLayerSummaryTable(result: WhatIfImpactResult): string {
  const rows: string[] = [];
  const layerLabels: Record<string, string> = {
    sql: '🗄️ SQL/PLSQL',
    backend: '⚙️ Backend/Controller',
    service: '🔧 Service/BO',
    repository: '📦 Repository/DAO',
    contract: '📋 Contrato/DTO',
    'business-rule': '📜 Regra de Negócio',
    frontend: '🖥️ Frontend',
    test: '🧪 Testes',
    config: '⚙️ Config',
    unknown: '❓ Outros'
  };

  for (const [layer, count] of Object.entries(result.layerSummary) as [WhatIfImpactLayer, number][]) {
    if (count === 0) continue;
    const label = layerLabels[layer] ?? layer;
    const critical = result.impactedNodes.filter((n) => n.layer === layer && n.breakRisk === 'CRITICAL').length;
    const high = result.impactedNodes.filter((n) => n.layer === layer && n.breakRisk === 'HIGH').length;
    rows.push(`| ${label} | ${count} arquivo(s) | ${critical > 0 ? `${critical} CRITICAL` : high > 0 ? `${high} HIGH` : 'MEDIUM/LOW'} |`);
  }

  if (rows.length === 0) return '> Nenhum arquivo impactado detectado.';

  return [
    '## Impacto por Camada',
    '',
    '| Camada | Arquivos | Risco dominante |',
    '|---|---|---|',
    ...rows
  ].join('\n');
}

function renderLayerSection(layer: WhatIfImpactLayer, nodes: WhatIfImpactNode[]): string[] {
  const layerLabels: Record<string, string> = {
    sql: '🗄️ SQL / PLSQL',
    backend: '⚙️ Backend / Controllers',
    service: '🔧 Services / Business Objects',
    repository: '📦 Repositories / DAOs',
    contract: '📋 Contratos / DTOs / Schemas',
    'business-rule': '📜 Regras de Negócio',
    frontend: '🖥️ Frontend / Componentes',
    test: '🧪 Testes',
    config: '⚙️ Configurações',
    unknown: '❓ Outros'
  };

  const lines: string[] = [
    `## ${layerLabels[layer] ?? layer}`,
    ''
  ];

  for (const node of nodes) {
    lines.push(`### \`${node.file}\``);
    lines.push(`- **Risco:** ${riskEmoji(node.breakRisk)} ${node.breakRisk}`);
    lines.push(`- **Confiança:** ${confidenceEmoji(node.confidence)} ${node.confidence}`);
    lines.push(`- **Motivo:** ${node.reason}`);
    lines.push(`- **Ação:** ${node.recommendedAction}`);
    if (node.evidence.length > 0) {
      lines.push('- **Evidências:**');
      for (const ev of node.evidence.slice(0, 5)) {
        lines.push(`  - \`${ev}\``);
      }
    }
    lines.push('');
  }

  lines.push('---', '');
  return lines;
}

function riskEmoji(risk: WhatIfBreakRisk): string {
  const map: Record<WhatIfBreakRisk, string> = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '⚪' };
  return map[risk];
}

function confidenceEmoji(confidence: string): string {
  const map: Record<string, string> = { CONFIRMED: '🟢', INFERRED: '🟡', GAP: '🔴' };
  return map[confidence] ?? '❓';
}
