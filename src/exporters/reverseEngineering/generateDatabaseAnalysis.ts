/**
 * Gerador de análise de banco de dados para Programação Reversa
 * Inspiração: Data Master do Reversa by Sandeco (MIT)
 * Suporte PLSQL Enterprise Mode para bases com 25.000+ tabelas.
 */

import type { ReverseEngineeringInput } from './reverseEngineeringTypes';

export function renderDatabaseAnalysisMd(input: ReverseEngineeringInput, projectName: string): string {
  const { inventory, scan } = input;
  const lines: string[] = [];

  lines.push(`# Análise de Banco de Dados: ${projectName}`);
  lines.push('');
  lines.push('> Gerado por TIC Coder Lite — Modo Lite.');
  lines.push('> Inspiração metodológica: Data Master do Reversa by Sandeco (MIT).');
  lines.push('');

  if (!inventory.database.detected) {
    lines.push('- Banco de dados não detectado neste projeto 🔴 LACUNA');
    return lines.join('\n');
  }

  lines.push('## Evidências de Banco de Dados');
  lines.push('');
  for (const ev of inventory.database.evidence) {
    lines.push(`- ${ev} 🟢 CONFIRMADO`);
  }
  lines.push('');

  // Arquivos SQL
  const sqlFiles = scan.files.filter((f) =>
    ['.sql', '.pks', '.pkb', '.prc', '.fnc', '.pkg', '.trg', '.pls', '.plsql'].includes(f.extension)
  );

  const plsql = inventory.plsql;
  const largeModeNote = sqlFiles.length > 500 ? `\n> ⚡ PLSQL Enterprise Mode ativo — base grande detectada (${sqlFiles.length} arquivos SQL).` : '';

  if (sqlFiles.length > 0) {
    lines.push(`## Arquivos SQL / PL/SQL (${sqlFiles.length}) 🟢 CONFIRMADO${largeModeNote}`);
    lines.push('');
    for (const f of sqlFiles.slice(0, 30)) {
      lines.push(`- ${f.relativePath} (${f.lines} linhas)`);
    }
    if (sqlFiles.length > 30) {
      lines.push(`- ... e mais ${sqlFiles.length - 30} arquivos`);
    }
    lines.push('');
  }

  // Migrations
  const migrationFiles = scan.files.filter((f) =>
    f.relativePath.toLowerCase().includes('migrat') ||
    f.relativePath.toLowerCase().includes('flyway') ||
    f.relativePath.toLowerCase().includes('liquibase') ||
    f.relativePath.toLowerCase().includes('changelog')
  );

  if (migrationFiles.length > 0) {
    lines.push(`## Migrations (${migrationFiles.length}) 🟢 CONFIRMADO`);
    lines.push('');
    for (const f of migrationFiles.slice(0, 20)) {
      lines.push(`- ${f.relativePath}`);
    }
    lines.push('');
  }

  // Resumo por tipo de objeto PL/SQL
  if (plsql.detected) {
    lines.push('## Resumo de Objetos PL/SQL 🟢 CONFIRMADO');
    lines.push('');
    lines.push('| Tipo | Quantidade |');
    lines.push('| --- | --- |');
    lines.push(`| Tabelas (DDL / referenciadas) | ${plsql.counts.table + plsql.tableReferences.length} |`);
    lines.push(`| Packages | ${plsql.counts.package + plsql.counts.package_body} |`);
    lines.push(`| Procedures | ${plsql.counts.procedure} |`);
    lines.push(`| Functions | ${plsql.counts.function} |`);
    lines.push(`| Triggers | ${plsql.counts.trigger} |`);
    lines.push(`| Views | ${plsql.counts.view} |`);
    lines.push('');
  }

  // Tabelas referenciadas
  if (plsql.tableReferences.length > 0) {
    const totalTables = plsql.tableReferences.length;
    lines.push(`## Tabelas Mais Referenciadas (top 20 de ${totalTables} indexadas) 🟢 CONFIRMADO`);
    lines.push('');
    if (totalTables > 300) {
      lines.push(`> ⚡ ${totalTables} tabelas indexadas. Exibindo apenas top 20. Consulte \`.tic-code/projects/database/index/tables.json\` para o índice completo.`);
      lines.push('');
    }
    lines.push('| Tabela | Leituras | Escritas | Total |');
    lines.push('| --- | --- | --- | --- |');
    const topTables = [...plsql.tableReferences]
      .sort((a, b) => (b.reads + b.writes) - (a.reads + a.writes))
      .slice(0, 20);
    for (const table of topTables) {
      lines.push(`| ${table.name} | ${table.reads} | ${table.writes} | ${table.reads + table.writes} |`);
    }
    lines.push('');
    if (totalTables > 300) {
      lines.push(`> Índice completo: \`.tic-code/projects/database/index/tables.json\``);
      lines.push(`> Objetos críticos: \`.tic-code/projects/database/critical-objects.json\``);
      lines.push('');
    }
  }

  return lines.join('\n');
}
