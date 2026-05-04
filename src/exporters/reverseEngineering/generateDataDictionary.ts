/**
 * Gerador de dicionário de dados para Programação Reversa
 * Inspiração: Data Master do Reversa by Sandeco (MIT)
 */

import type { ReverseEngineeringInput, DataDictionaryItem } from './reverseEngineeringTypes';

export function generateDataDictionary(input: ReverseEngineeringInput): DataDictionaryItem[] {
  const { inventory, plsql } = input;
  const items: DataDictionaryItem[] = [];

  // Entidades Java/JPA
  for (const entity of inventory.javaSpring.files.filter((f) => f.kind === 'entity')) {
    items.push({
      entity: entity.className,
      kind: 'entity',
      fields: [],
      relations: [],
      source: entity.path,
      confidence: 'confirmado'
    });
  }

  // DTOs Java
  for (const dto of inventory.javaSpring.files.filter((f) => f.kind === 'dto')) {
    items.push({
      entity: dto.className,
      kind: 'dto',
      fields: [],
      relations: [],
      source: dto.path,
      confidence: 'confirmado'
    });
  }

  // Tabelas PL/SQL
  const tableEntities = plsql.entities.filter((e) => e.kind === 'table');
  for (const table of tableEntities) {
    items.push({
      entity: table.name,
      kind: 'table',
      fields: [],
      relations: [],
      source: table.file,
      confidence: 'confirmado'
    });
  }

  // Tabelas referenciadas
  for (const tableRef of plsql.tableReferences) {
    if (!items.some((i) => i.entity === tableRef.name && i.kind === 'table')) {
      items.push({
        entity: tableRef.name,
        kind: 'table',
        fields: [],
        relations: [],
        source: tableRef.files[0] ?? 'detectado por referência',
        confidence: tableRef.files.length > 0 ? 'confirmado' : 'inferido'
      });
    }
  }

  // Views PL/SQL
  const viewEntities = plsql.entities.filter((e) => e.kind === 'view');
  for (const view of viewEntities) {
    items.push({
      entity: view.name,
      kind: 'view',
      fields: [],
      relations: [],
      source: view.file,
      confidence: 'confirmado'
    });
  }

  return items.slice(0, 80);
}

export function renderDataDictionaryMd(items: DataDictionaryItem[], projectName: string, totalTablesIndexed?: number): string {
  const lines: string[] = [];
  lines.push(`# Dicionário de Dados: ${projectName}`);
  lines.push('');
  lines.push('> Gerado por TIC Coder Lite — Modo Lite.');
  lines.push('> Inspiração metodológica: Data Master do Reversa by Sandeco (MIT).');
  lines.push('');
  lines.push('> ⚠️ Campos não foram extraídos (análise sem conteúdo de arquivo). Use este dicionário como ponto de partida.');
  lines.push('');

  if (totalTablesIndexed !== undefined && totalTablesIndexed > 300) {
    lines.push(`> ⚡ **PLSQL Enterprise Mode** — ${totalTablesIndexed.toLocaleString('pt-BR')} tabelas indexadas. Exibindo top 80 mais referenciadas.`);
    lines.push('> Índice completo: \`.tic-code/projects/database/index/tables.json\`');
    lines.push('');
  }

  if (items.length === 0) {
    lines.push('- Nenhuma entidade ou tabela detectada 🔴 LACUNA');
    return lines.join('\n');
  }

  const byKind: Record<string, DataDictionaryItem[]> = {};
  for (const item of items) {
    (byKind[item.kind] ??= []).push(item);
  }

  const kindLabels: Record<string, string> = {
    entity: 'Entities / JPA',
    dto: 'DTOs',
    table: 'Tabelas SQL',
    view: 'Views SQL'
  };

  for (const [kind, kindItems] of Object.entries(byKind)) {
    lines.push(`## ${kindLabels[kind] ?? kind}`);
    lines.push('');
    lines.push('| Nome | Origem | Confiança |');
    lines.push('| --- | --- | --- |');
    for (const item of kindItems) {
      const badge = item.confidence === 'confirmado' ? '🟢 CONFIRMADO' : '🟡 INFERIDO';
      lines.push(`| ${item.entity} | ${item.source} | ${badge} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
