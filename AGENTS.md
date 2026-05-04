# Contexto TIC Coder Lite para Codex

Esta seção de AGENTS.md foi gerada pelo TIC Coder Lite.

Leia este arquivo antes de planejar ou editar.

## Modos do TIC Coder Lite

- Modo Lite: scanner determinístico, grafo, riscos e contexto. Funciona sem IA, banco, Docker ou servidor.
- IA Padrão: exporta este contexto para ferramentas de IA. Codex usa AGENTS.md, Claude Code usa CLAUDE.md, Copilot usa .github/copilot-instructions.md, Cursor usa .cursorrules, Gemini usa GEMINI.md.
- IA Local: melhoria opcional com Ollama. Comece com um modelo pequeno como qwen2.5-coder:1.5b; nenhum modelo de 60GB é obrigatório e o modo pode ser desativado.

## Arquivos de Contexto Obrigatórios

Antes de alterar código, leia:

- .tic-code/agent-context.md
- .tic-code/risks.md
- .tic-code/architecture.md
- .tic-code/confidence-report.md
- .tic-code/questions.md
- .tic-code/reverse-engineering/operational-contracts.md
- .tic-code/reverse-engineering/business-rules.md
- .tic-code/reverse-engineering/confidence-report.md
- .tic-code/reverse-engineering/gaps.md
- .tic-code/reverse-engineering/questions.md
- .tic-code/reverse-engineering/traceability/code-spec-matrix.md
- .tic-code/reverse-engineering/traceability/risk-impact-matrix.md

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

## Ordem Recomendada de Leitura

1. src/exporters/reverseEngineering/generateReverseEngineering.ts
2. src/commands/analyzeProject.ts
3. src/exporters/writeTicCodeFolder.ts
4. src/reversa-adapter/exportForEngines.ts
5. src/scanner/detectStack.ts
6. src/webview/overviewPanel.ts
7. src/extension.ts
8. src/scanner/buildGraph.ts
9. src/commands/enhanceWithLocalAi.ts
10. src/webview/overviewHtml.ts

## Principais Riscos

- CRITICAL Arquivo tem mais de 1500 linhas: package-lock.json
- CRITICAL SQL concatenado em string: src/webview/webviewAssets.ts:357
- CRITICAL SQL concatenado em string: src/webview/webviewAssets.ts:402
- MEDIUM Uso de any no TypeScript: src/exporters/writeTicCodeFolder.ts:192
- MEDIUM Uso de any no TypeScript: src/exporters/writeTicCodeFolder.ts:262
- LOW Marcador TODO/FIXME encontrado: src/exporters/reverseEngineering/generateBusinessRules.ts:8

## Regras de Segurança

- Prefira fatos de .tic-code em vez de suposições.
- Abra os arquivos citados antes de alterar comportamento.
- Não remova endpoints, migrations, regras de autenticação, contratos públicos ou contexto gerado sem validação humana.
- Não introduza IA externa, RAG, bancos, servidores ou fluxos de instalação do Reversa no TIC Coder Lite.

## Créditos

A detecção de engines e o comportamento de escrita segura são adaptados conceitualmente do Reversa by Sandeco, licença MIT. O TIC Coder Lite permanece uma extensão separada e grava seu contexto principal em .tic-code.
