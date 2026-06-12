# TIC Analyzer

**Mapa vivo da arquitetura da sua aplicação.**
Análise semântica, impacto cross-tier e contexto para IA — 100% local.

```text
código (74k+ arquivos) → engine local → índice SQLite + contexto otimizado → IA consulta apenas o necessário
```

A ideia central: o trabalho pesado (AST, grafos, impacto, métricas, dependências e banco de dados) é feito por um engine determinístico na sua máquina. A IA (Claude Code, Copilot e outras) consulta primeiro o MCP e só acessa arquivos quando realmente precisa — consumindo uma fração dos tokens.

---

## O que ele responde

* **"Se eu mexer aqui, o que quebra?"** — análise de impacto de qualquer entidade: arquivo, método, endpoint, procedure, função, tabela ou coluna, atravessando todas as camadas da aplicação
* **"Como esse fluxo funciona?"** — rastreia fluxos ponta a ponta entre frontend, APIs, serviços, banco de dados e processos batch
* **"O projeto está saudável?"** — health score de 0–100 (grade A–E) com tendência histórica entre análises
* **"Esse PR é seguro?"** — review automático no GitHub com impacto, riscos novos e quality gates

### Exemplos de rastreamento

```text
coluna → trigger → procedure → DAO → service → endpoint → frontend
```

```text
tela → endpoint → service → procedure → tabela
```

---

## Stack

| Camada       | Tecnologia                            |
| ------------ | ------------------------------------- |
| Desktop      | Electron (.exe / .dmg / .AppImage)    |
| UI           | React + Vite                          |
| Engine       | Node.js + tree-sitter (offline)       |
| Índice       | SQLite (better-sqlite3) + FTS5        |
| Protocolo IA | MCP (Model Context Protocol) HTTP/SSE |
| CI           | GitHub Action + CLI headless          |

---

## Os 3 modos de uso

### 1. App Desktop

1. Abrir o TIC Analyzer
2. Selecionar a pasta raiz do projeto
3. Clicar em **Analisar**
4. Explorar as abas:

   * Visão Geral
   * Saúde
   * Explorador
   * Impacto
   * Métricas
   * Arquivos

Opcionalmente, inicie o MCP e conecte Claude Code ou Copilot ao índice local.

### 2. Servidor Compartilhado

```bash
tic-analyzer serve C:\Git\meu-projeto --host 0.0.0.0 --token segredo-do-time --watch 30
```

Permite que todo o time consulte o mesmo índice atualizado continuamente.

### 3. GitHub Action

```yaml
name: TIC PR Review

on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  tic:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: LeonardoForbici/tic-coder-lite@main
        with:
          gate: new-high-risks,health-drop:5
```

A Action:

1. Analisa base e head
2. Calcula impacto das mudanças
3. Detecta riscos novos
4. Publica review automática
5. Falha o pipeline caso algum gate seja violado

---

## CLI

```bash
tic-analyzer analyze <path>
tic-analyzer health <path>

tic-analyzer pr-review \
  --base <dir> \
  --head <dir>

tic-analyzer serve <path>
```

---

## O que o engine analisa

| Área                  | Detalhe                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| Grafo de dependências | AST real via tree-sitter, resolução de símbolos, imports, herança e DI  |
| Grafo de impacto      | Dependências entre frontend, backend, banco e integrações               |
| Banco de dados        | Procedures, functions, packages, triggers, views, lineage e acessos     |
| Monorepos             | Detecção automática de subprojetos frontend/backend                     |
| Health Score          | Dívida técnica, riscos, violações, acoplamento e código morto           |
| Qualidade             | Complexidade, hotspots, dependências circulares e padrões arquiteturais |
| Spring / Angular      | Transactions, jobs, módulos, permissões e OpenAPI                       |
| Busca                 | FTS5 e embeddings locais opcionais                                      |
| Incremental           | Reanálise apenas dos arquivos alterados                                 |

Tudo é persistido em:

```text
.tic-code/
├── index.db
├── analysis.json
├── snapshots.json
├── quick-context.md
└── modules/
```

---

## Dashboard

### Visão Geral

* Status da análise
* Health Score
* Status do MCP
* Consumo de tokens por tool

### Saúde

* Score 0–100
* Tendência histórica
* Penalidades por categoria

### Explorador

Navegação hierárquica:

```text
Aplicação
 ├─ Camadas
 │   ├─ Módulos
 │   │   ├─ Arquivos
 │   │   │   └─ Símbolos
```

Inspirado no CAST Imaging, escalando para dezenas de milhares de arquivos.

### Impacto

Análise cross-tier de qualquer entidade.

### Métricas

* Complexidade
* Hotspots
* Dívida técnica
* Violações arquiteturais

---

## Ferramentas MCP

### Impacto

| Tool                     | Descrição                   |
| ------------------------ | --------------------------- |
| get_blast_radius(entity) | Resumo rápido do impacto    |
| get_impact_of(entity)    | Impacto detalhado           |
| get_table_impact(table)  | Impacto de tabela ou coluna |
| get_diff_impact()        | Impacto do Git Diff         |
| get_impact(file)         | Dependentes de um arquivo   |

### Navegação

* trace_flow
* find_path
* get_graph_level
* search_code
* get_concept_map

### Contexto

* get_quick_context
* list_modules
* get_module
* search_module
* get_multigraph
* get_diagram

### Qualidade

* get_health
* get_metrics
* get_hotspots
* get_violations
* get_patterns
* get_inheritance
* get_dead_components

### Banco de Dados

* get_db_schema
* get_table_columns
* get_table_access
* get_plsql_object
* get_dead_plsql

### Regras e Contratos

* get_openapi
* get_permissions
* get_business_rules
* get_transactions
* get_batch_jobs
* get_angular_modules
* get_gaps
* get_analysis_json

---

## Fluxo Enterprise

```text
Dev → Commit

      ↓

GitHub Action
      ↓
Impacto + Riscos + Health

      ↓

Servidor TIC Analyzer
      ↓
Índice Compartilhado

      ↓

Claude Code / Copilot / IDEs
```

---

## Desenvolvimento

```bash
npm install

npm run dev

npm run verify
```

Suítes:

* semantic
* store
* crosstier
* orm
* impacto
* health
* pr-review
* serve
* embeddings

---

## Build

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

---

## Arquitetura

```text
electron/
    janela, IPC e lifecycle

src/
  analyzer/
      buildDependencyGraph
      buildImpactGraph
      computeHealthScore
      detectUiLinks

      store/
          indexDb
          impactQueries
          graphQueries
          snapshots

  cli/
      analyze
      health
      pr-review
      serve

  mcp/
      servidor MCP

  ui/
      dashboards
      explorador
      impacto

action.yml
```

---

## Filosofia

O TIC Analyzer não usa IA para entender seu sistema.

Ele constrói um modelo semântico completo do código localmente e expõe esse conhecimento através de um MCP.

A IA deixa de explorar milhares de arquivos às cegas e passa a consultar um mapa estruturado da aplicação antes de tomar qualquer decisão.
