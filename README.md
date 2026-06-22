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

A partir da Fase 1 da evolução rumo a uma análise estática profunda de
engenharia reversa, o grafo de dependências deixou de ser regex e passa a usar
**parsing AST real**
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

## Trace cross-tier — impacto end-to-end (React → Java → PL/SQL)

A tool MCP `trace_flow` reconstrói a **cadeia de impacto ininterrupta** entre as
camadas, unificando dois grafos que vivem no `index.db`: o **intra-código
resolvido** (Fase 1) e o **cross-tier** (HTTP/DB/PL-SQL), usando os arquivos como
ponte. Pergunta típica — *"o que quebra se eu mudar `PKG_CLIENTE.SALVAR`?"* —
devolve:

```
🖥️ TelaCliente
  ↓ ☕ ClienteController.salvar
  ↓ 📄 ClienteServiceImpl.salvar
  ↓ 📄 ClienteRepository
  ↓ 🗄️ PKG_CLIENTE
```

As chamadas Java são **resolvidas no nível de método** (`Classe.metodo`), via
arestas método→método persistidas em `method_edges` (ex. real do Spring
PetClinic: `OwnerController.findPaginated… → OwnerRepository#findByLastName…`).

O miolo `Service → Repository`, que o multigrafo antigo pulava, agora aparece —
porque a query atravessa as arestas `call` resolvidas (Fase 1) e os saltos
HTTP/DB cross-tier num único espaço de nós. Verificação:
`test/fixtures/crosstier`.

A cadeia também alcança **tabelas e colunas** (não só procedures): a camada ORM
(`detectOrmMappings`) liga `@Entity`/`@Table`, repositórios Spring Data
(`JpaRepository<Entity, Id>`) e SQL de `@Query`/`createNativeQuery` às tabelas.
O SQL é parseado por um **AST real multi-dialeto** (`node-sql-parser`:
Postgres/SQL Server/MySQL/Oracle-DML; fallback regex para JPQL/PL-SQL), o que dá
**lineage coluna-a-coluna**: `get_table_columns("PEDIDO")` lista quais colunas
são lidas/escritas e por quais arquivos. Assim `trace_flow("PEDIDO")` sobe da
tabela até a tela. Validado em código real (Spring PetClinic) e em
`test/fixtures/orm`.

---

## Busca semântica local (opt-in)

`search_code` tem dois modos: **FTS5** (léxico, padrão) e **vetorial**
(embeddings locais, ONNX via `@xenova/transformers`, sem chamada de API). O modo
vetorial é **opt-in** porque baixa um modelo (~25MB) na 1ª execução — ative com
`TIC_EMBEDDINGS=1` ao rodar a análise. Os vetores ficam no `index.db`; em runtime
o MCP embeda a query e ranqueia por cosseno. Onde o host do modelo é bloqueado
(ex.: sandboxes), a busca cai automaticamente para FTS5. A infraestrutura
(armazenamento + ranking por cosseno) é verificada em `verify-embeddings`.

---

## Complexidade por função

As métricas de qualidade são medidas **por função** sobre a AST real (não por
regex), para as linguagens com gramática (**Java, TypeScript, JavaScript, TSX/JSX**):

- **Ciclomática (McCabe)** — `1 + nº de pontos de decisão` (if, for, while, case,
  catch, `&&`, `||`, ternário).
- **Cognitiva** — penaliza o **aninhamento**: cada estrutura de controle soma o
  nível de profundidade corrente, capturando o custo de leitura que a ciclomática
  pura ignora.
- **Profundidade de aninhamento** — quão fundo o código encadeia decisões.
- **Funções ofensoras** — sinalizadas quando excedem os limites
  (`CC > 10`, cognitiva `> 15` ou aninhamento `> 4`), para priorizar refatoração.

Linguagens sem gramática (Python/Go/C#/Rust/PHP/Kotlin) caem no **fallback regex**
por arquivo. Os resultados aparecem em `metrics-summary.md`, em
`complex-functions.json`, na aba **Métricas › Funções** do app e na ferramenta MCP
`list_complex_functions` (com filtros `module` e `offendersOnly`).

---

## O que é analisado — 30 fases

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
| 20 | Métricas de qualidade | Complexidade **por função** (ciclomática McCabe + cognitiva + aninhamento) via AST, funções ofensoras, dívida técnica e hotspots; fallback regex p/ linguagens sem AST |
| 21 | Hierarquia de classes | `inheritance.md` — extends, implements, abstract, interface |
| 22 | Padrões arquiteturais | Repository, Service, Factory, Observer, etc. |
| 23 | Schema de banco | Tabelas de migrations, ORM models, DDL |
| 24 | @Transactional | Boundaries Spring: propagation, readOnly, rollbackFor |
| 25 | Batch jobs | @Scheduled, @Async, Quartz Job, Spring Batch |
| 26 | Módulos Angular/NgRx | @NgModule, lazy routes, actions, reducers, effects, selectors |
| 27 | Dead components | React/Angular components com inDegree=0 no grafo |
| 28 | Índice consultável (SQLite) | `index.db` — grafo/símbolos/busca FTS5 **sem teto de nós**, consultado pelo MCP |
| 29 | Export JSON | `analysis.json` estruturado com todos os dados |
| 30 | Arquivos para IA | `CLAUDE.md` e `.github/copilot-instructions.md` |

---

## Ferramentas MCP (35)

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
| `get_table_columns` | ~200 | Lineage coluna-a-coluna: colunas lidas/escritas de uma tabela e onde |
| `list_complex_functions` | ~400 | Funções mais complexas por função (ciclomática + cognitiva + aninhamento); filtros `module`/`offendersOnly` |
| `get_behavioral_hotspots` | ~400 | Hotspots comportamentais: complexidade × frequência de mudança no histórico do git |
| `get_change_coupling` | ~400 | Acoplamento temporal: arquivos que mudam juntos nos mesmos commits |
| `get_knowledge_map` | ~400 | Knowledge map / bus factor por módulo (concentração de autoria) |
| `trace_flow` | ~1.5k | Fluxo vertical completo a partir de um ponto de entrada (upstream + downstream) |
| `search_code` | ~400 | Busca semântica no código-fonte (FTS5 ou vetorial local) |
| `get_concept_map` | ~800 | Mapa cruzado de um conceito de negócio em todos os artefatos |

---

## Arquivos gerados em `.tic-code/`

```
.tic-code/
├── quick-context.md          # resumo ~12k tokens
├── index.md                  # mapa de navegação
├── index.db                  # índice consultável (SQLite) — fonte do MCP, sem teto de nós
├── dep-graph.json            # grafo de dependências (subconjunto p/ o visualizador da UI)
├── call-graph.json           # grafo multi-camada
├── impact-index.json         # índice de impacto de mudanças
├── analysis.json             # export estruturado completo
├── metrics-summary.md        # complexidade (por função) + hotspots + violações
├── complex-functions.json    # funções mais complexas (CC + cognitiva + aninhamento + ofensoras)
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

> **Módulo nativo (`better-sqlite3`):** o `index.db` usa um módulo nativo. O
> empacotamento (`dist:*`) recompila-o para o runtime do Electron
> automaticamente (electron-builder). Para `npm run dev`, rode
> `npm run rebuild:electron` uma vez. Os scripts de verificação (`npm run
> verify`) rodam sob Node e usam o binário Node-ABI.

---

## Capacidades

| Recurso | Status |
|---------|--------|
| Grafo por AST + símbolos resolvidos (TS/Java) | ✅ Fase 1 |
| Confiança por aresta (`resolved`/`inferred`) | ✅ |
| Índice consultável em escala (70k+ arquivos) | ✅ SQLite (Fase 2) |
| Trace de impacto cross-tier (React→Java→PL/SQL) | ✅ Fase 3 |
| Complexidade por função (ciclomática + cognitiva + aninhamento) | ✅ AST (Java/TS/JS) |
| PL/SQL data flow (tabelas por procedure) | ✅ |
| Dead PL/SQL detection | ✅ |
| Spring @Transactional mapping | ✅ |
| Batch jobs (@Scheduled, @Async, Quartz, Spring Batch) | ✅ |
| Angular NgRx store analysis | ✅ |
| Dead components (React/Angular) | ✅ |
| Integração MCP (Claude Code) | ✅ |
| Funciona 100% offline / sem cloud | ✅ |
| Orçamento de tokens para IA | ~12k tokens (quick-context) |
