export function getOverviewStyles(): string {
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
      fill: currentColor;
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

export function getOverviewScript(nonce: string): string {
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
    const initGraph = () => {
      if (graphInitialized) return;
      graphInitialized = true;
      try {
        applyLayout('agrupado');
        selectNode(graphState.selectedNodeId);
      } catch (err) {
        log('Erro ao inicializar grafo: ' + (err && err.message ? err.message : String(err)));
      }
    };
    const graphDetails = document.querySelector('.advanced-graph-details');
    if (graphDetails) {
      graphDetails.addEventListener('toggle', () => {
        if (graphDetails.open) initGraph();
      });
      // Init immediately if the details was restored as open by the webview
      if (graphDetails.open) initGraph();
    } else {
      // Fallback: no details wrapper, just init
      initGraph();
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

    function renderMultiProjectGraph() {
      const svg = document.getElementById('mpgVisSvg');
      if (!svg) return;
      const pgData = state.projectGraph;
      const pg = pgData && pgData.projectGraph;
      const cl = pgData && pgData.crossProjectLinks;

      // Explicit colors — no CSS vars inside SVG attributes (they don't resolve in VSCode webview)
      const BG = '#0f172a', PANEL = '#1e293b', PANEL2 = '#263548', FG = '#e2e8f0', MUTED = '#64748b';
      const colorByKind = { frontend: '#38bdf8', mobile: '#c4b5fd', backend: '#86efac', shared: '#fdba74', database: '#fcd34d', infra: '#94a3b8' };
      const layerKeys = ['frontend', 'mobile', 'backend', 'shared', 'database', 'infra'];
      const layerLabels = { frontend: 'Frontend', mobile: 'Mobile', backend: 'Backend / API', shared: 'Shared', database: 'SQL / DB', infra: 'Infra' };

      if (!pg || !pg.projects || !pg.projects.length) {
        svg.setAttribute('height', '80');
        svg.innerHTML = '<rect width="100%" height="80" fill="' + BG + '"/>'
          + '<text x="20" y="44" font-size="13" fill="' + MUTED + '" font-family="monospace">Rode Analisar Workspace para gerar o grafo multi-projeto.</text>';
        return;
      }

      const projects = pg.projects;
      const allNodes = (pg.nodes || []);
      const allEdges = (pg.edges || []);
      const crossLinks = (cl && cl.links) ? cl.links : [];

      const KEY_MODULES = new Set(['controller', 'service', 'repository', 'entity', 'component', 'page', 'router', 'guard', 'dto', 'config', 'database', 'security', 'model', 'hook', 'api', 'util']);

      // Assign nodes to projects (top 12 per project, key modules first)
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

      const W = 880, PAD_L = 60, NODE_W = 128, NODE_H = 44, NODE_GAP_X = 6, NODE_GAP_Y = 5, NODES_PER_ROW = 4;
      const BOX_PAD = 10, BOX_HEADER_H = 38, LAYER_GAP = 48, TOP_PAD = 30;

      const layerGroups = {};
      for (const lk of layerKeys) layerGroups[lk] = projects.filter((p) => (p.kind || 'unknown') === lk);

      const boxDim = (pid) => {
        const nodes = projectNodeMap.get(pid) || [];
        const cnt = nodes.length;
        const rows = Math.max(1, Math.ceil(cnt / NODES_PER_ROW));
        const cols = Math.min(cnt || 1, NODES_PER_ROW);
        const w = Math.max(BOX_PAD * 2 + cols * NODE_W + (cols - 1) * NODE_GAP_X, 200);
        const h = BOX_HEADER_H + BOX_PAD + rows * (NODE_H + NODE_GAP_Y) + BOX_PAD;
        return { w, h };
      };

      const layerH = (lk) => {
        const g = layerGroups[lk] || [];
        if (!g.length) return 0;
        return Math.max(...g.map((p) => boxDim(p.id).h)) + 24;
      };

      const layerY = {};
      let curY = TOP_PAD;
      for (const lk of layerKeys) {
        if (!(layerGroups[lk] || []).length) continue;
        layerY[lk] = curY;
        curY += layerH(lk) + LAYER_GAP;
      }
      const totalH = Math.max(curY + 20, 200);

      // Horizontal layout per project inside layer
      const projectPos = new Map();
      for (const lk of layerKeys) {
        const group = layerGroups[lk] || [];
        if (!group.length) continue;
        const usableW = W - PAD_L;
        const totalBoxW = group.reduce((s, p) => s + boxDim(p.id).w, 0);
        const gap = Math.max((usableW - totalBoxW) / (group.length + 1), 12);
        let cx = PAD_L + gap;
        for (const p of group) {
          const d = boxDim(p.id);
          projectPos.set(p.id, { x: cx, y: (layerY[lk] || 0) + 8, w: d.w, h: d.h, color: colorByKind[lk] || '#94a3b8' });
          cx += d.w + gap;
        }
      }

      // Node positions inside boxes
      const nodePos = new Map();
      for (const p of projects) {
        const pos = projectPos.get(p.id);
        if (!pos) continue;
        (projectNodeMap.get(p.id) || []).forEach((node, i) => {
          const col = i % NODES_PER_ROW, row = Math.floor(i / NODES_PER_ROW);
          const nx = pos.x + BOX_PAD + col * (NODE_W + NODE_GAP_X);
          const ny = pos.y + BOX_HEADER_H + row * (NODE_H + NODE_GAP_Y);
          nodePos.set(node.id, { x: nx, y: ny, cx: nx + NODE_W / 2, cy: ny + NODE_H / 2,
            top: { x: nx + NODE_W / 2, y: ny }, bottom: { x: nx + NODE_W / 2, y: ny + NODE_H },
            left: { x: nx, y: ny + NODE_H / 2 }, right: { x: nx + NODE_W, y: ny + NODE_H / 2 } });
        });
      }
      const visibleIds = new Set(nodePos.keys());

      // Build SVG
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + totalH);
      svg.setAttribute('height', String(totalH));
      svg.innerHTML = '';

      // Background
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('width', String(W)); bgRect.setAttribute('height', String(totalH)); bgRect.setAttribute('fill', BG);
      svg.appendChild(bgRect);

      // Arrowhead defs
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      for (const [id, color] of [['ah','#38bdf8'],['ah-db','#fcd34d'],['ah-call','#86efac'],['ah-gap','#f87171']]) {
        const mk = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        mk.setAttribute('id', id); mk.setAttribute('markerWidth', '9'); mk.setAttribute('markerHeight', '6');
        mk.setAttribute('refX', '8'); mk.setAttribute('refY', '3'); mk.setAttribute('orient', 'auto');
        const mp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        mp.setAttribute('d', 'M0,0 L0,6 L9,3 z'); mp.setAttribute('fill', color);
        mk.appendChild(mp); defs.appendChild(mk);
      }
      svg.appendChild(defs);

      // Layer bands
      for (const lk of layerKeys) {
        const g = layerGroups[lk] || [];
        if (!g.length || layerY[lk] === undefined) continue;
        const color = colorByKind[lk] || '#94a3b8';
        const lh = layerH(lk);
        // Band background
        const band = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        band.setAttribute('x', '0'); band.setAttribute('y', String(layerY[lk]));
        band.setAttribute('width', String(W)); band.setAttribute('height', String(lh));
        band.setAttribute('fill', color); band.setAttribute('fill-opacity', '0.06');
        svg.appendChild(band);
        // Left label strip
        const strip = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        strip.setAttribute('x', '0'); strip.setAttribute('y', String(layerY[lk]));
        strip.setAttribute('width', String(PAD_L - 4)); strip.setAttribute('height', String(lh));
        strip.setAttribute('fill', color); strip.setAttribute('fill-opacity', '0.14');
        svg.appendChild(strip);
        // Layer label (rotated)
        const lt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        const lmy = layerY[lk] + lh / 2;
        lt.setAttribute('x', String(PAD_L / 2)); lt.setAttribute('y', String(lmy));
        lt.setAttribute('text-anchor', 'middle'); lt.setAttribute('dominant-baseline', 'middle');
        lt.setAttribute('font-size', '9'); lt.setAttribute('font-weight', 'bold'); lt.setAttribute('fill', color);
        lt.setAttribute('transform', 'rotate(-90,' + (PAD_L / 2) + ',' + lmy + ')');
        lt.textContent = (layerLabels[lk] || lk).toUpperCase(); svg.appendChild(lt);
      }

      // Helper: cubic bezier edge
      const detail = document.getElementById('mpgDetail');
      const drawEdge = (x1, y1, x2, y2, color, dash, arrowId, onClick, label) => {
        const midY = (y1 + y2) / 2;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M' + x1 + ',' + y1 + ' C' + x1 + ',' + midY + ' ' + x2 + ',' + midY + ' ' + x2 + ',' + y2);
        path.setAttribute('fill', 'none'); path.setAttribute('stroke', color); path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-opacity', '0.75'); path.setAttribute('marker-end', 'url(#' + arrowId + ')');
        if (dash) path.setAttribute('stroke-dasharray', dash);
        if (onClick) {
          path.setAttribute('cursor', 'pointer');
          path.addEventListener('click', onClick);
          path.addEventListener('mouseenter', () => { path.setAttribute('stroke-width', '3'); path.setAttribute('stroke-opacity', '1'); });
          path.addEventListener('mouseleave', () => { path.setAttribute('stroke-width', '2'); path.setAttribute('stroke-opacity', '0.75'); });
        }
        svg.appendChild(path);
        if (label) {
          const mx = (x1 + x2) / 2, my = midY;
          const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          const lw = Math.min(label.length * 5.5, 130), lh2 = 14;
          bg.setAttribute('x', String(mx - lw / 2 - 3)); bg.setAttribute('y', String(my - lh2));
          bg.setAttribute('width', String(lw + 6)); bg.setAttribute('height', String(lh2));
          bg.setAttribute('rx', '3'); bg.setAttribute('fill', BG); bg.setAttribute('fill-opacity', '0.85');
          svg.appendChild(bg);
          const lt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          lt.setAttribute('x', String(mx)); lt.setAttribute('y', String(my - 4));
          lt.setAttribute('text-anchor', 'middle'); lt.setAttribute('font-size', '9');
          lt.setAttribute('fill', color); lt.setAttribute('pointer-events', 'none'); lt.setAttribute('font-family', 'monospace');
          lt.textContent = label.length > 24 ? label.slice(0, 21) + '…' : label; svg.appendChild(lt);
        }
      };

      // Within-project edges (show internal deps if any)
      const drawnE = new Set();
      for (const edge of allEdges) {
        if (edge.crossProject || !visibleIds.has(edge.from) || !visibleIds.has(edge.to)) continue;
        const ek = edge.from + '→' + edge.to; if (drawnE.has(ek)) continue; drawnE.add(ek);
        const fp = nodePos.get(edge.from), tp = nodePos.get(edge.to); if (!fp || !tp) continue;
        let col = '#a78bfa', dash = '6,3', aid = 'ah';
        if (edge.type === 'CALLS') { col = '#86efac'; dash = '4,2'; aid = 'ah-call'; }
        else if (edge.type === 'READS_TABLE' || edge.type === 'WRITES_TABLE') { col = '#fcd34d'; dash = '3,2'; aid = 'ah-db'; }
        drawEdge(fp.bottom.x, fp.bottom.y, tp.top.x, tp.top.y, col, dash, aid, null, '');
      }

      // Cross-project edges
      const drawnC = new Set();
      for (const link of crossLinks) {
        const ck = (link.fromFile || link.fromProjectId) + '→' + (link.toFile || link.endpoint || link.toProjectId);
        if (drawnC.has(ck)) continue; drawnC.add(ck);

        // Try to connect individual nodes; fallback to project box centers
        const fromNid = [...visibleIds].find((id) => id === link.fromFile || id.endsWith('/' + (link.fromFile || '').split('/').pop()));
        const toNid = link.toFile ? [...visibleIds].find((id) => id === link.toFile || id.endsWith('/' + (link.toFile || '').split('/').pop())) : null;
        let x1, y1, x2, y2;
        if (fromNid && toNid) {
          const fp = nodePos.get(fromNid), tp = nodePos.get(toNid);
          x1 = fp.bottom.x; y1 = fp.bottom.y; x2 = tp.top.x; y2 = tp.top.y;
        } else {
          const fb = projectPos.get(link.fromProjectId), tb = projectPos.get(link.toProjectId);
          if (!fb || !tb) continue;
          x1 = fb.x + fb.w / 2; y1 = fb.y + fb.h; x2 = tb.x + tb.w / 2; y2 = tb.y;
        }

        let col = '#38bdf8', dash = '', aid = 'ah';
        if ((link.type || '').includes('DATABASE')) { col = '#fcd34d'; dash = '4,2'; aid = 'ah-db'; }
        if (link.confidence === 'GAP') { col = '#f87171'; aid = 'ah-gap'; }

        const routeLabel = ((link.method || '') + ' ' + (link.endpoint || '')).trim();
        const onClick = () => {
          if (!detail) return;
          const cb = link.confidence === 'CONFIRMED' ? '🟢 CONFIRMADO' : link.confidence === 'INFERRED' ? '🟡 INFERIDO' : '🔴 LACUNA';
          detail.style.display = 'block';
          detail.innerHTML = '<strong style="font-size:12px">' + escapeHtml(mpgBaseName(link.fromFile || link.fromProjectId || '')) + '</strong>'
            + '<div style="color:#64748b;font-size:10px;margin:2px 0 6px">→ ' + escapeHtml(mpgBaseName(link.toFile || link.endpoint || '')) + '</div>'
            + '<div><code style="font-size:11px;color:#38bdf8">' + escapeHtml((link.method || 'GET') + ' ' + (link.endpoint || '')) + '</code></div>'
            + '<div style="margin-top:6px"><b>De:</b> ' + escapeHtml(link.fromProjectId || '') + '</div>'
            + '<div><b>Para:</b> ' + escapeHtml(link.toProjectId || '') + '</div>'
            + '<div style="margin-top:6px">' + cb + '</div>'
            + (link.evidence && link.evidence.length ? '<div style="margin-top:8px;font-size:9px;color:#94a3b8;word-break:break-all;font-family:monospace">' + escapeHtml(link.evidence[0]) + '</div>' : '');
        };
        drawEdge(x1, y1, x2, y2, col, dash, aid, onClick, routeLabel);
      }

      // Project boxes (drawn after edges so they're on top)
      for (const p of projects) {
        const pos = projectPos.get(p.id); if (!pos) continue;
        const col = pos.color;
        // Box shadow/glow
        const glow = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        glow.setAttribute('x', String(pos.x - 2)); glow.setAttribute('y', String(pos.y - 2));
        glow.setAttribute('width', String(pos.w + 4)); glow.setAttribute('height', String(pos.h + 4));
        glow.setAttribute('rx', '10'); glow.setAttribute('fill', col); glow.setAttribute('fill-opacity', '0.12');
        svg.appendChild(glow);
        // Box body
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(pos.x)); rect.setAttribute('y', String(pos.y));
        rect.setAttribute('width', String(pos.w)); rect.setAttribute('height', String(pos.h));
        rect.setAttribute('rx', '8'); rect.setAttribute('fill', PANEL2); rect.setAttribute('stroke', col); rect.setAttribute('stroke-width', '1.5');
        svg.appendChild(rect);
        // Header strip
        const hdr = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        hdr.setAttribute('x', String(pos.x)); hdr.setAttribute('y', String(pos.y));
        hdr.setAttribute('width', String(pos.w)); hdr.setAttribute('height', String(BOX_HEADER_H));
        hdr.setAttribute('rx', '8'); hdr.setAttribute('fill', col); hdr.setAttribute('fill-opacity', '0.18');
        svg.appendChild(hdr);
        // Project name
        const pn = (p.name || p.id || '');
        const nt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        nt.setAttribute('x', String(pos.x + 10)); nt.setAttribute('y', String(pos.y + 16));
        nt.setAttribute('font-size', '11'); nt.setAttribute('font-weight', 'bold'); nt.setAttribute('fill', col);
        nt.textContent = pn.length > 28 ? pn.slice(0, 25) + '…' : pn; svg.appendChild(nt);
        // Subtitle: stack + files
        const st = (p.stack || []).slice(0, 2).join(' · ') || (p.kind || '');
        const st2 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        st2.setAttribute('x', String(pos.x + 10)); st2.setAttribute('y', String(pos.y + 30));
        st2.setAttribute('font-size', '8'); st2.setAttribute('fill', MUTED);
        st2.textContent = st + '  ' + (p.files || 0) + ' arq · ' + (p.risks || 0) + ' riscos'; svg.appendChild(st2);
        // No-nodes hint
        if (!(projectNodeMap.get(p.id) || []).length) {
          const hint = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          hint.setAttribute('x', String(pos.x + pos.w / 2)); hint.setAttribute('y', String(pos.y + BOX_HEADER_H + 28));
          hint.setAttribute('text-anchor', 'middle'); hint.setAttribute('font-size', '9'); hint.setAttribute('fill', MUTED);
          hint.textContent = 'Rode Analisar Workspace para ver arquivos'; svg.appendChild(hint);
        }
      }

      // Individual nodes inside boxes
      const modColors = { controller:'#f59e0b', service:'#06b6d4', repository:'#ec4899', entity:'#10b981',
        dto:'#3b82f6', component:'#8b5cf6', page:'#6366f1', router:'#6366f1', guard:'#f43f5e',
        config:'#64748b', security:'#f43f5e', model:'#10b981', database:'#fcd34d', api:'#38bdf8', util:'#94a3b8' };

      for (const p of projects) {
        for (const node of (projectNodeMap.get(p.id) || [])) {
          const np = nodePos.get(node.id); if (!np) continue;
          const nc = modColors[node.module] || '#94a3b8';
          const lbl = mpgBaseName(node.label || node.id);
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('cursor', 'pointer');
          // Node background
          const nbg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          nbg.setAttribute('x', String(np.x)); nbg.setAttribute('y', String(np.y));
          nbg.setAttribute('width', String(NODE_W)); nbg.setAttribute('height', String(NODE_H));
          nbg.setAttribute('rx', '4'); nbg.setAttribute('fill', PANEL); nbg.setAttribute('stroke', nc); nbg.setAttribute('stroke-width', '1.2');
          // Left accent bar
          const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          bar.setAttribute('x', String(np.x)); bar.setAttribute('y', String(np.y));
          bar.setAttribute('width', '4'); bar.setAttribute('height', String(NODE_H));
          bar.setAttribute('rx', '4'); bar.setAttribute('fill', nc);
          // Label
          const lt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          lt.setAttribute('x', String(np.x + 10)); lt.setAttribute('y', String(np.y + 16));
          lt.setAttribute('font-size', '9'); lt.setAttribute('font-weight', '600'); lt.setAttribute('fill', FG);
          lt.textContent = lbl.length > 16 ? lbl.slice(0, 13) + '…' : lbl;
          // Module tag
          const mt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          mt.setAttribute('x', String(np.x + 10)); mt.setAttribute('y', String(np.y + 29));
          mt.setAttribute('font-size', '8'); mt.setAttribute('fill', nc); mt.textContent = node.module || '';
          // Risk indicator
          if (node.riskLevel === 'high' || node.riskLevel === 'medium') {
            const rd = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            rd.setAttribute('cx', String(np.x + NODE_W - 7)); rd.setAttribute('cy', String(np.y + 8)); rd.setAttribute('r', '4');
            rd.setAttribute('fill', node.riskLevel === 'high' ? '#f87171' : '#fcd34d'); g.appendChild(rd);
          }
          g.appendChild(nbg); g.appendChild(bar); g.appendChild(lt); g.appendChild(mt);
          g.addEventListener('mouseenter', () => nbg.setAttribute('stroke-width', '2'));
          g.addEventListener('mouseleave', () => nbg.setAttribute('stroke-width', '1.2'));
          g.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (!detail) return;
            const crossOut = crossLinks.filter((l) => l.fromFile === node.id || l.fromFile === node.path);
            const crossIn = crossLinks.filter((l) => l.toFile === node.id || l.toFile === node.path);
            detail.style.display = 'block';
            detail.innerHTML = '<strong style="font-size:12px">' + escapeHtml(lbl) + '</strong>'
              + '<div style="font-size:9px;color:#64748b;margin:2px 0 8px">' + escapeHtml(node.path || node.id) + '</div>'
              + '<div><b>Módulo:</b> ' + escapeHtml(node.module || '—') + '</div>'
              + '<div><b>Linguagem:</b> ' + escapeHtml(node.language || '—') + '</div>'
              + (node.riskLevel && node.riskLevel !== 'low' ? '<div style="margin-top:4px"><b>Risco:</b> ' + (node.riskLevel === 'high' ? '🔴' : '🟡') + ' ' + node.riskLevel + '</div>' : '')
              + (crossOut.length ? '<div style="margin-top:8px"><b>API calls:</b><br>' + crossOut.slice(0, 4).map((l) => '<code style="font-size:9px;display:block;color:#38bdf8">' + escapeHtml((l.method||'GET') + ' ' + (l.endpoint||'')) + '</code>').join('') + '</div>' : '')
              + (crossIn.length ? '<div style="margin-top:8px"><b>Chamado por:</b><br>' + crossIn.slice(0, 3).map((l) => '<code style="font-size:9px;display:block;color:#a78bfa">' + escapeHtml(mpgBaseName(l.fromFile||'')) + '</code>').join('') + '</div>' : '');
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
