# Perguntas do TIC Coder Lite

Gerado em: 2026-05-04T14:16:10.963Z
Projeto: tic-coder-lite

## Validação de Arquitetura

- Node.js ainda é parte ativa do projeto ou é resíduo legado?
- A fronteira do módulo config corresponde à arquitetura pretendida?
- A fronteira do módulo unknown corresponde à arquitetura pretendida?

## Validação de Riscos

- package-lock.json deve ser tratado como risco obrigatório na próxima alteração? (Arquivo tem mais de 1500 linhas)
- src/webview/webviewAssets.ts:357 deve ser tratado como risco obrigatório na próxima alteração? (SQL concatenado em string)
- src/webview/webviewAssets.ts:402 deve ser tratado como risco obrigatório na próxima alteração? (SQL concatenado em string)
- src/exporters/writeTicCodeFolder.ts:192 deve ser tratado como risco obrigatório na próxima alteração? (Uso de any no TypeScript)
- src/exporters/writeTicCodeFolder.ts:262 deve ser tratado como risco obrigatório na próxima alteração? (Uso de any no TypeScript)
- src/exporters/reverseEngineering/generateBusinessRules.ts:8 deve ser tratado como risco obrigatório na próxima alteração? (Marcador TODO/FIXME encontrado)

## Validação de Grafo e Impacto

- src/exporters/reverseEngineering/generateReverseEngineering.ts é central de propósito ou suas responsabilidades deveriam ser separadas?
- src/commands/analyzeProject.ts é central de propósito ou suas responsabilidades deveriam ser separadas?
- src/exporters/writeTicCodeFolder.ts é central de propósito ou suas responsabilidades deveriam ser separadas?
- src/reversa-adapter/exportForEngines.ts é central de propósito ou suas responsabilidades deveriam ser separadas?
- src/scanner/detectStack.ts é central de propósito ou suas responsabilidades deveriam ser separadas?
- src/webview/overviewPanel.ts é central de propósito ou suas responsabilidades deveriam ser separadas?
- src/extension.ts é central de propósito ou suas responsabilidades deveriam ser separadas?
- src/scanner/buildGraph.ts é central de propósito ou suas responsabilidades deveriam ser separadas?

## Decisões Humanas Necessárias

- Este projeto deve usar apenas Modo Lite, exportações de IA Padrão ou IA Local opcional?
- Quais arquivos de IA Padrão devem ser commitados: AGENTS.md, CLAUDE.md, instruções do Copilot, regras do Cursor ou GEMINI.md?
- A IA Local é permitida neste workspace, e qual modelo pequeno do Ollama deve ser usado?
- Quais fatos gerados devem virar regras de projeto para agentes de IA?
- Quais módulos são seguros para edições automatizadas e quais exigem revisão manual?
- Existem endpoints, migrations, regras de autenticação ou contratos públicos que nunca devem mudar sem aprovação?
- Existem convenções locais invisíveis por nomes de arquivo, imports ou manifests?
