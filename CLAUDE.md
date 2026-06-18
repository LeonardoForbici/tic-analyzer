# TIC Analyzer

Motor local de análise para projetos grandes — zero tokens de IA na análise.

## Modelo mental

```
código (74k arquivos) → engine local → resumo compacto → IA (mínimo)
```

## Stack

- **Electron** — janela nativa, distribui como .exe
- **React + Vite** — UI do renderer
- **TypeScript** — tudo tipado
- **MCP SDK** — servidor para Claude Code

## Estrutura

```
electron/
  main.ts             ← processo principal (janela, IPC, MCP lifecycle)
  preload.ts          ← bridge segura renderer ↔ main
src/
  analyzer/           ← engine de análise (puro Node.js, zero tokens)
    scanFiles.ts
    detectStack.ts
    buildDependencyGraph.ts   ← AST tree-sitter (TS/JS/Java) + fallback regex
    buildImpactGraph.ts       ← grafo de impacto unificado (file/method/plsql/table/column)
    computeHealthScore.ts     ← health score 0-100 (6 dimensões)
    checkArchRules.ts         ← regras .tic-rules.json + deepening + relatório HTML
    computeRiskPrediction.ts  ← churn git × complexidade × acoplamento
    computeDelta.ts           ← self-delta + loop de aprendizado preditivo (sistema vivo)
    notify.ts                 ← alertas outbound (Slack / webhook genérico)
    generateZoomOut.ts        ← visão executiva (fronteiras de domínio)
    generateGraphReport.ts    ← god nodes + conexões surpreendentes (graph-report.md)
    detectCommunities.ts      ← comunidades do grafo (Louvain, graphology) — clusters por topologia
    exportGraph.ts            ← export standalone do grafo (HTML interativo / Mermaid / SVG)
    detectRisks.ts
    detectEndpoints.ts
    detectModules.ts
    generateQuickContext.ts   ← quick-context.md (~12k tokens)
    generateModuleContext.ts  ← context.md por módulo (~75k tokens)
    generateMasterIndex.ts    ← index.md (mapa de navegação)
    tokenBudget.ts
    pipeline.ts               ← orquestra as 44 fases
    store/
      indexDb.ts              ← index.db SQLite (files/edges/symbols/impact_edges/modules/communities/FTS5)
      impactQueries.ts        ← queryImpactOf / queryBlastRadius / queryImpactPath (BFS reverso cross-tier + path finding)
      graphQueries.ts         ← agregação hierárquica (layer→module→file→symbol) + queryCommunities
      snapshots.ts            ← snapshots.json (histórico de health entre análises)
      triageStore.ts          ← triage.json (máquina de estados da skill triage)
      activityLog.ts          ← activity.json (timeline do sistema vivo)
      portfolioStore.ts       ← registro global multi-projeto (~/.tic-analyzer)
  cli/
    index.ts            ← CLI headless: analyze / health / pr-review / serve / export (usada pelo Action)
    prReview.ts         ← comparação base vs head + quality gates + markdown sticky
  mcp/
    server.ts           ← MCP Server HTTP/SSE (localhost:7432) + push SSE em /events
  ui/
    App.tsx             ← interface React (abas: Visão Geral, Saúde, Explorador, Impacto...)
    HierGraphViewer.tsx ← drill-down hierárquico estilo CAST Imaging
    HealthDashboard.tsx ← gauge + breakdown + tendência (snapshots)
    main.tsx
```

## Verificação

```bash
npm run verify   # build + 18 suítes (semantic, store, crosstier, orm, impacto, graph-insights, export, communities, health, pr-review, serve, governança, vivo, valor, portfólio, incremental, ux, embeddings)
```

NUNCA rodar `rebuild:electron` em CI — recompila o better-sqlite3 para a ABI
do Electron e quebra a execução em Node puro.

## GitHub Action (PR review)

`action.yml` na raiz — composite action que analisa merge-base vs head e
comenta no PR (sticky) o impacto cross-tier, riscos novos, violações e delta
de health. Gates: `new-high-risks`, `new-violations`, `new-rule-violations`, `health-drop:N`.
Com `create-issues`, gate reprovado vira issue `bug`/`needs-triage` com AGENT-BRIEF.
A análise da base é cacheada (actions/cache + disco em self-hosted) e o engine
é incremental — PRs seguintes só re-analisam o que mudou.

## Modo servidor (enterprise)

```bash
tic-analyzer serve /caminho/projeto --host 0.0.0.0 --token <segredo> --watch 30
```

Máquina dedicada analisa o projeto e serve o MCP para o time inteiro — todos
consultam o MESMO índice. **Sistema vivo**: file-watch reativo (debounced)
re-analisa ao salvar; push SSE em `GET /events`; alertas outbound (Slack/
webhook) via seção `alerts` do `.tic-rules.json`; timeline em `activity.json`
e loop preditivo em `prediction-accuracy.json`. Em rede, `--token` é
obrigatório (`Authorization: Bearer` ou `?token=` no `/events`).

## Governança (`.tic-rules.json`)

Regras de arquitetura ficam em `.tic-rules.json` na **raiz do projeto analisado**
(não neste repo). Criar pela aba Governança (botão "Criar .tic-rules.json", via
IPC `create-tic-rules` → `rulesTemplate()` em `checkArchRules.ts`) ou copiar
`.tic-code/tic-rules.example.json`. O botão e o IPC **não sobrescrevem** um
arquivo existente. Schema: `rules[].forbid` com `fromLayer/toLayer`,
`fromModule/toModule` ou `fromPath/toPath` (glob); `severity` `error|warn`;
`outOfScope[]` (decisões), `alerts` (Slack/webhook) e `roi` (custo/hora).
Carregado por `loadArchRules`; valida em `checkArchRules.ts` e alimenta o gate
`new-rule-violations`.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Build

```bash
npm run dist:win    # → release/TIC Analyzer Setup.exe
npm run dist:mac    # → release/TIC Analyzer.dmg
npm run dist:linux  # → release/TIC Analyzer.AppImage
```

## MCP Server (Claude Code)

Configure em `.claude/settings.json` do projeto analisado:

```json
{ "mcpServers": { "tic-analyzer": { "url": "http://localhost:7432/mcp" } } }
```

Ferramentas-chave (57 no total): `get_blast_radius` (resumo de impacto ~200
tokens — use PRIMEIRO), `get_impact_of` (impacto de arquivo/método/procedure/
tabela/coluna), `get_impact_path` (caminho entre duas entidades — "por que X
afeta Y"), `get_table_impact`, `get_diff_impact` (cross-tier), `get_health`,
`get_graph_level` (drill-down hierárquico), `get_graph_report` (god nodes +
conexões surpreendentes), `get_communities` (clusters Louvain por topologia),
`trace_flow`, `search_code` (FTS5 + vetorial fundidos via RRF), `list_modules`,
`get_module`, `get_quick_context`. Export do grafo (standalone, fora do app):
CLI `tic-analyzer export <path> --format html|mermaid|svg` ou botão "Exportar"
no HierGraphViewer (HTML/Mermaid/SVG/PNG).
Governança/skills (mattpocock/skills): `get_arch_rules`, `get_arch_suggestions`,
`get_risk_prediction`, `get_agent_brief`, `get_diagnosis`, `get_zoom_out`,
`get_out_of_scope`, `list_triage`, `update_triage`. Memória persistente:
`remember` (registra decisão/tentativa/outcome por entidade), `recall` (histórico
de tentativas — também injetado no `get_agent_brief`).
