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
- Riscos detectados: 6

## Stack Detectada

- Node.js: package.json

## Principais Riscos

- CRITICAL Arquivo tem mais de 1500 linhas: package-lock.json
- CRITICAL SQL concatenado em string: src/webview/webviewAssets.ts:357
- CRITICAL SQL concatenado em string: src/webview/webviewAssets.ts:402
- MEDIUM Uso de any no TypeScript: src/exporters/writeTicCodeFolder.ts:192
- MEDIUM Uso de any no TypeScript: src/exporters/writeTicCodeFolder.ts:262
- LOW Marcador TODO/FIXME encontrado: src/exporters/reverseEngineering/generateBusinessRules.ts:8

## Créditos

A detecção de engines e o comportamento de escrita segura são adaptados conceitualmente do Reversa by Sandeco, licença MIT. O TIC Coder Lite permanece uma extensão separada e grava seu contexto principal em .tic-code.
