# TIC Coder Lite — Reversa Engine para Codex

> Arquivo: `AGENTS.md` — gerado pelo TIC Coder Lite.
> Leia este arquivo antes de planejar ou editar.

---

Você está trabalhando em um sistema legado.

O TIC Coder Lite usa o motor/metodologia do Reversa adaptado para VS Code.

Antes de planejar, editar, refatorar ou gerar código, trate `.tic-code/reverse-engineering/` como a **especificação operacional** extraída do sistema existente.

Seu objetivo é **preservar** comportamento, regras de negócio, contratos, permissões, SQL/PL\SQL, fluxos e decisões arquiteturais existentes.

Não use este arquivo como relatório de scan.
Use como **contrato operacional**.

---

## Metodologia Reversa

- **Scout**: inventário e superfície do projeto
- **Archaeologist**: análise profunda de módulos
- **Detective**: regras de negócio, estados e permissões
- **Architect**: arquitetura, integrações e dívida técnica
- **Writer**: contratos operacionais e SDD
- **Reviewer**: gaps, inconsistências e validação
- **Data Master**: banco, SQL, PL/SQL, triggers, procedures, packages

## Escala de Confiança

- 🟢 CONFIRMADO: extraído diretamente do código
- 🟡 INFERIDO: deduzido por padrão, nome, fluxo ou estrutura
- 🔴 LACUNA: não determinável pelo código

## Arquivos Obrigatórios

Antes de alterar comportamento, leia:

- `.tic-code/reversa/plan.md`
- `.tic-code/reverse-engineering/inventory.md`
- `.tic-code/reverse-engineering/code-analysis.md`
- `.tic-code/reverse-engineering/domain.md`
- `.tic-code/reverse-engineering/business-rules.md`
- `.tic-code/reverse-engineering/architecture.md`
- `.tic-code/reverse-engineering/confidence-report.md`
- `.tic-code/reverse-engineering/gaps.md`
- `.tic-code/reverse-engineering/questions.md`
- `.tic-code/reverse-engineering/traceability/code-spec-matrix.md`
- `.tic-code/reverse-engineering/traceability/spec-impact-matrix.md`

## Regras

- Não inventar regra de negócio
- Não tratar inferência como verdade
- Não ignorar SQL/PLSQL
- Não alterar comportamento crítico sem consultar traceability
- Não sobrescrever arquivos do usuário sem confirmação
- Não introduzir servidor, banco local, RAG, Docker ou CLI externa
- Se faltar informação, marcar como 🔴 LACUNA

## Resumo do Projeto

- Projeto: tic-coder-lite
- Raiz: c:\Git\tic-coder-lite
- Arquivos analisados: 73
- Linhas analisadas: 15866
- Nós do grafo: 83
- Arestas do grafo: 145
- Riscos detectados: 5

## Stack Detectada

- Node.js: package.json

## Principais Riscos

> Arquivos de lock, mapas e bundles minificados são excluídos dos riscos de domínio.

- CRITICAL SQL concatenado em string: src/webview/webviewAssets.ts:357
- CRITICAL SQL concatenado em string: src/webview/webviewAssets.ts:402
- MEDIUM Uso de any no TypeScript: src/exporters/writeTicCodeFolder.ts:192
- MEDIUM Uso de any no TypeScript: src/exporters/writeTicCodeFolder.ts:262
- LOW Marcador TODO/FIXME encontrado: src/exporters/reverseEngineering/generateBusinessRules.ts:8

## Créditos

A detecção de engines e o comportamento de escrita segura são adaptados conceitualmente do Reversa by Sandeco, licença MIT. O TIC Coder Lite permanece uma extensão separada e grava seu contexto principal em .tic-code.

## Agentes Obrigatórios (execução funcional)

- Reversa — orquestração, state/config/plan/context.
- Scout — inventário/dependencies/surface.
- Archaeologist — modules/code-analysis/sdd por módulo.
- Detective — domain/business-rules/state-machines/permissions/gaps/questions.
- Architect — architecture/c4/erd/adrs.
- Writer — operational-contracts/sdd/openapi/user-stories/flowcharts/sequences.
- Reviewer — confidence/gaps/questions/risk-impact/review-report.
- Tracer — inputs de logs/traces + dynamic/runtime-evidence.
- Visor — inputs de screenshots + ui docs.
- Data Master — database-analysis/plsql/database/*/erd.
- Design System — design-system/tokens/components/themes.
- Chronicler — session/history/changelog.

## Matriz operacional dos 12 agentes

- Reversa — papel: orquestração; status: pending/running/completed/failed; artefatos: `.tic-code/reversa/state.json`, `config.json`, `plan.md`; inputs: nenhum.
- Scout — papel: inventário/superfície; status: pending/running/completed/failed; artefatos: `inventory.md`, `dependencies.md`; inputs: workspace scan.
- Archaeologist — papel: análise de módulos; status: pending/running/completed/failed; artefatos: `code-analysis.md`, `sdd/*`; inputs: modules context.
- Detective — papel: regras/estados/permissões; status: pending/running/completed/failed; artefatos: `domain.md`, `business-rules.md`, `state-machines.md`, `permissions.md`; inputs: código + contexto.
- Architect — papel: arquitetura/C4/ERD; status: pending/running/completed/failed; artefatos: `architecture.md`, `c4-*`, `erd-complete.md`; inputs: grafo + inventário.
- Writer — papel: contratos operacionais/SDD; status: pending/running/completed/failed; artefatos: `operational-contracts.md`, `openapi/*`, `user-stories/*`; inputs: saídas dos agentes anteriores.
- Reviewer — papel: revisão e consistência; status: pending/running/completed/failed; artefatos: `confidence-report.md`, `review-report.md`; inputs: todos os artefatos.
- Tracer — papel: evidência de runtime; status: pending/running/completed/failed; artefatos: `dynamic.md`, `traceability/runtime-evidence.md`; inputs: logs/traces importados.
- Visor — papel: documentação de UI; status: pending/running/completed/failed; artefatos: `ui/screenshots-index.md`, `ui/ui-analysis.md`, `ui/user-flows.md`; inputs: screenshots importados.
- Data Master — papel: banco/SQL/PLSQL; status: pending/running/completed/failed; artefatos: `data-dictionary.md`, `database-analysis.md`, `plsql-analysis.md`, `database/*`; inputs: SQL/PLSQL (ou 🔴 LACUNA sem banco).
- Design System — papel: tokens/componentes/themes; status: pending/running/completed/failed; artefatos: `design-system/tokens.md`, `components.md`, `themes.md`; inputs: CSS/SCSS/themes (ou 🔴 LACUNA).
- Chronicler — papel: histórico de sessões; status: pending/running/completed/failed; artefatos: `.tic-code/reversa/chronicler/session.md`, `history.json`, `reverse-engineering/changelog.md`; inputs: execução da análise.
