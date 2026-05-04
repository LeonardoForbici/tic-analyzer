/**
 * Adaptador de prompts do Reversa para TIC Coder Lite
 *
 * Usa os assets carregados pelo reversaAssetLoader como base metodológica
 * para gerar seções de contratos operacionais e instruções para agentes de IA.
 *
 * Créditos: Reversa by Sandeco — MIT License
 */

import type { ProjectSummary } from '../types';
import type { ReversaAssets } from './reversaAssetLoader';
import { classifyFileToModule } from '../exporters/reverseEngineering/generateCodeAnalysis';

/** Agrupa riscos por nível + módulo, sem repetições */
export function groupRisksForPrompt(summary: ProjectSummary): string {
  const { risks } = summary.risks;

  // Filtrar ruído
  const meaningful = risks.filter((r) => {
    const lower = r.file.toLowerCase();
    return (
      !lower.endsWith('package-lock.json') &&
      !lower.endsWith('yarn.lock') &&
      !lower.endsWith('pnpm-lock.yaml') &&
      !lower.endsWith('.map') &&
      !lower.endsWith('.min.js')
    );
  });

  if (meaningful.length === 0) return '- Nenhum risco determinístico detectado 🟢';

  // Agrupar por nível
  const byLevel: Record<string, string[]> = { critical: [], high: [], medium: [], low: [] };
  const seenTitles = new Map<string, string>(); // title -> first file

  for (const r of meaningful) {
    const key = `${r.level}|${r.title}`;
    if (seenTitles.has(key)) continue;
    seenTitles.set(key, r.file);
    const { name: moduleName } = classifyFileToModule(r.file);
    const loc = r.line ? `${r.file}:${r.line}` : r.file;
    byLevel[r.level]?.push(`- **${moduleName}**: ${r.title} → \`${loc}\``);
  }

  const lines: string[] = [];
  if (byLevel.critical.length) {
    lines.push('### 🔴 Críticos');
    lines.push(...byLevel.critical.slice(0, 5));
  }
  if (byLevel.high.length) {
    lines.push('### 🟠 Altos');
    lines.push(...byLevel.high.slice(0, 5));
  }
  if (byLevel.medium.length) {
    lines.push('### 🟡 Médios');
    lines.push(...byLevel.medium.slice(0, 5));
  }
  if (byLevel.low.length) {
    lines.push('### ⚪ Baixos');
    lines.push(...byLevel.low.slice(0, 3));
  }
  return lines.join('\n');
}

/** Gera resumo de stack formatado */
export function formatStack(summary: ProjectSummary): string {
  const detected = summary.inventory.stack.filter((s) => s.detected);
  if (detected.length === 0) return '- Stack não detectada automaticamente';
  return detected.map((s) => `- **${s.name}**`).join('\n');
}

/** Lista os arquivos mais centrais do grafo */
export function formatCentralFiles(summary: ProjectSummary, limit = 8): string {
  return summary.graph.stats.centralFiles
    .slice(0, limit)
    .map((f, i) => `${i + 1}. \`${f.path}\``)
    .join('\n');
}

/** Gera seção da Escala de Confiança baseada nos docs do Reversa */
export function renderConfidenceScaleSection(_assets: ReversaAssets): string {
  return `## Escala de Confiança (Metodologia Reversa)

Todo item gerado pelo TIC Coder Lite é marcado com:

| Símbolo | Nome | Significado |
| --- | --- | --- |
| 🟢 | **CONFIRMADO** | Extraído diretamente do código, com arquivo e linha como evidência |
| 🟡 | **INFERIDO** | Deduzido por padrão, nome ou contexto — provavelmente correto, pode estar errado |
| 🔴 | **LACUNA** | Não determinável por análise estática — requer validação humana |

**Regra:** Não trate 🟡 como verdade. Para 🔴, pergunte ao usuário antes de prosseguir.

> Créditos: Escala de confiança inspirada no Reversa by Sandeco (MIT).`;
}

/** Gera a seção de pipeline de agentes (Scout → Archaeologist → ...) */
export function renderAgentPipelineSection(assets: ReversaAssets): string {
  const agentOrder = [
    { key: 'reversa-scout', label: 'Scout', role: 'Mapeamento — inventário, linguagens, dependências, entry points' },
    { key: 'reversa-archaeologist', label: 'Archaeologist', role: 'Escavação — fluxos de controle, algoritmos, estruturas de dados por módulo' },
    { key: 'reversa-detective', label: 'Detective', role: 'Interpretação — regras de negócio, máquinas de estado, permissões, ADRs' },
    { key: 'reversa-architect', label: 'Architect', role: 'Síntese — diagramas C4, ERD, integrações, Spec Impact Matrix' },
    { key: 'reversa-writer', label: 'Writer', role: 'Geração — specs SDD, OpenAPI, user stories, code-spec matrix' },
    { key: 'reversa-reviewer', label: 'Reviewer', role: 'Revisão — inconsistências, reclassificação de confiança, gaps e perguntas' },
    { key: 'reversa-data-master', label: 'Data Master', role: 'Banco de Dados — DDL, migrations, ERD completo, stored procedures' }
  ];

  const lines: string[] = [
    '## Pipeline de Análise (Metodologia Reversa)',
    '',
    'O TIC Coder Lite executa análise determinística cobrindo as seguintes fases:',
    '',
    '| Fase | Agente | Responsabilidade |',
    '| --- | --- | --- |'
  ];

  for (const agent of agentOrder) {
    const hasSkill = !!assets.agents[agent.key];
    const badge = hasSkill ? '✅' : '🔄';
    lines.push(`| ${badge} | **${agent.label}** | ${agent.role} |`);
  }

  lines.push('');
  lines.push('> **✅** = skill disponível em `resources/reversa/agents/` | **🔄** = executado deterministicamente pelo TIC Coder Lite');
  lines.push('');
  lines.push('**Saídas em `.tic-code/reverse-engineering/`:**');
  lines.push('- `inventory.md`, `dependencies.md`, `code-analysis.md`, `domain.md`');
  lines.push('- `business-rules.md`, `operational-contracts.md`, `architecture.md`');
  lines.push('- `confidence-report.md`, `gaps.md`, `questions.md`');
  lines.push('- `traceability/code-spec-matrix.md`, `traceability/risk-impact-matrix.md`');

  return lines.join('\n');
}

/** Gera seção de instruções operacionais: o que o agente DEVE fazer */
export function renderOperationalInstructions(forEngine: string): string {
  return `## Instruções Operacionais para ${forEngine}

### Antes de qualquer mudança

1. Leia \`.tic-code/reverse-engineering/operational-contracts.md\` — encontre o contrato do módulo afetado.
2. Leia \`.tic-code/reverse-engineering/business-rules.md\` — verifique se há regras 🟢 CONFIRMADAS que você não pode quebrar.
3. Leia \`.tic-code/reverse-engineering/confidence-report.md\` — entenda o nível de cobertura da análise.
4. Consulte \`.tic-code/reverse-engineering/traceability/code-spec-matrix.md\` para entender impactos.

### Ao detectar 🔴 LACUNA

Não invente. Pergunte ao usuário:
> "Encontrei uma lacuna: [descrição]. Qual é o comportamento esperado?"

### Ao alterar API, endpoint ou contrato público

Consulte \`.tic-code/reverse-engineering/api-contracts.md\` e verifique se o contrato está documentado.
Se não estiver, adicione à lista de perguntas em \`.tic-code/reverse-engineering/questions.md\`.

### PL/SQL / Banco de Dados

Antes de alterar qualquer query, tabela ou procedure:
1. Leia \`.tic-code/reverse-engineering/database-analysis.md\`
2. Verifique \`.tic-code/reverse-engineering/plsql-analysis.md\` (se existir)
3. **Não altere** COMMIT, ROLLBACK, triggers ou SQL dinâmico sem validação humana.

### Nunca fazer sem validação humana

- Remover endpoints públicos, rotas, scripts de banco ou checagens de autenticação
- Renomear módulos, rotas ou variáveis de ambiente sem verificar todos os chamadores
- Tratar 🟡 INFERIDO como contrato definitivo
- Adicionar dependências externas, bancos, servidores ou fluxos de IA ao TIC Coder Lite`;
}
