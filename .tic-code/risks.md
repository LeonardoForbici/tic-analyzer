# Riscos do TIC Coder Lite

Gerado em: 2026-05-04T14:16:10.925Z
Projeto: tic-coder-lite
Raiz: c:\Git\tic-coder-lite

## Resumo

- Total: 6
- Críticos: 3
- Altos: 0
- Médios: 2
- Baixos: 1

## Achados

### CRITICAL - Arquivo tem mais de 1500 linhas

- ID: large-file-critical
- Local: package-lock.json
- Motivo: O arquivo tem 4001 linhas.
- Evidência: 4001 linhas
- Recomendação: Separe responsabilidades em módulos menores antes de mudanças amplas.

### CRITICAL - SQL concatenado em string

- ID: sql-concatenation
- Local: src/webview/webviewAssets.ts:357
- Motivo: SQL parece ser montado com concatenação de strings, o que pode causar injection e consultas frágeis.
- Evidência: 'backend', 'Backend'], ['frontend', 'Frontend'], ['mobile', 'Mobile'], ['database', 'Database / PL/SQL'] ]; select.innerHTML = '<option value="todos">Todos os tipos</option>' + projectTypes.map(([value, label]) => '<option value="' + value 
- Recomendação: Use consultas parametrizadas, prepared statements ou query builder com valores vinculados.

### CRITICAL - SQL concatenado em string

- ID: sql-concatenation
- Local: src/webview/webviewAssets.ts:402
- Motivo: SQL parece ser montado com concatenação de strings, o que pode causar injection e consultas frágeis.
- Evidência: 'http://www.w3.org/2000/svg', 'line'); const dim = graphState.selectedNodeId && edge.from !== graphState.selectedNodeId && edge.to !== graphState.selectedNodeId; line.setAttribute('class', 'edge ' +
- Recomendação: Use consultas parametrizadas, prepared statements ou query builder com valores vinculados.

### MEDIUM - Uso de any no TypeScript

- ID: typescript-any
- Local: src/exporters/writeTicCodeFolder.ts:192
- Motivo: O código abre mão da checagem de tipos do TypeScript.
- Evidência: : any
- Recomendação: Substitua any por interface mais estreita, generic, unknown com validação ou tipo explícito de domínio.

### MEDIUM - Uso de any no TypeScript

- ID: typescript-any
- Local: src/exporters/writeTicCodeFolder.ts:262
- Motivo: O código abre mão da checagem de tipos do TypeScript.
- Evidência: : any
- Recomendação: Substitua any por interface mais estreita, generic, unknown com validação ou tipo explícito de domínio.

### LOW - Marcador TODO/FIXME encontrado

- ID: todo-fixme
- Local: src/exporters/reverseEngineering/generateBusinessRules.ts:8
- Motivo: O código contém um marcador de trabalho não resolvido.
- Evidência: /** Nomes de método que sugerem regras de negócio */
- Recomendação: Resolva o marcador ou converta em trabalho rastreado com responsável e contexto.
