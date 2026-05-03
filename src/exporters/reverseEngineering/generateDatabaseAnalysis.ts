/**
 * Gerador de análise de banco de dados para Programação Reversa
 * Inspiração: Data Master do Reversa by Sandeco (MIT)
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

  if (sqlFiles.length > 0) {
    lines.push(`## Arquivos SQL / PL/SQL (${sqlFiles.length}) 🟢 CONFIRMADO`);
    lines.push('');
    for (const f of sqlFiles.slice(0, 30)) {
      lines.push(`- ${f.relativePath} (${f.lines} linhas)`);
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

  // Tabelas referenciadas
  const plsql = inventory.plsql;
  if (plsql.tableReferences.length > 0) {
    lines.push('## Tabelas Mais Referenciadas 🟢 CONFIRMADO');
    lines.push('');
    lines.push('| Tabela | Leituras | Escritas | Total |');
    lines.push('| --- | --- | --- | --- |');
    const topTables = [...plsql.tableReferences]
      .sort((a, b) => (b.reads + b.writes) - (a.reads + a.writes))
      .slice(0, 20);
    for (const table of topTables) {
      lines.push(`| ${table.name} | ${table.reads} | ${table.writes} | ${table.reads + table.writes} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
