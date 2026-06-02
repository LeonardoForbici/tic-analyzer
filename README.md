# TIC Analyzer

Motor local de análise estática para projetos grandes — zero tokens de IA na fase de análise.

```
código (74k+ arquivos) → engine local → resumo compacto → IA (mínimo de tokens)
```

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Desktop | Electron |
| UI | React + Vite |
| Linguagem | TypeScript |
| Protocolo IA | MCP SDK (Model Context Protocol) |

---

## Como usar

1. Abrir o TIC Analyzer
2. Selecionar a pasta raiz do projeto
3. Clicar em **Analisar**
4. (Opcional) Clicar em **Iniciar MCP** para expor as ferramentas ao Claude Code
5. Configurar `.claude/settings.json` no projeto analisado:

```json
{
  "mcpServers": {
    "tic-analyzer": {
      "url": "http://localhost:7432/mcp"
    }
  }
}
```

---

## Análise semântica (AST + resolução de símbolos)

A partir da Fase 1 da evolução rumo a paridade com o CAST Imaging, o grafo de
dependências deixou de ser regex e passa a usar **parsing AST real**
(`tree-sitter`, 100% local/offline) com **resolução de símbolos** para
TypeScript/JS/TSX e Java:

- Imports TS resolvidos com **aliases de tsconfig** (`@/...`) e **barris**
  (`export ... from`) seguidos até a origem.
- Java: `extends`/`implements` resolvidos e **chamadas via interface→implementador**
  (padrão DI) — sabe que `userService.findAll()` chama `UserServiceImpl`.
- Cada aresta carrega `confidence`: **`resolved`** (alvo único confirmado) ou
  **`inferred`** (ambíguo — ex.: interface com vários implementadores). Em
  engenharia reversa, isso diz no que confiar.
- Linguagens sem grammar (Python/Go/C#/Rust/PHP/Kotlin) continuam via regex como
  fallback.

Verificação: `npm run verify` roda o resolvedor sobre `test/fixtures/semantic`.

---

## O que é analisado — 29 fases

| # | Fase | O que produz |
|---|------|-------------|
| 1 | Scan de arquivos | Índice de todos os arquivos com linhas e extensões |
| 2 | Detecção de stack | Linguagens, frameworks, gerenciadores de pacotes |
| 3 | Grafo de dependências (AST) | `dep-graph.json` — arestas `import`/`call`/`extends`/`implements` com `confidence` (`resolved`/`inferred`) |
| 4 | Detecção de riscos (OWASP) | A02 Crypto, A03 Injection, A05 Misconfig, A09 Logging |
| 5 | Endpoints REST | Rotas detectadas em Express, Spring, NestJS, etc. |
| 6 | Chamadas HTTP frontend | fetch/axios/HttpClient com método e URL |
| 7 | Objetos PL/SQL | Procedures, functions, packages, triggers, views, sequences, indexes, synonyms + tabelas lidas/escritas |
| 8 | Chamadas backend→banco | JDBC, oracledb, Spring StoredProcedure, JdbcTemplate |
| 9 | Módulos | Agrupamento por estrutura de diretório |
| 10 | Quick-context.md | Resumo ~12k tokens para IA |
| 11 | Contexto por módulo | `modules/{nome}/context.md` (~75k tokens total) |
| 12 | Regras de negócio | Validações, enums, guards por módulo |
| 13 | Permissões e roles | Matriz de acesso com guards e decorators |
| 14 | index.md | Mapa de navegação do projeto |
| 15 | Diagrama Mermaid | Dependências entre módulos |
| 16 | OpenAPI YAML | Especificação dos endpoints detectados |
| 17 | Relatório de gaps | Módulos sem contexto, endpoints sem docs |
| 18 | Multi-grafo | Frontend → Endpoint → Backend → PL/SQL (`call-graph.json`) |
| 19 | Índice de impacto | `impact-index.json` — quem depende de quem |
| 20 | Métricas de qualidade | Complexidade ciclomática, dívida técnica, hotspots |
| 21 | Hierarquia de classes | `inheritance.md` — extends, implements, abstract, interface |
| 22 | Padrões arquiteturais | Repository, Service, Factory, Observer, etc. |
| 23 | Schema de banco | Tabelas de migrations, ORM models, DDL |
| 24 | @Transactional | Boundaries Spring: propagation, readOnly, rollbackFor |
| 25 | Batch jobs | @Scheduled, @Async, Quartz Job, Spring Batch |
| 26 | Módulos Angular/NgRx | @NgModule, lazy routes, actions, reducers, effects, selectors |
| 27 | Dead components | React/Angular components com inDegree=0 no grafo |
| 28 | Export JSON | `analysis.json` estruturado com todos os dados |
| 29 | Arquivos para IA | `CLAUDE.md` e `.github/copilot-instructions.md` |

---

## 27 MCP Tools

| Tool | ~Tokens | Descrição |
|------|---------|-----------|
| `get_quick_context` | ~12k | Resumo completo do projeto |
| `list_modules` | ~200 | Lista módulos com contagem de arquivos |
| `get_module` | ~3k | Contexto detalhado de um módulo |
| `search_module` | ~1k | Busca módulo por nome parcial |
| `get_impact` | ~200 | Quem depende de um arquivo |
| `get_diff_impact` | ~500 | Impacto de arquivos modificados no git |
| `get_metrics` | ~500 | Complexidade e dívida técnica |
| `get_hotspots` | ~300 | Top arquivos com maior dívida técnica |
| `get_patterns` | ~400 | Padrões arquiteturais detectados |
| `get_violations` | ~300 | Violações de camadas arquiteturais |
| `get_inheritance` | ~400 | Hierarquia de classes |
| `get_db_schema` | ~500 | Tabelas, colunas, PKs, FKs |
| `get_analysis_json` | ~2k | Export completo analysis.json |
| `get_multigraph` | ~1k | Grafo Frontend→Endpoint→Backend→PL/SQL |
| `get_diagram` | ~500 | Diagrama Mermaid de módulos |
| `get_openapi` | ~1k | Especificação OpenAPI dos endpoints |
| `get_gaps` | ~300 | Gaps e lacunas do projeto |
| `get_permissions` | ~400 | Matriz de permissões e roles |
| `get_business_rules` | ~500 | Regras de negócio por módulo |
| `get_plsql_object` | ~300 | Detalhes de uma procedure/function PL/SQL |
| `get_table_access` | ~200 | Quais procedures leem/escrevem uma tabela |
| `get_dead_plsql` | ~300 | Procedures/functions sem referenciadores |
| `get_transactions` | ~400 | Boundaries @Transactional do Spring |
| `get_batch_jobs` | ~300 | Jobs @Scheduled, @Async, Quartz, Spring Batch |
| `get_angular_modules` | ~400 | Módulos Angular, lazy routes e NgRx store |
| `get_dead_components` | ~200 | Componentes React/Angular sem uso |
| `find_path` | ~200 | Menor caminho entre dois arquivos no grafo |

---

## Arquivos gerados em `.tic-code/`

```
.tic-code/
├── quick-context.md          # resumo ~12k tokens
├── index.md                  # mapa de navegação
├── dep-graph.json            # grafo de dependências
├── call-graph.json           # grafo multi-camada
├── impact-index.json         # índice de impacto de mudanças
├── analysis.json             # export estruturado completo
├── metrics-summary.md        # complexidade + hotspots + violações
├── patterns.md               # padrões arquiteturais
├── inheritance.md            # hierarquia de classes
├── openapi.yaml              # endpoints em OpenAPI 3.0
├── diagram.md + multigraph.md # diagramas Mermaid
├── gaps.md                   # lacunas detectadas
├── permissions.md            # matriz de permissões
├── db-schema.md              # schema de banco de dados
├── transactions.md           # @Transactional boundaries (Spring)
├── batch-jobs.md             # @Scheduled, @Async, Quartz, Spring Batch
├── angular-modules.md        # NgModule + lazy routes + NgRx
├── plsql-objects.json        # procedures/functions com tabelas lidas/escritas
├── dead-plsql.json           # PL/SQL sem referenciadores
├── dead-components.json      # React/Angular components com inDegree=0
├── file-cache.json           # cache incremental
└── modules/
    └── {nome}/
        ├── context.md
        ├── business-rules.md
        ├── metrics.md
        └── patterns.md
```

---

## Suporte a linguagens

| Linguagem / Ecossistema | Detecção |
|-------------------------|---------|
| **PL/SQL Oracle** | PROCEDURE, FUNCTION, PACKAGE, TRIGGER, VIEW, SEQUENCE, INDEX, SYNONYM + tabelas lidas/escritas por procedure |
| **Java / Spring** | Endpoints (@GetMapping etc.), @Transactional (propagation, readOnly, rollbackFor), @Scheduled (cron/fixedRate), @Async, Quartz Job, Spring Batch Tasklet/ItemProcessor |
| **TypeScript / JavaScript** | React (components, hooks), Angular (@NgModule, lazy routes, NgRx), Express/NestJS endpoints, fetch/axios/HttpClient |
| **HTML** | Chamadas HTTP inline |
| **Python** | Endpoints Flask/FastAPI, imports, métricas |
| **Go** | Imports, grafo, métricas |
| **C# / .NET** | Endpoints, imports, métricas |
| **Kotlin** | Endpoints Spring, @Transactional |
| **Ruby / PHP / Rust** | Imports, grafo, métricas |

---

## Build

```bash
npm install
npm run dev          # desenvolvimento (Electron + Vite hot-reload)

npm run dist:win     # → release/TIC Analyzer Setup.exe
npm run dist:mac     # → release/TIC Analyzer.dmg
npm run dist:linux   # → release/TIC Analyzer.AppImage
```

---

## TIC Analyzer vs CAST Imaging

| Feature | CAST Imaging | TIC Analyzer |
|---------|-------------|-------------|
| PL/SQL data flow (tabelas por procedure) | Sim | Sim |
| Dead PL/SQL detection | Sim | Sim |
| Spring @Transactional mapping | Sim | Sim |
| Batch jobs (@Scheduled, Quartz) | Sim | Sim |
| Angular NgRx store analysis | Parcial | Sim |
| Dead components (React/Angular) | Não | Sim |
| MCP integration (Claude Code) | Não | Sim |
| Funciona offline / sem cloud | Não | Sim |
| Custo | ~$50k/ano | Open source |
| Token budget para IA | N/A | ~12k tokens (quick-context) |
