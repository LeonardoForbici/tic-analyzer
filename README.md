# TIC Analyzer

**Analisador semântico de código para projetos grandes** — estilo CAST Imaging, 100% local, zero tokens de IA na análise.

```
código (74k+ arquivos) → engine local → índice SQLite + resumos compactos → IA consulta o mínimo
```

A ideia central: o trabalho pesado (AST, grafos, impacto, métricas) é feito por um engine determinístico na sua máquina. A IA (Claude Code, Copilot) **pergunta primeiro ao MCP** e só lê arquivos quando realmente precisa — gastando uma fração dos tokens.

---

## O que ele responde

- **"Se eu mexer aqui, o que quebra?"** — impacto de *qualquer* entidade: arquivo, método Java, procedure/function PL/SQL, tabela, coluna ou tela `.osw`, atravessando todas as camadas (coluna → trigger → procedure → DAO Java → endpoint → tela React → `.osw`)
- **"Como esse fluxo funciona?"** — trace ponta-a-ponta tela → endpoint → service → procedure → tabela
- **"O projeto está saudável?"** — health score 0–100 (grade A–E) com tendência histórica entre análises
- **"Esse PR é seguro?"** — review automático no GitHub com impacto, riscos novos e quality gates

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Desktop | Electron (.exe / .dmg / .AppImage) |
| UI | React + Vite (canvas próprio, sem libs de grafo) |
| Engine | Node.js puro + tree-sitter (WASM, offline) |
| Índice | SQLite (better-sqlite3) + FTS5 |
| Protocolo IA | MCP (Model Context Protocol) HTTP/SSE |
| CI | GitHub Action composite + CLI headless |

---

## Os 3 modos de uso

### 1. App desktop (dev individual)

1. Abrir o TIC Analyzer → selecionar a pasta raiz do projeto → **Analisar**
2. Explorar as abas: **Visão Geral · Saúde · Explorador · Impacto · Métricas · Arquivos**
3. (Opcional) **Iniciar MCP** e configurar no `.claude/settings.json` do projeto analisado:

```json
{ "mcpServers": { "tic-analyzer": { "url": "http://localhost:7432/mcp" } } }
```

A análise também gera `CLAUDE.md` e `.github/copilot-instructions.md` no projeto analisado, ensinando a IA a usar o MCP antes de ler arquivos.

### 2. Modo servidor (enterprise — máquina dedicada para o time)

```bash
tic-analyzer serve C:\Git\meu-projeto --host 0.0.0.0 --token segredo-do-time --watch 30
```

- Analisa o projeto e sobe o MCP headless (sem janela)
- `--watch 30` re-analisa **incrementalmente** a cada 30 min — índice sempre fresco
- Em rede, `--token` (ou env `TIC_TOKEN`) é **obrigatório**: toda chamada exige `Authorization: Bearer <token>`; `/health` fica aberto para monitoramento
- Cada dev aponta o Claude Code para a máquina dedicada — **todo o time consulta o MESMO índice**:

```json
{ "mcpServers": { "tic-analyzer": { "url": "http://maquina-dedicada:7432/mcp", "headers": { "Authorization": "Bearer segredo-do-time" } } } }
```

### 3. GitHub Action (PR review automático)

No repositório do **seu projeto**, crie `.github/workflows/tic-review.yml`:

```yaml
name: TIC PR Review
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  tic:
    runs-on: ubuntu-latest   # ou self-hosted (recomendado p/ repos grandes)
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: LeonardoForbici/tic-coder-lite@main
        with:
          gate: new-high-risks,health-drop:5
```

A cada PR, a Action:
1. Analisa o **merge-base** (como o main estava) e o **head** (com suas mudanças) — a análise da base é **cacheada** (chaveada pelo SHA do merge-base; em self-hosted persiste em disco) e o engine é incremental, então só o que mudou é re-analisado
2. Posta **um comentário fixo** (atualizado a cada push, nunca spam) com: impacto cross-tier por arquivo mudado, riscos novos, violações arquiteturais novas e delta do health score
3. **Reprova o check** se um gate falhar — `new-high-risks`, `new-violations`, `health-drop:N` (ou vazio para só comentar)

---

## CLI

```bash
tic-analyzer analyze <path> [--json] [--no-ai-files]   # análise completa headless
tic-analyzer health <path>                              # health score da última análise
tic-analyzer pr-review --base <dir> --head <dir>        # compara duas análises (usada pela Action)
           [--out report.md] [--gate new-high-risks,health-drop:5]
tic-analyzer serve <path> [--port 7432] [--host 0.0.0.0]
           [--token <segredo>] [--watch <min>] [--no-analyze]
```

Exit codes do `pr-review`: `0` ok · `1` gate falhou · `2` erro.

---

## O que o engine analisa (pipeline de 32 fases)

| Área | Detalhe |
|------|---------|
| **Grafo de dependências** | AST real via tree-sitter (TS/TSX/JS/Java) com resolução de símbolos: aliases de tsconfig (`@/...`), barris (`export ... from`) seguidos até a origem, Java DI (interface → implementador), `extends`/`implements`, method edges Java. Fallback regex p/ Python/Go/C#/Rust/PHP/Kotlin. Cada aresta tem `confidence: resolved \| inferred` — em engenharia reversa, isso diz no que confiar |
| **Grafo de impacto unificado** | Consolida imports, chamadas de método, HTTP (React→Controller), Java→PL/SQL (`@Procedure`, `{call}`, `SimpleJdbcCall`...), PL/SQL→PL/SQL, triggers (`ON <tabela>`), sinônimos, acesso a tabela/coluna (ORM + SQL parseado) e telas `.osw` num único grafo endereçável: `file:` `method:` `plsql:` `table:` `column:` |
| **Telas .osw** | JSON de tela do frontend vinculado ao controller por convenção (`kitAssembly.osw` → `KitAssemblyController.tsx`) e por conteúdo (strings do JSON casadas com arquivos/símbolos reais do projeto) |
| **PL/SQL** | Procedures, functions, packages, triggers, views, sequences, sinônimos; tabelas lidas/escritas por objeto; chamadas inter-procedure; dead PL/SQL; lineage coluna-a-coluna |
| **Monorepo** | Pastas `<projeto>-backend` / `<projeto>-frontend` lado a lado viram subprojetos automaticamente (nomes curtos: `backend`, `frontend`), com camada frontend/backend/database **por arquivo** |
| **Health score** | 0–100, grade A–E, 6 dimensões: dívida/KLOC, riscos ponderados (OWASP), violações arquiteturais, dead code, acoplamento, % de arestas heurísticas. Snapshots históricos em `snapshots.json` |
| **Qualidade** | Complexidade ciclomática, hotspots, dívida técnica, dependências circulares, violações de camada, padrões arquiteturais (Repository, Service, Factory...), hierarquia de herança |
| **Spring/Angular** | `@Transactional` (propagation/readOnly/rollbackFor), `@Scheduled`/batch jobs, `@NgModule`/lazy routes/NgRx, permissões (roles × rotas), endpoints → OpenAPI 3.0 |
| **Busca** | FTS5 sempre ativa; embeddings locais opcionais (`TIC_EMBEDDINGS=1`, modelo ONNX ~25MB, 100% offline) |
| **Incremental** | file-cache por hash: re-análises só tocam o que mudou |

Tudo persistido em `.tic-code/` (gitignored): `index.db` (SQLite — fonte de verdade das queries), `quick-context.md` (~12k tokens), `modules/*/context.md`, `analysis.json`, `snapshots.json` e relatórios markdown.

---

## Dashboard (Electron)

- **Visão Geral** — números da análise + health score + status do MCP + tokens gastos por tool em tempo real
- **Saúde** — gauge do score, barras de penalidade por dimensão, KPIs com delta vs análise anterior e gráfico de tendência histórica
- **Explorador** — drill-down hierárquico estilo CAST Imaging: aplicação → camadas → módulos → arquivos → símbolos. Duplo-clique expande, breadcrumb colapsa, raio do nó ∝ nº de filhos, peso da aresta = nº de dependências agregadas, cor verde→âmbar pela fração resolvida por AST. Renderiza só o nível visível (funciona com 74k arquivos) e o layout chega **já assentado** — a física roda invisível antes do primeiro frame
- **Impacto** — modo Cross-tier (qualquer entidade: procedure, tabela, coluna, arquivo), modo Arquivo e modo Git Diff
- **Métricas** — complexidade, dívida técnica, hotspots e violações

---

## As 36 ferramentas MCP

**Impacto (o diferencial — use primeiro):**

| Tool | Para quê |
|------|----------|
| `get_blast_radius(entity)` | Resumo ultra-compacto (~200 tokens): contagens por tipo/módulo + top críticos. **Use ANTES de tudo** |
| `get_impact_of(entity)` | Impacto detalhado de arquivo/método/procedure/tabela/coluna, agrupado por profundidade e módulo |
| `get_table_impact(table[, column])` | Atalho: quem é afetado por mudar a tabela/coluna |
| `get_diff_impact()` | Impacto cross-tier de tudo que está no git diff (use antes de commitar) |
| `get_impact(file)` | Dependentes de um arquivo (modo simples, só imports) |

**Navegação e fluxo:** `trace_flow` (cadeia tela→endpoint→service→procedure→tabela) · `find_path` (caminho entre dois arquivos) · `get_graph_level` (grafo hierárquico agregado, mesmo dado do Explorador) · `search_code` (FTS5/vetorial) · `get_concept_map`

**Contexto:** `get_quick_context` (~12k tokens, ponto de partida) · `list_modules` · `get_module(name, detail=summary|full)` · `search_module` · `get_multigraph(detail)` · `get_diagram`

**Qualidade e saúde:** `get_health` (score + delta vs análise anterior) · `get_metrics` · `get_hotspots` · `get_violations` · `get_patterns` · `get_inheritance` · `get_dead_components`

**Banco e PL/SQL:** `get_db_schema` · `get_table_columns` (lineage de coluna) · `get_table_access` · `get_plsql_object` · `get_dead_plsql`

**Specs e regras:** `get_openapi` · `get_permissions` · `get_business_rules` · `get_transactions` · `get_batch_jobs` · `get_angular_modules` · `get_gaps` · `get_analysis_json`

Todas as tools leem o `index.db` e respondem compacto, com truncamento explícito (`truncated` + como pedir mais) — a IA nunca fica cega.

---

## Fluxo enterprise completo

```
dev commita ──► GitHub Action (runner ou self-hosted, cache incremental da base)
                  └─► comenta impacto/riscos/health no PR + gate bloqueia regressão

máquina dedicada ──► tic-analyzer serve --host 0.0.0.0 --token ... --watch 30
                  └─► MCP servindo o MESMO índice para todos os devs/IAs do time

dashboard ──► tendência de health ao longo do tempo (1 snapshot por análise)
```

---

## Desenvolvimento

```bash
npm install
npm run dev          # Vite (5173) + Electron

npm run verify       # build + 9 suítes de verificação:
                     # semantic, store, crosstier, orm, impacto,
                     # health, pr-review, serve, embeddings
```

> ⚠️ **Nunca rode `rebuild:electron` em CI** — recompila o better-sqlite3 para a ABI do Electron e quebra a execução em Node puro. O `npm ci` usa os prebuilds Node.

## Build de distribuição

```bash
npm run dist:win     # → release/TIC Analyzer Setup.exe
npm run dist:mac     # → release/TIC Analyzer.dmg
npm run dist:linux   # → release/TIC Analyzer.AppImage
```

---

## Arquitetura

```
electron/            processo principal (janela, IPC, lifecycle do MCP)
src/
  analyzer/          engine puro Node (zero IA): pipeline de 32 fases
    buildDependencyGraph   AST tree-sitter + resolução de símbolos
    buildImpactGraph       grafo de impacto unificado cross-tier
    computeHealthScore     score 0-100 em 6 dimensões
    detectOswLinks         telas .osw → controllers
    store/
      indexDb              index.db SQLite (files/edges/symbols/impact_edges/modules/FTS5)
      impactQueries        BFS reverso cross-tier (queryImpactOf / queryBlastRadius)
      graphQueries         agregação hierárquica (layer → module → file → symbol)
      snapshots            histórico de health entre análises
  cli/               headless: analyze / health / pr-review / serve
  mcp/               MCP Server HTTP/SSE (36 tools, token tracking, auth Bearer)
  ui/                React: HealthDashboard, HierGraphViewer, abas
action.yml           GitHub Action (PR review com cache incremental da base)
```
