/**
 * Gera AGENTS.md / CLAUDE.md / copilot-instructions.md / .cursorrules / GEMINI.md
 * usando conteúdo adaptado do Reversa como contratos operacionais.
 *
 * Esses arquivos NÃO são relatórios de scan — são contratos operacionais.
 * Créditos: Reversa by Sandeco — MIT License (adapted)
 */

import * as fs from 'node:fs';
import * as vscode from 'vscode';
import type { ProjectSummary } from '../types';
import { getAgentSkillPath } from './embeddedReversaPaths';
import { adaptSkillMd } from './adaptReversaContent';
import { classifyFileToModule } from '../exporters/reverseEngineering/generateCodeAnalysis';

export type AgentContractEngine = 'codex' | 'claude-code' | 'github-copilot' | 'cursor' | 'gemini-cli' | 'aider';

export interface AgentContractOptions {
  engine: AgentContractEngine;
  targetFile: string;
  engineInstruction: string;
  compact?: boolean;
}

/** Pré-cabeçalho obrigatório para todos os contratos */
const MANDATORY_PREAMBLE = `Você está trabalhando em um sistema legado.

O TIC Coder Lite usa o motor/metodologia do Reversa adaptado para VS Code.

Antes de planejar, editar, refatorar ou gerar código, trate \`.tic-code/reverse-engineering/\` como a **especificação operacional** extraída do sistema existente.

Seu objetivo é **preservar** comportamento, regras de negócio, contratos, permissões, SQL/PL\\SQL, fluxos e decisões arquiteturais existentes.

Não use este arquivo como relatório de scan.
Use como **contrato operacional**.`;

export function generateAgentContract(
  summary: ProjectSummary,
  options: AgentContractOptions,
  extensionUri?: vscode.Uri
): string {
  const { engine, targetFile, engineInstruction, compact = false } = options;
  const engineLabel = engineLabelFor(engine);

  const header = buildHeader(engineLabel, targetFile, engineInstruction, summary.workspaceName);
  const stack = buildStackSection(summary);
  const risks = buildRisksSection(summary);
  const artifacts = buildArtifactsSection();
  const instructions = buildInstructionsSection(engineLabel);
  const pipeline = buildPipelineSection(summary, extensionUri);
  const confidenceScale = buildConfidenceSection();
  const localAi = buildLocalAiSection();
  const credits = buildCreditsSection();

  if (compact) {
    return [header, buildCompactSummary(summary), artifacts, instructions, confidenceScale, credits].join('\n\n') + '\n';
  }

  return [
    header,
    buildProjectSummary(summary),
    stack,
    risks,
    artifacts,
    instructions,
    pipeline,
    confidenceScale,
    localAi,
    credits
  ].join('\n\n') + '\n';
}

function buildHeader(engineLabel: string, targetFile: string, instruction: string, projectName: string): string {
  return `# TIC Coder Lite — Reversa Engine para ${engineLabel}

> Arquivo: \`${targetFile}\` — gerado pelo TIC Coder Lite.
> ${instruction}

---

${MANDATORY_PREAMBLE}

**Projeto:** ${projectName}`;
}

function buildCompactSummary(summary: ProjectSummary): string {
  return `## Projeto

- **Nome:** ${summary.workspaceName}
- **Arquivos:** ${summary.totalFiles}
- **Linhas:** ${summary.totalLines.toLocaleString()}
- **Spec:** \`.tic-code/reverse-engineering/\`
- **Estado Reversa:** \`.tic-code/reversa/state.json\``;
}

function buildProjectSummary(summary: ProjectSummary): string {
  return `## Resumo do Projeto

| Campo | Valor |
| --- | --- |
| Projeto | ${summary.workspaceName} |
| Arquivos analisados | ${summary.totalFiles} |
| Linhas analisadas | ${summary.totalLines.toLocaleString()} |
| Nós do grafo | ${summary.graph.stats.nodeCount} |
| Arestas | ${summary.graph.stats.edgeCount} |
| Estado Reversa | \`.tic-code/reversa/state.json\` |
| Plano | \`.tic-code/reversa/plan.md\` |`;
}

function buildStackSection(summary: ProjectSummary): string {
  const detected = summary.inventory.stack.filter((s) => s.detected);
  if (detected.length === 0) return '## Stack\n\n- Stack não detectada automaticamente.';
  return `## Stack Detectada\n\n${detected.map((s) => `- **${s.name}**`).join('\n')}`;
}

function buildRisksSection(summary: ProjectSummary): string {
  const meaningful = summary.risks.risks.filter((r) => {
    const l = r.file.toLowerCase();
    return !l.endsWith('package-lock.json') && !l.endsWith('yarn.lock') && !l.endsWith('.map') && !l.endsWith('.min.js');
  });

  if (meaningful.length === 0) return '## Riscos\n\n- Nenhum risco determinístico detectado 🟢';

  // Group by level, deduplicate by title
  const byLevel: Record<string, string[]> = { critical: [], high: [], medium: [], low: [] };
  const seen = new Set<string>();
  for (const r of meaningful) {
    const key = `${r.level}|${r.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { name: mod } = classifyFileToModule(r.file);
    const loc = r.line ? `${r.file}:${r.line}` : r.file;
    byLevel[r.level]?.push(`- **${mod}**: ${r.title} → \`${loc}\``);
  }

  const sections: string[] = ['## Riscos Técnicos'];
  if (byLevel.critical.length) { sections.push('\n### 🔴 Críticos'); sections.push(...byLevel.critical.slice(0, 5)); }
  if (byLevel.high.length) { sections.push('\n### 🟠 Altos'); sections.push(...byLevel.high.slice(0, 5)); }
  if (byLevel.medium.length) { sections.push('\n### 🟡 Médios'); sections.push(...byLevel.medium.slice(0, 5)); }
  if (byLevel.low.length) { sections.push('\n### ⚪ Baixos'); sections.push(...byLevel.low.slice(0, 3)); }
  sections.push('\n> Lista completa: `.tic-code/risks.md` e `.tic-code/reverse-engineering/traceability/risk-impact-matrix.md`');
  return sections.join('\n');
}

function buildArtifactsSection(): string {
  return `## Artefatos de Programação Reversa

Antes de qualquer mudança, leia:

| Artefato | Conteúdo |
| --- | --- |
| \`.tic-code/reversa/state.json\` | Estado da pipeline (fases, checkpoints) |
| \`.tic-code/reversa/plan.md\` | Plano completo de análise |
| \`.tic-code/reverse-engineering/operational-contracts.md\` | Contratos por módulo |
| \`.tic-code/reverse-engineering/business-rules.md\` | Regras de negócio candidatas |
| \`.tic-code/reverse-engineering/confidence-report.md\` | Cobertura e lacunas |
| \`.tic-code/reverse-engineering/code-analysis.md\` | Módulos e acoplamento |
| \`.tic-code/reverse-engineering/architecture.md\` | Arquitetura detectada |
| \`.tic-code/reverse-engineering/gaps.md\` | Lacunas 🔴 abertas |
| \`.tic-code/reverse-engineering/questions.md\` | Perguntas para especialistas |
| \`.tic-code/reverse-engineering/traceability/code-spec-matrix.md\` | Rastreabilidade código ↔ spec |
| \`.tic-code/reverse-engineering/traceability/risk-impact-matrix.md\` | Riscos ↔ impacto |`;
}

function buildInstructionsSection(engineLabel: string): string {
  return `## Instruções Operacionais para ${engineLabel}

### Antes de qualquer mudança

1. Leia \`.tic-code/reversa/state.json\` — entenda em que fase a análise está.
2. Leia \`.tic-code/reverse-engineering/operational-contracts.md\` — encontre o contrato do módulo.
3. Verifique \`.tic-code/reverse-engineering/business-rules.md\` — não quebre regras 🟢 CONFIRMADAS.
4. Consulte \`.tic-code/reverse-engineering/confidence-report.md\` — conheça as lacunas.

### Ao encontrar 🔴 LACUNA

Não invente. Pergunte:
> "Encontrei uma lacuna: [descrição]. Qual é o comportamento esperado?"

### Ao alterar API ou contrato público

Verifique \`.tic-code/reverse-engineering/traceability/code-spec-matrix.md\` antes de alterar assinaturas.

### PL/SQL / Banco de Dados

Leia \`.tic-code/reverse-engineering/database/\` antes de alterar qualquer query.
**Não altere** COMMIT, ROLLBACK, triggers ou SQL dinâmico sem validação humana.

### Nunca fazer sem validação humana

- Remover endpoints públicos, rotas, scripts de banco ou checagens de autenticação
- Tratar 🟡 INFERIDO como contrato definitivo
- Introduzir dependências externas, bancos, servidores ou fluxos de IA no TIC Coder Lite`;
}

function buildPipelineSection(_summary: ProjectSummary, extensionUri?: vscode.Uri): string {
  const agents = [
    { key: 'reversa-scout', label: 'Scout', role: 'Reconhecimento — inventário, linguagens, entry points' },
    { key: 'reversa-archaeologist', label: 'Archaeologist', role: 'Escavação — módulos, fluxos de controle, acoplamento' },
    { key: 'reversa-detective', label: 'Detective', role: 'Interpretação — regras de negócio, máquinas de estado, ADRs' },
    { key: 'reversa-architect', label: 'Architect', role: 'Síntese — C4, ERD, integrações, decisões arquiteturais' },
    { key: 'reversa-writer', label: 'Writer', role: 'Geração — SDDs, OpenAPI, user stories, traceability' },
    { key: 'reversa-reviewer', label: 'Reviewer', role: 'Revisão — inconsistências, confiança, gaps, perguntas' },
    { key: 'reversa-data-master', label: 'Data Master', role: 'Banco — DDL, migrations, ERD completo, procedures' }
  ];

  const lines = [
    '## Pipeline Reversa Engine',
    '',
    '| Fase | Agente | Responsabilidade | Skill |',
    '| --- | --- | --- | --- |'
  ];

  for (const agent of agents) {
    const hasSkill = extensionUri ? fs.existsSync(getAgentSkillPath(extensionUri, agent.key)) : true;
    const badge = hasSkill ? '✅' : '🔄';
    lines.push(`| ${badge} | **${agent.label}** | ${agent.role} | \`resources/reversa/agents/${agent.key}/\` |`);
  }

  lines.push('');
  lines.push('> ✅ = SKILL.md disponível | 🔄 = executado deterministicamente');
  return lines.join('\n');
}

function buildConfidenceSection(): string {
  return `## Escala de Confiança (Reversa)

| Símbolo | Nome | Uso |
| --- | --- | --- |
| 🟢 | **CONFIRMADO** | Extraído diretamente do código com arquivo e linha |
| 🟡 | **INFERIDO** | Deduzido por padrão — pode estar errado, valide antes de usar |
| 🔴 | **LACUNA** | Não determinável estaticamente — pergunte ao usuário |

> Créditos: Escala de confiança do Reversa by Sandeco (MIT).`;
}

function buildLocalAiSection(): string {
  return `## IA Local (Ollama — Opcional)

A IA Local é **opcional**. TIC Coder Lite funciona completamente sem ela.

- **Padrão:** \`qwen2.5-coder:3b\`
- **Alta qualidade:** \`qwen2.5-coder:7b\`
- Configure: TIC Coder Lite → Configurações → Modelo Local`;
}

function buildCreditsSection(): string {
  return `## Créditos

- **TIC Coder Lite** by TIC / Leonardo Forbici
- **Motor Reversa** by Sandeco — MIT License (adapted)
- Agentes: \`resources/reversa/agents/\` | Docs: \`resources/reversa/docs/\`
- Gerado em: ${new Date().toISOString()}`;
}

function engineLabelFor(engine: AgentContractEngine): string {
  const labels: Record<AgentContractEngine, string> = {
    codex: 'Codex',
    'claude-code': 'Claude Code',
    'github-copilot': 'GitHub Copilot',
    cursor: 'Cursor',
    'gemini-cli': 'Gemini CLI',
    aider: 'Aider'
  };
  return labels[engine] ?? engine;
}

/** Carrega e adapta o SKILL.md de um agente, se disponível */
export function loadAdaptedAgentSkill(agentName: string, extensionUri?: vscode.Uri): string | null {
  if (!extensionUri) return null;
  const skillPath = getAgentSkillPath(extensionUri, agentName);
  try {
    const raw = fs.readFileSync(skillPath, 'utf8');
    const { body } = adaptSkillMd(raw);
    return body;
  } catch {
    return null;
  }
}
