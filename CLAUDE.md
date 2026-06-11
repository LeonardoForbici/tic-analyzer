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
    detectRisks.ts
    detectEndpoints.ts
    detectModules.ts
    generateQuickContext.ts   ← quick-context.md (~12k tokens)
    generateModuleContext.ts  ← context.md por módulo (~75k tokens)
    generateMasterIndex.ts    ← index.md (mapa de navegação)
    tokenBudget.ts
    pipeline.ts               ← orquestra as 32 fases
    store/
      indexDb.ts              ← index.db SQLite (files/edges/symbols/impact_edges/modules/FTS5)
      impactQueries.ts        ← queryImpactOf / queryBlastRadius (BFS reverso cross-tier)
      graphQueries.ts         ← agregação hierárquica (layer→module→file→symbol)
      snapshots.ts            ← snapshots.json (histórico de health entre análises)
  cli/
    index.ts            ← CLI headless: analyze / health / pr-review (usada pelo Action)
    prReview.ts         ← comparação base vs head + quality gates + markdown sticky
  mcp/
    server.ts           ← MCP Server HTTP/SSE (localhost:7432)
  ui/
    App.tsx             ← interface React (abas: Visão Geral, Saúde, Explorador, Impacto...)
    HierGraphViewer.tsx ← drill-down hierárquico estilo CAST Imaging
    HealthDashboard.tsx ← gauge + breakdown + tendência (snapshots)
    main.tsx
```

## Verificação

```bash
npm run verify   # build + 8 suítes (semantic, store, crosstier, orm, impacto, health, pr-review, embeddings)
```

NUNCA rodar `rebuild:electron` em CI — recompila o better-sqlite3 para a ABI
do Electron e quebra a execução em Node puro.

## GitHub Action (PR review)

`action.yml` na raiz — composite action que analisa merge-base vs head e
comenta no PR (sticky) o impacto cross-tier, riscos novos, violações e delta
de health. Gates: `new-high-risks`, `new-violations`, `health-drop:N`.

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

Ferramentas-chave (32 no total): `get_blast_radius` (resumo de impacto ~200
tokens — use PRIMEIRO), `get_impact_of` (impacto de arquivo/método/procedure/
tabela/coluna), `get_table_impact`, `get_diff_impact` (cross-tier), `get_health`,
`get_graph_level` (drill-down hierárquico), `trace_flow`, `search_code`,
`list_modules`, `get_module`, `get_quick_context`.
