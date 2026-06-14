# TIC Analyzer

**Analisador semântico de código e plataforma de governança de engenharia** — 100% local, zero tokens de IA na análise.

```
código (74k+ arquivos) → engine local → índice SQLite + resumos compactos → IA consulta o mínimo
```

A ideia central: o trabalho pesado (AST, grafos, impacto, métricas, regras) é feito por um engine determinístico na sua máquina. A IA (Claude Code, Copilot) **pergunta primeiro ao MCP** e só lê arquivos quando realmente precisa — gastando uma fração dos tokens.

---

## O que ele responde

- **"Se eu mexer aqui, o que quebra?"** — impacto de *qualquer* entidade: arquivo, método, procedure/function PL/SQL, tabela ou coluna, atravessando todas as camadas (coluna → trigger → procedure → DAO → endpoint → tela)
- **"Como esse fluxo funciona?"** — trace ponta-a-ponta tela → endpoint → service → procedure → tabela
- **"Esse PR é seguro?"** — review automático no GitHub com impacto, riscos novos, violações de regras de arquitetura e quality gates
- **"A arquitetura está derivando?"** — regras escritas pelo arquiteto validadas a cada análise e a cada PR (architecture drift)
- **"Onde nasce o próximo bug?"** — predição por churn do git × complexidade × acoplamento
- **"O projeto está saudável?"** — health score 0–100 (A–E) com tendência histórica
- **"O que precisa ser feito?"** — fila de triagem com máquina de estados e briefs prontos para agentes de IA

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
2. Explorar as abas: **Visão Geral · Saúde · Valor · Governança · Atividade · Explorador · Impacto · Métricas · Arquivos · Portfólio**
3. (Opcional) **Iniciar MCP** e configurar no `.claude/settings.json` do projeto analisado:

```json
{ "mcpServers": { "tic-analyzer": { "url": "http://localhost:7432/mcp" } } }
```

A análise também gera `CLAUDE.md` e `.github/copilot-instructions.md` no projeto analisado, ensinando a IA a usar o MCP antes de ler arquivos.

### 2. Modo servidor (enterprise — máquina dedicada para o time)

```bash
tic-analyzer serve /caminho/do/projeto --host 0.0.0.0 --token segredo-do-time --watch 30
```

- Analisa o projeto e sobe o MCP headless (sem janela)
- **File-watch reativo**: reage a *saves* (debounced, `--debounce 15`) e re-analisa sozinho — `--watch N` vira só rede de segurança periódica
- **Push ao vivo** em `GET /events` (SSE): dashboards e assistentes de IA recebem `analysis-complete` + eventos de atividade sem polling
- **Alertas outbound**: configure `alerts` no `.tic-rules.json` (Slack/webhook) — health caiu, risco crítico ou violação de regra disparam um POST na hora
- Em rede, `--token` (ou env `TIC_TOKEN`) é **obrigatório**: `Authorization: Bearer <token>` (ou `?token=` no `/events`); `/health` fica aberto para monitoramento
- Cada dev aponta o assistente de IA para a máquina dedicada — **todo o time consulta o MESMO índice**:

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
  issues: write          # apenas se usar create-issues
jobs:
  tic:
    runs-on: ubuntu-latest   # ou self-hosted (recomendado p/ repos grandes)
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: <org>/tic-coder-lite@main
        with:
          gate: new-high-risks,new-rule-violations,health-drop:5
          create-issues: 'true'   # gate falhou → issue bug/needs-triage com AGENT-BRIEF
```

A cada PR, a Action:
1. Analisa o **merge-base** e o **head** — a análise da base é **cacheada** (chaveada pelo SHA do merge-base; em self-hosted persiste em disco) e o engine é incremental
2. Posta **um comentário fixo** (atualizado a cada push) com: impacto cross-tier por arquivo mudado, riscos novos, violações de regras de arquitetura, risco preditivo dos arquivos tocados, delta do health e **perguntas de grilling**
3. **Reprova o check** se um gate falhar: `new-high-risks` · `new-violations` · `new-rule-violations` · `health-drop:N`
4. Com `create-issues`, gate reprovado vira **issue automática** com labels `bug`/`needs-triage` e corpo = AGENT-BRIEF completo

---

## Módulo de Governança de Engenharia

### Regras de arquitetura (`.tic-rules.json`)

O arquiteto declara o que não pode acontecer; a pipeline valida; o PR bloqueia o drift:

```json
{
  "rules": [
    { "id": "no-frontend-db", "severity": "error",
      "description": "Frontend nunca acessa o banco diretamente",
      "forbid": { "fromLayer": "frontend", "toLayer": "database" } },
    { "id": "sem-legado", "severity": "warn",
      "forbid": { "fromModule": "backend/novo", "toModule": "backend/legado" } },
    { "id": "camadas-por-path", "severity": "error",
      "forbid": { "fromPath": "app-frontend/**", "toPath": "**/repository/**" } }
  ],
  "outOfScope": [
    { "id": "multi-tenant", "decision": "Multi-tenancy fora do escopo atual",
      "reason": "Custo de migração não justifica", "date": "2026-01-15" }
  ],
  "alerts": {
    "slackWebhook": "https://hooks.slack.com/services/...",
    "webhook": "https://meu-endpoint/tic",
    "on": { "healthDrop": 5, "newCriticalRisk": true, "newRuleViolation": true }
  }
}
```

Regras por **camada** (frontend/backend/database), **módulo** ou **glob de path**. Violações `error` derrubam o health score e o gate `new-rule-violations`. Sem o arquivo, a análise gera um exemplo em `.tic-code/tic-rules.example.json`. O catálogo `outOfScope` registra decisões para o time não rediscutir. A seção `alerts` (opcional) dispara notificações outbound — ver "Sistema vivo".

### Manutenção preditiva

Cruza o churn do git (90 dias) com as métricas estáticas: **score 0–100 por arquivo** = churn (40%) + commits de fix (20%) + complexidade (20%) + acoplamento (20%), com motivos legíveis ("mudou 14× em 90 dias, 8 fixes, complexidade 32"). Arquivos de alto risco tocados num PR ganham flag no comentário.

### Valor & Custo (ROI) — o argumento que reduz tempo e dinheiro

Traduz a análise técnica em **tempo e dinheiro** para a liderança (aba **Valor**):
- **Custo da dívida**: débito técnico → horas → dev-days → moeda (`debtScore × hoursPerDebtPoint × hourlyRate`). Taxa-hora e moeda configuráveis em `.tic-rules.json` → `roi`.
- **Horas economizadas**: cada entidade cross-tier que um PR impactou e que não precisou ser rastreada à mão (estimativa conservadora) → horas/custo poupados.
- **Ownership & bus-factor** (autoria git): quem domina cada módulo, **conhecimento em risco** (arquivo crítico com 1 só autor — se a pessoa sair, dói), dificuldade de **onboarding** por módulo e **roteamento de revisor** de PR.
- **Relatório Executivo**: um clique gera um **PDF** (ou HTML) para a diretoria — saúde, tendência, custo da dívida, riscos e risco de conhecimento, em vocabulário de negócio.

```json
"roi": { "hourlyRate": 50, "currency": "US$", "hoursPerDebtPoint": 0.5 }
```

> Valores de tempo/custo são **estimativas transparentes** ancoradas no débito e na taxa-hora — não promessa contábil.

### Portfólio multi-projeto

Visão executiva **cross-repositório** (aba **Portfólio**): um registro global (`~/.tic-analyzer/portfolio.json`, ou `TIC_PORTFOLIO_DIR`) que cada análise — pelo app, CLI ou Action em CI — alimenta com um resumo compacto. O painel compara **saúde, riscos, drift e custo da dívida de todos os repositórios**, pior saúde no topo, com custo por projeto e ações de re-analisar/remover. Em CI, analisar N repositórios popula o mesmo painel; a tool MCP `get_portfolio` responde "qual repositório está pior?". `tic-analyzer portfolio [--json]` lista pela CLI.

### Skills de engenharia (fiéis a [mattpocock/skills](https://github.com/mattpocock/skills))

| Skill | Implementação no TIC |
|-------|---------------------|
| **triage** | Fila com máquina de estados (`needs-triage` → `needs-info`/`ready-for-agent`/`ready-for-human`/`wontfix`), 1 categoria + 1 estado por item, riscos e violações viram itens automaticamente (preservando triagem humana), **AGENT-BRIEF** no template exato da skill (Category · Summary · Current/Desired behavior · Key interfaces · Acceptance criteria · Out of scope) preenchido pelo grafo, e issue automática no PR |
| **diagnose** | `get_diagnosis(from, to)` devolve as 6 fases: feedback loop primeiro, reprodução pelo caminho do grafo, 3–5 hipóteses falsificáveis ("Se X é a causa, então mudar Y elimina o bug") ranqueadas por risco preditivo, instrumentação 1-a-1 com prefixo de log, fix+regressão e post-mortem |
| **improve-codebase-architecture** | Deletion test (módulos pass-through), interfaces rasas, god modules e circulares viram candidatos a *deepening* — com **relatório HTML** (cards Problem/Solution/Benefits + Top recommendation) gerado pelo app |
| **grill-with-docs** | Perguntas de grilling no PR nascidas de contradições do grafo, confrontadas com as docs geradas (regras de negócio por módulo, ADRs em `docs/adr/`, decisões out-of-scope) + sugestão quando a mudança atinge o limiar de ADR |
| **zoom-out** | `get_zoom_out()` = visão macro por fronteiras de domínio (Mermaid); `get_zoom_out(entity)` = onde aquela parte se encaixa: módulo dono, quem a chama, em vocabulário de domínio |

*Toda saída de triagem segue a regra da skill: começa com "This was generated by AI during triage."*

### Sistema vivo (event-driven, contínuo)

Em vez de só responder quando perguntado, o TIC observa, lembra e avisa:

- **Olhos** — file-watch reativo no modo `serve` e no app (toggle **🔴 Ao Vivo**): re-analisa sozinho quando você salva, debounced
- **Batimento** — `activity.json`: linha do tempo do que mudou a cada análise (health subiu/caiu, riscos novos, regras violadas, módulos add/removidos)
- **Aprendizado** — quando um arquivo marcado de alto risco depois recebe um commit de fix, registra `prediction-confirmed` e calcula a **taxa de acerto** do preditor (`prediction-accuracy.json`)
- **Voz interna** — push **SSE em `GET /events`**: a aba Atividade e os dashboards atualizam ao vivo; a IA assina via `get_activity` ("o que mudou recentemente?")
- **Voz externa** — alertas outbound (Slack + webhook JSON genérico + notificação desktop nativa) quando um limiar de `alerts` é cruzado

> A re-análise é **incremental**: arquivos não alterados reusam os símbolos AST cacheados (`symbol-cache.json`), pulando o tree-sitter — a fase mais cara. A resolução de referências roda sempre (é barata e cruza arquivos), então o grafo incremental é **idêntico** ao completo. No `serve`/Ao Vivo isso reduz a re-análise de minutos para segundos em repositórios grandes.

---

## Dashboard

- **Visão Geral** — números da análise + health score + status do MCP + tokens por tool
- **Saúde** — gauge do score (6 dimensões), KPIs com delta, tendência histórica
- **Governança** — 🎯 KPIs (Impact Score, Risk Level, Modules Analyzed, Architecture Drift) · 📊 tendência de impacto dos PRs + distribuição de dívida · 🔍 fila de triagem com transições de estado · 🏗️ compliance por regra de arquitetura · 📈 PRs recentes com blast radius e status de gate · botão de **relatório de arquitetura (HTML)**
- **Explorador** — drill-down hierárquico estilo CAST Imaging: aplicação → camadas → módulos → arquivos → símbolos; renderiza só o nível visível (74k arquivos ok) e o layout chega já assentado
- **Impacto** — cross-tier (qualquer entidade), por arquivo e por git diff
- **Métricas** — complexidade, dívida, hotspots, violações

---

## CLI

```bash
tic-analyzer analyze <path> [--json] [--no-ai-files]
tic-analyzer health <path>
tic-analyzer pr-review --base <dir> --head <dir> [--out report.md]
           [--gate new-high-risks,new-rule-violations,health-drop:5] [--brief-out brief.md]
tic-analyzer serve <path> [--port 7432] [--host 0.0.0.0] [--token <segredo>] [--watch <min>] [--debounce <seg>]
tic-analyzer report <path> [--out report.html]                                          # relatório executivo (HTML)
tic-analyzer portfolio [--json]                                                          # portfólio (todos os projetos analisados)
```

Exit codes do `pr-review`: `0` ok · `1` gate falhou · `2` erro. Cada execução registra em `.tic-code/pr-history.json` (alimenta o dashboard).

---

## O que o engine analisa (pipeline de 36 fases)

| Área | Detalhe |
|------|---------|
| **Grafo de dependências** | AST real via tree-sitter (TS/TSX/JS/Java) com resolução de símbolos: aliases de tsconfig (`@/...`), barris (`export ... from`) seguidos até a origem, DI (interface → implementador), `extends`/`implements`, method edges. Fallback regex p/ Python/Go/C#/Rust/PHP/Kotlin. Cada aresta tem `confidence: resolved \| inferred` — em engenharia reversa, isso diz no que confiar |
| **Grafo de impacto unificado** | Consolida imports, chamadas de método, HTTP (frontend→controller), backend→PL/SQL (`@Procedure`, `{call}`, `SimpleJdbcCall`...), PL/SQL→PL/SQL, triggers (`ON <tabela>`), sinônimos e acesso a tabela/coluna (ORM + SQL parseado) num único grafo endereçável: `file:` `method:` `plsql:` `table:` `column:` |
| **PL/SQL** | Procedures, functions, packages, triggers, views, sequences, sinônimos; tabelas lidas/escritas por objeto; chamadas inter-procedure; dead PL/SQL; lineage coluna-a-coluna |
| **Monorepo** | Pastas `<projeto>-backend` / `<projeto>-frontend` lado a lado viram subprojetos automaticamente (nomes curtos: `backend`, `frontend`), com camada frontend/backend/database **por arquivo** |
| **Governança** | Regras `.tic-rules.json` (drift), predição de risco, triagem (máquina de estados), candidatos a deepening, zoom-out executivo |
| **Health score** | 0–100, grade A–E, 6 dimensões: dívida/KLOC, riscos ponderados (OWASP), violações + drift, dead code, acoplamento, % de arestas heurísticas. Snapshots históricos |
| **Qualidade** | Complexidade ciclomática, hotspots, dívida técnica, dependências circulares, padrões arquiteturais, hierarquia de herança |
| **Spring/Angular** | `@Transactional`, `@Scheduled`/batch jobs, `@NgModule`/NgRx, permissões (roles × rotas), endpoints → OpenAPI 3.0 |
| **Busca** | FTS5 sempre ativa; embeddings locais opcionais (`TIC_EMBEDDINGS=1`, modelo ONNX ~25MB, 100% offline) |
| **Incremental** | file-cache por hash: re-análises só tocam o que mudou |

Artefatos em `.tic-code/` (gitignored): `index.db`, `analysis.json`, `snapshots.json`, `triage.json`, `pr-history.json`, `arch-violations.json`, `risk-prediction.json`, `zoom-out.md`, contextos por módulo e relatórios.

---

## As 50 ferramentas MCP

**Impacto (use primeiro):** `get_blast_radius` (resumo ~200 tokens — **comece por ele**) · `get_impact_of` · `get_table_impact` · `get_diff_impact` · `get_impact`

**Governança e skills:** `get_arch_rules` · `get_arch_suggestions` · `get_risk_prediction` · `get_agent_brief` · `get_diagnosis` · `get_zoom_out` · `get_out_of_scope` · `list_triage` · `update_triage`

**Navegação e fluxo:** `trace_flow` · `find_path` · `get_graph_level` · `search_code` · `get_concept_map`

**Contexto:** `get_quick_context` · `list_modules` · `get_module(detail)` · `search_module` · `get_multigraph(detail)` · `get_diagram`

**Valor & custo:** `get_roi` · `get_ownership` · `suggest_reviewers` · `get_portfolio`

**Qualidade e saúde:** `get_health` · `get_activity` (timeline do sistema vivo) · `get_metrics` · `get_hotspots` · `get_violations` · `get_patterns` · `get_inheritance` · `get_dead_components`

**Banco:** `get_db_schema` · `get_table_columns` · `get_table_access` · `get_plsql_object` · `get_dead_plsql`

**Specs e regras:** `get_openapi` · `get_permissions` · `get_business_rules` · `get_transactions` · `get_batch_jobs` · `get_angular_modules` · `get_gaps` · `get_analysis_json`

Todas leem o `index.db` e respondem compacto, com truncamento explícito — a IA nunca fica cega.

---

## Fluxo "da detecção à tarefa pronta"

```
análise ──► risco/violação detectada ──► item bug · needs-triage na fila
PR ──► gate falhou ──► issue automática com AGENT-BRIEF completo
humano (ou IA) ──► triagem: ready-for-agent
agente ──► get_agent_brief(id) ──► implementa com acceptance criteria verificáveis
```

E o ciclo macro:

```
dev commita ──► Action (cache incremental) ──► comentário + grilling + gates no PR
máquina dedicada ──► serve --watch ──► MCP único para todo o time
dashboard ──► saúde, drift, triagem e PRs ao longo do tempo
```

---

## Desenvolvimento

```bash
npm install
npm run dev          # Vite (5173) + Electron

npm run verify       # build + 10 suítes: semantic, store, crosstier, orm,
                     # impacto, health, pr-review, serve, governança, embeddings
```

> ⚠️ **Nunca rode `rebuild:electron` em CI** — recompila o better-sqlite3 para a ABI do Electron e quebra a execução em Node puro.

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
  analyzer/          engine puro Node (zero IA): pipeline de 36 fases
    buildDependencyGraph   AST tree-sitter + resolução de símbolos
    buildImpactGraph       grafo de impacto unificado cross-tier
    computeHealthScore     health 0-100 em 6 dimensões
    checkArchRules         regras .tic-rules.json + deepening candidates + HTML
    computeRiskPrediction  churn git × complexidade × acoplamento
    generateZoomOut        visão executiva por fronteiras de domínio
    store/
      indexDb              index.db SQLite (files/edges/symbols/impact_edges/modules/FTS5)
      impactQueries        BFS reverso cross-tier
      graphQueries         agregação hierárquica (layer → module → file → symbol)
      snapshots            histórico de health
      triageStore          fila de triagem (máquina de estados da skill)
  cli/               headless: analyze / health / pr-review / serve
  mcp/               MCP Server HTTP/SSE (50 tools, auth Bearer, push SSE /events, agent briefs)
  ui/                React: Health, Governança, Explorador, Impacto
action.yml           GitHub Action (PR review, cache incremental, issues de triagem)
```

Créditos: as skills de engenharia implementam os processos de [mattpocock/skills](https://github.com/mattpocock/skills).
