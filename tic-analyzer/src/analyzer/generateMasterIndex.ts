import type { ProjectModule } from './detectModules';
import type { RiskFinding } from './detectRisks';
import type { StackInfo } from './detectStack';

export interface MasterIndexInput {
  projectName: string;
  totalFiles: number;
  totalLines: number;
  stack: StackInfo;
  modules: ProjectModule[];
  risks: RiskFinding[];
  generatedAt: string;
}

/** Gera .tic-code/index.md — mapa de navegação (~5KB) */
export function generateMasterIndex(input: MasterIndexInput): string {
  const { projectName, totalFiles, totalLines, stack, modules, risks, generatedAt } = input;

  const criticalCount = risks.filter((r) => r.level === 'critical').length;
  const highCount = risks.filter((r) => r.level === 'high').length;

  const moduleRows = modules.map((m) => {
    const moduleRisks = risks.filter((r) => r.file.startsWith(m.path)).length;
    const riskBadge = moduleRisks > 0 ? `⚠️ ${moduleRisks}` : '✅ 0';
    return `| [${m.name}](.tic-code/modules/${m.name}/context.md) | \`${m.path}\` | ${m.fileCount.toLocaleString()} | ${m.languages.join(', ')} | ${riskBadge} |`;
  });

  return `# ${projectName} — Índice de Navegação

> Gerado pelo TIC Analyzer em ${generatedAt}
> **${totalFiles.toLocaleString()} arquivos** | **${totalLines.toLocaleString()} linhas** | Linguagem principal: **${stack.primaryLanguage}**

---

## Visão Geral

| Métrica | Valor |
| --- | --- |
| Total de arquivos | ${totalFiles.toLocaleString()} |
| Total de linhas | ${totalLines.toLocaleString()} |
| Linguagem principal | ${stack.primaryLanguage} |
| Frameworks | ${stack.frameworks.join(', ') || 'Não detectado'} |
| Módulos | ${modules.length} |
| Riscos críticos | ${criticalCount} |
| Riscos altos | ${highCount} |

---

## Módulos — Mapa de Navegação

| Módulo | Caminho | Arquivos | Linguagens | Riscos |
| --- | --- | --- | --- | --- |
${moduleRows.join('\n')}

---

## Como Usar

### Para Copilot / Claude
1. Leia este arquivo para entender a estrutura do projeto
2. Para perguntas sobre um módulo específico → leia \`.tic-code/modules/{nome}/context.md\`
3. Para contexto geral compacto → leia \`.tic-code/quick-context.md\`

### Para Claude Code (MCP)
Se o TIC Analyzer MCP Server estiver rodando (\`localhost:7432\`):
\`\`\`
list_modules()           → lista todos os módulos
get_module("auth")       → contexto completo do módulo auth
get_quick_context()      → quick-context.md completo
search_module("payment") → encontra módulo mais relevante
\`\`\`

---

> ⚡ **Regra de ouro:** Leia APENAS o módulo relevante para sua pergunta.
> Não carregue todos os módulos de uma vez — isso desperdiça tokens premium.
`;
}
