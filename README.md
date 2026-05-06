# TIC Coder Lite — Interface VS Code para Reversa Engine

TIC Coder Lite é uma extensão VS Code que fornece uma interface gráfica local-first para o **Reversa Engine** — um motor de programação reversa que transforma sistemas legados em especificações executáveis.

Ele escaneia o projeto aberto, constrói um grafo de arquitetura leve, detecta riscos determinísticos e usa a metodologia de SDD e agentes do Reversa para gerar documentação operacional em `.tic-code/`.

O contexto gerado pode ser exportado para ferramentas como Codex, Claude Code, GitHub Copilot, Cursor, Gemini CLI e modelos Ollama locais.

TIC Coder Lite está preparado para demos locais e empacotamento `.vsix`. Ainda não é publicado no Marketplace.

## O que é o Reversa Engine?

O Reversa Engine (adaptado de Reversa by Sandeco, MIT) é uma metodologia de programação reversa com:

- **7 Agentes de IA**: Scout, Archaeologist, Detective, Architect, Writer, Reviewer, Data Master
- **Escala de Confiança**: 🟢 CONFIRMADO, 🟡 INFERIDO, 🔴 LACUNA
- **Especificações Executáveis**: SDD (Sistema de Documentação de Domínio)
- **Contratos Operacionais**: Regras extraídas, permissões, fluxos, SQL/PL-SQL
- **Rastreabilidade**: Matriz código ↔ spec, impacto de riscos

## TIC Coder Lite ≠ Reversa CLI

- **Reversa CLI**: Executável `npx reversa` — standalone reverse engineering tool
- **TIC Coder Lite**: Extensão VS Code — interface gráfica que **usa o Reversa Engine como motor**

TIC Coder Lite não instala, executa ou depende do Reversa CLI. Ele **incorpora os agentes, templates e metodologia** do Reversa como um motor embutido.

## Capturas de Tela

Capturas de demo podem ser gravadas após iniciar o Extension Development Host. Arquivos de placeholder estão incluídos para futuras screenshots:

- `docs/screenshots/overview-placeholder.svg`
- `docs/screenshots/graph-placeholder.svg`
- `docs/screenshots/context-placeholder.svg`

## Os Três Modos

### 1. ⚡ Modo Lite

Modo Lite funciona sem IA.

- Scanner de workspace determinístico
- Detecção de stack e arquitetura por convenção
- Grafo leve de imports e referências de packages
- Detector de riscos determinístico
- Geração de contexto `.tic-code/`
- Sem banco de dados
- Sem Docker
- Sem servidor
- Sem Ollama
- Sem runtime de IA

Use este modo quando quer um inventário de projeto rápido e local antes de editar código.

### 2. 🤖 Modo IA Padrão

Modo IA Padrão exporta contexto TIC Coder Lite para as ferramentas de codificação com IA já usadas pelo desenvolvedor.

- Codex lê `AGENTS.md`
- Claude Code lê `CLAUDE.md`
- GitHub Copilot lê `.github/copilot-instructions.md`
- Cursor lê `.cursorrules`
- Gemini CLI lê `GEMINI.md`
- Aider pode ler `CONVENTIONS.md`

Todos os arquivos de agente gerados instruem o assistente a ler:

- `.tic-code/agent-context.md`
- `.tic-code/risks.md`
- `.tic-code/architecture.md`
- `.tic-code/confidence-report.md`
- `.tic-code/questions.md`

Arquivos existentes são tratados com segurança. TIC Coder Lite pode perguntar, adicionar uma seção marcada TIC Coder Lite ou ignorar o arquivo dependendo de `ticCoderLite.exports.safeWriteMode`. Nunca deleta arquivos do projeto.

### 3. 🧠 Modo IA Local

Modo IA Local é opcional e usa Ollama apenas quando habilitado.

- URL padrão: `http://localhost:11434`
- Nenhum modelo é baixado automaticamente
- Pode ser desabilitado a qualquer momento
- Modo Lite continua funcionando se Ollama estiver offline

#### Seleção Automática de Modelo

O Modo IA Local seleciona o modelo certo para cada tarefa:

| Tarefa | Modo `auto` |
|--------|-------------|
| Resumo de módulos | `fastModel` |
| Explicação de riscos | `fastModel` |
| Perguntas e lacunas | `fastModel` |
| Contexto para IA | `fastModel` |
| Análise PL/SQL | `qualityModel` |
| Regras de negócio | `qualityModel` |
| Análise de domínio | `qualityModel` |
| Máquinas de estado | `qualityModel` |
| Permissões | `qualityModel` |
| Arquivos críticos | `qualityModel` |

**Fallback automático:**
- Se `qualityModel` não estiver instalado, usa `fastModel`
- Se `fastModel` não estiver instalado, exibe mensagem amigável com instrução de instalação
- Nunca baixa modelos automaticamente

**Modos de seleção** (`ticCoderLite.localAi.mode`):
- `auto` (padrão) — escolhe o modelo certo para cada tarefa
- `fast` — usa sempre `fastModel`
- `quality` — usa sempre `qualityModel`

Modo IA Local pode gerar:

- `.tic-code/agent-context.ai.md`
- `.tic-code/questions.ai.md`
- `.tic-code/module-summaries.ai.md`

## Como Executar Localmente

Instale as dependências:

```bash
npm install
```

Compile a extensão:

```bash
npm run compile
```

Abra esta pasta no VS Code:

```bash
code .
```

Pressione `F5` para iniciar um Extension Development Host. Na nova janela VS Code, abra um projeto que deseja analisar e execute comandos da Paleta de Comandos.

## Como Analisar um Workspace

1. Abra uma pasta de workspace no Extension Development Host.
2. Execute `TIC Coder Lite: Analisar Workspace (Modo Lite)`.
3. Aguarde a conclusão da notificação de progresso.
4. Abra a visualização da barra de atividades TIC Coder Lite ou execute `TIC Coder Lite: Abrir Visão Geral`.
5. Revise os arquivos `.tic-code/` gerados.

Workspaces grandes são digitalizados com notificações de progresso, suporte a cancelamento, limites de contagem de arquivos, limites de tamanho de arquivo, evitação de arquivos binários, logs úteis e um cache incremental simples baseado em tempo modificado de `.tic-code/scan.json`.

Os logs são escritos no Canal de Saída denominado `TIC Coder Lite`.

## Programação Reversa / SDD

TIC Coder Lite usa o **motor Reversa embutido** como base completa de programação reversa. O Reversa by Sandeco (MIT) é incorporado em `resources/reversa/` e adaptado para funcionar como extensão VS Code.

**TIC Coder Lite NÃO é o Reversa CLI.** É uma extensão VS Code que usa o motor/metodologia do Reversa adaptado internamente.

### Saída principal

```
.tic-code/reversa/              — estado do motor Reversa
├── state.json                  — fases, checkpoints, status
├── config.json                 — configuração da análise
├── plan.md                     — plano de programação reversa
├── version                     — versão do motor
├── context/
│   ├── surface.json            — mapeamento de superfície
│   ├── modules.json            — módulos detectados
│   ├── graph.json              — grafo de dependências
│   ├── risks.json              — riscos detectados
│   └── workspace-summary.json  — resumo compacto
└── _config/
    ├── manifest.yaml           — configuração do motor
    └── sdd-template.md         — template SDD

.tic-code/reverse-engineering/  — especificações extraídas (equivalente ao _reversa_sdd/)
├── inventory.md                — inventário (Scout)
├── dependencies.md             — dependências
├── code-analysis.md            — módulos e acoplamento (Archaeologist)
├── data-dictionary.md          — dicionário de dados
├── domain.md                   — domínio (Detective)
├── state-machines.md           — máquinas de estado
├── permissions.md              — permissões e papéis
├── business-rules.md           — regras de negócio candidatas
├── operational-contracts.md    — contratos operacionais por módulo
├── architecture.md             — arquitetura (Architect)
├── c4-context.md               — diagrama C4 contexto
├── c4-containers.md            — diagrama C4 containers
├── c4-components.md            — diagrama C4 componentes
├── erd-complete.md             — ERD completo
├── confidence-report.md        — relatório de confiança (Reviewer)
├── gaps.md                     — lacunas 🔴
├── questions.md                — perguntas para validação humana
├── dynamic.md                  — análise dinâmica
├── sdd/                        — specs detalhadas por componente
├── openapi/                    — contratos OpenAPI
├── user-stories/               — user stories
├── adrs/                       — Architecture Decision Records
├── flowcharts/                 — diagramas de fluxo
├── sequences/                  — diagramas de sequência
├── ui/                         — specs de interface
├── database/                   — análise de banco
├── design-system/              — design system
└── traceability/
    ├── code-spec-matrix.md     — código ↔ spec
    ├── risk-impact-matrix.md   — risco ↔ impacto
    └── spec-impact-matrix.md   — spec ↔ componentes
```

### Pipeline Reversa Engine

| Fase | Agente | Tipo |
| --- | --- | --- |
| **Scout** | reversa-scout | ✅ Determinístico |
| **Archaeologist** | reversa-archaeologist | 🔄 Parcial |
| **Detective** | reversa-detective | ⏳ Requer IA |
| **Architect** | reversa-architect | 🔄 Parcial |
| **Writer** | reversa-writer | 🔄 Parcial |
| **Reviewer** | reversa-reviewer | ✅ Determinístico |
| **Data Master** | reversa-data-master | 🔄 Se PL/SQL detectado |

### Escala de Confiança (Reversa)

Toda afirmação gerada é marcada com um dos seguintes níveis:

| Nível | Significado |
| --- | --- |
| 🟢 CONFIRMADO | Extraído diretamente do código, SQL, anotação, import, PL/SQL, endpoint ou arquivo |
| 🟡 INFERIDO | Deduzido por nome de classe, pasta, padrão arquitetural ou relacionamento no grafo |
| 🔴 LACUNA | Não confirmável pelo código — exige validação humana |

### Exemplo de saída

```markdown
## Regras Candidatas — Faturamento

### BR-1: Acesso a FaturaController requer autorização (@PreAuthorize) 🟢 CONFIRMADO
Evidências:
- financeiro/FaturaController.java

### BR-2: Operação de negócio detectada: calcularJuros em BoletoService 🟡 INFERIDO
Evidências:
- financeiro/BoletoService.java

## Lacunas

### GAP-3: Triggers detectadas — regras de negócio no banco podem não estar documentadas 🔴 LACUNA
Pergunta: Quais regras de negócio cada trigger implementa?
```

### Cobertura por tipo de projeto

| Tipo | Artefatos gerados |
| --- | --- |
| Java/Spring | Controllers, services, endpoints, permissões, entities, DTOs |
| TypeScript/Frontend | Componentes, hooks, services, páginas |
| Oracle PL/SQL | Packages, procedures, triggers, tabelas, dependências |
| Docker/Infra | Evidências de infraestrutura |
| Banco de dados | Tabelas, views, migrations, SQL |

### Inspiração metodológica

A camada de Programação Reversa do TIC Coder Lite foi inspirada nos agentes do **Reversa by Sandeco (MIT)**:

- **Scout** → `inventory.md` e `dependencies.md`
- **Archaeologist** → `code-analysis.md`
- **Detective** → `domain.md`, `business-rules.md`, `state-machines.md`, `permissions.md`
- **Architect** → `architecture.md`
- **Writer** → `api-contracts.md`, `data-dictionary.md`
- **Reviewer** → `confidence-report.md`, `gaps.md`, `questions.md`
- **Data Master** → `database-analysis.md`, `plsql-analysis.md`

> **Importante:** O TIC Coder Lite não é uma CLI Reversa nem um fork do Reversa. É uma extensão VS Code independente com inspiração metodológica, que grava em `.tic-code` (não em `.reversa`), funciona sem IA obrigatória e mantém créditos ao Reversa.

### Instruções para agentes de IA

Antes de alterar código em workspaces analisados pelo TIC Coder Lite:

1. Leia `.tic-code/reverse-engineering/inventory.md`
2. Leia `.tic-code/reverse-engineering/architecture.md`
3. Consulte `.tic-code/reverse-engineering/business-rules.md` — 🟡 INFERIDO exige validação
4. Verifique `.tic-code/reverse-engineering/gaps.md` para 🔴 LACUNAS
5. Use `.tic-code/reverse-engineering/traceability/` para rastrear código ↔ spec ↔ risco
6. Em projetos PL/SQL: leia `plsql-analysis.md` antes de alterar qualquer tabela referenciada por trigger

## Detecção de Subprojetos

TIC Coder Lite detecta automaticamente subprojetos reais dentro do seu workspace:

- **Backend**: `pom.xml`, `build.gradle`, `src/main/java`, `application.yml`, `application.properties`
- **Frontend**: `vite.config.ts`, `next.config.js`, `angular.json`, `src/App.tsx`, `package.json` (React/Vue/Angular/Next)
- **Mobile**: `react-native.config.js`, `app.json` (Expo), `android/`, `ios/`, `pubspec.yaml` (Flutter)
- **Database / PL/SQL**: `db/`, `database/`, `sql/`, arquivos `.sql`, `.pks`, `.pkb`, `.prc`, `.fnc`, `.trg`
- **Infraestrutura**: `Dockerfile`, `docker-compose.yml`, `k8s/`, `helm/`, `terraform/`, `.github/workflows/`
- **Shared / Libs**: `libs/`, `packages/`, `shared/`, `package.json` com escopo de biblioteca

Gera artefatos separados por projeto dentro de `.tic-code/projects/{projectId}/`.

## Arquivos Gerados

Modo Lite gera (globais):

- `.tic-code/workspace-summary.json`
- `.tic-code/scan.json`
- `.tic-code/modules.json`
- `.tic-code/inventory.md`
- `.tic-code/graph.json`
- `.tic-code/architecture.md`
- `.tic-code/risks.json`
- `.tic-code/risks.md`
- `.tic-code/agent-context.md`
- `.tic-code/confidence-report.md`
- `.tic-code/questions.md`

E por projeto em `.tic-code/projects/{projectId}/`:

- `scan.json`
- `graph.json`
- `risks.json`
- `agent-context.md`
- `reverse-engineering/` (mesma estrutura global, filtrada por projeto)

Modo IA Padrão pode gerar:

- `AGENTS.md`
- `CLAUDE.md`
- `.github/copilot-instructions.md`
- `.cursorrules`
- `GEMINI.md`
- `CONVENTIONS.md`
- `.tic-code/created-files.json`

Modo IA Local pode gerar:

- `.tic-code/agent-context.ai.md`
- `.tic-code/questions.ai.md`
- `.tic-code/module-summaries.ai.md`

## Usando com Codex

1. Execute `TIC Coder Lite: Analisar Workspace (Modo Lite)`.
2. Execute `TIC Coder Lite: Exportar para Codex (Modo IA Padrão)`.
3. Abra `AGENTS.md`.
4. Peça a Codex para ler `AGENTS.md` e os arquivos `.tic-code/` referenciados antes de alterar o código.

## Usando com Claude Code

1. Execute `TIC Coder Lite: Analisar Workspace (Modo Lite)`.
2. Execute `TIC Coder Lite: Exportar para Claude (Modo IA Padrão)`.
3. Claude Code deve ler `CLAUDE.md` e depois os arquivos `.tic-code/` de contexto gerados.

## Usando com GitHub Copilot

1. Execute `TIC Coder Lite: Analisar Workspace (Modo Lite)`.
2. Execute `TIC Coder Lite: Exportar para Copilot (Modo IA Padrão)`.
3. Revise `.github/copilot-instructions.md`.
4. Copilot pode usar esse arquivo como orientação de projeto dentro do VS Code e fluxos de trabalho do GitHub.

## Usando com Cursor

1. Execute `TIC Coder Lite: Analisar Workspace (Modo Lite)`.
2. Execute `TIC Coder Lite: Exportar para Cursor (Modo IA Padrão)`.
3. Revise `.cursorrules`.
4. Cursor deve usar a orientação gerada antes de fazer edições de projeto.

## Usando com Ollama (Opcional)

1. Instale e inicie Ollama localmente.
2. Puxe o modelo fast (mínimo) manualmente:

```bash
ollama pull qwen2.5-coder:3b
```

3. Puxe o modelo quality (opcional, para tarefas complexas):

```bash
ollama pull qwen2.5-coder:7b
```

4. Nas configurações do VS Code, habilite `ticCoderLite.localAi.enabled`.
5. Execute `TIC Coder Lite: Melhorar com IA Local (Modo IA Local)`.

A WebView exibe uma tabela mostrando qual modelo foi usado em cada tarefa.

Se Ollama estiver offline, TIC Coder Lite mostra uma mensagem amigável e Modo Lite permanece totalmente utilizável.

## Comandos

- `TIC Coder Lite: Analisar Workspace (Modo Lite)`
- `TIC Coder Lite: Abrir Visão Geral`
- `TIC Coder Lite: Gerar Contexto para IA (Modo Lite)`
- `TIC Coder Lite: Detectar Ferramentas de IA (Modo IA Padrão)`
- `TIC Coder Lite: Exportar AGENTS.md (Modo IA Padrão)`
- `TIC Coder Lite: Exportar para Codex (Modo IA Padrão)`
- `TIC Coder Lite: Exportar para Claude (Modo IA Padrão)`
- `TIC Coder Lite: Exportar para Copilot (Modo IA Padrão)`
- `TIC Coder Lite: Exportar para Cursor (Modo IA Padrão)`
- `TIC Coder Lite: Exportar para Gemini (Modo IA Padrão)`
- `TIC Coder Lite: Melhorar com IA Local (Modo IA Local)`

## Configurações

- `ticCoderLite.scan.maxFiles`
- `ticCoderLite.scan.maxFileSizeKb`
- `ticCoderLite.scan.include`
- `ticCoderLite.scan.exclude`
- `ticCoderLite.localAi.enabled`
- `ticCoderLite.localAi.ollamaUrl`
- `ticCoderLite.localAi.fastModel` (padrão: `qwen2.5-coder:3b`)
- `ticCoderLite.localAi.qualityModel` (padrão: `qwen2.5-coder:7b`)
- `ticCoderLite.localAi.mode` (`auto` | `fast` | `quality`, padrão: `auto`)
- `ticCoderLite.localAi.model` (legado)
- `ticCoderLite.output.openAfterScan`
- `ticCoderLite.exports.safeWriteMode`
- `ticCoderLite.database.largeMode` (padrão: `true`)
- `ticCoderLite.database.maxVisualNodes` (padrão: `300`)
- `ticCoderLite.database.maxTablesInGraph` (padrão: `100`)
- `ticCoderLite.database.maxCriticalTables` (padrão: `200`)
- `ticCoderLite.database.enableTableIndex` (padrão: `true`)
- `ticCoderLite.database.criticalNamePatterns` (lista opcional)
- `ticCoderLite.database.maxSqlFiles` (padrão: `100000`)

## Estrutura de Artefatos

Cada análise gera uma estrutura hierárquica:

```
.tic-code/
  workspace-summary.json          # Resumo global do workspace
  scan.json                       # Resultado do scan global
  graph.json                      # Grafo de dependências global
  risks.json                      # Riscos globais
  agent-context.md                # Contexto para IA (global)
  confidence-report.md            # Relatório de confiança
  questions.md                    # Perguntas para IA
  projects/
    backend/
      scan.json
      graph.json
      risks.json
      agent-context.md
    frontend/
      scan.json
      graph.json
      risks.json
      agent-context.md
    mobile/
      ...
    database/
      ...
    infra/
      ...
    shared/
      ...
```

## Garantias do TIC Coder Lite

- ✓ Sem banco de dados externo necessário
- ✓ Sem Docker necessário
- ✓ Sem servidor necessário
- ✓ Sem IA necessária (Modo Lite funciona sem qualquer IA)
- ✓ Sem Ollama necessário (IA Local é opcional)
- ✓ Sem modificações de projeto durante análise
- ✓ Incrementalmente cacheado para múltiplas análises rápidas
- ✓ Suporte a cancelamento para grandes workspaces
- ✓ Determinístico: mesmos resultado para mesma entrada
- ✓ Seguro: nunca sobrescreve projetos sem confirmação

## Licença

MIT
- `ticCoderLite.localAi.model` (legado)

## Generate A Local VSIX

This project is prepared for local packaging only.

```bash
npm run compile
npm run package
```

The command creates a `.vsix` file in the project root. Do not publish it to the Marketplace yet.

Install the generated VSIX locally from VS Code:

1. Open the Extensions view.
2. Choose `Install from VSIX...`.
3. Select the generated `tic-coder-lite-*.vsix`.

## Demo Video Checklist

1. Launch the Extension Development Host with `F5`.
2. Open a real Java, TypeScript, or mixed workspace.
3. Run `TIC Coder Lite: Analyze Project (Lite Mode)`.
4. Show `.tic-code/scan.json`, `.tic-code/architecture.md`, `.tic-code/risks.md`, and `.tic-code/agent-context.md`.
5. Open `TIC Coder Lite: Open 3 Modes Overview`.
6. Export for Codex or Claude.
7. Optionally show Local AI Mode with Ollama offline and then online.

## MVP Limitations

- The graph is lightweight and based on imports, package manifests, paths, and conventions.
- It does not perform full compiler-grade semantic analysis.
- Java method and risk detection are approximate and deterministic.
- TypeScript path aliases are intentionally limited in the MVP.
- Local AI enhancement requires a manually installed Ollama model.
- TIC Coder Lite does not run tests, migrate databases, call cloud APIs, or start backend services.

## Credits

- Reversa by Sandeco, MIT License.
- TIC Coder Lite by TIC / Leonardo Forbici.
- InsightGraph concepts used as internal reference, not bundled as a dependency.

## Relationship To Reversa

TIC Coder Lite adapts selected concepts from Reversa around AI engine detection, agent entry files, operational context, safe writing, and confidence-oriented documentation. It does not bundle the full Reversa installer, update flow, uninstall flow, `.reversa/`, `_reversa_sdd/`, or Reversa agents.

## Relationship To InsightGraph

InsightGraph was used as an internal conceptual reference for local scan/analyze flows, in-memory graph context, impact-style reasoning, deterministic fragility/risk ideas, and optional Ollama configuration patterns. TIC Coder Lite does not bundle InsightGraph and does not use Neo4j, py2neo, FastAPI, SQLite, Ollama as a requirement, RAG, or a Python backend.

## License

MIT. See `LICENSE` and `NOTICE.md`.

## Fluxo Reversa Engine (12 agentes)

O TIC Coder Lite opera como **UI VS Code do Reversa Engine** com 12 agentes: Reversa, Scout, Archaeologist, Detective, Architect, Writer, Reviewer, Tracer, Visor, Data Master, Design System e Chronicler.

- **Tracer** exige importação de logs/traces (`.log`, `.txt`, `.json`, `.ndjson`) para gerar `dynamic.md` e `runtime-evidence.md`.
- **Visor** exige importação de screenshots (`.png`, `.jpg`, `.jpeg`, `.webp`) para gerar `screenshots-index.md`, `ui-analysis.md` e `user-flows.md`.
- **Design System** analisa CSS/SCSS/themes quando existirem; se não houver, gera artefatos com 🔴 LACUNA.
- **Chronicler** registra sessões de análise e changelog.
- **status pending** = aguardando input.
- **status completed** = artefatos gerados.
- Não existe status `partial` ou `skipped` no estado dos agentes.
