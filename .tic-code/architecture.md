# Arquitetura do TIC Coder Lite

Gerado em: 2026-05-04T14:16:10.885Z
Projeto: tic-coder-lite
Raiz: c:\Git\tic-coder-lite

## Resumo do Grafo

- Nós: 85
- Arestas: 145
- Arestas internas: 99
- Arestas externas/pacotes: 46

## Stack Detectada

- Node.js: package.json

## Módulos Encontrados

- unknown: 74 nós
- external: 10 nós
- config: 1 nós

## Principais Dependências

- package.json -> @types/node: 1 aresta(s) de dependência
- package.json -> @types/vscode: 1 aresta(s) de dependência
- package.json -> @vscode/vsce: 1 aresta(s) de dependência
- package.json -> typescript: 1 aresta(s) de dependência
- src/commands/analyzeProject.ts -> node:path: 1 aresta(s) de dependência
- src/commands/analyzeProject.ts -> vscode: 1 aresta(s) de dependência
- src/commands/analyzeProject.ts -> src/exporters/writeTicCodeFolder.ts: 1 aresta(s) de dependência
- src/commands/analyzeProject.ts -> src/scanner/buildGraph.ts: 1 aresta(s) de dependência
- src/commands/analyzeProject.ts -> src/scanner/detectProjects.ts: 1 aresta(s) de dependência
- src/commands/analyzeProject.ts -> src/scanner/detectRisks.ts: 1 aresta(s) de dependência
- src/commands/analyzeProject.ts -> src/scanner/detectStack.ts: 1 aresta(s) de dependência
- src/commands/analyzeProject.ts -> src/scanner/scanWorkspace.ts: 1 aresta(s) de dependência
- src/commands/analyzeProject.ts -> src/types.ts: 1 aresta(s) de dependência
- src/commands/analyzeProject.ts -> src/utils/config.ts: 1 aresta(s) de dependência
- src/commands/analyzeProject.ts -> src/utils/outputChannel.ts: 1 aresta(s) de dependência
- src/commands/analyzeProject.ts -> src/utils/workspace.ts: 1 aresta(s) de dependência
- src/commands/enhanceWithLocalAi.ts -> vscode: 1 aresta(s) de dependência
- src/commands/enhanceWithLocalAi.ts -> src/commands/analyzeProject.ts: 1 aresta(s) de dependência
- src/commands/enhanceWithLocalAi.ts -> src/local-ai/checkOllamaStatus.ts: 1 aresta(s) de dependência
- src/commands/enhanceWithLocalAi.ts -> src/local-ai/enhanceAgentContext.ts: 1 aresta(s) de dependência
- src/commands/enhanceWithLocalAi.ts -> src/local-ai/enhanceModuleSummary.ts: 1 aresta(s) de dependência
- src/commands/enhanceWithLocalAi.ts -> src/local-ai/ollamaClient.ts: 1 aresta(s) de dependência
- src/commands/exportAgentsMd.ts -> vscode: 1 aresta(s) de dependência
- src/commands/exportAgentsMd.ts -> src/reversa-adapter/exportForEngines.ts: 1 aresta(s) de dependência
- src/commands/generateAgentContext.ts -> vscode: 1 aresta(s) de dependência
- src/commands/generateAgentContext.ts -> src/commands/analyzeProject.ts: 1 aresta(s) de dependência
- src/commands/generateAgentContext.ts -> src/exporters/generateAgentContextMd.ts: 1 aresta(s) de dependência
- src/commands/generateAgentContext.ts -> src/exporters/writeTicCodeFolder.ts: 1 aresta(s) de dependência
- src/commands/generateAgentContext.ts -> src/types.ts: 1 aresta(s) de dependência
- src/commands/openOverview.ts -> vscode: 1 aresta(s) de dependência
- src/commands/openOverview.ts -> src/webview/overviewPanel.ts: 1 aresta(s) de dependência
- src/exporters/reverseEngineering/generateReverseEngineering.ts -> vscode: 1 aresta(s) de dependência
- src/exporters/reverseEngineering/generateReverseEngineering.ts -> src/exporters/reverseEngineering/generateApiContracts.ts: 1 aresta(s) de dependência
- src/exporters/reverseEngineering/generateReverseEngineering.ts -> src/exporters/reverseEngineering/generateArchitecture.ts: 1 aresta(s) de dependência
- src/exporters/reverseEngineering/generateReverseEngineering.ts -> src/exporters/reverseEngineering/generateBusinessRules.ts: 1 aresta(s) de dependência
- src/exporters/reverseEngineering/generateReverseEngineering.ts -> src/exporters/reverseEngineering/generateCodeAnalysis.ts: 1 aresta(s) de dependência
- src/exporters/reverseEngineering/generateReverseEngineering.ts -> src/exporters/reverseEngineering/generateConfidenceReport.ts: 1 aresta(s) de dependência
- src/exporters/reverseEngineering/generateReverseEngineering.ts -> src/exporters/reverseEngineering/generateDatabaseAnalysis.ts: 1 aresta(s) de dependência
- src/exporters/reverseEngineering/generateReverseEngineering.ts -> src/exporters/reverseEngineering/generateDataDictionary.ts: 1 aresta(s) de dependência
- src/exporters/reverseEngineering/generateReverseEngineering.ts -> src/exporters/reverseEngineering/generateDependencies.ts: 1 aresta(s) de dependência

## Arquivos Centrais

- src/exporters/reverseEngineering/generateReverseEngineering.ts: 18 conexão(ões)
- src/commands/analyzeProject.ts: 17 conexão(ões)
- src/exporters/writeTicCodeFolder.ts: 15 conexão(ões)
- src/reversa-adapter/exportForEngines.ts: 12 conexão(ões)
- src/scanner/detectStack.ts: 9 conexão(ões)
- src/webview/overviewPanel.ts: 8 conexão(ões)
- src/extension.ts: 8 conexão(ões)
- src/scanner/buildGraph.ts: 7 conexão(ões)
- src/commands/enhanceWithLocalAi.ts: 7 conexão(ões)
- src/webview/overviewHtml.ts: 7 conexão(ões)
- src/scanner/detectRisks.ts: 6 conexão(ões)
- src/scanner/scanWorkspace.ts: 6 conexão(ões)
- src/utils/config.ts: 6 conexão(ões)
- src/commands/generateAgentContext.ts: 6 conexão(ões)
- src/reversa-adapter/detectEngines.ts: 6 conexão(ões)

## Acoplamentos Possíveis

- unknown -> config: 5 aresta(s)

## Notas de Leitura para Agentes de IA

- graph.json é um grafo leve de arquivos inspirado em conceitos de grafo em memória, não um banco de dados.
- IMPORTS significa que um arquivo fonte importa outro arquivo do workspace.
- USES_PACKAGE significa que um arquivo fonte importa um pacote que não foi resolvido como arquivo local.
- DEPENDS_ON significa que metadados de pacote declaram uma dependência.
- Arquivos marcados com risco médio ou alto têm mais conexões no grafo e merecem cuidado extra antes de edições.
