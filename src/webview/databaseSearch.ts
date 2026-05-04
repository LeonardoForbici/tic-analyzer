/**
 * Seção de busca e visualização de objetos de banco de dados para a WebView do TIC Coder Lite.
 * Renderiza a seção PLSQL Enterprise Mode com busca, filtros e top objetos críticos.
 */

import type { DatabaseIndex } from '../scanner/databaseIndex';
import type { DatabaseSummary } from '../scanner/databaseLargeMode';

export interface DatabaseSearchInput {
  index: DatabaseIndex;
  summary: DatabaseSummary;
}

export function renderDatabaseEnterpriseSection(input: DatabaseSearchInput): string {
  const { index, summary } = input;

  const banner = summary.largeModeActive
    ? `<div class="enterprise-banner">⚡ <strong>PLSQL Enterprise Mode ativo</strong> — ${index.totalTables.toLocaleString('pt-BR')} tabelas indexadas. O grafo visual mostra apenas objetos críticos.</div>`
    : '';

  return `<section class="section" id="dbEnterpriseSection">
    <h2>🗄️ Database / PL/SQL Enterprise</h2>
    ${banner}
    <div class="metrics">
      ${metricCard('Tabelas indexadas', index.totalTables.toLocaleString('pt-BR'))}
      ${metricCard('Packages', index.totalPackages)}
      ${metricCard('Procedures', index.totalProcedures)}
      ${metricCard('Triggers', index.totalTriggers)}
      ${metricCard('Objetos críticos', index.criticalObjects.length)}
      ${metricCard('Schemas', summary.schemaCount)}
    </div>

    <div class="db-search-bar" style="margin:12px 0">
      <input type="search" id="dbSearch" placeholder="Buscar tabela, package, procedure, trigger..." class="db-search-input" style="width:100%;padding:6px 10px;box-sizing:border-box;border:1px solid var(--vscode-input-border,#ccc);background:var(--vscode-input-background,#fff);color:var(--vscode-input-foreground,#000)">
      <div class="db-filter-tabs" role="tablist" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">
        <button class="db-filter active" data-filter="all">Todos</button>
        <button class="db-filter" data-filter="critical">Tabelas críticas</button>
        <button class="db-filter" data-filter="package">Packages</button>
        <button class="db-filter" data-filter="procedure">Procedures</button>
        <button class="db-filter" data-filter="trigger">Triggers</button>
        <button class="db-filter" data-filter="write">Escritas</button>
        <button class="db-filter" data-filter="read">Lidas</button>
        <button class="db-filter" data-filter="high-risk">Alto risco</button>
      </div>
    </div>

    <div class="db-results" id="dbSearchResults">
      ${renderTopCriticalTables(index, summary)}
      ${renderTopCriticalPackages(index)}
      ${renderCriticalTriggers(index)}
    </div>

    <p class="caption" style="margin-top:8px;color:var(--vscode-descriptionForeground,#888)">
      🧠 IA Local usa contexto filtrado para evitar sobrecarga — apenas objetos críticos são enviados, nunca a base inteira.
    </p>
  </section>`;
}

function renderTopCriticalTables(index: DatabaseIndex, summary: DatabaseSummary): string {
  const topTables = summary.topCriticalTables.slice(0, 15);
  if (topTables.length === 0) {
    return '';
  }

  const rows = topTables
    .map(
      (t) =>
        `<li class="db-item" data-type="table" data-risk="${escapeHtml(t.riskLevel)}" data-score="${t.score}" data-name="${escapeHtml(t.name.toLowerCase())}">
          <span class="mono">${escapeHtml(t.name)}</span>
          <span class="risk-${escapeHtml(t.riskLevel)}">${escapeHtml(t.riskLevel)}</span>
          <span class="caption">score: ${t.score}</span>
        </li>`
    )
    .join('');

  return `<div class="db-group">
    <h3>Top Tabelas Críticas (${index.totalTables.toLocaleString('pt-BR')} indexadas)</h3>
    <ul class="db-list">${rows}</ul>
  </div>`;
}

function renderTopCriticalPackages(index: DatabaseIndex): string {
  const topPkgs = index.packages.slice(0, 10);
  if (topPkgs.length === 0) {
    return '';
  }

  const rows = topPkgs
    .map(
      (p) =>
        `<li class="db-item" data-type="package" data-risk="${escapeHtml(p.riskLevel)}" data-score="${p.criticalityScore}" data-name="${escapeHtml(p.name.toLowerCase())}">
          <span class="mono">${escapeHtml(p.name)}</span>
          <span class="risk-${escapeHtml(p.riskLevel)}">${escapeHtml(p.riskLevel)}</span>
          <span class="caption">${p.procedures.length} proc · ${p.tablesWritten.length} tabs escritas</span>
        </li>`
    )
    .join('');

  return `<div class="db-group">
    <h3>Top Packages (${index.totalPackages.toLocaleString('pt-BR')} total)</h3>
    <ul class="db-list">${rows}</ul>
  </div>`;
}

function renderCriticalTriggers(index: DatabaseIndex): string {
  const critTriggers = index.triggers.filter((t) => t.riskLevel !== 'low').slice(0, 10);
  if (critTriggers.length === 0) {
    return '';
  }

  const rows = critTriggers
    .map(
      (t) =>
        `<li class="db-item" data-type="trigger" data-risk="${escapeHtml(t.riskLevel)}" data-name="${escapeHtml(t.name.toLowerCase())}">
          <span class="mono">${escapeHtml(t.name)}</span>
          ${t.tableName ? `<span class="caption">ON ${escapeHtml(t.tableName)}</span>` : ''}
          <span class="risk-${escapeHtml(t.riskLevel)}">${escapeHtml(t.riskLevel)}</span>
        </li>`
    )
    .join('');

  return `<div class="db-group">
    <h3>Triggers Críticos (${index.totalTriggers} total)</h3>
    <ul class="db-list">${rows}</ul>
  </div>`;
}

function metricCard(label: string, value: string | number): string {
  return `<div class="card"><span class="value">${escapeHtml(String(value))}</span><span class="label">${escapeHtml(label)}</span></div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
