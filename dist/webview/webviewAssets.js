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
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background:
        linear-gradient(135deg, color-mix(in srgb, var(--panel) 88%, #0ea5e9 12%), var(--panel));
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
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 32px;
      transition: border-color .16s ease, background .16s ease, transform .16s ease;
    }
    .btn:hover { background: var(--panel-2); border-color: color-mix(in srgb, var(--line) 45%, var(--accent) 55%); transform: translateY(-1px); }
    .btn.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent); }
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
    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: 14px;
      margin-bottom: 14px;
    }
    .kicker {
      color: var(--cyan);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .visual-intel {
      border-color: color-mix(in srgb, var(--line) 62%, var(--cyan) 38%);
      background:
        linear-gradient(145deg, color-mix(in srgb, var(--panel) 88%, #04131a 12%), color-mix(in srgb, var(--panel) 88%, #101010 12%));
    }
    .visual-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(320px, .85fr);
      gap: 14px;
      align-items: start;
    }
    .visual-form {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: color-mix(in srgb, var(--bg) 78%, var(--fg) 6%);
      padding: 14px;
    }
    .field-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .field {
      display: grid;
      gap: 5px;
      margin-bottom: 10px;
      min-width: 0;
    }
    .field span {
      color: var(--muted);
      font-size: 11px;
      font-weight: 650;
    }
    .control {
      width: 100%;
      min-height: 34px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--bg);
      color: var(--fg);
      padding: 7px 9px;
      outline: none;
    }
    .control:focus {
      border-color: color-mix(in srgb, var(--accent) 72%, var(--line) 28%);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
    }
    .textarea { min-height: 92px; resize: vertical; }
    .visual-actions { justify-content: flex-start; margin-top: 8px; }
    .impact-panel {
      min-height: 100%;
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--bg) 82%, #0b1220 18%), var(--panel));
    }
    .impact-empty {
      display: grid;
      gap: 10px;
      min-height: 190px;
      align-content: center;
    }
    .impact-scoreboard {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
    .score-tile {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 9px;
      background: color-mix(in srgb, var(--bg) 78%, var(--fg) 8%);
      min-width: 0;
    }
    .score-tile span {
      display: block;
      font-size: 22px;
      font-weight: 760;
      line-height: 1;
    }
    .score-tile small {
      color: var(--muted);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .score-tile.strong {
      border-color: color-mix(in srgb, var(--accent) 64%, var(--line) 36%);
      background: color-mix(in srgb, var(--accent) 18%, var(--bg) 82%);
    }
    .impact-list { margin-top: 10px; }
    .trace-rail {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 6px;
      margin-top: 12px;
    }
    .trace-rail span {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 5px 7px;
      color: var(--muted);
      font-size: 11px;
      text-align: center;
      background: color-mix(in srgb, var(--panel-2) 70%, transparent);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
    .cockpit-header {
      background: linear-gradient(135deg, color-mix(in srgb, var(--panel) 85%, #0ea5e9 15%), var(--panel));
    }
    .cockpit-header .subtitle {
      color: var(--muted);
      font-size: 13px;
      margin: 2px 0 6px;
    }
    .cockpit-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 10px;
      margin-bottom: 18px;
    }
    .cockpit-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      background: var(--panel);
      display: grid;
      gap: 4px;
    }
    .cockpit-value {
      font-size: 22px;
      font-weight: 700;
      line-height: 1.2;
    }
    .cockpit-label {
      font-size: 12px;
      color: var(--muted);
    }
    .cockpit-source {
      font-size: 10px;
      color: var(--muted);
      opacity: 0.7;
    }
    .cockpit-green { border-left: 3px solid var(--green); }
    .cockpit-blue { border-left: 3px solid var(--blue); }
    .cockpit-yellow { border-left: 3px solid var(--amber); }
    .cockpit-red { border-left: 3px solid var(--danger); }
    .cockpit-gray { border-left: 3px solid #64748b; }
    .empty-state {
      padding: 20px;
      text-align: center;
      color: var(--muted);
      border: 1px dashed var(--line);
      border-radius: 8px;
    }
    .wi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 12px;
    }
    .wi-project-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      background: var(--panel);
      display: grid;
      gap: 4px;
    }
    .wi-project-kind {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .wi-project-name { font-weight: 600; font-size: 14px; }
    .wi-project-stats {
      display: flex;
      gap: 12px;
      font-size: 12px;
      margin-top: 4px;
    }
    .mpg-layers {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0;
      margin: 12px 0 16px;
    }
    .mpg-layer {
      width: 100%;
      text-align: center;
      padding: 8px 0;
    }
    .mpg-layer-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 8px;
    }
    .mpg-layer-cards {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: center;
    }
    .mpg-card {
      border: 2px solid;
      border-radius: 8px;
      padding: 10px 14px;
      min-width: 140px;
      max-width: 220px;
      background: var(--panel);
      text-align: left;
    }
    .mpg-arrow {
      font-size: 20px;
      color: var(--muted);
      padding: 4px 0;
    }
    .mpg-connectors {
      padding: 10px 14px;
      background: var(--panel-2);
      border-radius: 6px;
      margin-bottom: 12px;
    }
    .mpg-link-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      padding: 3px 0;
    }
    .mpg-link-arrow { color: var(--muted); }
    .flow-list { display: grid; gap: 8px; }
    .flow-chain {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      padding: 10px 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      font-size: 12px;
    }
    .flow-chain.flow-gap { border-color: rgba(239,68,68,.35); }
    .flow-step {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .flow-icon { font-size: 14px; }
    .flow-arrow { color: var(--muted); font-size: 14px; }
    .flow-conf { margin-left: auto; display: flex; align-items: center; gap: 4px; }
    .flow-missing { color: #fca5a5; }
    .data-table {
      width: 100%;
      font-size: 12px;
      border-collapse: collapse;
    }
    .data-table th {
      text-align: left;
      padding: 4px 8px;
      border-bottom: 1px solid var(--line);
    }
    .data-table td {
      padding: 3px 8px;
    }
    .data-table tr + tr { border-top: 1px solid var(--line); }
    .advanced-graph-details {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 16px;
      margin: 16px 0;
      background: var(--panel);
    }
    .advanced-graph-summary {
      cursor: pointer;
      user-select: none;
      padding: 4px 0;
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
    .badge-blue { background: rgba(56,189,248,.18); color: #7dd3fc; border: 1px solid rgba(56,189,248,.45); }
    .badge-yellow { background: rgba(245,158,11,.18); color: #fcd34d; border: 1px solid rgba(245,158,11,.45); }
    .badge-red { background: rgba(239,68,68,.18); color: #fca5a5; border: 1px solid rgba(239,68,68,.45); }
    .badge-gray { background: rgba(148,163,184,.18); color: #cbd5e1; border: 1px solid rgba(148,163,184,.4); }
    .confidence-legend { display: flex; flex-wrap: wrap; gap: 8px; }
    @media (max-width: 980px) {
      .page { padding: 16px; }
      .header, .section-head, .two-column, .graph-shell, .visual-grid { display: grid; grid-template-columns: 1fr; }
      .field-grid { grid-template-columns: 1fr; }
      .actions, .graph-tools { justify-content: flex-start; }
      .graph-side { border-left: 0; border-top: 1px solid var(--line); }
      .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .impact-scoreboard { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .trace-rail { grid-template-columns: 1fr; }
      .cockpit-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .wi-grid { grid-template-columns: 1fr; }
      .flow-chain { flex-direction: column; align-items: flex-start; }
      .flow-conf { margin-left: 0; }
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

      // Module group backgrounds
      const moduleColors2 = { controller:'#f59e0b', service:'#06b6d4', repository:'#ec4899', entity:'#10b981',
        dto:'#3b82f6', component:'#8b5cf6', page:'#6366f1', router:'#6366f1', guard:'#f43f5e',
        config:'#64748b', security:'#f43f5e', model:'#10b981', database:'#fcd34d', api:'#38bdf8', util:'#94a3b8' };
      const moduleNodes = new Map();
      for (const node of graph.nodes) {
        if (!node.module || node.module === 'unknown' || node.origin !== 'internal') continue;
        if (!moduleNodes.has(node.module)) moduleNodes.set(node.module, []);
        moduleNodes.get(node.module).push(node);
      }
      const moduleBgGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      for (const [mod, nodes] of moduleNodes) {
        if (nodes.length < 2) continue;
        const pad = 28;
        const minX = Math.min(...nodes.map((n) => n.x)) - pad;
        const minY = Math.min(...nodes.map((n) => n.y)) - pad;
        const maxX = Math.max(...nodes.map((n) => n.x)) + pad;
        const maxY = Math.max(...nodes.map((n) => n.y)) + pad;
        const color = moduleColors2[mod] || '#94a3b8';
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(minX)); rect.setAttribute('y', String(minY));
        rect.setAttribute('width', String(maxX - minX)); rect.setAttribute('height', String(maxY - minY));
        rect.setAttribute('rx', '12'); rect.setAttribute('fill', color); rect.setAttribute('fill-opacity', '0.06');
        rect.setAttribute('stroke', color); rect.setAttribute('stroke-opacity', '0.2'); rect.setAttribute('stroke-width', '1');
        moduleBgGroup.appendChild(rect);
        const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lbl.setAttribute('x', String(minX + 8)); lbl.setAttribute('y', String(minY + 14));
        lbl.setAttribute('font-size', '9'); lbl.setAttribute('fill', color); lbl.setAttribute('font-weight', 'bold'); lbl.setAttribute('opacity', '0.7');
        lbl.textContent = mod.toUpperCase(); moduleBgGroup.appendChild(lbl);
      }
      root.appendChild(moduleBgGroup);

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
      $('nodeEdges').innerHTML = edges.slice(0, 16).map((edge) => {
        const peer = escapeHtml(edge.from === id ? edge.to : edge.from);
        const ev = edge.evidence ? '<div style="font-size:9px;color:var(--muted);margin-top:1px;word-break:break-all">' + escapeHtml(edge.evidence) + '</div>' : '';
        return '<li><span class="mono">' + escapeHtml(edge.type) + '</span><span class="mono">' + peer + '</span>' + ev + '</li>';
      }).join('') || '<li><span>Sem arestas no grafo</span></li>';
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
    document.querySelectorAll('[data-command]').forEach((el) => el.addEventListener('click', () => {
      const command = el.dataset.command;
      if (command === 'analyzeImpactByImage') {
        const payload = {
          url: $('impactUrl')?.value || '',
          changeDescription: $('impactChangeDescription')?.value || '',
          screenName: $('impactScreenName')?.value || '',
          visibleTerms: (($('impactVisibleTerms')?.value || '').split(',').map((x) => x.trim()).filter(Boolean)),
          mainAction: $('impactMainAction')?.value || '',
          targetElement: $('impactTargetElement')?.value || '',
          targetField: $('impactTargetField')?.value || '',
          targetRule: $('impactTargetRule')?.value || ''
        };
        post(command, { payload });
        return;
      }
      post(command);
    }));
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

    // Defer graph rendering until the advanced section is opened
    let graphInitialized = false;
    const graphDetails = document.querySelector('.advanced-graph-details');
    if (graphDetails) {
      graphDetails.addEventListener('toggle', () => {
        if (graphDetails.open && !graphInitialized) {
          graphInitialized = true;
          applyLayout('agrupado');
          selectNode(graphState.selectedNodeId);
        }
      });
    }

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

    // Multi-project tab switching
    document.querySelectorAll('.mpg-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.mpg-tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.mpg-tab').forEach((panel) => {
          panel.style.display = panel.id === ('mpg-tab-' + tab) ? '' : 'none';
        });
      });
    });

    renderMultiProjectGraph();

    function renderMultiProjectGraph() {
      const svg = document.getElementById('mpgVisSvg');
      if (!svg) return;
      const pgData = state.projectGraph;
      const pg = pgData && pgData.projectGraph;
      const cl = pgData && pgData.crossProjectLinks;
      if (!pg || !pg.projects || !pg.projects.length) {
        svg.innerHTML = '<text x="20" y="30" font-size="13" fill="var(--muted)">Rode Analisar Workspace para gerar o grafo multi-projeto.</text>';
        return;
      }

      const projects = pg.projects;
      const allNodes = pg.nodes || [];
      const allEdges = pg.edges || [];
      const crossLinks = (cl && cl.links) ? cl.links : [];

      // Layout constants
      const W = 900, PADDING = 12, LAYER_LABEL_W = 72;
      const NODE_W = 132, NODE_H = 48, NODE_GAP_X = 8, NODE_GAP_Y = 6, NODES_PER_ROW = 4;
      const BOX_PAD = 10, BOX_HEADER_H = 34, LAYER_GAP = 52, LEGEND_H = 26;

      const colorByKind = { frontend: '#38bdf8', mobile: '#c4b5fd', backend: '#86efac', shared: '#fdba74', database: '#fcd34d', infra: '#94a3b8' };
      const layerKeys = ['frontend', 'mobile', 'backend', 'shared', 'database', 'infra'];
      const layerLabels = { frontend: 'Frontend', mobile: 'Mobile', backend: 'Backend / API', shared: 'Shared', database: 'SQL / DB', infra: 'Infra' };
      const KEY_MODULES = new Set(['controller', 'service', 'repository', 'entity', 'component', 'page', 'router', 'guard', 'dto', 'config', 'database', 'security', 'model', 'hook', 'api', 'util']);

      // --- Assign nodes to projects (top architectural nodes, max 12) ---
      const projectNodeMap = new Map();
      for (const p of projects) projectNodeMap.set(p.id, []);
      for (const node of allNodes) {
        if (!node.projectId || node.origin !== 'internal') continue;
        const bucket = projectNodeMap.get(node.projectId);
        if (bucket) bucket.push(node);
      }
      for (const [pid, nodes] of projectNodeMap) {
        projectNodeMap.set(pid, nodes.sort((a, b) => {
          const ak = KEY_MODULES.has(a.module) ? 0 : 1, bk = KEY_MODULES.has(b.module) ? 0 : 1;
          return ak !== bk ? ak - bk : (b.degree || 0) - (a.degree || 0);
        }).slice(0, 12));
      }

      // --- Box dimensions ---
      const layerGroups = {};
      for (const lk of layerKeys) layerGroups[lk] = projects.filter((p) => p.kind === lk);

      const boxDim = (pid) => {
        const nodes = projectNodeMap.get(pid) || [];
        const rows = Math.max(1, Math.ceil(nodes.length / NODES_PER_ROW));
        const cols = Math.min(nodes.length || 1, NODES_PER_ROW);
        return { w: Math.max(BOX_PAD * 2 + cols * NODE_W + (cols - 1) * NODE_GAP_X, 160), h: BOX_HEADER_H + BOX_PAD + rows * (NODE_H + NODE_GAP_Y) };
      };

      const layerH = (lk) => {
        const g = layerGroups[lk];
        return g.length ? Math.max(...g.map((p) => boxDim(p.id).h)) + 24 : 0;
      };

      // --- Vertical layout per layer ---
      const layerY = {};
      let curY = LEGEND_H + 10;
      for (const lk of layerKeys) {
        if (!layerGroups[lk].length) continue;
        layerY[lk] = curY;
        curY += layerH(lk) + LAYER_GAP;
      }
      const totalH = Math.max(curY, 200);

      // --- Horizontal layout per project inside layer ---
      const projectPos = new Map();
      for (const lk of layerKeys) {
        const group = layerGroups[lk];
        if (!group.length) continue;
        const usableW = W - LAYER_LABEL_W - PADDING;
        const totalBoxW = group.reduce((s, p) => s + boxDim(p.id).w, 0);
        const gap = Math.max((usableW - totalBoxW) / (group.length + 1), 8);
        let cx = LAYER_LABEL_W + PADDING + gap;
        for (const p of group) {
          const d = boxDim(p.id);
          projectPos.set(p.id, { x: cx, y: layerY[lk] + 8, w: d.w, h: d.h, color: colorByKind[lk] || '#94a3b8' });
          cx += d.w + gap;
        }
      }

      // --- Node positions inside each box ---
      const nodePos = new Map();
      for (const p of projects) {
        const pos = projectPos.get(p.id);
        if (!pos) continue;
        (projectNodeMap.get(p.id) || []).forEach((node, i) => {
          const col = i % NODES_PER_ROW, row = Math.floor(i / NODES_PER_ROW);
          const nx = pos.x + BOX_PAD + col * (NODE_W + NODE_GAP_X);
          const ny = pos.y + BOX_HEADER_H + BOX_PAD + row * (NODE_H + NODE_GAP_Y);
          nodePos.set(node.id, { x: nx, y: ny, cx: nx + NODE_W / 2, cy: ny + NODE_H / 2,
            top: { x: nx + NODE_W / 2, y: ny }, bottom: { x: nx + NODE_W / 2, y: ny + NODE_H },
            left: { x: nx, y: ny + NODE_H / 2 }, right: { x: nx + NODE_W, y: ny + NODE_H / 2 } });
        });
      }
      const visibleIds = new Set(nodePos.keys());

      // --- Render ---
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + totalH);
      svg.setAttribute('height', String(totalH));
      svg.innerHTML = '';

      // Defs: arrowheads per type
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      for (const [id, color] of [['arr-http','#38bdf8'],['arr-call','#86efac'],['arr-db','#fcd34d'],['arr-imp','#a78bfa'],['arr-gap','#f87171']]) {
        const mk = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        mk.setAttribute('id', id); mk.setAttribute('markerWidth', '8'); mk.setAttribute('markerHeight', '6');
        mk.setAttribute('refX', '7'); mk.setAttribute('refY', '3'); mk.setAttribute('orient', 'auto');
        const mp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        mp.setAttribute('d', 'M0,0 L0,6 L8,3 z'); mp.setAttribute('fill', color);
        mk.appendChild(mp); defs.appendChild(mk);
      }
      svg.appendChild(defs);

      // Legend
      const legendData = [['HTTP/REST','#38bdf8',''],['Function Call','#86efac','5,3'],['Database','#fcd34d','3,3'],['Import/Use','#a78bfa','8,3,2,3']];
      let lx = LAYER_LABEL_W + PADDING;
      for (const [label, color, dash] of legendData) {
        const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        ln.setAttribute('x1', String(lx)); ln.setAttribute('y1', '13'); ln.setAttribute('x2', String(lx + 22)); ln.setAttribute('y2', '13');
        ln.setAttribute('stroke', color); ln.setAttribute('stroke-width', '2'); if (dash) ln.setAttribute('stroke-dasharray', dash);
        svg.appendChild(ln);
        const ap = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        ap.setAttribute('d', 'M' + (lx+18) + ',10 L' + (lx+22) + ',13 L' + (lx+18) + ',16 z'); ap.setAttribute('fill', color);
        svg.appendChild(ap);
        const lt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lt.setAttribute('x', String(lx + 26)); lt.setAttribute('y', '17'); lt.setAttribute('font-size', '9'); lt.setAttribute('fill', 'var(--fg)');
        lt.textContent = label; svg.appendChild(lt);
        lx += 30 + label.length * 5.5 + 10;
      }

      // Layer backgrounds + labels
      for (const lk of layerKeys) {
        if (!layerGroups[lk].length || layerY[lk] === undefined) continue;
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', '0'); bg.setAttribute('y', String(layerY[lk]));
        bg.setAttribute('width', String(W)); bg.setAttribute('height', String(layerH(lk)));
        bg.setAttribute('fill', colorByKind[lk] || '#94a3b8'); bg.setAttribute('fill-opacity', '0.04');
        svg.appendChild(bg);
        const ll = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        ll.setAttribute('x', '4'); ll.setAttribute('y', String(layerY[lk] + 16)); ll.setAttribute('font-size', '8');
        ll.setAttribute('fill', colorByKind[lk] || '#94a3b8'); ll.setAttribute('font-weight', 'bold');
        ll.textContent = (layerLabels[lk] || lk).toUpperCase(); svg.appendChild(ll);
      }

      // Helper: draw a bezier edge
      const drawEdge = (x1, y1, x2, y2, stroke, dash, markerId, onClick, label) => {
        const midY = (y1 + y2) / 2;
        const pe = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pe.setAttribute('d', 'M' + x1 + ',' + y1 + ' C' + x1 + ',' + midY + ' ' + x2 + ',' + midY + ' ' + x2 + ',' + y2);
        pe.setAttribute('fill', 'none'); pe.setAttribute('stroke', stroke); pe.setAttribute('stroke-width', '1.5');
        pe.setAttribute('stroke-opacity', '0.7'); pe.setAttribute('marker-end', 'url(#' + markerId + ')');
        if (dash) pe.setAttribute('stroke-dasharray', dash);
        if (onClick) { pe.setAttribute('cursor', 'pointer'); pe.addEventListener('click', onClick);
          pe.addEventListener('mouseenter', () => { pe.setAttribute('stroke-opacity', '1'); pe.setAttribute('stroke-width', '2.5'); });
          pe.addEventListener('mouseleave', () => { pe.setAttribute('stroke-opacity', '0.7'); pe.setAttribute('stroke-width', '1.5'); }); }
        svg.appendChild(pe);
        if (label) {
          const lt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          lt.setAttribute('x', String((x1 + x2) / 2 + 4)); lt.setAttribute('y', String(midY - 3));
          lt.setAttribute('text-anchor', 'middle'); lt.setAttribute('font-size', '8');
          lt.setAttribute('fill', stroke); lt.setAttribute('pointer-events', 'none');
          lt.textContent = label.length > 26 ? label.slice(0, 23) + '…' : label; svg.appendChild(lt);
        }
      };

      const detail = document.getElementById('mpgDetail');

      // Within-project edges
      const drawnE = new Set();
      for (const edge of allEdges) {
        if (edge.crossProject || !visibleIds.has(edge.from) || !visibleIds.has(edge.to)) continue;
        const ek = edge.from + '→' + edge.to; if (drawnE.has(ek)) continue; drawnE.add(ek);
        const fp = nodePos.get(edge.from), tp = nodePos.get(edge.to); if (!fp || !tp) continue;
        let stroke = '#a78bfa', dash = '8,3,2,3', mid = 'arr-imp';
        if (edge.type === 'CALLS') { stroke = '#86efac'; dash = '5,3'; mid = 'arr-call'; }
        else if (edge.type === 'READS_TABLE' || edge.type === 'WRITES_TABLE') { stroke = '#fcd34d'; dash = '3,3'; mid = 'arr-db'; }
        drawEdge(fp.bottom.x, fp.bottom.y, tp.top.x, tp.top.y, stroke, dash, mid, null, '');
      }

      // Cross-project edges (individual file→file when possible, else box→box)
      const drawnC = new Set();
      for (const link of crossLinks) {
        const ck = (link.fromFile || link.fromProjectId) + '→' + (link.toFile || link.endpoint || link.toProjectId);
        if (drawnC.has(ck)) continue; drawnC.add(ck);
        const fromNid = [...visibleIds].find((id) => id === link.fromFile || id.endsWith('/' + link.fromFile?.split('/').pop()));
        const toNid = link.toFile ? [...visibleIds].find((id) => id === link.toFile || id.endsWith('/' + link.toFile?.split('/').pop())) : null;
        let x1, y1, x2, y2;
        if (fromNid && toNid) {
          const fp = nodePos.get(fromNid), tp = nodePos.get(toNid);
          x1 = fp.bottom.x; y1 = fp.bottom.y; x2 = tp.top.x; y2 = tp.top.y;
        } else {
          const fb = projectPos.get(link.fromProjectId), tb = projectPos.get(link.toProjectId);
          if (!fb || !tb) continue;
          x1 = fb.x + fb.w / 2; y1 = fb.y + fb.h; x2 = tb.x + tb.w / 2; y2 = tb.y;
        }
        let stroke = '#38bdf8', dash = '', mid = 'arr-http';
        if (link.type === 'BACKEND_USES_DATABASE') { stroke = '#fcd34d'; dash = '3,3'; mid = 'arr-db'; }
        if (link.confidence === 'GAP') { stroke = '#f87171'; mid = 'arr-gap'; }
        const routeLabel = ((link.method || '') + ' ' + (link.endpoint || '')).trim();
        const onClick = () => {
          if (!detail) return;
          const cb = link.confidence === 'CONFIRMED' ? '🟢' : link.confidence === 'INFERRED' ? '🟡' : '🔴';
          detail.innerHTML = '<strong>Ponte Cross-Project</strong><hr style="border-color:var(--border);margin:4px 0">'
            + '<div><b>De:</b> <span class="mono" style="font-size:10px">' + escapeHtml(mpgBaseName(link.fromFile || link.fromProjectId)) + '</span></div>'
            + '<div><b>Para:</b> <span class="mono" style="font-size:10px">' + escapeHtml(mpgBaseName(link.toFile || link.endpoint || '')) + '</span></div>'
            + '<div><b>Endpoint:</b> <code style="font-size:10px">' + escapeHtml((link.method || 'GET') + ' ' + (link.endpoint || '')) + '</code></div>'
            + '<div><b>Confiança:</b> ' + cb + ' ' + escapeHtml(link.confidence || '') + '</div>'
            + (link.evidence && link.evidence.length ? '<div style="margin-top:6px"><b>Evidência:</b><br><code style="font-size:9px;word-break:break-all;opacity:0.8">' + escapeHtml(link.evidence[0]) + '</code></div>' : '');
          detail.style.display = 'block';
        };
        drawEdge(x1, y1, x2, y2, stroke, dash, mid, onClick, routeLabel);
      }

      // Project boxes
      for (const p of projects) {
        const pos = projectPos.get(p.id); if (!pos) continue;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(pos.x)); rect.setAttribute('y', String(pos.y));
        rect.setAttribute('width', String(pos.w)); rect.setAttribute('height', String(pos.h));
        rect.setAttribute('rx', '8'); rect.setAttribute('fill', 'var(--panel-2)');
        rect.setAttribute('stroke', pos.color); rect.setAttribute('stroke-width', '1.5'); svg.appendChild(rect);
        const kt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        kt.setAttribute('x', String(pos.x + 8)); kt.setAttribute('y', String(pos.y + 13));
        kt.setAttribute('font-size', '8'); kt.setAttribute('fill', pos.color); kt.setAttribute('font-weight', 'bold');
        kt.textContent = (p.kind || '').toUpperCase(); svg.appendChild(kt);
        const nt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        nt.setAttribute('x', String(pos.x + pos.w / 2)); nt.setAttribute('y', String(pos.y + 26));
        nt.setAttribute('text-anchor', 'middle'); nt.setAttribute('font-size', '12'); nt.setAttribute('font-weight', '600'); nt.setAttribute('fill', 'var(--fg)');
        const pn = (p.name || p.id || ''); nt.textContent = pn.length > 26 ? pn.slice(0, 23) + '…' : pn; svg.appendChild(nt);
        const st = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        st.setAttribute('x', String(pos.x + pos.w - 6)); st.setAttribute('y', String(pos.y + 13));
        st.setAttribute('text-anchor', 'end'); st.setAttribute('font-size', '8'); st.setAttribute('fill', 'var(--muted)');
        st.textContent = (p.files || 0) + ' arq'; svg.appendChild(st);
      }

      // Individual nodes inside boxes
      const modColors = { controller:'#f59e0b', service:'#06b6d4', repository:'#ec4899', entity:'#10b981',
        dto:'#3b82f6', component:'#8b5cf6', page:'#6366f1', router:'#6366f1', guard:'#f43f5e',
        config:'#64748b', security:'#f43f5e', model:'#10b981', database:'#fcd34d', api:'#38bdf8', util:'#94a3b8' };
      const modIcons = { controller:'⚙', service:'⚡', repository:'🗄', entity:'◈', dto:'📦',
        component:'◻', page:'📄', router:'⇄', guard:'🔒', config:'⚙', security:'🔒',
        model:'◈', database:'🗃', api:'🔗', util:'🔧' };

      for (const p of projects) {
        for (const node of (projectNodeMap.get(p.id) || [])) {
          const np = nodePos.get(node.id); if (!np) continue;
          const nc = modColors[node.module] || '#94a3b8';
          const ni = modIcons[node.module] || '◻';
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('cursor', 'pointer');
          const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          bg.setAttribute('x', String(np.x)); bg.setAttribute('y', String(np.y));
          bg.setAttribute('width', String(NODE_W)); bg.setAttribute('height', String(NODE_H));
          bg.setAttribute('rx', '5'); bg.setAttribute('fill', 'var(--panel)'); bg.setAttribute('stroke', nc); bg.setAttribute('stroke-width', '1.5');
          const ib = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          ib.setAttribute('x', String(np.x)); ib.setAttribute('y', String(np.y)); ib.setAttribute('width', '22'); ib.setAttribute('height', String(NODE_H));
          ib.setAttribute('rx', '5'); ib.setAttribute('fill', nc); ib.setAttribute('fill-opacity', '0.18');
          const it = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          it.setAttribute('x', String(np.x + 11)); it.setAttribute('y', String(np.y + NODE_H / 2 + 4));
          it.setAttribute('text-anchor', 'middle'); it.setAttribute('font-size', '12'); it.textContent = ni;
          const lbl = mpgBaseName(node.label || node.id);
          const lt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          lt.setAttribute('x', String(np.x + 28)); lt.setAttribute('y', String(np.y + 17));
          lt.setAttribute('font-size', '9'); lt.setAttribute('font-weight', '600'); lt.setAttribute('fill', 'var(--fg)');
          lt.textContent = lbl.length > 15 ? lbl.slice(0, 12) + '…' : lbl;
          const mt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          mt.setAttribute('x', String(np.x + 28)); mt.setAttribute('y', String(np.y + 30));
          mt.setAttribute('font-size', '8'); mt.setAttribute('fill', nc); mt.textContent = node.module || '';
          if (node.riskLevel === 'high' || node.riskLevel === 'medium') {
            const rd = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            rd.setAttribute('cx', String(np.x + NODE_W - 6)); rd.setAttribute('cy', String(np.y + 7)); rd.setAttribute('r', '4');
            rd.setAttribute('fill', node.riskLevel === 'high' ? '#f87171' : '#fcd34d'); g.appendChild(rd);
          }
          g.appendChild(bg); g.appendChild(ib); g.appendChild(it); g.appendChild(lt); g.appendChild(mt);
          g.addEventListener('mouseenter', () => bg.setAttribute('stroke-width', '2.5'));
          g.addEventListener('mouseleave', () => bg.setAttribute('stroke-width', '1.5'));
          g.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (!detail) return;
            const crossOut = crossLinks.filter((l) => l.fromFile === node.id || l.fromFile === node.path);
            const crossIn = crossLinks.filter((l) => l.toFile === node.id || l.toFile === node.path);
            const edgeOut = allEdges.filter((e) => e.from === node.id && visibleIds.has(e.to));
            const edgeIn = allEdges.filter((e) => e.to === node.id && visibleIds.has(e.from));
            detail.innerHTML = '<strong>' + escapeHtml(lbl) + '</strong><hr style="border-color:var(--border);margin:4px 0">'
              + '<div><b>Módulo:</b> ' + escapeHtml(node.module || node.type || '—') + '</div>'
              + '<div><b>Linguagem:</b> ' + escapeHtml(node.language || '—') + '</div>'
              + (node.riskLevel && node.riskLevel !== 'low' ? '<div><b>Risco:</b> ' + (node.riskLevel === 'high' ? '🔴' : '🟡') + ' ' + node.riskLevel + '</div>' : '')
              + '<div style="margin-top:6px"><b>Entrantes:</b> ' + (edgeIn.length + crossIn.length) + ' &nbsp; <b>Saintes:</b> ' + (edgeOut.length + crossOut.length) + '</div>'
              + (crossOut.length ? '<div style="margin-top:4px"><b>API calls:</b><br>' + crossOut.slice(0, 3).map((l) => '<code style="font-size:9px">' + escapeHtml((l.method||'GET') + ' ' + (l.endpoint||'')) + '</code>').join('<br>') + '</div>' : '')
              + (crossIn.length ? '<div style="margin-top:4px"><b>Chamado por:</b><br>' + crossIn.slice(0, 3).map((l) => '<code style="font-size:9px">' + escapeHtml(mpgBaseName(l.fromFile||'')) + '</code>').join('<br>') + '</div>' : '')
              + '<div style="margin-top:6px;font-size:9px;color:var(--muted);word-break:break-all">' + escapeHtml(node.path || node.id) + '</div>';
            detail.style.display = 'block';
          });
          svg.appendChild(g);
        }
      }

      svg.addEventListener('click', () => { if (detail) detail.style.display = 'none'; });
    }

    function mpgBaseName(p) {
      return p ? p.replace(/\\/g, '/').split('/').pop() || p : '';
    }
  </script>`;
}
//# sourceMappingURL=webviewAssets.js.map