"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderOverviewHtml = renderOverviewHtml;
const graphRenderer_1 = require("./graphRenderer");
const webviewAssets_1 = require("./webviewAssets");
const databaseSearch_1 = require("./databaseSearch");
const databaseIndex_1 = require("../scanner/databaseIndex");
const databaseLargeMode_1 = require("../scanner/databaseLargeMode");
const config_1 = require("../utils/config");
function renderOverviewHtml(input) {
    const { summary, engines, agentContextPreview, nonce, localAiTaskLog, localAiConfig, reversaData } = input;
    const graph = (0, graphRenderer_1.buildWebviewGraphData)(summary.graph);
    const javaClasses = summary.inventory.javaSpring.files.length;
    const methods = estimateMethods(summary);
    const highRiskFiles = findHighRiskFiles(summary);
    const modules = summary.inventory.modules.filter((module) => module.files.length > 0);
    const detectedEngines = engines.filter((engine) => engine.detected);
    const stack = summary.inventory.stack.filter((signal) => signal.detected);
    const plsql = summary.inventory.plsql;
    const plsqlRisks = summary.risks.risks.filter((risk) => risk.category === 'plsql');
    const detectedProjects = summary.detectedProjects ?? [];
    // Construir seção Database Enterprise se PL/SQL for detectado
    let dbEnterpriseHtml = '';
    if (plsql.detected) {
        try {
            const dbConfig = (0, config_1.getTicCoderLiteConfig)().database;
            const dbIndex = (0, databaseIndex_1.buildDatabaseIndex)(plsql, dbConfig);
            const dbSummary = (0, databaseLargeMode_1.buildDatabaseSummary)(dbIndex);
            dbEnterpriseHtml = (0, databaseSearch_1.renderDatabaseEnterpriseSection)({ index: dbIndex, summary: dbSummary });
        }
        catch {
            // Fallback para seção básica se o enterprise mode falhar
            dbEnterpriseHtml = '';
        }
    }
    const data = {
        graph,
        project: summary.workspaceName,
        engines: engines.map((engine) => ({ id: engine.id, name: engine.name, detected: engine.detected })),
        projects: detectedProjects,
        selectedProject: null
    };
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reversa Engine — TIC Coder Lite</title>
  <style nonce="${nonce}">${(0, webviewAssets_1.getOverviewStyles)()}</style>
</head>
<body>
  <script nonce="${nonce}">window.__TIC_CODE_DATA__ = ${safeJson(data)};</script>
  <main class="page">
    <header class="header">
      <div>
        <h1>Reversa Engine — TIC Coder Lite</h1>
        <p class="muted">Interface gráfica VS Code para programação reversa</p>
        <p class="muted">Workspace: <strong>${escapeHtml(summary.workspaceName)}</strong></p>
      </div>
      <div class="actions">
        <button class="btn primary" data-command="analyzeProject">⚡ Analisar Workspace</button>
        <button class="btn" data-command="exportForCodex">Exportar para Codex</button>
        <button class="btn" data-command="exportForClaude">Exportar para Claude</button>
        <button class="btn" data-command="enhanceLocalAi">🧠 Melhorar com IA Local</button>
      </div>
    </header>

    <section class="section">
      <h2>Subprojetos Detectados</h2>
      ${detectedProjects.length > 0
        ? `<div class="project-selector">
             <label>Selecionar projeto para análise:</label>
             <div class="project-grid">
               <div class="project-card active" data-project-id="all">
                 <span class="project-icon">🌍</span>
                 <span class="project-name">Todos os projetos</span>
                 <span class="project-count">${detectedProjects.length} projeto(s)</span>
               </div>
               ${detectedProjects.map((project) => `
                 <div class="project-card" data-project-id="${escapeHtml(project.id)}">
                   <span class="project-icon">${getProjectIcon(project.kind)}</span>
                   <span class="project-name">${escapeHtml(project.name)}</span>
                   <span class="project-count">${project.files} arquivo(s) · ${project.risks} risco(s)</span>
                 </div>
               `).join('')}
             </div>
           </div>`
        : `<div class="card"><p>Nenhum subprojeto específico detectado. Análise global sendo exibida.</p></div>`}
    </section>

    <section class="summary" aria-label="Resumo">
      ${metric('Arquivos analisados', summary.totalFiles)}
      ${metric('Classes Java', javaClasses)}
      ${metric('Métodos estimados', methods)}
      ${metric('Riscos', summary.risks.summary.total)}
      ${metric('Engines de IA', detectedEngines.length)}
      ${metric('Database / PL/SQL', plsql.files.length)}
    </section>

    ${renderReversaEngineSection(summary, reversaData)}

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
      <h2>Grafo</h2>
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
    </section>

    <section class="section">
      <h2>Riscos</h2>
      <ul>${highRiskFiles.map((file) => `<li><span class="mono">${escapeHtml(file.path)}</span><span class="risk-${escapeHtml(file.level)}">${riskLabel(file.level)}</span></li>`).join('') || '<li><span>Nenhum risco alto detectado.</span></li>'}</ul>
    </section>

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
        <ul>
          <li>Resumos de regras de negócio candidatas</li>
          <li>Perguntas de validação humana</li>
          <li>Descrições de domínio e arquitetura</li>
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

    <section class="section">
      <h2>Log do TIC</h2>
      <div class="log" id="logs"></div>
    </section>
  </main>
  ${(0, webviewAssets_1.getOverviewScript)(nonce)}
</body>
</html>`;
}
function renderLocalAiLog(log) {
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
      <table style="width:100%;margin-top:6px;border-collapse:collapse;font-size:0.85em">
        <thead><tr><th style="text-align:left">Tarefa</th><th style="text-align:left">Modelo</th><th style="text-align:left">Motivo</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </details>`;
}
function getProjectIcon(kind) {
    const icons = {
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
function metric(label, value) {
    return `<div class="card"><span class="value">${escapeHtml(String(value))}</span><span class="label">${escapeHtml(label)}</span></div>`;
}
function estimateMethods(summary) {
    const javaApprox = summary.inventory.javaSpring.files.reduce((total, file) => total + Math.max(1, file.endpoints.length), 0);
    const scriptApprox = summary.graph.nodes.filter((node) => node.type === 'script_source').length;
    return javaApprox + scriptApprox;
}
function findHighRiskFiles(summary) {
    const fromRisks = summary.risks.risks
        .filter((risk) => risk.level === 'critical' || risk.level === 'high')
        .map((risk) => ({ path: risk.file, level: risk.level }));
    const fromGraph = summary.graph.nodes
        .filter((node) => node.module !== 'external' && node.riskLevel)
        .map((node) => ({ path: node.path, level: node.riskLevel ?? 'medium' }));
    const seen = new Set();
    return [...fromRisks, ...fromGraph].filter((item) => {
        if (seen.has(item.path)) {
            return false;
        }
        seen.add(item.path);
        return true;
    }).slice(0, 12);
}
function riskLabel(value) {
    return {
        critical: 'critico',
        high: 'alto',
        medium: 'medio',
        low: 'baixo'
    }[value] ?? value;
}
function safeJson(value) {
    return JSON.stringify(value).replaceAll('</', '<\\/');
}
function renderReversaEngineSection(summary, reversaData) {
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
        { id: 'tracer', label: 'Tracer', icon: '📈', status: 'pending', executionMode: 'user-input', requiredInputs: ['logs/traces .log/.txt/.json/.ndjson'], generatedFiles: ['dynamic.md', 'runtime-evidence.md'] },
        { id: 'visor', label: 'Visor', icon: '🖼️', status: 'pending', executionMode: 'user-input', requiredInputs: ['screenshots .png/.jpg/.jpeg/.webp'], generatedFiles: ['screenshots-index.md', 'ui-analysis.md', 'user-flows.md'] },
        { id: 'data-master', label: 'Data Master', icon: '🗄️', status: analysisRan ? 'completed' : 'pending' },
        { id: 'design-system', label: 'Design System', icon: '🎨', status: analysisRan ? 'completed' : 'pending' },
        { id: 'chronicler', label: 'Chronicler', icon: '📚', status: analysisRan ? 'completed' : 'pending', executionMode: 'deterministic', requiredInputs: [], generatedFiles: ['session.md', 'history.json', 'changelog.md'] }
    ];
    const statusBadge = (s) => {
        if (s === 'completed')
            return '<span class="badge badge-green">✅ Executado</span>';
        return '<span class="badge badge-gray">⏳ Pendente</span>';
    };
    const fileStatus = (generated) => generated
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
    return `<section class="section premium">
    <h2>Reversa Engine — TIC Coder Lite</h2>
    <p class="caption">Motor de programação reversa embutido. Pipeline gera contexto em <code>.tic-code/reversa/</code>.</p>
    <div class="metrics premium-metrics">
      ${metric('Agentes mapeados', '12 / 12')}
      ${metric('Módulos', moduleCount)}
      ${metric('Riscos', riskCount)}
      ${metric('Arquivos gerados', generatedFileCount)}
      ${metric('Nós do grafo', graphNodes)}
      ${metric('Arestas do grafo', graphEdges)}
    </div>
    <div class="card">
      <h3>Fases da Metodologia Reversa</h3>
      <div class="phase-grid">
        ${phases.map((p) => `<div class="phase-item"><span>${p.icon}</span><span><strong>${p.label}</strong></span>${statusBadge(p.status)}<div class="caption">Modo: ${p.executionMode ?? 'deterministic'}</div><div class="caption">Inputs: ${(p.requiredInputs ?? []).join(', ') || 'nenhum'}</div><div class="caption">Arquivos: ${(p.generatedFiles ?? []).join(', ') || 'n/a'}</div>${p.id === 'tracer' ? '<button class=\"btn\" data-command=\"importTracerInputs\">Importar Logs/Traces</button>' : ''}${p.id === 'visor' ? '<button class=\"btn\" data-command=\"importVisorScreenshots\">Importar Screenshots</button>' : ''}</div>`).join('\n        ')}
      </div>
      <h3>Arquivos Gerados</h3>
      <div class="links-grid">
        ${generatedFiles.map((f) => `<div class="link-item"><span>${f.icon}</span> <code>${f.path}</code> ${fileStatus(f.generated)}</div>`).join('\n        ')}
      </div>
      <h3>Escala de Confiança</h3>
      <div class="confidence-legend">
        <span class="badge badge-green">🟢 CONFIRMADO</span>
        <span class="badge badge-yellow">🟡 INFERIDO</span>
        <span class="badge badge-red">🔴 LACUNA</span>
      </div>
      ${reversaData?.state ? '<p class="caption">Dados reais carregados de state.json/context/*.json.</p>' : '<p class="caption">Fallback elegante ativo: execute uma análise para preencher dados do Reversa.</p>'}
    </div>
  </section>`;
}
function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
//# sourceMappingURL=overviewHtml.js.map