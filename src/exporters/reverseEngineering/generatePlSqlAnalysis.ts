/**
 * Gerador de análise PL/SQL para Programação Reversa
 * Inspiração: Data Master do Reversa by Sandeco (MIT)
 */

import type { ReverseEngineeringInput } from './reverseEngineeringTypes';

export function renderPlSqlAnalysisMd(input: ReverseEngineeringInput, projectName: string): string {
  const { inventory, risks } = input;
  const plsql = inventory.plsql;
  const lines: string[] = [];

  lines.push(`# Análise PL/SQL: ${projectName}`);
  lines.push('');
  lines.push('> Gerado por TIC Coder Lite — Modo Lite.');
  lines.push('> Inspiração metodológica: Data Master do Reversa by Sandeco (MIT).');
  lines.push('');

  if (!plsql.detected) {
    lines.push('- Nenhum artefato PL/SQL detectado 🟢 CONFIRMADO');
    return lines.join('\n');
  }

  // Resumo
  lines.push('## Resumo PL/SQL 🟢 CONFIRMADO');
  lines.push('');
  lines.push('| Tipo | Quantidade |');
  lines.push('| --- | --- |');
  lines.push(`| Packages | ${plsql.counts.package} |`);
  lines.push(`| Package Bodies | ${plsql.counts.package_body} |`);
  lines.push(`| Procedures | ${plsql.counts.procedure} |`);
  lines.push(`| Functions | ${plsql.counts.function} |`);
  lines.push(`| Triggers | ${plsql.counts.trigger} |`);
  lines.push(`| Views | ${plsql.counts.view} |`);
  lines.push(`| Tabelas (DDL) | ${plsql.counts.table} |`);
  lines.push(`| Cursors | ${plsql.counts.cursor} |`);
  lines.push('');

  // Packages
  const packages = plsql.entities.filter((e) => e.kind === 'package' || e.kind === 'package_body');
  if (packages.length > 0) {
    lines.push('## Packages 🟢 CONFIRMADO');
    lines.push('');
    for (const pkg of packages.slice(0, 30)) {
      lines.push(`- **${pkg.name}** (${pkg.kind}) — ${pkg.file}:${pkg.line}`);
    }
    lines.push('');
  }

  // Procedures críticas
  const procedures = plsql.entities.filter((e) => e.kind === 'procedure');
  if (procedures.length > 0) {
    lines.push(`## Procedures (${procedures.length}) 🟢 CONFIRMADO`);
    lines.push('');
    for (const proc of procedures.slice(0, 25)) {
      const parentInfo = proc.parentName ? ` (package: ${proc.parentName})` : '';
      lines.push(`- **${proc.name}**${parentInfo} — ${proc.file}:${proc.line}`);
    }
    lines.push('');
  }

  // Functions
  const functions = plsql.entities.filter((e) => e.kind === 'function');
  if (functions.length > 0) {
    lines.push(`## Functions (${functions.length}) 🟢 CONFIRMADO`);
    lines.push('');
    for (const fn of functions.slice(0, 25)) {
      const parentInfo = fn.parentName ? ` (package: ${fn.parentName})` : '';
      lines.push(`- **${fn.name}**${parentInfo} — ${fn.file}:${fn.line}`);
    }
    lines.push('');
  }

  // Triggers — regras escondidas no banco
  const triggers = plsql.entities.filter((e) => e.kind === 'trigger');
  if (triggers.length > 0) {
    lines.push(`## Triggers (${triggers.length}) 🟢 CONFIRMADO`);
    lines.push('');
    lines.push('> ⚠️ Triggers contêm regras de negócio no banco. Valide antes de alterar as tabelas afetadas.');
    lines.push('');
    for (const trigger of triggers.slice(0, 20)) {
      const tableInfo = trigger.targetTable ? ` ON ${trigger.targetTable}` : '';
      lines.push(`- **${trigger.name}**${tableInfo} — ${trigger.file}:${trigger.line}`);
    }
    lines.push('');
  }

  // Tabelas mais referenciadas
  if (plsql.tableReferences.length > 0) {
    lines.push('## Tabelas Mais Referenciadas 🟢 CONFIRMADO');
    lines.push('');
    lines.push('| Tabela | Leituras | Escritas | Arquivos |');
    lines.push('| --- | --- | --- | --- |');
    const topTables = [...plsql.tableReferences]
      .sort((a, b) => (b.reads + b.writes) - (a.reads + a.writes))
      .slice(0, 20);
    for (const table of topTables) {
      lines.push(`| ${table.name} | ${table.reads} | ${table.writes} | ${table.files.length} |`);
    }
    lines.push('');
  }

  // Riscos PL/SQL
  const plsqlRisks = risks.filter((r) => r.category === 'plsql');
  if (plsqlRisks.length > 0) {
    lines.push(`## Riscos Transacionais PL/SQL (${plsqlRisks.length}) 🟢 CONFIRMADO`);
    lines.push('');
    for (const risk of plsqlRisks.slice(0, 20)) {
      lines.push(`- **${risk.level.toUpperCase()}** ${risk.title} — ${risk.file}${risk.line ? `:${risk.line}` : ''}`);
      lines.push(`  Recomendação: ${risk.recommendation}`);
      lines.push('');
    }
  }

  // Dependências PL/SQL
  if (plsql.dependencies.length > 0) {
    lines.push('## Dependências PL/SQL 🟢 CONFIRMADO');
    lines.push('');
    lines.push('| Origem | Tipo | Alvo | Evidência |');
    lines.push('| --- | --- | --- | --- |');
    for (const dep of plsql.dependencies.slice(0, 30)) {
      lines.push(`| ${dep.sourceId} | ${dep.edgeType} | ${dep.targetName} | ${dep.evidence} |`);
    }
    lines.push('');
  }

  // Ordem recomendada de leitura
  lines.push('## Ordem Recomendada de Leitura 🟡 INFERIDO');
  lines.push('');
  lines.push('1. Packages principais (acima)');
  lines.push('2. Triggers das tabelas mais referenciadas');
  lines.push('3. Procedures críticas por volume de dependências');
  lines.push('4. Functions utilitárias');
  lines.push('5. Views de relatório');
  lines.push('');
  lines.push('> Ajuste esta ordem com base nos domínios de negócio identificados.');

  return lines.join('\n');
}
