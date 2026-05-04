# Relatório de Confiança do TIC Coder Lite

Gerado em: 2026-05-04T14:16:10.961Z
Projeto: tic-coder-lite

## Escala de Confiança

CONFIRMADO: detectado diretamente no código
INFERIDO: inferido por nome/convenção
LACUNA: precisa validação humana

## Confirmado

- Nome do projeto: tic-coder-lite
- Caminho raiz: c:\Git\tic-coder-lite
- Arquivos analisados: 75
- Linhas analisadas: 16002
- Nós do grafo: 85
- Arestas do grafo: 145
- Riscos encontrados: 6
- Node.js: package.json
- O TIC Coder Lite tem três modos: Modo Lite, IA Padrão e IA Local.
- O Modo Lite não exige IA, banco, Docker, servidor ou Ollama.

## Inferido

- config: 1 arquivo(s) por convenção de nome/caminho
- unknown: 66 arquivo(s) por convenção de nome/caminho
- src/exporters/reverseEngineering/generateReverseEngineering.ts: central por grau no grafo 18
- src/commands/analyzeProject.ts: central por grau no grafo 17
- src/exporters/writeTicCodeFolder.ts: central por grau no grafo 15
- src/reversa-adapter/exportForEngines.ts: central por grau no grafo 12
- src/scanner/detectStack.ts: central por grau no grafo 9
- src/webview/overviewPanel.ts: central por grau no grafo 8
- src/extension.ts: central por grau no grafo 8
- src/scanner/buildGraph.ts: central por grau no grafo 7
- src/commands/enhanceWithLocalAi.ts: central por grau no grafo 7
- src/webview/overviewHtml.ts: central por grau no grafo 7
- node:fs: risco medium no grafo por quantidade de conexões
- node:path: risco high no grafo por quantidade de conexões
- vscode: risco high no grafo por quantidade de conexões
- src/commands/analyzeProject.ts: risco high no grafo por quantidade de conexões
- src/commands/enhanceWithLocalAi.ts: risco medium no grafo por quantidade de conexões
- src/commands/generateAgentContext.ts: risco medium no grafo por quantidade de conexões
- src/exporters/reverseEngineering/generateReverseEngineering.ts: risco high no grafo por quantidade de conexões
- src/exporters/writeTicCodeFolder.ts: risco high no grafo por quantidade de conexões
- src/extension.ts: risco medium no grafo por quantidade de conexões
- src/reversa-adapter/detectEngines.ts: risco medium no grafo por quantidade de conexões

## Lacunas

- O comportamento em runtime não foi executado nem rastreado.
- Regras de negócio não foram validadas semanticamente por uma pessoa.
- O grafo de imports não prova todas as dependências em runtime ou chamadas por reflexão.
- Papéis e permissões de segurança exigem validação humana.
- Significado do schema de banco e segurança de migrations exigem validação humana.
- Cobertura de testes e uso em produção não foram medidos.

## Observações

- Fatos confirmados são extraídos de arquivos, manifests, imports, arestas do grafo e regras determinísticas de risco.
- Fatos inferidos ajudam na navegação, mas devem ser verificados no código antes de edições arquiteturais.
- Lacunas são prompts de validação para pessoas ou para uma revisão específica mais profunda do projeto.
