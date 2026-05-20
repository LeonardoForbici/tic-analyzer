import type { LocalAiTaskLogEntry } from '../local-ai/ollamaClient';
import type { AiEngine } from '../reversa-adapter/engineTypes';
import type { ProjectSummary } from '../types';
import type { FileEditCandidate, ImageIndexEntry, ScreenImpactResult } from '../impact/impactTypes';
import type { DependencyBaseline, DependencyImpactResult } from '../dependency-impact/dependencyImpactTypes';
import { buildWebviewGraphData } from './graphRenderer';
import { getOverviewScript, getOverviewStyles } from './webviewAssets';
import { renderDatabaseEnterpriseSection } from './databaseSearch';
import { buildDatabaseIndex } from '../scanner/databaseIndex';
import { buildDatabaseSummary } from '../scanner/databaseLargeMode';
import { getTicCoderLiteConfig } from '../utils/config';

export interface OverviewHtmlInput {
  summary: ProjectSummary;
  engines: AiEngine[];
  agentContextPreview: string;
  nonce: string;
  /** Log de tarefas da última execução da IA Local. Exibido no painel IA Local. */
  localAiTaskLog?: LocalAiTaskLogEntry[];
  /** Informações do modelo configurado para exibir no painel IA Local. */
  localAiConfig?: { model: string; fastModel: string; qualityModel: string; mode: string; enabled: boolean };
  reversaData?: {
    state: Record<string, unknown> | null;
    graph: { nodes?: unknown[]; edges?: unknown[] } | null;
    modules: unknown[] | null;
    risks: unknown[] | null;
  };
  impactData?: {
    latestImpact: ScreenImpactResult | null;
    latestAiPackage: Record<string, unknown> | null;
    latestCostEstimate: Record<string, unknown> | null;
    latestFilesToEdit: FileEditCandidate[] | null;
    latestImageIndex: ImageIndexEntry | null;
  };
  projectGraphData?: {
    projectGraph: Record<string, unknown> | null;
    crossProjectLinks: Record<string, unknown> | null;
    frontendApiIndex: unknown[] | null;
    backendEndpointIndex: unknown[] | null;
    backendDatabaseIndex?: unknown[] | null;
  };
  depImpactData?: {
    latestResult: DependencyImpactResult | null;
    baselines: DependencyBaseline[] | null;
  };
}

// ─── Main render ─────────────────────────────────────────────────────────────

export function renderOverviewHtml(input: OverviewHtmlInput): string {
  const { summary, engines, agentContextPreview, nonce, localAiTaskLog, localAiConfig, reversaData, impactData, projectGraphData, depImpactData } = input;
  const graph = buildWebviewGraphData(summary.graph);
  const javaClasses = summary.inventory.javaSpring.files.length;
  const methods = estimateMethods(summary);
  const highRiskFiles = findHighRiskFiles(summary);
  const modules = summary.inventory.modules.filter((module) => module.files.length > 0);
  const detectedEngines = engines.filter((engine) => engine.detected);
  const stack = summary.inventory.stack.filter((signal) => signal.detected);
  const plsql = summary.inventory.plsql;
  const plsqlRisks = summary.risks.risks.filter((risk) => risk.category === 'plsql');
  const detectedProjects = summary.detectedProjects ?? [];

  // Database Enterprise section
  let dbEnterpriseHtml = '';
  if (plsql.detected) {
    try {
      const dbConfig = getTicCoderLiteConfig().database;
      const dbIndex = buildDatabaseIndex(plsql, dbConfig);
      const dbSummary = buildDatabaseSummary(dbIndex);
      dbEnterpriseHtml = renderDatabaseEnterpriseSection({ index: dbIndex, summary: dbSummary });
    } catch {
      dbEnterpriseHtml = '';
    }
  }

  // Cockpit metrics
  const feApiCount = (projectGraphData?.frontendApiIndex as unknown[] ?? [])
    .reduce((sum: number, f) => sum + ((f as Record<string, unknown>)['calls'] as unknown[] ?? []).length, 0 as number);
  const beDbCount = (projectGraphData?.backendDatabaseIndex as unknown[] ?? [])
    .reduce((sum: number, b) => sum + ((b as Record<string, unknown>)['queries'] as unknown[] ?? []).length, 0 as number);
  const criticalRisks = summary.risks.risks.filter((r) => r.level === 'critical').length;
  const lastImpactLevel = impactData?.latestImpact?.impactEstimate?.level ?? null;

  const data = {
    graph,
    project: summary.workspaceName,
    engines: engines.map((engine) => ({ id: engine.id, name: engine.name, detected: engine.detected })),
    projects: detectedProjects,
    selectedProject: null,
    projectGraph: projectGraphData ?? null
  };

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reversa Engine — TIC Coder Lite</title>
  <style nonce="${nonce}">${getOverviewStyles()}</style>
</head>
<body>
  <script nonce="${nonce}">window.__TIC_CODE_DATA__ = ${safeJson(data)};</script>
  <main class="page">

    <!-- ══════════════════════════════════════════════════════════════════════
         1. HEADER / COCKPIT
         ══════════════════════════════════════════════════════════════════════ -->
    <header class="header cockpit-header">
      <div>
        <h1>TIC Coder Lite — Reversa Engine</h1>
        <p class="subtitle">Entenda o workspace, rastreie impacto entre projetos e valide mudanças antes da IA tocar no legado.</p>
        <p class="muted">Workspace: <strong>${escapeHtml(summary.workspaceName)}</strong></p>
      </div>
      <div class="actions">
        <button class="btn primary" data-command="analyzeWorkspace">⚡ Analisar Workspace</button>
        <button class="btn" data-command="openTicCodeFolder">Abrir .tic-code</button>
        <button class="btn" data-command="openReverseEngineeringFolder">Abrir reverse-engineering</button>
        <button class="btn" data-command="enhanceWithLocalAi">🧠 IA Local</button>
      </div>
    </header>

    <section class="cockpit-cards" aria-label="Cockpit">
      ${cockpitCard('Projetos detectados', detectedProjects.length > 0 ? String(detectedProjects.length) : 'não gerado', detectedProjects.length > 0 ? 'green' : 'gray', 'project-graph.json')}
      ${cockpitCard('Pontes frontend → backend', feApiCount > 0 ? String(feApiCount) : 'não gerado', feApiCount > 0 ? 'blue' : 'gray', 'cross-project-links.json')}
      ${cockpitCard('Pontes backend → banco', beDbCount > 0 ? String(beDbCount) : 'não gerado', beDbCount > 0 ? 'blue' : 'gray', 'backend-database-index.json')}
      ${cockpitCard('Riscos críticos', criticalRisks > 0 ? String(criticalRisks) : '0', criticalRisks > 0 ? 'red' : 'green', 'risks.json')}
      ${cockpitCard('Último impacto', lastImpactLevel ? lastImpactLevel : 'não analisado', lastImpactLevel ? 'yellow' : 'gray', 'impact/latest-screen-impact.json')}
    </section>

    <!-- ══════════════════════════════════════════════════════════════════════
         2. WORKSPACE INTELLIGENCE
         ══════════════════════════════════════════════════════════════════════ -->
    ${renderWorkspaceIntelligence(detectedProjects, projectGraphData)}

    <!-- ══════════════════════════════════════════════════════════════════════
         3. GRAFO MULTI-PROJETO
         ══════════════════════════════════════════════════════════════════════ -->
    ${renderProjectGraphSection(projectGraphData)}

    <!-- ══════════════════════════════════════════════════════════════════════
         4. FLUXO FRONTEND → BACKEND → BANCO
         ══════════════════════════════════════════════════════════════════════ -->
    ${renderFlowSection(projectGraphData, impactData)}

    <!-- ══════════════════════════════════════════════════════════════════════
         5. IMPACTO POR IMAGEM / TELA
         ══════════════════════════════════════════════════════════════════════ -->
    <section class="section visual-intel">
      <div class="section-head">
        <div>
          <div class="kicker">Reconhecimento Visual</div>
          <h2>Impacto por Screenshot</h2>
          <p class="caption">Correlacione tela, rota, componente, API, backend e SQL/PLSQL com fingerprint visual local.</p>
        </div>
        <div class="actions">
          <button class="btn" data-command="importVisorScreenshots">Documentar UI no Visor</button>
          <button class="btn primary" data-command="importImpactScreenshotAndAnalyze">Importar screenshot + analisar</button>
        </div>
      </div>
      <div class="visual-grid">
        <div class="visual-form">
          <div class="field-grid">
            <label class="field">
              <span>URL da tela</span>
              <input id="impactUrl" class="control" type="text" placeholder="/clientes/123">
            </label>
            <label class="field">
              <span>Nome da tela</span>
              <input id="impactScreenName" class="control" type="text" placeholder="Opcional">
            </label>
          </div>
          <label class="field">
            <span>Descricao da mudanca desejada</span>
            <textarea id="impactChangeDescription" class="control textarea" placeholder="Ex: adicionar validacao de limite de credito"></textarea>
          </label>
          <div class="field-grid">
            <label class="field">
              <span>Palavras visiveis</span>
              <input id="impactVisibleTerms" class="control" type="text" placeholder="botao salvar, limite, cliente">
            </label>
            <label class="field">
              <span>Acao principal</span>
              <input id="impactMainAction" class="control" type="text" placeholder="Salvar, filtrar, pagar">
            </label>
            <label class="field">
              <span>Elemento alvo</span>
              <input id="impactTargetElement" class="control" type="text" placeholder="Tabela, modal, campo">
            </label>
            <label class="field">
              <span>Campo alvo</span>
              <input id="impactTargetField" class="control" type="text" placeholder="Opcional">
            </label>
          </div>
          <label class="field">
            <span>Regra alvo</span>
            <input id="impactTargetRule" class="control" type="text" placeholder="Opcional">
          </label>
          <div class="actions visual-actions">
            <button class="btn primary" data-command="analyzeImpactByImage">Analisar por pistas</button>
            <button class="btn" data-command="importImpactScreenshot">Importar screenshot</button>
            <button class="btn" data-command="estimateChangeCostWithLocalAi">Estimar com IA Local</button>
            <button class="btn" data-command="exportChangePackageForPaidAi">Exportar pacote IA</button>
            <button class="btn" data-command="openImpactReport">Relatorio</button>
            <button class="btn" data-command="openImpactJson">JSON</button>
            <button class="btn" data-command="openFilesToEdit">Arquivos</button>
          </div>
        </div>
        <div class="detail impact-panel">
          ${renderImpactSummary(impactData)}
        </div>
      </div>
    </section>

    <!-- ══════════════════════════════════════════════════════════════════════
         6. DEPENDENCY CHANGE IMPACT
         ══════════════════════════════════════════════════════════════════════ -->
    ${renderDepImpactSection(depImpactData)}

    <!-- ══════════════════════════════════════════════════════════════════════
         8. EVIDÊNCIAS / REVERSA / SDD
         ══════════════════════════════════════════════════════════════════════ -->
    ${renderReversaEngineSection(summary, reversaData)}

    ${dbEnterpriseHtml || (plsql.detected ? `
    <section class="section">
      <h2>Database / PL/SQL</h2>
      <div class="metrics">
        ${metric('Packages', plsql.counts.package + plsql.counts.package_body)}
        ${metric('Procedures', plsql.counts.procedure)}
        ${metric('Functions', plsql.counts.function)}
        ${metric('Triggers', plsql.counts.trigger)}
        ${metric('Tabelas', plsql.tableReferences.length)}
        ${metric('Riscos PL/SQL', plsqlRisks.length)}
      </div>
      <h3>Tabelas mais referenciadas</h3>
      <ul>${plsql.tableReferences.slice(0, 10).map((table) => `<li><span class="mono">${escapeHtml(table.name)}</span><span>${table.reads} leituras / ${table.writes} escritas</span></li>`).join('') || '<li><span>Nenhuma tabela PL/SQL detectada.</span></li>'}</ul>
      <h3 style="margin-top:14px">Riscos PL/SQL</h3>
      <ul>${plsqlRisks.slice(0, 12).map((risk) => `<li><span class="mono">${escapeHtml(risk.title)} (${escapeHtml(risk.file)}${risk.line ? `:${risk.line}` : ''})</span><span class="risk-${escapeHtml(risk.level)}">${riskLabel(risk.level)}</span></li>`).join('') || '<li><span>Nenhum risco PL/SQL detectado.</span></li>'}</ul>
    </section>` : '')}

    <section class="section">
      <h2>Riscos</h2>
      <ul>${highRiskFiles.map((file) => `<li><span class="mono">${escapeHtml(file.path)}</span><span class="risk-${escapeHtml(file.level)}">${riskLabel(file.level)}</span></li>`).join('') || '<li><span>Nenhum risco alto detectado.</span></li>'}</ul>
    </section>

    <section class="section">
      <h2>🔍 Programação Reversa / SDD</h2>
      <p class="caption">Análise determinística local que transforma código em especificações técnicas, regras candidatas, gaps e rastreabilidade para agentes de IA.</p>

      <div class="mode-tabs" role="tablist">
        <button class="mode active" data-mode="rev-lite"><strong>⚡ Modo Lite</strong><br><span class="caption">Programação reversa sem IA — análise determinística com marcação de confiança.</span></button>
        <button class="mode" data-mode="rev-standard"><strong>🤖 IA Padrão</strong><br><span class="caption">Codex/Claude/Copilot/Cursor devem ler <code>.tic-code/reverse-engineering/</code> antes de alterar código.</span></button>
        <button class="mode" data-mode="rev-local"><strong>🧠 IA Local</strong><br><span class="caption">Ollama opcional melhora textos e perguntas, mas não é necessário para gerar o SDD base.</span></button>
      </div>

      <div class="mode-panel active" data-panel="rev-lite">
        <p>Os arquivos abaixo foram gerados em <code>.tic-code/reverse-engineering/</code> por análise determinística, sem IA:</p>
        <div class="pill-list" style="flex-wrap:wrap; gap:6px; margin-top:10px">
          <span class="pill">📋 inventory.md</span>
          <span class="pill">🔗 dependencies.md</span>
          <span class="pill">🔬 code-analysis.md</span>
          <span class="pill">🏢 domain.md</span>
          <span class="pill">📜 business-rules.md</span>
          <span class="pill">🔄 state-machines.md</span>
          <span class="pill">🔐 permissions.md</span>
          <span class="pill">🏗️ architecture.md</span>
          <span class="pill">📡 api-contracts.md</span>
          <span class="pill">📚 data-dictionary.md</span>
          <span class="pill">🗄️ database-analysis.md</span>
          ${plsql.detected ? `<span class="pill">🟠 plsql-analysis.md</span>` : ''}
          <span class="pill">📊 confidence-report.md</span>
          <span class="pill">⚠️ gaps.md</span>
          <span class="pill">❓ questions.md</span>
          <span class="pill">🔗 traceability/</span>
        </div>
        <div class="metrics" style="margin-top:12px">
          ${metric('Riscos críticos', summary.risks.risks.filter((r) => r.level === 'critical').length)}
          ${metric('Riscos altos', summary.risks.risks.filter((r) => r.level === 'high').length)}
          ${metric('Artefatos gerados', 15 + (plsql.detected ? 1 : 0))}
          ${plsql.detected ? metric('Packages PL/SQL', plsql.counts.package) : ''}
          ${plsql.detected ? metric('Triggers PL/SQL', plsql.counts.trigger) : ''}
        </div>
      </div>
      <div class="mode-panel" data-panel="rev-standard">
        <p>Ao usar Codex, Claude Code, GitHub Copilot, Cursor ou Gemini neste workspace:</p>
        <ol>
          <li>Leia <code>.tic-code/reverse-engineering/inventory.md</code> para entender o sistema.</li>
          <li>Leia <code>.tic-code/reverse-engineering/architecture.md</code> antes de propor mudanças estruturais.</li>
          <li>Leia <code>.tic-code/reverse-engineering/business-rules.md</code> — regras marcadas 🟡 precisam de validação.</li>
          <li>Verifique <code>.tic-code/reverse-engineering/gaps.md</code> para 🔴 lacunas antes de qualquer refatoração.</li>
          <li>Consulte <code>.tic-code/reverse-engineering/traceability/</code> para rastrear código ↔ spec ↔ risco.</li>
          ${plsql.detected ? `<li>⚠️ PL/SQL detectado: leia <code>.tic-code/reverse-engineering/plsql-analysis.md</code> antes de alterar qualquer tabela ou regra no backend.</li>` : ''}
        </ol>
        <p class="caption">Todos esses arquivos são gerados automaticamente pelo Modo Lite — sem IA, banco, Docker ou servidor.</p>
      </div>
      <div class="mode-panel" data-panel="rev-local">
        <p>Ollama é opcional. O TIC Coder Lite gera todos os artefatos de programação reversa sem Ollama.</p>
        <p>Com Ollama ativado, você pode melhorar:</p>
        <ul style="display:block;list-style:disc;padding-left:20px">
          <li style="display:list-item;border:0;padding:0">Resumos de regras de negócio candidatas</li>
          <li style="display:list-item;border:0;padding:0">Perguntas de validação humana</li>
          <li style="display:list-item;border:0;padding:0">Descrições de domínio e arquitetura</li>
        </ul>
        <button class="btn" data-command="enhanceLocalAi">🧠 Melhorar com Ollama (opcional)</button>
        <p class="caption">Selecione o modo em <code>ticCoderLite.localAi.mode</code>: <strong>auto</strong> (padrão), <strong>fast</strong> ou <strong>quality</strong>.</p>
        ${renderLocalAiLog(localAiTaskLog)}
      </div>

      ${detectedProjects.length > 0 ? `
      <h3 style="margin-top:14px">Programação Reversa por Projeto</h3>
      <ul>${detectedProjects.map((project) => `<li>${getProjectIcon(project.kind)} <strong>${escapeHtml(project.name)}</strong> — <span class="mono">.tic-code/projects/${escapeHtml(project.id)}/reverse-engineering/</span></li>`).join('')}</ul>
      ` : ''}
    </section>

    <!-- ══════════════════════════════════════════════════════════════════════
         CONFIGURAÇÃO / MODOS / EXPORTAÇÕES
         ══════════════════════════════════════════════════════════════════════ -->
    <section class="section">
      <h2>Configuração Fácil</h2>
      <div class="setup-grid">
        <div class="card setup-card">
          <strong>Começar sem configurar nada</strong>
          <p class="caption">Usa o Modo Lite local: sem IA, sem Docker, sem banco e sem servidor.</p>
          <button class="btn primary" data-command="setupBeginner">Aplicar padrão recomendado</button>
        </div>
        <div class="card setup-card">
          <strong>Exportar para ferramentas de IA</strong>
          <p class="caption">Detecta Codex, Claude Code, Copilot, Cursor e Gemini quando existirem no workspace.</p>
          <button class="btn" data-command="detectEngines">Detectar ferramentas instaladas</button>
        </div>
        <div class="card setup-card">
          <strong>IA Local opcional</strong>
          <p class="caption">Liga ou desliga Ollama sem mexer em JSON. O Modo Lite continua funcionando mesmo desligado.</p>
          <button class="btn" data-command="enableLocalAi">Ligar IA Local</button>
          <button class="btn" data-command="disableLocalAi">Desligar IA Local</button>
        </div>
        <div class="card setup-card">
          <strong>Ajustes avançados</strong>
          <p class="caption">Abre as configurações nativas do VS Code já filtradas para TIC Coder Lite.</p>
          <button class="btn" data-command="openSettings">Abrir configurações</button>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>Modos do TIC Coder Lite</h2>
      <div class="mode-tabs" role="tablist">
        <button class="mode active" data-mode="lite"><strong>⚡ Modo Lite</strong><br><span class="caption">Análise local, sem IA, sem banco e sem Docker.</span></button>
        <button class="mode" data-mode="standard"><strong>🤖 IA Padrão</strong><br><span class="caption">Exporta contexto para Codex, Claude Code, Copilot, Cursor e Gemini.</span></button>
        <button class="mode" data-mode="local"><strong>🧠 IA Local</strong><br><span class="caption">Usa Ollama opcionalmente para melhorar resumos e perguntas.</span></button>
      </div>

      <div class="mode-panel active" data-panel="lite">
        <p>O Modo Lite gera scan, grafo, riscos e contexto em <code>.tic-code</code> sem depender de serviços externos.</p>
      </div>
      <div class="mode-panel" data-panel="standard">
        <p>A IA Padrão grava arquivos nativos para ferramentas de codificação assistida.</p>
        <div class="actions">
          <button class="btn primary" data-command="exportForCodex">Exportar para Codex</button>
          <button class="btn" data-command="exportForClaude">Exportar para Claude</button>
          <button class="btn" data-command="openTicCodeFolder">Abrir .tic-code</button>
          <button class="btn" data-command="openReverseEngineeringFolder">Abrir reverse-engineering</button>
          <button class="btn" data-command="exportForCopilot">Exportar para Copilot</button>
          <button class="btn" data-command="exportForCursor">Exportar para Cursor</button>
          <button class="btn" data-command="exportForGemini">Exportar para Gemini</button>
        </div>
        <p class="caption">Engines detectadas: ${detectedEngines.map((engine) => escapeHtml(engine.name)).join(', ') || 'nenhuma detectada ainda'}.</p>
      </div>
      <div class="mode-panel" data-panel="local">
        <p>A IA Local é opcional e usa Ollama quando estiver configurado. O scan continua funcionando sem ela.</p>
        ${localAiConfig ? `<p class="caption">Modelo local: <strong>${escapeHtml(localAiConfig.model || localAiConfig.fastModel)}</strong> &middot; modo: <strong>${escapeHtml(localAiConfig.mode)}</strong> &middot; ${localAiConfig.enabled ? 'ativado' : 'desativado'}</p>` : ''}
        <button class="btn primary" data-command="enhanceLocalAi">Melhorar com IA Local</button>
        ${renderLocalAiLog(localAiTaskLog)}
      </div>
    </section>

    <section class="section">
      <h2>Contexto para IA</h2>
      <div class="detail context">${escapeHtml(agentContextPreview || 'Execute Analisar Workspace para gerar .tic-code/agent-context.md')}</div>
    </section>

    <section class="section">
      <h2>Exportações</h2>
      <div class="metrics">
        <div class="card"><strong>AGENTS.md</strong><p class="caption">Codex</p></div>
        <div class="card"><strong>CLAUDE.md</strong><p class="caption">Claude Code</p></div>
        <div class="card"><strong>copilot-instructions.md</strong><p class="caption">GitHub Copilot</p></div>
        <div class="card"><strong>.cursorrules</strong><p class="caption">Cursor</p></div>
        <div class="card"><strong>GEMINI.md</strong><p class="caption">Gemini</p></div>
      </div>
    </section>

    <section class="section">
      <h2>Stack e Módulos</h2>
      <div class="two-column">
        <div>
          <h2>Stack detectada</h2>
          <div class="pill-list">${stack.map((signal) => `<span class="pill">${escapeHtml(signal.name)}</span>`).join('') || '<span class="pill">Nenhuma stack detectada</span>'}</div>
        </div>
        <div>
          <h2>Módulos</h2>
          <ul>${modules.map((module) => `<li><strong>${escapeHtml(module.kind)}</strong><span>${module.files.length}</span></li>`).join('') || '<li><span>Nenhum módulo detectado</span></li>'}</ul>
        </div>
      </div>
    </section>

    <!-- ══════════════════════════════════════════════════════════════════════
         9. GRAFO BRUTO — AVANÇADO (RECOLHÍVEL)
         ══════════════════════════════════════════════════════════════════════ -->
    <details class="section advanced-graph-details">
      <summary class="advanced-graph-summary">
        <h2 style="display:inline;margin:0">Grafo bruto do workspace — avançado</h2>
      </summary>
      <p class="caption" style="margin:10px 0">Use esta visão para inspeção técnica detalhada. Para fluxos entre projetos, veja <strong>Grafo Multi-Projeto</strong> acima.</p>
      <div class="summary" aria-label="Resumo">
        ${metric('Arquivos analisados', summary.totalFiles)}
        ${metric('Classes Java', javaClasses)}
        ${metric('Métodos estimados', methods)}
        ${metric('Riscos', summary.risks.summary.total)}
        ${metric('Engines de IA', detectedEngines.length)}
        ${metric('Database / PL/SQL', plsql.files.length)}
      </div>
      <div class="card graph-card">
        <div class="graph-toolbar">
          <div>
            <strong>Mapa de dependências do workspace</strong>
            <div class="caption">
              <span id="graphTotal">${summary.graph.stats.nodeCount} nós totais · ${summary.graph.stats.edgeCount} arestas totais</span>
              · <span id="graphVisible">carregando...</span>
              · <span class="muted">${graph.stats.internalCount} internos · ${graph.stats.externalCount + graph.stats.frameworkCount} externos ocultos por padrão</span>
            </div>
          </div>
          <div class="graph-tools">
            <input id="graphSearch" type="search" placeholder="Buscar nó ou arquivo">
            <select id="originFilter" aria-label="Filtrar por origem">
              <option value="internal" selected>Internos</option>
              <option value="external">Externos</option>
              <option value="framework">Frameworks</option>
              <option value="high-risk">Alto risco</option>
              <option value="all">Todos</option>
            </select>
            <select id="stackFilter" aria-label="Filtrar por stack">
              <option value="all" selected>Todos</option>
              <option value="backend-java">Backend Java</option>
              <option value="frontend-react">Frontend React/TS</option>
              <option value="javascript">JavaScript</option>
              <option value="database">Database / PL/SQL</option>
              <option value="infra">Infra</option>
              <option value="end-to-end">Fluxo ponta-a-ponta</option>
            </select>
            <select id="moduleFilter" aria-label="Filtrar por módulo"></select>
            <select id="layoutSelect" aria-label="Layout do grafo">
              <option value="agrupado">Agrupado</option>
              <option value="radial">Radial</option>
              <option value="camadas">Camadas</option>
            </select>
            <input id="density" type="range" min="15" max="100" value="65" title="Densidade de arestas">
            <button class="btn compact" id="zoomOut">−</button>
            <button class="btn compact" id="fitGraph">Ajustar</button>
            <button class="btn compact" id="zoomIn">+</button>
            <button class="btn compact" id="toggleLabels">Rótulos</button>
          </div>
        </div>
        <div id="graphOriginInfo" class="caption" style="padding:4px 10px;background:var(--vscode-textBlockQuote-background,#f0f4ff);border-radius:4px;margin:4px 0">
          Exibindo apenas nós internos do workspace. Dependências externas foram ocultadas para reduzir ruído. Use o filtro <em>Externos</em> ou <em>Todos</em> para ver dependências de terceiros.
        </div>
        <div class="graph-shell">
          <div class="graph-wrap" id="graphWrap">
            <svg id="graph" role="img" aria-label="Grafo de dependências do TIC Coder Lite"></svg>
            <div class="graph-hint">Arraste o fundo para mover · use scroll para zoom · clique em um nó para detalhes</div>
          </div>
          <aside class="graph-side">
            <h2 id="nodeTitle">Nó</h2>
            <div class="caption mono" id="nodeMeta"></div>
            <ul id="nodeDetails"></ul>
            <h2 style="margin-top:16px">Dependências externas do nó</h2>
            <ul id="nodeExternalDeps" class="caption"></ul>
            <h2 style="margin-top:16px">Legenda</h2>
            <div class="legend">
              <span>controller</span><span>service</span><span>repository</span><span>entity</span><span>externo</span><span>framework</span><span>risco alto</span>
            </div>
            <h2 style="margin-top:16px">Arestas do nó</h2>
            <ul id="nodeEdges"></ul>
          </aside>
        </div>
      </div>
    </details>

    <section class="section">
      <h2>Log do TIC</h2>
      <div class="log" id="logs"></div>
    </section>
  </main>
  ${getOverviewScript(nonce)}
</body>
</html>`;
}

// ─── Cockpit card ────────────────────────────────────────────────────────────

function cockpitCard(label: string, value: string, color: 'green' | 'blue' | 'yellow' | 'red' | 'gray', source: string): string {
  return `<div class="cockpit-card cockpit-${color}">
    <span class="cockpit-value">${escapeHtml(value)}</span>
    <span class="cockpit-label">${escapeHtml(label)}</span>
    <span class="cockpit-source">Fonte: ${escapeHtml(source)}</span>
  </div>`;
}

// ─── 2. Workspace Intelligence ───────────────────────────────────────────────

function renderWorkspaceIntelligence(projects: ProjectSummary['detectedProjects'], projectGraphData?: OverviewHtmlInput['projectGraphData']): string {
  const actualProjects = projects ?? [];
  if (actualProjects.length === 0 && !projectGraphData?.projectGraph) {
    return `<section class="section">
      <div class="kicker">Workspace Intelligence</div>
      <h2>Projetos Detectados</h2>
      <div class="empty-state">
        <p>Rode <strong>Analisar Workspace</strong> para gerar o grafo multi-projeto.</p>
      </div>
    </section>`;
  }

  const kindBorder: Record<string, string> = { frontend: '#38bdf8', backend: '#86efac', database: '#fcd34d', mobile: '#c4b5fd', shared: '#fdba74', infra: '#94a3b8' };

  const projectCards = actualProjects.map((project) => {
    const border = kindBorder[project.kind] ?? '#94a3b8';
    return `<div class="wi-project-card" style="border-left:4px solid ${border}">
      <div class="wi-project-kind" style="color:${border}">${escapeHtml(project.kind.toUpperCase())}</div>
      <div class="wi-project-name">${getProjectIcon(project.kind)} ${escapeHtml(project.name)}</div>
      <div class="caption mono">${escapeHtml(project.relativePath || '.')}</div>
      <div class="caption">${project.stack.join(', ') || 'stack não detectada'}</div>
      <div class="wi-project-stats">
        <span>${project.files} arquivos</span>
        <span class="${project.risks > 0 ? 'risk-high' : ''}">${project.risks} riscos</span>
      </div>
    </div>`;
  }).join('');

  return `<section class="section">
    <div class="kicker">Workspace Intelligence</div>
    <h2>Projetos Detectados</h2>
    <p class="caption">${actualProjects.length} projeto(s) identificado(s) neste workspace. Fonte: <code>project-graph.json</code></p>
    <div class="wi-grid">${projectCards}</div>
  </section>`;
}

// ─── 3. Project Graph ────────────────────────────────────────────────────────

function buildMultiProjectSvg(
  projects: unknown[],
  crossLinks: unknown[]
): string {
  const BG = '#0f172a', PANEL2 = '#253347', FG = '#e2e8f0', MUTED = '#64748b';
  const colorByKind: Record<string, string> = {
    frontend: '#38bdf8', mobile: '#c4b5fd', backend: '#86efac',
    shared: '#fdba74', database: '#fcd34d', infra: '#94a3b8'
  };
  const layerKeys = ['frontend', 'mobile', 'backend', 'shared', 'database', 'infra'];
  const layerLabels: Record<string, string> = {
    frontend: 'Frontend', mobile: 'Mobile', backend: 'Backend/API',
    shared: 'Shared', database: 'SQL/DB', infra: 'Infra'
  };

  if (!projects.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="80">
      <rect width="860" height="80" fill="${BG}"/>
      <text x="20" y="44" font-size="13" fill="${MUTED}" font-family="monospace">Rode Analisar Workspace para gerar o grafo multi-projeto.</text>
    </svg>`;
  }

  const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const trunc = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s;

  const W = 860, PAD_L = 56, BOX_MIN_W = 220, BOX_H = 100, BOX_GAP = 16, LAYER_GAP = 44, TOP_PAD = 24;

  type Proj = { id: string; name: string; kind: string; files: number; risks: number; stack: string[] };
  type Link = { fromProjectId: string; toProjectId: string; method: string; endpoint: string; fromFile: string; toFile: string; confidence: string; type: string };

  const projs = projects.map((p) => {
    const r = p as Record<string, unknown>;
    return { id: String(r['id'] ?? ''), name: String(r['name'] ?? r['id'] ?? ''), kind: String(r['kind'] ?? 'unknown'), files: Number(r['files'] ?? 0), risks: Number(r['risks'] ?? 0), stack: (r['stack'] as string[] | undefined) ?? [] } as Proj;
  }).filter((p) => layerKeys.includes(p.kind));

  const links = crossLinks.map((l) => {
    const r = l as Record<string, unknown>;
    return { fromProjectId: String(r['fromProjectId'] ?? ''), toProjectId: String(r['toProjectId'] ?? ''), method: String(r['method'] ?? ''), endpoint: String(r['endpoint'] ?? ''), fromFile: String(r['fromFile'] ?? ''), toFile: String(r['toFile'] ?? ''), confidence: String(r['confidence'] ?? 'INFERRED'), type: String(r['type'] ?? '') } as Link;
  });

  const layerGroups: Record<string, Proj[]> = {};
  for (const lk of layerKeys) layerGroups[lk] = projs.filter((p) => p.kind === lk);

  const boxW = (p: Proj) => Math.max(BOX_MIN_W, Math.min(trunc(p.name, 30).length * 8 + 40, 320));

  const layerH = (lk: string) => layerGroups[lk].length ? BOX_H + 24 : 0;

  const layerY: Record<string, number> = {};
  let curY = TOP_PAD;
  for (const lk of layerKeys) {
    if (!layerGroups[lk].length) continue;
    layerY[lk] = curY;
    curY += layerH(lk) + LAYER_GAP;
  }
  const totalH = Math.max(curY + 16, 160);

  // Compute box positions
  const boxPos = new Map<string, { x: number; y: number; w: number; h: number; color: string }>();
  for (const lk of layerKeys) {
    const group = layerGroups[lk];
    if (!group.length) continue;
    const usable = W - PAD_L;
    const totalW = group.reduce((s, p) => s + boxW(p), 0) + (group.length - 1) * BOX_GAP;
    let cx = PAD_L + Math.max((usable - totalW) / 2, 0);
    for (const p of group) {
      const w = boxW(p);
      boxPos.set(p.id, { x: cx, y: (layerY[lk] ?? 0) + 8, w, h: BOX_H, color: colorByKind[lk] ?? '#94a3b8' });
      cx += w + BOX_GAP;
    }
  }

  const parts: string[] = [];

  // Background
  parts.push(`<rect width="${W}" height="${totalH}" fill="${BG}"/>`);

  // Arrowhead defs
  parts.push(`<defs>
    <marker id="ah" markerWidth="9" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#38bdf8"/></marker>
    <marker id="ahdb" markerWidth="9" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#fcd34d"/></marker>
    <marker id="ahgap" markerWidth="9" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#f87171"/></marker>
  </defs>`);

  // Layer bands
  for (const lk of layerKeys) {
    if (!layerGroups[lk].length || layerY[lk] === undefined) continue;
    const col = colorByKind[lk] ?? '#94a3b8';
    const lh = layerH(lk);
    const ly = layerY[lk];
    parts.push(`<rect x="0" y="${ly}" width="${W}" height="${lh}" fill="${col}" fill-opacity="0.07"/>`);
    parts.push(`<rect x="0" y="${ly}" width="${PAD_L - 4}" height="${lh}" fill="${col}" fill-opacity="0.18"/>`);
    const lmy = ly + lh / 2;
    parts.push(`<text x="${PAD_L / 2}" y="${lmy}" text-anchor="middle" dominant-baseline="middle" font-size="8" font-weight="bold" fill="${col}" font-family="monospace" transform="rotate(-90,${PAD_L / 2},${lmy})">${esc(layerLabels[lk] ?? lk)}</text>`);
  }

  // Cross-project edges (drawn before boxes so boxes render on top)
  const drawnLinks = new Set<string>();
  for (const link of links) {
    const fb = boxPos.get(link.fromProjectId);
    const tb = boxPos.get(link.toProjectId);
    if (!fb || !tb) continue;
    const ck = link.fromProjectId + '→' + link.toProjectId + link.endpoint;
    if (drawnLinks.has(ck)) continue;
    drawnLinks.add(ck);

    const x1 = fb.x + fb.w / 2, y1 = fb.y + fb.h;
    const x2 = tb.x + tb.w / 2, y2 = tb.y;
    const midY = (y1 + y2) / 2;
    const isDb = link.type.includes('DATABASE');
    const isGap = link.confidence === 'GAP';
    const col = isGap ? '#f87171' : isDb ? '#fcd34d' : '#38bdf8';
    const aid = isGap ? 'ahgap' : isDb ? 'ahdb' : 'ah';
    const dash = isDb ? 'stroke-dasharray="4 2"' : '';
    const label = ((link.method || '') + ' ' + (link.endpoint || '')).trim();
    const lbl = trunc(label, 28);

    parts.push(`<path d="M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}" fill="none" stroke="${col}" stroke-width="2" stroke-opacity="0.8" ${dash} marker-end="url(#${aid})"/>`);
    if (lbl) {
      const mx = (x1 + x2) / 2, my = midY;
      const lw = lbl.length * 5.8 + 6;
      parts.push(`<rect x="${mx - lw / 2}" y="${my - 13}" width="${lw}" height="13" rx="3" fill="${BG}" fill-opacity="0.9"/>`);
      parts.push(`<text x="${mx}" y="${my - 3}" text-anchor="middle" font-size="9" fill="${col}" font-family="monospace">${esc(lbl)}</text>`);
    }
  }

  // Project boxes
  for (const p of projs) {
    const pos = boxPos.get(p.id);
    if (!pos) continue;
    const col = pos.color;
    const subtitle = (p.stack.slice(0, 2).join(' · ') || p.kind) + `  ${p.files} arq`;
    parts.push(`<rect x="${pos.x - 2}" y="${pos.y - 2}" width="${pos.w + 4}" height="${pos.h + 4}" rx="10" fill="${col}" fill-opacity="0.1"/>`);
    parts.push(`<rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" rx="8" fill="${PANEL2}" stroke="${col}" stroke-width="1.5"/>`);
    parts.push(`<rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="36" rx="8" fill="${col}" fill-opacity="0.2"/>`);
    parts.push(`<text x="${pos.x + 10}" y="${pos.y + 16}" font-size="11" font-weight="bold" fill="${col}" font-family="monospace">${esc(trunc(p.name, 30))}</text>`);
    parts.push(`<text x="${pos.x + 10}" y="${pos.y + 29}" font-size="8" fill="${MUTED}">${esc(subtitle)}</text>`);
    if (p.risks > 0) {
      const riskColor = p.risks > 10 ? '#f87171' : '#fcd34d';
      parts.push(`<text x="${pos.x + pos.w - 8}" y="${pos.y + 16}" text-anchor="end" font-size="9" fill="${riskColor}">⚠ ${p.risks}</text>`);
    }

    // Files linked in cross-project links for this project (as chips)
    const outLinks = links.filter((l) => l.fromProjectId === p.id);
    const inLinks = links.filter((l) => l.toProjectId === p.id);
    const relatedFiles = [...new Set([
      ...outLinks.map((l) => l.fromFile ? l.fromFile.split('/').pop() ?? '' : ''),
      ...inLinks.map((l) => l.toFile ? l.toFile.split('/').pop() ?? '' : '')
    ])].filter(Boolean).slice(0, 4);

    if (relatedFiles.length) {
      let chipX = pos.x + 8;
      const chipY = pos.y + 46;
      for (const fname of relatedFiles) {
        const fw = Math.min(fname.length * 5.5 + 10, pos.w - 16);
        if (chipX + fw > pos.x + pos.w - 4) break;
        parts.push(`<rect x="${chipX}" y="${chipY}" width="${fw}" height="16" rx="4" fill="${col}" fill-opacity="0.15"/>`);
        parts.push(`<text x="${chipX + 5}" y="${chipY + 11}" font-size="8" fill="${FG}" font-family="monospace">${esc(trunc(fname, 22))}</text>`);
        chipX += fw + 4;
      }
    } else {
      parts.push(`<text x="${pos.x + pos.w / 2}" y="${pos.y + 62}" text-anchor="middle" font-size="9" fill="${MUTED}">nenhuma ponte detectada</text>`);
    }
  }

  // No-project fallback
  if (!projs.length) {
    parts.push(`<text x="${W / 2}" y="${totalH / 2}" text-anchor="middle" font-size="12" fill="${MUTED}">Projetos detectados mas sem kind mapeado. Rode Analisar Workspace.</text>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${totalH}" style="display:block">${parts.join('')}</svg>`;
}

function renderProjectGraphSection(data?: OverviewHtmlInput['projectGraphData']): string {
  const pg = data?.projectGraph;
  const cl = data?.crossProjectLinks as Record<string, unknown> | null | undefined;
  const fe = data?.frontendApiIndex ?? [];
  const be = data?.backendEndpointIndex ?? [];

  const hasData = pg || cl || fe.length > 0 || be.length > 0;

  if (!hasData) {
    return `
    <section class="section">
      <div class="kicker">Multi-Projeto</div>
      <h2>Grafo Multi-Projeto</h2>
      <div class="empty-state">
        <p>Nenhum dado de multi-projeto disponível.</p>
        <p class="caption">Rode <strong>Analisar Workspace</strong> para gerar o Grafo Multi-Projeto e Cross-Project Links.</p>
      </div>
    </section>`;
  }

  const projects = pg ? (pg['projects'] as unknown[] ?? []) : [];
  const crossLinks = cl ? (cl['links'] as unknown[] ?? []) : [];
  const gaps = cl ? (cl['gaps'] as unknown[] ?? []) : [];

  const svgHtml = buildMultiProjectSvg(projects, crossLinks);

  return `
  <section class="section">
    <div class="section-head">
      <div>
        <div class="kicker">Multi-Projeto</div>
        <h2>Grafo Multi-Projeto</h2>
        <p class="caption">${projects.length} projeto(s) · ${crossLinks.length} ponte(s) cross-project · ${gaps.length} lacuna(s)</p>
      </div>
      <div class="actions">
        <button class="btn compact" data-command="openProjectGraph">project-graph.json</button>
        <button class="btn compact" data-command="openCrossProjectLinks">cross-project-links.md</button>
      </div>
    </div>

    <div style="overflow-x:auto;border-radius:8px;margin-bottom:16px">
      ${svgHtml}
    </div>

    <div class="graph-tabs" style="display:flex;gap:8px;margin:8px 0;flex-wrap:wrap">
      <button class="btn compact mpg-tab-btn active" data-tab="pontes">Pontes (${crossLinks.length})</button>
      <button class="btn compact mpg-tab-btn" data-tab="frontend">Frontend API (${(fe as unknown[]).flatMap((f: unknown) => ((f as Record<string, unknown>)['calls'] as unknown[] ?? [])).length})</button>
      <button class="btn compact mpg-tab-btn" data-tab="backend">Backend Endpoints (${(be as unknown[]).flatMap((b: unknown) => ((b as Record<string, unknown>)['endpoints'] as unknown[] ?? [])).length})</button>
    </div>

    <div id="mpg-tab-pontes" class="mpg-tab">
      ${crossLinks.length === 0 ? `<p class="caption">Nenhum cross-project link encontrado. ${gaps.length > 0 ? `${gaps.length} chamadas frontend não mapeadas.` : 'Rode Analisar Workspace para detectar pontes entre frontend e backend.'}</p>` : `
      <div style="overflow-x:auto">
      <table class="data-table">
        <thead><tr>
          <th>De</th><th>Arquivo</th><th>Método</th><th>Endpoint</th><th>Para</th><th>Controller</th><th>Conf.</th>
        </tr></thead>
        <tbody>
          ${crossLinks.slice(0, 80).map((l: unknown) => {
            const lnk = l as Record<string, unknown>;
            const confVal = String(lnk['confidence'] ?? '');
            const confClass = confVal === 'CONFIRMED' ? 'badge-green' : confVal === 'INFERRED' ? 'badge-yellow' : 'badge-gray';
            return `<tr>
              <td class="mono">${escapeHtml(String(lnk['fromProjectId'] ?? ''))}</td>
              <td class="mono" title="${escapeHtml(String(lnk['fromFile'] ?? ''))}">${escapeHtml(String(lnk['fromFile'] ?? '').split('/').pop() ?? '')}</td>
              <td><span class="badge badge-blue">${escapeHtml(String(lnk['method'] ?? ''))}</span></td>
              <td class="mono">${escapeHtml(String(lnk['endpoint'] ?? ''))}</td>
              <td class="mono">${escapeHtml(String(lnk['toProjectId'] ?? ''))}</td>
              <td class="mono" title="${escapeHtml(String(lnk['toFile'] ?? ''))}">${escapeHtml(String(lnk['toFile'] ?? '').split('/').pop() ?? '')}</td>
              <td><span class="badge ${confClass}">${confVal}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>`}
    </div>

    <div id="mpg-tab-frontend" class="mpg-tab" style="display:none">
      ${fe.length === 0 ? '<p class="caption">Nenhuma chamada API frontend detectada. Rode Analisar Workspace.</p>' : `
      <div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Projeto</th><th>Arquivo</th><th>Método</th><th>Rota</th><th>Conf.</th></tr></thead>
        <tbody>
          ${(fe as unknown[]).flatMap((f: unknown) => {
            const idx = f as Record<string, unknown>;
            const calls = idx['calls'] as unknown[] ?? [];
            return calls.slice(0, 20).map((c: unknown) => {
              const call = c as Record<string, unknown>;
              const confVal = String(call['confidence'] ?? '');
              const confClass = confVal === 'CONFIRMED' ? 'badge-green' : confVal === 'INFERRED' ? 'badge-yellow' : 'badge-gray';
              return `<tr>
                <td class="mono">${escapeHtml(String(call['projectId'] ?? idx['projectId'] ?? ''))}</td>
                <td class="mono" title="${escapeHtml(String(call['file'] ?? ''))}">${escapeHtml(String(call['file'] ?? '').split('/').pop() ?? '')}</td>
                <td><span class="badge badge-blue">${escapeHtml(String(call['method'] ?? ''))}</span></td>
                <td class="mono">${escapeHtml(String(call['path'] ?? ''))}</td>
                <td><span class="badge ${confClass}">${confVal}</span></td>
              </tr>`;
            });
          }).join('')}
        </tbody>
      </table></div>`}
    </div>

    <div id="mpg-tab-backend" class="mpg-tab" style="display:none">
      ${be.length === 0 ? '<p class="caption">Nenhum endpoint backend detectado. Rode Analisar Workspace.</p>' : `
      <div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Projeto</th><th>Controller</th><th>Método</th><th>Rota</th><th>Conf.</th></tr></thead>
        <tbody>
          ${(be as unknown[]).flatMap((b: unknown) => {
            const idx = b as Record<string, unknown>;
            const endpoints = idx['endpoints'] as unknown[] ?? [];
            return endpoints.slice(0, 20).map((e: unknown) => {
              const ep = e as Record<string, unknown>;
              const confVal = String(ep['confidence'] ?? '');
              const confClass = confVal === 'CONFIRMED' ? 'badge-green' : confVal === 'INFERRED' ? 'badge-yellow' : 'badge-gray';
              return `<tr>
                <td class="mono">${escapeHtml(String(ep['projectId'] ?? idx['projectId'] ?? ''))}</td>
                <td class="mono" title="${escapeHtml(String(ep['controllerFile'] ?? ''))}">${escapeHtml(String(ep['controllerFile'] ?? '').split('/').pop() ?? '')}</td>
                <td><span class="badge badge-blue">${escapeHtml(String(ep['httpMethod'] ?? ''))}</span></td>
                <td class="mono">${escapeHtml(String(ep['fullPath'] ?? ep['path'] ?? ''))}</td>
                <td><span class="badge ${confClass}">${confVal}</span></td>
              </tr>`;
            });
          }).join('')}
        </tbody>
      </table></div>`}
    </div>
  </section>`;
}

// ─── 4. Flow Section ─────────────────────────────────────────────────────────

function renderFlowSection(projectGraphData?: OverviewHtmlInput['projectGraphData'], impactData?: OverviewHtmlInput['impactData']): string {
  const cl = projectGraphData?.crossProjectLinks as Record<string, unknown> | null | undefined;
  const crossLinks = cl ? (cl['links'] as unknown[] ?? []) : [];
  const fe = projectGraphData?.frontendApiIndex ?? [];
  const be = projectGraphData?.backendEndpointIndex ?? [];
  const bdbi = projectGraphData?.backendDatabaseIndex ?? [];
  const impact = impactData?.latestImpact;

  const hasAnyFlowData = crossLinks.length > 0 || fe.length > 0 || be.length > 0 || bdbi.length > 0 || impact;

  if (!hasAnyFlowData) {
    return `<section class="section">
      <div class="kicker">Fluxos</div>
      <h2>Fluxos Detectados</h2>
      <div class="empty-state">
        <p>Nenhum fluxo frontend → backend → banco detectado.</p>
        <p class="caption">Rode <strong>Analisar Workspace</strong> para detectar fluxos entre camadas.</p>
      </div>
    </section>`;
  }

  // Build flow chains from cross-project links
  const flowRows: string[] = [];

  // If we have screen impact data, show that first
  if (impact) {
    const feMatches = impact.frontendMatches.slice(0, 5);
    const apis = impact.apiCalls.slice(0, 5);
    const tables = impact.databaseImpact.tables.slice(0, 5);

    flowRows.push(`<div class="flow-chain">
      <div class="flow-step flow-screen">
        <span class="flow-icon">🖥️</span>
        <span>${escapeHtml(impact.input.userHints.screenName || impact.input.url || 'Tela analisada')}</span>
        <span class="badge badge-blue">Impact</span>
      </div>
      ${feMatches.length > 0 ? `<div class="flow-arrow">→</div><div class="flow-step flow-frontend">
        <span class="flow-icon">🎨</span>
        <span>${feMatches.map((m) => escapeHtml(m.file.split('/').pop() ?? '')).join(', ')}</span>
      </div>` : ''}
      ${apis.length > 0 ? `<div class="flow-arrow">→</div><div class="flow-step flow-api">
        <span class="flow-icon">📡</span>
        <span>${apis.map((a) => escapeHtml(`${a.method} ${a.path}`)).join(', ')}</span>
      </div>` : ''}
      ${tables.length > 0 ? `<div class="flow-arrow">→</div><div class="flow-step flow-db">
        <span class="flow-icon">🗄️</span>
        <span>${tables.map((t) => escapeHtml(t)).join(', ')}</span>
      </div>` : ''}
      <div class="flow-conf"><span class="badge badge-yellow">Fonte: latest-screen-impact.json</span></div>
    </div>`);
  }

  // Build flows from cross-project links (group by endpoint)
  const byEndpoint = new Map<string, unknown[]>();
  for (const l of crossLinks.slice(0, 30)) {
    const lnk = l as Record<string, unknown>;
    const key = `${lnk['method'] ?? ''} ${lnk['endpoint'] ?? ''}`;
    if (!byEndpoint.has(key)) byEndpoint.set(key, []);
    byEndpoint.get(key)!.push(lnk);
  }

  let flowCount = 0;
  for (const [endpoint, links] of byEndpoint) {
    if (flowCount >= 10) break;
    const first = links[0] as Record<string, unknown>;
    const conf = String(first['confidence'] ?? 'GAP');
    const confClass = conf === 'CONFIRMED' ? 'badge-green' : conf === 'INFERRED' ? 'badge-yellow' : 'badge-red';
    const confLabel = conf === 'CONFIRMED' ? '🟢' : conf === 'INFERRED' ? '🟡' : '🔴';

    flowRows.push(`<div class="flow-chain">
      <div class="flow-step flow-frontend">
        <span class="flow-icon">🎨</span>
        <span class="mono">${escapeHtml(String(first['fromFile'] ?? '').split('/').pop() ?? '')}</span>
      </div>
      <div class="flow-arrow">→</div>
      <div class="flow-step flow-api">
        <span class="flow-icon">📡</span>
        <span class="mono">${escapeHtml(endpoint)}</span>
      </div>
      <div class="flow-arrow">→</div>
      <div class="flow-step flow-backend">
        <span class="flow-icon">⚙️</span>
        <span class="mono">${escapeHtml(String(first['toFile'] ?? '').split('/').pop() ?? String(first['toProjectId'] ?? 'não encontrado'))}</span>
      </div>
      <div class="flow-conf">${confLabel} <span class="badge ${confClass}">${escapeHtml(conf)}</span></div>
    </div>`);
    flowCount++;
  }

  // Gaps
  const gaps = cl ? (cl['gaps'] as unknown[] ?? []) : [];
  for (const g of gaps.slice(0, 5)) {
    const gap = g as Record<string, unknown>;
    flowRows.push(`<div class="flow-chain flow-gap">
      <div class="flow-step flow-frontend">
        <span class="flow-icon">🎨</span>
        <span class="mono">${escapeHtml(String(gap['fromFile'] ?? '').split('/').pop() ?? '')}</span>
      </div>
      <div class="flow-arrow">→</div>
      <div class="flow-step flow-api">
        <span class="flow-icon">📡</span>
        <span class="mono">${escapeHtml(String(gap['method'] ?? ''))} ${escapeHtml(String(gap['endpoint'] ?? gap['path'] ?? ''))}</span>
      </div>
      <div class="flow-arrow">→</div>
      <div class="flow-step flow-missing">
        <span class="flow-icon">❌</span>
        <span>backend não encontrado</span>
      </div>
      <div class="flow-conf">🔴 <span class="badge badge-red">LACUNA</span></div>
    </div>`);
  }

  return `<section class="section">
    <div class="kicker">Fluxos</div>
    <h2>Fluxos Detectados</h2>
    <p class="caption">Rastreamento de tela/componente → API → controller → banco. Fonte: <code>cross-project-links.json</code>, <code>frontend-api-index.json</code>, <code>backend-endpoint-index.json</code></p>
    <div class="flow-list">${flowRows.join('')}</div>
    <div class="confidence-legend" style="margin-top:12px">
      <span class="badge badge-green">🟢 Confirmado</span>
      <span class="badge badge-yellow">🟡 Inferido</span>
      <span class="badge badge-red">🔴 Lacuna</span>
    </div>
  </section>`;
}

// ─── 5. Impact Summary ──────────────────────────────────────────────────────

function renderImpactSummary(impactData?: OverviewHtmlInput['impactData']): string {
  const impact = impactData?.latestImpact;
  const imageIndex = impactData?.latestImageIndex ?? null;

  if (!impact) {
    return `<div class="impact-empty">
      <span class="badge badge-gray">Nenhuma análise executada</span>
      <strong>Pronto para fingerprint visual</strong>
      <p class="caption">Importe um screenshot ou preencha as pistas da tela para gerar frontend, API, backend e SQL/PLSQL prováveis.</p>
      <div class="actions visual-actions" style="margin-top:8px">
        <button class="btn primary" data-command="importImpactScreenshot">Importar Screenshot</button>
      </div>
      ${renderVisualEvidenceBlock(null)}
    </div>`;
  }
  const filesToReview = impact.impactEstimate.recommendedFilesToReview ?? [];
  const filesToEdit = (impactData?.latestFilesToEdit ?? impact.fileCandidates).slice(0, 10);
  const cost = impactData?.latestCostEstimate;
  const metadata = impact.fingerprint.screenshotMetadata;
  const visual = impact.fingerprint.visualRecognition;
  const dimension = metadata.width && metadata.height ? `${metadata.width}x${metadata.height}` : 'não disponível';
  return `
    <div class="impact-scoreboard">
      <div class="score-tile strong"><span>${impact.impactEstimate.score}</span><small>score</small></div>
      <div class="score-tile"><span>${impact.frontendMatches.length}</span><small>frontend</small></div>
      <div class="score-tile"><span>${impact.apiCalls.length}</span><small>API</small></div>
      <div class="score-tile"><span>${impact.databaseImpact.tables.length}</span><small>tabelas</small></div>
    </div>
    <div class="pill-list" style="margin-top:10px">
      <span class="badge badge-blue">Impacto ${escapeHtml(impact.impactEstimate.level)}</span>
      <span class="badge badge-gray">Esforço ${escapeHtml(impact.impactEstimate.estimatedEffort.label)}</span>
      <span class="badge badge-gray">${escapeHtml(metadata.confidence ?? 'não determinado')}</span>
    </div>
    <p class="caption" style="margin-top:6px">Fonte: <code>impact/latest-screen-impact.json</code></p>
    <ul class="impact-list">
      <li><span>URL</span><span class="caption mono">${escapeHtml(impact.input.url ?? 'não informada')}</span></li>
      <li><span>Tela inferida</span><span class="caption">${escapeHtml(visual?.probableScreen ?? impact.input.userHints.screenName ?? 'não inferida')}</span></li>
      <li><span>Dimensão</span><span class="caption mono">${escapeHtml(dimension)} / ${escapeHtml(metadata.viewport ?? 'não disponível')}</span></li>
      <li><span>Assinatura</span><span class="caption mono">${escapeHtml(metadata.visualSignature ?? 'não gerada')}</span></li>
      <li><span>Screenshot</span><span class="caption mono">${escapeHtml(impact.input.screenshotFileName ?? 'não importado')}</span></li>
    </ul>
    <div class="trace-rail" aria-label="Fluxo visual">
      <span>Frontend</span><span>API</span><span>Backend</span><span>SQL</span><span>PLSQL</span>
    </div>
    <p class="caption" style="margin-top:8px"><strong>Arquivos prováveis:</strong> ${filesToEdit.map((f) => escapeHtml(f.file)).join(', ') || 'nenhum detectado'}</p>
    <p class="caption"><strong>Arquivos para revisar:</strong> ${filesToReview.map((f) => escapeHtml(f)).join(', ') || 'nenhum'}</p>
    <p class="caption"><strong>Riscos:</strong> ${impact.impactEstimate.risks.map((r) => escapeHtml(r)).join(' | ') || 'nenhum detectado'}</p>
    <p class="caption"><strong>Perguntas:</strong> ${impact.questions.map((q) => escapeHtml(q)).join(' | ') || 'nenhuma'}</p>
    ${visual ? `<p class="caption"><strong>Sinais visuais:</strong> ${visual.signals.map((signal) => escapeHtml(signal)).join(' | ')}</p>` : ''}
    ${cost ? `<p class="caption"><strong>Estimativa IA Local:</strong> modelo ${escapeHtml(String(cost.model ?? 'não informado'))}, resposta ${escapeHtml(String(cost.response ?? 'não disponível'))} - <code>.tic-code/impact/latest-cost-estimate.md</code></p>` : ''}
    ${renderVisualEvidenceBlock(imageIndex)}
  `;
}

function renderVisualEvidenceBlock(imageIndex: import('../impact/impactTypes').ImageIndexEntry | null): string {
  if (!imageIndex) {
    return `<div class="detail" style="margin-top:12px;padding:10px;border:1px solid var(--vscode-editorHint-border,#555)">
      <strong>Evidência Visual</strong>
      <p class="caption" style="margin-top:4px">Nenhuma evidência visual importada ainda.</p>
      <div class="actions visual-actions" style="margin-top:8px">
        <button class="btn primary" data-command="importImpactScreenshot">Importar Screenshot</button>
      </div>
    </div>`;
  }

  const lv = imageIndex.localVision;
  const hasScreenshot = Boolean(imageIndex.screenshotPath);
  const visionAttempted = lv.attempted;
  const visionEnabled = lv.enabled;
  const readyForPaidAi = hasScreenshot;

  let visionStatus: string;
  let visionBadgeClass: string;
  if (visionAttempted) {
    visionStatus = `Executado (${escapeHtml(lv.model ?? 'não informado')})`;
    visionBadgeClass = 'badge-green';
  } else if (visionEnabled) {
    visionStatus = 'Habilitado / não executado';
    visionBadgeClass = 'badge-yellow';
  } else if (!lv.model && lv.warnings.some((w) => w.includes('modelo'))) {
    visionStatus = 'Modelo ausente';
    visionBadgeClass = 'badge-red';
  } else {
    visionStatus = 'Desativado';
    visionBadgeClass = 'badge-gray';
  }

  const visibleTexts = lv.visibleText.slice(0, 6).map((t) => escapeHtml(t)).join(', ') || 'nenhum';
  const uiElements = lv.uiElements.slice(0, 6).map((e) => escapeHtml(e)).join(', ') || 'nenhum';
  const actions = lv.actions.slice(0, 4).map((a) => escapeHtml(a)).join(', ') || 'nenhuma';

  const visionLocalNote = visionAttempted
    ? `<p class="caption" style="margin-top:4px">Reconhecimento visual local executado.</p>
       <ul class="impact-list" style="margin-top:6px">
         <li><span>Textos visíveis</span><span class="caption">${visibleTexts}</span></li>
         <li><span>Elementos UI</span><span class="caption">${uiElements}</span></li>
         <li><span>Ações</span><span class="caption">${actions}</span></li>
         ${lv.warnings.length ? `<li><span>Avisos</span><span class="caption">${lv.warnings.map((w) => escapeHtml(w)).join(' | ')}</span></li>` : ''}
       </ul>`
    : `<p class="caption" style="margin-top:4px">Imagem indexada. Reconhecimento real da imagem não executado. Use IA paga com visão anexando a imagem, ou ative visão local com <code>qwen2.5vl:3b</code>.</p>`;

  return `<div class="detail" style="margin-top:12px;padding:10px;border:1px solid var(--vscode-editorHint-border,#555)">
    <strong>Evidência Visual</strong>
    <div class="pill-list" style="margin-top:6px">
      <span class="badge ${hasScreenshot ? 'badge-green' : 'badge-gray'}">Screenshot: ${hasScreenshot ? 'importado' : 'não importado'}</span>
      <span class="badge ${imageIndex.fingerprintPath ? 'badge-green' : 'badge-gray'}">Fingerprint: ${imageIndex.fingerprintPath ? 'gerado' : 'não gerado'}</span>
      <span class="badge ${visionBadgeClass}">Visão local: ${visionStatus}</span>
      <span class="badge ${readyForPaidAi ? 'badge-green' : 'badge-gray'}">IA paga com visão: ${readyForPaidAi ? 'sim' : 'não'}</span>
    </div>
    <ul class="impact-list" style="margin-top:8px">
      <li><span>Image Index</span><span class="caption mono">${escapeHtml(imageIndex.fingerprintPath ? `.tic-code/visual-index/screenshots/${imageIndex.id}/image-index.json` : 'não gerado')}</span></li>
      <li><span>Caminho</span><span class="caption mono">${escapeHtml(imageIndex.relativeScreenshotPath ?? imageIndex.screenshotFileName ?? 'não disponível')}</span></li>
    </ul>
    ${visionLocalNote}
    <div class="actions visual-actions" style="margin-top:8px">
      <button class="btn primary" data-command="importImpactScreenshot">Importar Screenshot</button>
      ${hasScreenshot ? `<button class="btn" data-command="openLatestImpactScreenshot">Abrir Screenshot</button>` : ''}
      <button class="btn" data-command="openImageIndex">Abrir Image Index</button>
      <button class="btn" data-command="openVisualIndex">Abrir Visual Index</button>
      <button class="btn" data-command="exportChangePackageForPaidAi">Exportar Pacote para IA Paga</button>
    </div>
  </div>`;
}

// ─── 6. Dependency Impact ────────────────────────────────────────────────────

function renderDepImpactSection(data?: OverviewHtmlInput['depImpactData']): string {
  const result = data?.latestResult ?? null;
  const baselines = data?.baselines ?? [];
  const hasBaseline = baselines.length > 0;
  const hasResult = result !== null;

  const impactBadge = (level: string | undefined) => {
    if (!level) return '';
    const cls = level === 'CRITICAL' ? 'badge-red' : level === 'HIGH' ? 'badge-red' : level === 'MEDIUM' ? 'badge-yellow' : 'badge-green';
    return `<span class="badge ${cls}">${escapeHtml(level)}</span>`;
  };
  const recBadge = (rec: string | undefined) => {
    if (!rec) return '';
    const cls = rec === 'BLOCK' ? 'badge-red' : rec === 'REVIEW_REQUIRED' ? 'badge-yellow' : 'badge-green';
    return `<span class="badge ${cls}">${escapeHtml(rec)}</span>`;
  };

  const baselineCards = hasBaseline
    ? `<div class="setup-grid">${baselines.map(b => `
      <div class="card setup-card">
        <strong>${escapeHtml(b.projectId || 'Projeto')}</strong>
        <p class="caption">${escapeHtml(b.language || 'linguagem não detectada')} · Runtime: ${escapeHtml(b.runtimeVersion || 'não detectado')}</p>
        <span class="badge badge-gray">${escapeHtml(b.runtimeVersionConfidence || 'não determinado')}</span>
        <span class="cockpit-source">Fonte: dependency-impact/baseline.json</span>
      </div>`).join('')}</div>`
    : `<div class="empty-state"><p>Baseline não detectado. Rode <strong>Analisar Workspace</strong> primeiro.</p></div>`;

  const resultBlock = hasResult ? `
    <div class="detail" style="margin-top:12px">
      <h3>Última Análise de Impacto</h3>
      <div class="pill-list" style="margin-top:8px">
        ${impactBadge(result.impactLevel)}
        <span class="badge badge-gray">Score: ${result.score}</span>
        ${recBadge(result.approvalRecommendation)}
      </div>
      <ul class="impact-list" style="margin-top:8px">
        <li><span>Arquivos afetados</span><span class="caption">${result.affectedFiles?.length ?? 0}</span></li>
        <li><span>Achados de compatibilidade</span><span class="caption">${result.compatibilityFindings?.length ?? 0}</span></li>
        <li><span>Riscos de quebra</span><span class="caption">${result.breakingRisks?.length ?? 0}</span></li>
      </ul>
      <span class="cockpit-source">Fonte: dependency-impact/latest-dependency-impact.json</span>
      <div class="actions visual-actions" style="margin-top:8px">
        <button class="btn" data-command="openDepImpactReport">Relatório</button>
        <button class="btn" data-command="openDepImpactMigrationPlan">Plano de Migração</button>
        <button class="btn" data-command="openDepImpactApprovalPack">Approval Pack</button>
      </div>
    </div>` : `<div class="empty-state" style="margin-top:12px"><p>Nenhuma análise de impacto de dependência executada.</p></div>`;

  return `
  <section class="section">
    <div class="section-head">
      <div>
        <div class="kicker">Dependency Change Impact</div>
        <h2>Impacto de Mudança de Dependência</h2>
        <p class="caption">Analise o impacto de upgrades de dependências no seu workspace.</p>
      </div>
      <div class="actions">
        <button class="btn primary" data-command="analyzeDependencyChange">Analisar Mudança de Dependência</button>
      </div>
    </div>
    <h3>Baseline Detectado</h3>
    ${baselineCards}
    ${resultBlock}
  </section>`;
}

// ─── 8. Reversa Engine Section ───────────────────────────────────────────────

function renderReversaEngineSection(summary: ProjectSummary, reversaData?: OverviewHtmlInput['reversaData']): string {
  const analysisRan = summary.totalFiles > 0;
  const graphNodes = Array.isArray(reversaData?.graph?.nodes) ? reversaData?.graph?.nodes.length : summary.graph.stats.nodeCount;
  const graphEdges = Array.isArray(reversaData?.graph?.edges) ? reversaData?.graph?.edges.length : summary.graph.stats.edgeCount;
  const moduleCount = Array.isArray(reversaData?.modules) ? reversaData?.modules.length : summary.inventory.modules.length;
  const riskCount = Array.isArray(reversaData?.risks) ? reversaData?.risks.length : summary.risks.summary.total;
  const generatedFileCount = 8;

  const phases = [
    { id: 'reversa', label: 'Reversa', icon: '🧭', status: analysisRan ? 'completed' : 'pending' },
    { id: 'scout', label: 'Scout', icon: '🔍', status: analysisRan ? 'completed' : 'pending' },
    { id: 'archaeologist', label: 'Archaeologist', icon: '⛏️', status: analysisRan ? 'completed' : 'pending' },
    { id: 'detective', label: 'Detective', icon: '🕵️', status: analysisRan ? 'completed' : 'pending' },
    { id: 'architect', label: 'Architect', icon: '🏗️', status: analysisRan ? 'completed' : 'pending' },
    { id: 'writer', label: 'Writer', icon: '📝', status: analysisRan ? 'completed' : 'pending' },
    { id: 'reviewer', label: 'Reviewer', icon: '🔬', status: analysisRan ? 'completed' : 'pending' },
    { id: 'tracer', label: 'Tracer', icon: '📈', status: 'pending', executionMode: 'user-input', requiredInputs: ['logs/traces .log/.txt/.json/.ndjson'], generatedFiles: ['dynamic.md','runtime-evidence.md'] },
    { id: 'visor', label: 'Visor', icon: '🖼️', status: 'pending', executionMode: 'user-input', requiredInputs: ['screenshots .png/.jpg/.jpeg/.webp'], generatedFiles: ['screenshots-index.md','ui-analysis.md','user-flows.md','screenshots-analysis.json'] },
    { id: 'data-master', label: 'Data Master', icon: '🗄️', status: analysisRan ? 'completed' : 'pending' },
    { id: 'design-system', label: 'Design System', icon: '🎨', status: analysisRan ? 'completed' : 'pending' },
    { id: 'chronicler', label: 'Chronicler', icon: '📚', status: analysisRan ? 'completed' : 'pending', executionMode: 'deterministic', requiredInputs: [], generatedFiles: ['session.md','history.json','changelog.md'] }
  ];

  const statusBadge = (s: string) => {
    if (s === 'completed') return '<span class="badge badge-green">✅ Executado</span>';
    return '<span class="badge badge-gray">⏳ Pendente</span>';
  };

  const fileStatus = (generated: boolean) =>
    generated
      ? '<span class="badge badge-green">✅ Gerado</span>'
      : '<span class="badge badge-gray">⏳ Pendente</span>';

  const generatedFiles = [
    { path: '.tic-code/reversa/state.json', icon: '📊', generated: analysisRan },
    { path: '.tic-code/reversa/config.json', icon: '⚙️', generated: analysisRan },
    { path: '.tic-code/reversa/plan.md', icon: '📋', generated: analysisRan },
    { path: '.tic-code/reversa/context/surface.json', icon: '🗺️', generated: analysisRan },
    { path: '.tic-code/reversa/context/modules.json', icon: '📦', generated: analysisRan },
    { path: '.tic-code/reversa/context/graph.json', icon: '🕸️', generated: analysisRan },
    { path: '.tic-code/reversa/context/risks.json', icon: '⚠️', generated: analysisRan },
    { path: '.tic-code/reverse-engineering/', icon: '📁', generated: analysisRan }
  ];

  return `<section class="section">
    <div class="kicker">Reversa Engine</div>
    <h2>Arquivos Gerados / Evidências</h2>
    <p class="caption">Motor de programação reversa embutido. Pipeline gera contexto em <code>.tic-code/reversa/</code>.</p>
    <div class="metrics">
      ${metric('Agentes mapeados', '12 / 12')}
      ${metric('Módulos', moduleCount)}
      ${metric('Riscos', riskCount)}
      ${metric('Arquivos gerados', generatedFileCount)}
      ${metric('Nós do grafo', graphNodes)}
      ${metric('Arestas do grafo', graphEdges)}
    </div>
    <details>
      <summary style="cursor:pointer;font-weight:600;margin-bottom:8px">Fases da Metodologia Reversa (${phases.filter(p => p.status === 'completed').length}/${phases.length} executadas)</summary>
      <div class="phase-grid">
        ${phases.map((p) => `<div class="phase-item"><span>${p.icon}</span><span><strong>${p.label}</strong></span>${statusBadge(p.status)}<div class="caption">Modo: ${(p as any).executionMode ?? 'deterministic'}</div><div class="caption">Inputs: ${((p as any).requiredInputs ?? []).join(', ') || 'nenhum'}</div><div class="caption">Arquivos: ${((p as any).generatedFiles ?? []).join(', ') || 'n/a'}</div>${p.id === 'tracer' ? '<button class=\"btn\" data-command=\"importTracerInputs\">Importar Logs/Traces</button>' : ''}${p.id === 'visor' ? '<button class=\"btn\" data-command=\"importVisorScreenshots\">Importar Screenshots</button>' : ''}</div>`).join('\n        ')}
      </div>
    </details>
    <details style="margin-top:8px">
      <summary style="cursor:pointer;font-weight:600;margin-bottom:8px">Arquivos Gerados (${generatedFiles.filter(f => f.generated).length}/${generatedFiles.length})</summary>
      <div class="links-grid">
        ${generatedFiles.map((f) => `<div class="link-item"><span>${f.icon}</span> <code>${f.path}</code> ${fileStatus(f.generated)}</div>`).join('\n        ')}
      </div>
    </details>
    <div class="confidence-legend" style="margin-top:10px">
      <span class="badge badge-green">🟢 CONFIRMADO</span>
      <span class="badge badge-yellow">🟡 INFERIDO</span>
      <span class="badge badge-red">🔴 LACUNA</span>
    </div>
    ${reversaData?.state ? '<p class="caption">Dados reais carregados de state.json/context/*.json.</p>' : '<p class="caption">Execute uma análise para preencher dados do Reversa.</p>'}
  </section>`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderLocalAiLog(log: LocalAiTaskLogEntry[] | undefined): string {
  if (!log || log.length === 0) {
    return '<p class="caption" style="margin-top:8px">Nenhuma execução de IA Local registrada ainda.</p>';
  }
  const rows = log.map((entry) => `
    <tr>
      <td>${escapeHtml(entry.taskLabel)}</td>
      <td class="mono">${escapeHtml(entry.model)}</td>
      <td class="caption">${escapeHtml(entry.reason)}</td>
    </tr>`).join('');
  return `
    <details style="margin-top:10px">
      <summary class="caption" style="cursor:pointer">📋 Modelos usados na última execução</summary>
      <table class="data-table" style="margin-top:6px">
        <thead><tr><th>Tarefa</th><th>Modelo</th><th>Motivo</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </details>`;
}

function getProjectIcon(kind: string): string {
  const icons: Record<string, string> = {
    backend: '⚙️',
    frontend: '🎨',
    mobile: '📱',
    database: '🗄️',
    infra: '🌐',
    shared: '📦',
    unknown: '❓'
  };
  return icons[kind] ?? '📁';
}

function metric(label: string, value: string | number): string {
  return `<div class="card"><span class="value">${escapeHtml(String(value))}</span><span class="label">${escapeHtml(label)}</span></div>`;
}

function estimateMethods(summary: ProjectSummary): number {
  const javaApprox = summary.inventory.javaSpring.files.reduce((total, file) => total + Math.max(1, file.endpoints.length), 0);
  const scriptApprox = summary.graph.nodes.filter((node) => node.type === 'script_source').length;
  return javaApprox + scriptApprox;
}

function findHighRiskFiles(summary: ProjectSummary): Array<{ path: string; level: string }> {
  const fromRisks = summary.risks.risks
    .filter((risk) => risk.level === 'critical' || risk.level === 'high')
    .map((risk) => ({ path: risk.file, level: risk.level }));
  const fromGraph = summary.graph.nodes
    .filter((node) => node.module !== 'external' && node.riskLevel)
    .map((node) => ({ path: node.path, level: node.riskLevel ?? 'medium' }));

  const seen = new Set<string>();
  return [...fromRisks, ...fromGraph].filter((item) => {
    if (seen.has(item.path)) {
      return false;
    }
    seen.add(item.path);
    return true;
  }).slice(0, 12);
}

function riskLabel(value: string): string {
  return {
    critical: 'crítico',
    high: 'alto',
    medium: 'médio',
    low: 'baixo'
  }[value] ?? value;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('</', '<\\/');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
