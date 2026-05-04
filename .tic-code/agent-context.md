# Contexto para IA do TIC Coder Lite

Gerado em: 2026-05-04T14:16:10.959Z
Projeto: tic-coder-lite
Raiz: c:\Git\tic-coder-lite

## Objetivo

Este arquivo é um contexto operacional para Codex, Claude Code, Copilot, Cursor e agentes locais de IA antes de alterar código. Ele é gerado localmente a partir de scan determinístico, stack, grafo e dados de risco.

## Modos do TIC Coder Lite

1. Modo Lite: scanner determinístico, grafo, riscos e contexto. Sem IA, sem banco, sem Docker e sem servidor.
2. IA Padrão: exporta contexto para ferramentas de IA existentes. Codex usa AGENTS.md, Claude Code usa CLAUDE.md, Copilot usa .github/copilot-instructions.md, Cursor usa .cursorrules, Gemini usa GEMINI.md.
3. IA Local: melhoria opcional com Ollama. Modelo inicial recomendado: qwen2.5-coder:1.5b. Pode ser desativada e não exige modelos grandes de 60GB.

## Stack Detectada

- Node.js: package.json

## Resumo do Projeto

- Arquivos analisados: 75
- Linhas analisadas: 16002
- Nós do grafo: 85
- Arestas do grafo: 145
- Riscos detectados: 6

## Módulos Críticos

- unknown: 17 ponto(s) ponderados de risco
- config: 1 nó(s) no grafo

## Arquivos de Alto Risco

- package-lock.json: risco critical: Arquivo tem mais de 1500 linhas
- src/webview/webviewAssets.ts: risco critical: SQL concatenado em string
- src/commands/analyzeProject.ts: alta centralidade no grafo
- src/exporters/reverseEngineering/generateReverseEngineering.ts: alta centralidade no grafo
- src/exporters/writeTicCodeFolder.ts: alta centralidade no grafo
- src/reversa-adapter/exportForEngines.ts: alta centralidade no grafo

## Dependências Importantes

- vscode: 16 conexão(ões)
- node:path: 14 conexão(ões)
- node:fs: 9 conexão(ões)
- @types/node: 1 conexão(ões)
- @types/vscode: 1 conexão(ões)
- @vscode/vsce: 1 conexão(ões)
- node:child_process: 1 conexão(ões)
- node:crypto: 1 conexão(ões)
- node:util: 1 conexão(ões)
- typescript: 1 conexão(ões)

## Principais Riscos

- CRITICAL Arquivo tem mais de 1500 linhas (package-lock.json)
- CRITICAL SQL concatenado em string (src/webview/webviewAssets.ts:357)
- CRITICAL SQL concatenado em string (src/webview/webviewAssets.ts:402)
- MEDIUM Uso de any no TypeScript (src/exporters/writeTicCodeFolder.ts:192)
- MEDIUM Uso de any no TypeScript (src/exporters/writeTicCodeFolder.ts:262)
- LOW Marcador TODO/FIXME encontrado (src/exporters/reverseEngineering/generateBusinessRules.ts:8)

## Banco / PL/SQL

- Arquivos PL/SQL: 0
- Packages: 0
- Package bodies: 0
- Procedures: 0
- Functions: 0
- Triggers: 0
- Tabelas referenciadas: 0

### Packages detectados

- Nenhum package detectado.

### Procedures e functions criticas

- Nenhuma procedure/function detectada.

### Triggers

- Nenhum trigger detectado.

### Tabelas mais referenciadas

- Nenhuma tabela referenciada.

### Riscos transacionais e PL/SQL

- Nenhum risco PL/SQL detectado.

### Aviso para IA

- Regras de negocio criticas podem estar escondidas no banco.
- Packages, procedures e triggers podem executar validacoes que nao aparecem no backend/frontend.
- Nao altere COMMIT, ROLLBACK, autonomous transaction, triggers ou SQL dinamico sem validacao humana.
- Use .tic-code/projects/database/agent-context.md para o contexto focado em PL/SQL.

## Ordem Recomendada de Leitura

1. AGENTS.md
2. CLAUDE.md
3. README.md
4. package.json
5. tsconfig.json
6. .tic-code/inventory.md
7. .tic-code/architecture.md
8. .tic-code/risks.md
9. .tic-code/projects/database/agent-context.md
10. src/exporters/reverseEngineering/generateReverseEngineering.ts
11. src/commands/analyzeProject.ts
12. src/exporters/writeTicCodeFolder.ts
13. src/reversa-adapter/exportForEngines.ts
14. src/scanner/detectStack.ts
15. src/webview/overviewPanel.ts
16. src/extension.ts
17. src/scanner/buildGraph.ts
18. src/commands/enhanceWithLocalAi.ts

## Instruções para Agentes de IA

- Leia este arquivo, .tic-code/inventory.md, .tic-code/architecture.md e .tic-code/risks.md antes de editar.
- Trate fatos confirmados como verdade local do projeto, a menos que os fontes tenham mudado após este scan.
- Abra os arquivos citados antes de modificar comportamento.
- Prefira edições estreitas ao redor do módulo e das dependências envolvidas no pedido.
- Rode novamente a análise do TIC Coder Lite após mudanças relevantes de código.
- Mantenha arquivos gerados dentro de .tic-code, salvo quando o usuário pedir exportação para outro lugar.
- Lembrete: fatos do Modo Lite funcionam sem IA; IA Padrão só exporta contexto; IA Local é opcional.

## Programação Reversa / SDD

Antes de alterar código, leia também:

- .tic-code/reverse-engineering/inventory.md
- .tic-code/reverse-engineering/architecture.md
- .tic-code/reverse-engineering/business-rules.md
- .tic-code/reverse-engineering/confidence-report.md
- .tic-code/reverse-engineering/gaps.md
- .tic-code/reverse-engineering/questions.md
- .tic-code/reverse-engineering/traceability/code-spec-matrix.md
- .tic-code/reverse-engineering/traceability/risk-impact-matrix.md

### Instruções para Agentes (Programação Reversa)

- Não trate 🟡 INFERIDO como verdade absoluta.
- Valide itens 🟡 INFERIDO antes de alterar regra crítica.
- Pergunte ao usuário sobre itens 🔴 LACUNA antes de prosseguir.
- Nunca altere módulo crítico sem consultar riscos e a matriz de impacto.
- Em projetos com PL/SQL, verifique triggers, procedures e packages antes de alterar regra de negócio no backend.
- Consulte .tic-code/reverse-engineering/plsql-analysis.md antes de alterar qualquer tabela referenciada por trigger.

### Níveis de Confiança

- 🟢 CONFIRMADO: extraído diretamente do código, SQL, anotação ou arquivo.
- 🟡 INFERIDO: deduzido por nome, padrão, fluxo ou grafo.
- 🔴 LACUNA: não confirmável, exige validação humana.

## Não Fazer Sem Validação Humana

- Não remova APIs públicas, endpoints, scripts de banco, migrations ou checagens de segurança apenas por inferência.
- Não renomeie módulos, pacotes, rotas ou variáveis de ambiente sem validar chamadores.
- Não assuma que uma fronteira de módulo inferida é uma regra arquitetural intencional.
- Não trate risco do grafo como prova de bug; use como sinal de prioridade para inspeção.
- Não adicione serviços externos, bancos, runtimes de IA, RAG ou servidores aos fluxos do TIC Coder Lite.

## Créditos

- Reversa by Sandeco, MIT License. Programação Reversa do TIC Coder Lite foi inspirada metodologicamente no Reversa.
- TIC Coder Lite by TIC / Leonardo Forbici.
- InsightGraph concepts used as internal reference, not bundled as dependency.
