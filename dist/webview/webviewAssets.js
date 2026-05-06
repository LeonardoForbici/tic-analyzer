"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOverviewStyles = getOverviewStyles;
exports.getOverviewScript = getOverviewScript;
function getOverviewStyles() {
    return `
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-foreground);
      --muted: var(--vscode-descriptionForeground);
      --line: var(--vscode-panel-border);
      --accent: var(--vscode-button-background);
      --accent-fg: var(--vscode-button-foreground);
      --panel: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-foreground) 8%);
      --panel-2: color-mix(in srgb, var(--vscode-editor-background) 84%, var(--vscode-foreground) 16%);
      --danger: #f85149;
      --warn: #d29922;
      --ok: #3fb950;
      --cyan: #18d9e8;
      --pink: #d946ef;
      --amber: #f59e0b;
      --green: #22c55e;
      --blue: #38bdf8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--fg);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    button, input, select { font: inherit; }
    .page { max-width: 1280px; margin: 0 auto; padding: 24px; }
    .header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--line);
      margin-bottom: 18px;
    }
    h1 { margin: 0 0 6px; font-size: 26px; }
    h2 { margin: 0 0 12px; font-size: 16px; }
    h3 { margin: 0 0 8px; font-size: 13px; }
    p { line-height: 1.45; }
    code { color: var(--fg); }
    .muted, .caption { color: var(--muted); }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; align-content: start; }
    .btn {
      border: 1px solid var(--line);
      border-radius: 4px;
      background: transparent;
      color: var(--fg);
      padding: 7px 10px;
      cursor: pointer;
    }
    .btn:hover { background: var(--panel-2); }
    .btn.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
    .btn.compact { padding: 5px 8px; }
    .summary, .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .card, .section {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--panel);
    }
    .card { padding: 14px; }
    .value { display: block; font-size: 24px; font-weight: 650; margin-bottom: 4px; }
    .label { color: var(--muted); font-size: 12px; }
    .section { padding: 16px; margin: 16px 0; }
    .mode-tabs, .project-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .mode, .chip {
      border: 1px solid var(--line);
      border-radius: 4px;
      background: transparent;
      color: var(--fg);
      padding: 8px 10px;
      cursor: pointer;
      text-align: left;
    }
    .mode.active, .chip.active { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
    .mode-panel { display: none; }
    .mode-panel.active { display: block; }
    .two-column {
      display: grid;
      grid-template-columns: minmax(0, 1.6fr) minmax(280px, .75fr);
      gap: 12px;
    }
    .setup-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .setup-card { border-left: 3px solid var(--accent); }
    .setup-card strong { display: block; margin-bottom: 4px; }
    .graph-card { min-height: 620px; padding: 0; overflow: hidden; background: #020607; }
    .graph-toolbar {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
      background: color-mix(in srgb, var(--bg) 82%, black 18%);
    }
    .graph-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; }
    .graph-tools input, .graph-tools select {
      min-width: 130px;
      border: 1px solid var(--line);
      border-radius: 4px;
      background: var(--bg);
      color: var(--fg);
      padding: 6px 8px;
    }
    .graph-shell {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 286px;
      min-height: 560px;
    }
    .graph-wrap {
      position: relative;
      height: 560px;
      overflow: hidden;
      background:
        radial-gradient(circle at 20% 50%, rgba(249, 115, 22, .18), transparent 26%),
        radial-gradient(circle at 78% 45%, rgba(6, 182, 212, .18), transparent 34%),
        radial-gradient(circle at 50% 85%, rgba(217, 70, 239, .10), transparent 24%),
        linear-gradient(135deg, rgba(255,255,255,.025), transparent 38%),
        #020607;
    }
    .graph-wrap:before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background-image:
        linear-gradient(rgba(24,217,232,.055) 1px, transparent 1px),
        linear-gradient(90deg, rgba(24,217,232,.055) 1px, transparent 1px);
      background-size: 34px 34px;
      mask-image: radial-gradient(circle at center, black, transparent 78%);
    }
    .graph-hint {
      position: absolute;
      left: 12px;
      bottom: 12px;
      z-index: 2;
      color: color-mix(in srgb, white 70%, transparent);
      font-size: 11px;
      pointer-events: none;
    }
    svg { width: 100%; height: 100%; display: block; position: relative; z-index: 1; }
    .edge { stroke: rgba(210, 230, 245, .34); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .edge.package { stroke: rgba(24,217,232,.34); }
    .edge.dim { opacity: .08; }
    .node { cursor: pointer; }
    .node circle.core {
      stroke: rgba(255,255,255,.88);
      stroke-width: 1.3;
      filter: drop-shadow(0 0 8px currentColor);
    }
    .node text {
      fill: rgba(245,250,255,.92);
      font-size: 11px;
      pointer-events: none;
      paint-order: stroke;
      stroke: rgba(0,0,0,.92);
      stroke-width: 4px;
    }
    .node .halo { fill: transparent; stroke: currentColor; stroke-width: 1; opacity: .34; }
    .node.selected .halo { opacity: .9; stroke-width: 2; }
    .node.dim { opacity: .18; }
    .node.controller { color: var(--amber); }
    .node.service { color: var(--cyan); }
    .node.repository { color: var(--pink); }
    .node.entity { color: var(--green); }
    .node.dto { color: var(--blue); }
    .node.config, .node.security { color: #f97316; }
    .node.database { color: #34d399; }
    .node.external { color: #94a3b8; }
    .node.framework { color: #6b7280; }
    .node.unknown { color: #a3e635; }
    .node.high, .node.critical { color: var(--danger); }
    .graph-side {
      border-left: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
      background: color-mix(in srgb, var(--bg) 84%, black 16%);
      padding: 12px;
      overflow: auto;
    }
    .legend { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 12px; }
    .legend span { border: 1px solid var(--line); border-radius: 999px; padding: 3px 7px; font-size: 11px; color: var(--muted); }
    .detail, .log {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 12px;
      background: var(--panel);
    }
    ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 7px; }
    li { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--line); padding-bottom: 7px; }
    li:last-child { border-bottom: 0; padding-bottom: 0; }
    .mono { font-family: var(--vscode-editor-font-family); font-size: 12px; word-break: break-word; }
    .pill-list { display: flex; flex-wrap: wrap; gap: 7px; }
    .pill { border: 1px solid var(--line); border-radius: 999px; padding: 4px 8px; background: var(--panel-2); font-size: 12px; }
    .risk-high, .risk-critical { color: var(--danger); }
    .risk-medium { color: var(--warn); }
    .risk-low { color: var(--ok); }
    .context { white-space: pre-wrap; max-height: 300px; overflow: auto; }
    .log { min-height: 120px; max-height: 220px; overflow: auto; color: var(--muted); white-space: pre-wrap; }
    .enterprise-banner {
      padding: 8px 12px;
      background: color-mix(in srgb, var(--accent) 15%, transparent);
      border: 1px solid var(--accent);
      border-radius: 4px;
      margin-bottom: 12px;
      font-size: 13px;
    }
    .db-search-input { border-radius: 4px; }
    .db-filter {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 10px;
      background: transparent;
      color: var(--fg);
      font-size: 11px;
      cursor: pointer;
    }
    .db-filter.active { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
    .db-group { margin: 10px 0; }
    .db-list { display: grid; gap: 4px; }
    .db-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 5px 8px;
      border-bottom: 1px solid var(--line);
      font-size: 12px;
    }
    .db-item:last-child { border-bottom: 0; }
    .premium {
      background: radial-gradient(circle at top right, rgba(56, 189, 248, 0.14), transparent 30%), var(--panel);
      border-color: color-mix(in srgb, var(--line) 75%, #2563eb 25%);
    }
    .premium-metrics .card {
      background: linear-gradient(160deg, rgba(15, 23, 42, 0.86), rgba(2, 6, 23, 0.92));
      border-color: rgba(56, 189, 248, 0.25);
    }
    .phase-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .phase-item {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      display: grid;
      gap: 4px;
      background: color-mix(in srgb, var(--bg) 80%, #0b1220 20%);
    }
    .links-grid { display: grid; gap: 8px; margin-bottom: 14px; }
    .link-item {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 8px 10px;
      background: color-mix(in srgb, var(--bg) 84%, #0f172a 16%);
    }
    .badge { border-radius: 999px; padding: 2px 8px; font-size: 11px; display: inline-flex; align-items: center; }
    .badge-green { background: rgba(34,197,94,.18); color: #86efac; border: 1px solid rgba(34,197,94,.45); }
    .badge-yellow { background: rgba(245,158,11,.18); color: #fcd34d; border: 1px solid rgba(245,158,11,.45); }
    .badge-red { background: rgba(239,68,68,.18); color: #fca5a5; border: 1px solid rgba(239,68,68,.45); }
    .badge-gray { background: rgba(148,163,184,.18); color: #cbd5e1; border: 1px solid rgba(148,163,184,.4); }
    .confidence-legend { display: flex; flex-wrap: wrap; gap: 8px; }
    @media (max-width: 980px) {
      .page { padding: 16px; }
      .header, .two-column, .graph-shell { display: grid; grid-template-columns: 1fr; }
      .actions, .graph-tools { justify-content: flex-start; }
      .graph-side { border-left: 0; border-top: 1px solid var(--line); }
      .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `;
}
function getOverviewScript(nonce) {
    return `<script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = window.__TIC_CODE_DATA__;
    const graphState = {
      selectedNodeId: state.graph.nodes[0]?.id || null,
      zoom: 1,
      panX: 0,
      panY: 0,
      labels: true,
      density: 65,
      module: 'todos',
      origin: 'internal',
      stack: 'all',
      search: '',
      draggingNode: null,
      draggingCanvas: false,
      lastPointer: null
    };
    const $ = (id) => document.getElementById(id);

    function post(command, payload = {}) {
      vscode.postMessage({ command, ...payload });
      log('Comando enviado: ' + command);
    }

    function log(message) {
      const target = $('logs');
      const time = new Date().toLocaleTimeString('pt-BR');
      if (target) target.textContent = '[' + time + '] ' + message + '\\n' + target.textContent;
    }

    function setMode(mode) {
      document.querySelectorAll('.mode').forEach((el) => el.classList.toggle('active', el.dataset.mode === mode));
      document.querySelectorAll('.mode-panel').forEach((el) => el.classList.toggle('active', el.dataset.panel === mode));
      log('Modo selecionado: ' + modeLabel(mode));
    }

    function modeLabel(mode) {
      return { lite: 'Modo Lite', standard: 'IA Padrão', local: 'IA Local' }[mode] || mode;
    }

    function moduleColor(module) {
      return {
        controller: 'controller',
        service: 'service',
        repository: 'repository',
        entity: 'entity',
        dto: 'dto',
        config: 'config',
        security: 'security',
        database: 'database',
        external: 'external',
        unknown: 'unknown'
      }[module] || 'unknown';
    }

    function nodeColorClass(node) {
      if (node.origin === 'framework') return 'framework';
      if (node.origin === 'external') return 'external';
      return moduleColor(node.module);
    }

    function filteredGraph() {
      const search = graphState.search.toLowerCase();
      const maxEdges = Math.max(20, Math.round(state.graph.edges.length * graphState.density / 100));
      const module = graphState.module;
      const originMode = graphState.origin;
      const stackMode = graphState.stack;
      const nodes = state.graph.nodes.filter((node) => {
        const moduleOk = module === 'todos' || matchesProjectType(node, module) || node.module === module;
        const searchOk = !search || node.label.toLowerCase().includes(search) || node.path.toLowerCase().includes(search);
        let originOk = true;
        if (originMode === 'internal') originOk = node.origin === 'internal';
        else if (originMode === 'external') originOk = node.origin === 'external';
        else if (originMode === 'framework') originOk = node.origin === 'framework';
        else if (originMode === 'high-risk') originOk = node.origin === 'internal' && (node.riskLevel === 'high' || node.riskLevel === 'critical');
        // 'all' shows everything
        const stackOk = matchesStackFilter(node, stackMode);
        return moduleOk && searchOk && originOk && stackOk;
      });
      const ids = new Set(nodes.map((node) => node.id));
      // For end-to-end, include cross-boundary edges
      let edges;
      if (stackMode === 'end-to-end') {
        edges = state.graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)).slice(0, maxEdges * 2);
      } else {
        edges = state.graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)).slice(0, maxEdges);
      }
      return { nodes, edges, ids };
    }

    function matchesStackFilter(node, stack) {
      if (stack === 'all') return true;
      if (stack === 'backend-java') return node.language === 'Java' || node.module === 'controller' || node.module === 'service' || node.module === 'repository' || node.module === 'entity';
      if (stack === 'frontend-react') return /TypeScript|React/.test(node.language) && !/server|backend/i.test(node.path);
      if (stack === 'javascript') return /JavaScript/.test(node.language);
      if (stack === 'database') return node.module === 'database' || node.language === 'PL/SQL' || String(node.type).startsWith('plsql_');
      if (stack === 'infra') return /docker|k8s|helm|terraform|infra|workflow/i.test(node.path);
      if (stack === 'end-to-end') {
        // Show controller + service + repository + database nodes to see full flow
        return node.module === 'controller' || node.module === 'service' || node.module === 'repository' || node.module === 'database' || node.language === 'PL/SQL' || String(node.type).startsWith('plsql_');
      }
      return true;
    }

    function renderModuleOptions() {
      const select = $('moduleFilter');
      if (!select || select.dataset.ready) return;
      const modules = [...new Set(state.graph.nodes.map((node) => node.module))].sort();
      const projectTypes = [
        ['backend', 'Backend'],
        ['frontend', 'Frontend'],
        ['mobile', 'Mobile'],
        ['database', 'Database / PL/SQL']
      ];
      select.innerHTML = '<option value="todos">Todos os tipos</option>' +
        projectTypes.map(([value, label]) => '<option value="' + value + '">' + label + '</option>').join('') +
        modules.map((module) => '<option value="' + escapeHtml(module) + '">' + escapeHtml(moduleLabel(module)) + '</option>').join('');
      select.dataset.ready = 'true';
    }

    function matchesProjectType(node, type) {
      if (type === 'database') return node.module === 'database' || node.language === 'PL/SQL' || String(node.type).startsWith('plsql_');
      if (type === 'backend') return node.language === 'Java' || node.module === 'controller' || node.module === 'service' || node.module === 'repository';
      if (type === 'frontend') return /TypeScript|JavaScript|React/.test(node.language) && !/server|backend/i.test(node.path);
      if (type === 'mobile') return /android|ios|mobile|react-native|flutter|dart/i.test(node.path);
      return false;
    }

    function renderGraph() {
      renderModuleOptions();
      const svg = $('graph');
      const wrap = $('graphWrap');
      const width = Math.max(720, wrap?.clientWidth || 900);
      const height = Math.max(520, wrap?.clientHeight || 560);
      const graph = filteredGraph();
      const byId = new Map(graph.nodes.map((node) => [node.id, node]));
      const connectedToSelected = new Set();
      for (const edge of graph.edges) {
        if (edge.from === graphState.selectedNodeId) connectedToSelected.add(edge.to);
        if (edge.to === graphState.selectedNodeId) connectedToSelected.add(edge.from);
      }

      svg.innerHTML = '';
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      const root = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      root.setAttribute('transform', 'translate(' + graphState.panX + ' ' + graphState.panY + ') scale(' + graphState.zoom + ')');
      svg.appendChild(root);

      const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      root.appendChild(edgeGroup);
      for (const edge of graph.edges) {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) continue;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const dim = graphState.selectedNodeId && edge.from !== graphState.selectedNodeId && edge.to !== graphState.selectedNodeId;
        line.setAttribute('class', 'edge ' + (edge.type !== 'IMPORTS' ? 'package ' : '') + (dim ? 'dim' : ''));
        line.setAttribute('x1', from.x);
        line.setAttribute('y1', from.y);
        line.setAttribute('x2', to.x);
        line.setAttribute('y2', to.y);
        edgeGroup.appendChild(line);
      }

      const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      root.appendChild(nodeGroup);
      for (const node of graph.nodes) {
        const selected = node.id === graphState.selectedNodeId;
        const related = connectedToSelected.has(node.id);
        const dim = graphState.selectedNodeId && !selected && !related;
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('class', 'node ' + nodeColorClass(node) + ' ' + (node.riskLevel || '') + (selected ? ' selected' : '') + (dim ? ' dim' : ''));
        group.setAttribute('data-id', node.id);
        group.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');

        const size = Math.max(5, Math.min(20, 5 + Math.sqrt(node.degree + 1) * 2.5));
        const halo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        halo.setAttribute('class', 'halo');
        halo.setAttribute('r', String(size + 8));
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('class', 'core');
        circle.setAttribute('r', String(size));
        group.appendChild(halo);
        group.appendChild(circle);

        if (graphState.labels || selected) {
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', String(size + 8));
          text.setAttribute('y', '4');
          text.textContent = node.label.length > 34 ? node.label.slice(0, 31) + '...' : node.label;
          group.appendChild(text);
        }

        group.addEventListener('click', (event) => {
          event.stopPropagation();
          selectNode(node.id);
        });
        group.addEventListener('mousedown', (event) => {
          event.stopPropagation();
          graphState.draggingNode = node;
          graphState.lastPointer = { x: event.clientX, y: event.clientY };
        });
        nodeGroup.appendChild(group);
      }

      $('graphVisible').textContent = graph.nodes.length + ' nós visíveis · ' + graph.edges.length + ' arestas';
    }

    function selectNode(id) {
      graphState.selectedNodeId = id;
      const node = state.graph.nodes.find((item) => item.id === id);
      const edges = state.graph.edges.filter((edge) => edge.from === id || edge.to === id);
      $('nodeTitle').textContent = node ? node.label : 'Nenhum nó selecionado';
      $('nodeMeta').textContent = node ? node.path : '';
      $('nodeDetails').innerHTML = node ? [
        ['Módulo', moduleLabel(node.module)],
        ['Tipo', typeLabel(node.type)],
        ['Linguagem', node.language],
        ['Origem', originLabel(node.origin, node.frameworkName)],
        ['Risco', riskLabel(node.riskLevel || 'normal')],
        ['Conexões', String(node.degree)],
        ['Arestas exibidas', String(edges.length)]
      ].map(([k, v]) => '<li><strong>' + escapeHtml(k) + '</strong><span class="mono">' + escapeHtml(v) + '</span></li>').join('') : '';
      // Show external deps for the selected internal node
      const extDepsEl = $('nodeExternalDeps');
      if (extDepsEl) {
        if (node && node.origin === 'internal') {
          const extTargetIds = edges.filter((e) => e.from === id).map((e) => e.to);
          const extNodes = extTargetIds.map((eid) => state.graph.nodes.find((n) => n.id === eid)).filter((n) => n && n.origin !== 'internal');
          extDepsEl.innerHTML = extNodes.length
            ? extNodes.map((n) => '<li class="caption"><span class="mono">' + escapeHtml(n.label) + '</span>' + (n.frameworkName ? ' <em>(' + escapeHtml(n.frameworkName) + ')</em>' : '') + '</li>').join('')
            : '<li class="caption muted">Nenhuma dependência externa direta</li>';
        } else {
          extDepsEl.innerHTML = '';
        }
      }
      $('nodeEdges').innerHTML = edges.slice(0, 16).map((edge) => '<li><span class="mono">' + escapeHtml(edge.type) + '</span><span class="mono">' + escapeHtml(edge.from === id ? edge.to : edge.from) + '</span></li>').join('') || '<li><span>Sem arestas no grafo</span></li>';
      renderGraph();
    }

    function moduleLabel(value) {
      return {
        controller: 'Controller',
        service: 'Service',
        repository: 'Repository',
        entity: 'Entity',
        dto: 'DTO',
        config: 'Configuração',
        security: 'Segurança',
        database: 'Database / PL/SQL',
        external: 'Dependência externa',
        unknown: 'Não classificado'
      }[value] || value;
    }

    function typeLabel(value) {
      return {
        package_manifest: 'Manifest de pacote',
        java_source: 'Fonte Java',
        script_source: 'Fonte TypeScript/JavaScript',
        database_script: 'Script de banco',
        config: 'Configuração',
        documentation: 'Documentação',
        external_dependency: 'Dependência externa',
        plsql_script: 'Script PL/SQL',
        plsql_package: 'Package PL/SQL',
        plsql_package_body: 'Package body PL/SQL',
        plsql_procedure: 'Procedure PL/SQL',
        plsql_function: 'Function PL/SQL',
        plsql_trigger: 'Trigger PL/SQL',
        plsql_table: 'Tabela PL/SQL',
        plsql_view: 'View PL/SQL',
        plsql_cursor: 'Cursor PL/SQL',
        file: 'Arquivo'
      }[value] || value;
    }

    function riskLabel(value) {
      return { critical: 'crítico', high: 'alto', medium: 'médio', low: 'baixo', normal: 'normal' }[value] || value;
    }

    function originLabel(origin, frameworkName) {
      if (origin === 'framework') return 'Framework' + (frameworkName ? ' (' + frameworkName + ')' : '');
      if (origin === 'external') return 'Externo';
      return 'Interno';
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
    }

    function fitGraph() {
      const graph = filteredGraph();
      if (!graph.nodes.length) return;
      const wrap = $('graphWrap');
      const width = Math.max(720, wrap.clientWidth || 900);
      const height = Math.max(520, wrap.clientHeight || 560);
      const xs = graph.nodes.map((node) => node.x);
      const ys = graph.nodes.map((node) => node.y);
      const minX = Math.min(...xs) - 80;
      const maxX = Math.max(...xs) + 180;
      const minY = Math.min(...ys) - 80;
      const maxY = Math.max(...ys) + 80;
      const scale = Math.min(1.6, Math.max(0.45, Math.min(width / (maxX - minX), height / (maxY - minY))));
      graphState.zoom = scale;
      graphState.panX = (width - (minX + maxX) * scale) / 2;
      graphState.panY = (height - (minY + maxY) * scale) / 2;
      renderGraph();
    }

    function applyLayout(kind) {
      const nodes = state.graph.nodes;
      if (!nodes.length) return;
      if (kind === 'radial') {
        const centerX = 470;
        const centerY = 280;
        nodes.forEach((node, index) => {
          const angle = index * 2.399963229728653;
          const radius = 32 + Math.sqrt(index) * 28;
          node.x = Math.round(centerX + Math.cos(angle) * radius);
          node.y = Math.round(centerY + Math.sin(angle) * radius);
        });
      } else if (kind === 'camadas') {
        const groups = {};
        nodes.forEach((node) => {
          const key = node.module || 'unknown';
          groups[key] = groups[key] || [];
          groups[key].push(node);
        });
        Object.values(groups).forEach((group, groupIndex) => {
          group.forEach((node, index) => {
            node.x = 90 + groupIndex * 150 + (index % 5) * 24;
            node.y = 70 + Math.floor(index / 5) * 30;
          });
        });
      } else {
        const groups = {};
        nodes.forEach((node) => {
          const key = node.module || 'unknown';
          groups[key] = groups[key] || [];
          groups[key].push(node);
        });
        const keys = Object.keys(groups);
        const columns = Math.max(2, Math.ceil(Math.sqrt(keys.length)));
        keys.forEach((key, groupIndex) => {
          const centerX = 170 + (groupIndex % columns) * 220;
          const centerY = 120 + Math.floor(groupIndex / columns) * 170;
          groups[key].forEach((node, index) => {
            const angle = index * 2.399963229728653;
            const radius = 18 + Math.sqrt(index) * 18;
            node.x = Math.round(centerX + Math.cos(angle) * radius);
            node.y = Math.round(centerY + Math.sin(angle) * radius);
          });
        });
      }
      fitGraph();
    }

    document.querySelectorAll('.mode').forEach((el) => el.addEventListener('click', () => setMode(el.dataset.mode)));
    document.querySelectorAll('[data-command]').forEach((el) => el.addEventListener('click', () => post(el.dataset.command)));
    $('zoomIn').addEventListener('click', () => { graphState.zoom = Math.min(2.8, graphState.zoom + 0.18); renderGraph(); });
    $('zoomOut').addEventListener('click', () => { graphState.zoom = Math.max(0.25, graphState.zoom - 0.18); renderGraph(); });
    $('fitGraph').addEventListener('click', fitGraph);
    $('toggleLabels').addEventListener('click', () => { graphState.labels = !graphState.labels; renderGraph(); });
    $('moduleFilter').addEventListener('change', (event) => { graphState.module = event.target.value; renderGraph(); });
    const originFilterEl = $('originFilter');
    if (originFilterEl) {
      originFilterEl.addEventListener('change', (event) => {
        graphState.origin = event.target.value;
        const info = $('graphOriginInfo');
        if (info) {
          if (graphState.origin === 'internal') {
            info.style.display = '';
          } else {
            info.style.display = 'none';
          }
        }
        renderGraph();
      });
    }
    const stackFilterEl = $('stackFilter');
    if (stackFilterEl) {
      stackFilterEl.addEventListener('change', (event) => { graphState.stack = event.target.value; renderGraph(); });
    }
    $('graphSearch').addEventListener('input', (event) => { graphState.search = event.target.value; renderGraph(); });
    $('density').addEventListener('input', (event) => { graphState.density = Number(event.target.value); renderGraph(); });
    $('layoutSelect').addEventListener('change', (event) => applyLayout(event.target.value));
    $('graph').addEventListener('click', () => { graphState.selectedNodeId = null; renderGraph(); });
    $('graph').addEventListener('wheel', (event) => {
      event.preventDefault();
      graphState.zoom = Math.max(0.25, Math.min(2.8, graphState.zoom + (event.deltaY > 0 ? -0.08 : 0.08)));
      renderGraph();
    });
    $('graph').addEventListener('mousedown', (event) => {
      graphState.draggingCanvas = true;
      graphState.lastPointer = { x: event.clientX, y: event.clientY };
    });
    window.addEventListener('mouseup', () => {
      graphState.draggingNode = null;
      graphState.draggingCanvas = false;
    });
    window.addEventListener('mousemove', (event) => {
      if (!graphState.lastPointer) return;
      const dx = event.clientX - graphState.lastPointer.x;
      const dy = event.clientY - graphState.lastPointer.y;
      if (graphState.draggingNode) {
        graphState.draggingNode.x += dx / graphState.zoom;
        graphState.draggingNode.y += dy / graphState.zoom;
        graphState.lastPointer = { x: event.clientX, y: event.clientY };
        renderGraph();
        return;
      }
      if (graphState.draggingCanvas) {
        graphState.panX += dx;
        graphState.panY += dy;
        graphState.lastPointer = { x: event.clientX, y: event.clientY };
        renderGraph();
      }
    });

    $('graphTotal').textContent = state.graph.stats.totalNodes + ' nós totais · ' + state.graph.stats.totalEdges + ' arestas totais';
    applyLayout('agrupado');
    selectNode(graphState.selectedNodeId);

    // Database search functionality
    (function initDbSearch() {
      const dbSearchInput = $('dbSearch');
      const dbResults = $('dbSearchResults');
      if (!dbSearchInput || !dbResults) return;
      const allItems = dbResults.querySelectorAll('.db-item');
      const filterBtns = document.querySelectorAll('.db-filter');

      let activeFilter = 'all';

      filterBtns.forEach((btn) => btn.addEventListener('click', () => {
        filterBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.filter;
        applyDbFilter();
      }));

      dbSearchInput.addEventListener('input', () => applyDbFilter());

      function applyDbFilter() {
        const query = dbSearchInput.value.toLowerCase();
        allItems.forEach((item) => {
          const name = item.dataset.name || '';
          const type = item.dataset.type || '';
          const risk = item.dataset.risk || '';
          const matchesSearch = !query || name.includes(query);
          let matchesFilter = true;
          if (activeFilter === 'critical') matchesFilter = type === 'table' && (risk === 'critical' || risk === 'high');
          else if (activeFilter === 'package') matchesFilter = type === 'package';
          else if (activeFilter === 'procedure') matchesFilter = type === 'procedure';
          else if (activeFilter === 'trigger') matchesFilter = type === 'trigger';
          else if (activeFilter === 'high-risk') matchesFilter = risk === 'critical' || risk === 'high';
          item.style.display = matchesSearch && matchesFilter ? '' : 'none';
        });
      }
    })();

    log('Painel TIC Coder Lite carregado');
  </script>`;
}
//# sourceMappingURL=webviewAssets.js.map