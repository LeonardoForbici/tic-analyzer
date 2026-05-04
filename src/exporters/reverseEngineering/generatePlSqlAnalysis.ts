/**
 * Gerador de análise PL/SQL para Programação Reversa
 * Inspiração: Data Master do Reversa by Sandeco (MIT)
 * Suporte PLSQL Enterprise Mode: exibe top objetos críticos quando a base é grande.
 */

import type { ReverseEngineeringInput } from './reverseEngineeringTypes';

const LARGE_BASE_THRESHOLD = 500; // Número de tabelas para ativar Enterprise mode no MD

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

  const isLargeBase = plsql.tableReferences.length > LARGE_BASE_THRESHOLD;
  if (isLargeBase) {
    lines.push(`> ⚡ **PLSQL Enterprise Mode** — Base grande detectada (${plsql.tableReferences.length} tabelas referenciadas).`);
    lines.push('> Exibindo apenas objetos mais críticos. Índice completo em `.tic-code/projects/database/`.');
    lines.push('');
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
  lines.push(`| Tabelas referenciadas | ${plsql.tableReferences.length} |`);
  lines.push(`| Cursors | ${plsql.counts.cursor} |`);
  lines.push('');

  // Packages
  const packages = plsql.entities.filter((e) => e.kind === 'package' || e.kind === 'package_body');
  if (packages.length > 0) {
    const limit = isLargeBase ? 20 : 30;
    lines.push(`## Packages (top ${Math.min(packages.length, limit)}) 🟢 CONFIRMADO`);
    lines.push('');
    for (const pkg of packages.slice(0, limit)) {
      lines.push(`- **${pkg.name}** (${pkg.kind}) — ${pkg.file}:${pkg.line}`);
    }
    if (packages.length > limit) {
      lines.push(`- ... e mais ${packages.length - limit} packages`);
    }
    lines.push('');
  }

  // Procedures críticas
  const procedures = plsql.entities.filter((e) => e.kind === 'procedure');
  if (procedures.length > 0) {
    const limit = isLargeBase ? 15 : 25;
    lines.push(`## Procedures (${procedures.length} total, exibindo ${Math.min(procedures.length, limit)}) 🟢 CONFIRMADO`);
    lines.push('');
    for (const proc of procedures.slice(0, limit)) {
      const parentInfo = proc.parentName ? ` (package: ${proc.parentName})` : '';
      lines.push(`- **${proc.name}**${parentInfo} — ${proc.file}:${proc.line}`);
    }
    if (procedures.length > limit) {
      lines.push(`- ... e mais ${procedures.length - limit} procedures. Índice completo: \`.tic-code/projects/database/index/procedures.json\``);
    }
    lines.push('');
  }

  // Functions
  const functions = plsql.entities.filter((e) => e.kind === 'function');
  if (functions.length > 0) {
    const limit = isLargeBase ? 10 : 25;
    lines.push(`## Functions (${functions.length} total, exibindo ${Math.min(functions.length, limit)}) 🟢 CONFIRMADO`);
    lines.push('');
    for (const fn of functions.slice(0, limit)) {
      const parentInfo = fn.parentName ? ` (package: ${fn.parentName})` : '';
      lines.push(`- **${fn.name}**${parentInfo} — ${fn.file}:${fn.line}`);
    }
    if (functions.length > limit) {
      lines.push(`- ... e mais ${functions.length - limit} functions`);
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
    if (triggers.length > 20) {
      lines.push(`- ... e mais ${triggers.length - 20} triggers. Índice completo: \`.tic-code/projects/database/index/triggers.json\``);
    }
    lines.push('');
  }

  // Tabelas mais referenciadas
  if (plsql.tableReferences.length > 0) {
    const totalTables = plsql.tableReferences.length;
    const displayLimit = isLargeBase ? 20 : 20;
    lines.push(`## Tabelas Mais Referenciadas (top ${displayLimit} de ${totalTables}) 🟢 CONFIRMADO`);
    lines.push('');
    if (isLargeBase) {
      lines.push(`> ⚡ ${totalTables} tabelas indexadas. Índice completo: \`.tic-code/projects/database/index/tables.json\``);
      lines.push('');
    }
    lines.push('| Tabela | Leituras | Escritas | Arquivos |');
    lines.push('| --- | --- | --- | --- |');
    const topTables = [...plsql.tableReferences]
      .sort((a, b) => (b.reads + b.writes) - (a.reads + a.writes))
      .slice(0, displayLimit);
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
    const depLimit = isLargeBase ? 20 : 30;
    lines.push(`## Dependências PL/SQL (top ${depLimit}) 🟢 CONFIRMADO`);
    lines.push('');
    lines.push('| Origem | Tipo | Alvo | Evidência |');
    lines.push('| --- | --- | --- | --- |');
    for (const dep of plsql.dependencies.slice(0, depLimit)) {
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
  if (isLargeBase) {
    lines.push('6. Consulte `.tic-code/projects/database/critical-objects.json` para objetos priorizados por criticidade');
  }
  lines.push('');
  lines.push('> Ajuste esta ordem com base nos domínios de negócio identificados.');

  return lines.join('\n');
}
