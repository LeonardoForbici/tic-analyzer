/**
 * Gerador do contrato operacional principal para agentes de IA
 *
 * Gera o conteúdo base que é compartilhado por AGENTS.md, CLAUDE.md,
 * copilot-instructions.md, .cursorrules e GEMINI.md.
 *
 * Filosofia: AGENTS.md é um contrato operacional, não um relatório de scan.
 * Inspirado no Reversa by Sandeco (MIT License).
 */

import type { ProjectSummary } from '../types';
import type { ReversaAssets } from './reversaAssetLoader';
import {
  groupRisksForPrompt,
  formatStack,
  formatCentralFiles,
  renderConfidenceScaleSection,
  renderAgentPipelineSection,
  renderOperationalInstructions
} from './reversaPromptAdapter';

export interface OperationalPromptOptions {
  engineName: string;
  targetFile: string;
  engineInstruction: string;
  /** Se true, inclui seção de pipeline de agentes (para AGENTS.md e CLAUDE.md) */
  fullContract?: boolean;
  /** Se true, versão condensada (para Copilot, Cursor) */
  compact?: boolean;
}

/**
 * Gera o contrato operacional completo para um agente de IA.
 * Este é o coração do TIC Coder Lite como ferramenta de programação reversa.
 */
export function generateOperationalAgentPrompt(
  summary: ProjectSummary,
  assets: ReversaAssets,
  options: OperationalPromptOptions
): string {
  const { engineName, targetFile, engineInstruction, fullContract = true, compact = false } = options;
  const projectName = summary.workspaceName;
  const rootPath = summary.rootPath;

  const stack = formatStack(summary);
  const centralFiles = formatCentralFiles(summary, compact ? 5 : 8);
  const risks = groupRisksForPrompt(summary);
  const plsql = summary.inventory.plsql;
  const hasPlSql = plsql.detected || plsql.files.length > 0;
  const totalFiles = summary.totalFiles;
  const totalLines = summary.totalLines;

  // Módulos detectados
  const moduleList = buildModuleList(summary);

  // ── Seção de contrato operacional ─────────────────────────────────────────
  const contractHeader = compact
    ? buildCompactHeader(engineName, targetFile, engineInstruction, projectName)
    : buildFullHeader(engineName, targetFile, engineInstruction, projectName);

  // ── Resumo do projeto ─────────────────────────────────────────────────────
  const projectSummary = `## Resumo do Projeto

- **Projeto:** ${projectName}
- **Raiz:** ${rootPath}
- **Arquivos analisados:** ${totalFiles}
- **Linhas analisadas:** ${totalLines.toLocaleString()}
- **Grafo:** ${summary.graph.stats.nodeCount} nós, ${summary.graph.stats.edgeCount} arestas

## Stack Detectada

${stack}`;

  // ── Módulos ───────────────────────────────────────────────────────────────
  const modulesSection = moduleList
    ? `## Módulos do Projeto\n\n${moduleList}`
    : '';

  // ── Arquivos centrais ─────────────────────────────────────────────────────
  const centralFilesSection = `## Arquivos Mais Centrais (Grafo)

${centralFiles || '- Não detectados'}

> Para análise completa: \`.tic-code/reverse-engineering/code-analysis.md\``;

  // ── Riscos ────────────────────────────────────────────────────────────────
  const risksSection = `## Riscos Técnicos Detectados

${risks}

> Detalhes completos: \`.tic-code/risks.md\` e \`.tic-code/reverse-engineering/traceability/risk-impact-matrix.md\``;

  // ── PL/SQL (somente se detectado) ─────────────────────────────────────────
  const plsqlSection = hasPlSql && !compact
    ? buildPlSqlSection(summary)
    : '';

  // ── Artefatos RE ──────────────────────────────────────────────────────────
  const artifactsSection = `## Artefatos de Programação Reversa

Antes de alterar código, leia:

| Artefato | Conteúdo |
| --- | --- |
| \`.tic-code/reverse-engineering/operational-contracts.md\` | Contratos operacionais por módulo |
| \`.tic-code/reverse-engineering/business-rules.md\` | Regras de negócio candidatas |
| \`.tic-code/reverse-engineering/confidence-report.md\` | Cobertura e lacunas |
| \`.tic-code/reverse-engineering/code-analysis.md\` | Módulos e acoplamento |
| \`.tic-code/reverse-engineering/architecture.md\` | Arquitetura detectada |
| \`.tic-code/reverse-engineering/gaps.md\` | Lacunas 🔴 não confirmadas |
| \`.tic-code/reverse-engineering/questions.md\` | Perguntas para o especialista |
| \`.tic-code/reverse-engineering/traceability/code-spec-matrix.md\` | Rastreabilidade código ↔ spec |
| \`.tic-code/reverse-engineering/traceability/risk-impact-matrix.md\` | Riscos ↔ impacto ↔ módulo |`;

  // ── Instruções operacionais ───────────────────────────────────────────────
  const operationalInstructions = renderOperationalInstructions(engineName);

  // ── Escala de confiança ───────────────────────────────────────────────────
  const confidenceSection = compact ? renderCompactConfidenceScale() : renderConfidenceScaleSection(assets);

  // ── Pipeline (somente fullContract) ──────────────────────────────────────
  const pipelineSection = fullContract && !compact
    ? renderAgentPipelineSection(assets)
    : '';

  // ── IA Local ─────────────────────────────────────────────────────────────
  const localAiSection = !compact ? `## IA Local (Ollama)

A IA Local é **opcional** — o TIC Coder Lite funciona completamente sem ela.

- **Padrão recomendado:** \`qwen2.5-coder:3b\`
- **Alta qualidade:** \`qwen2.5-coder:7b\`
- Configure em: TIC Coder Lite → Configurações → Modelo Local` : '';

  // ── Créditos ─────────────────────────────────────────────────────────────
  const creditsSection = `## Créditos

- **TIC Coder Lite** by TIC / Leonardo Forbici
- **Metodologia Reversa** by Sandeco — MIT License (adapted)
- Agentes utilizados como base: \`resources/reversa/agents/\` e \`resources/reversa/docs/agents/\`
- Gerado em: ${new Date().toISOString()}`;

  // ── Montar documento final ─────────────────────────────────────────────────
  const sections = [
    contractHeader,
    projectSummary,
    modulesSection,
    centralFilesSection,
    risksSection,
    plsqlSection,
    artifactsSection,
    operationalInstructions,
    confidenceSection,
    pipelineSection,
    localAiSection,
    creditsSection
  ].filter(Boolean);

  return sections.join('\n\n') + '\n';
}

function buildFullHeader(
  engineName: string,
  targetFile: string,
  engineInstruction: string,
  projectName: string
): string {
  return `# TIC Coder Lite — Contrato de Programação Reversa para ${engineName}

> Este arquivo foi gerado pelo TIC Coder Lite e salvo em \`${targetFile}\`.
> ${engineInstruction}

---

Você está trabalhando em um sistema legado: **${projectName}**.

Antes de planejar, editar, refatorar ou gerar código, trate \`.tic-code/reverse-engineering/\` como a **especificação operacional** extraída do sistema existente.

Seu objetivo não é apenas implementar mudanças.
Seu objetivo é **preservar** comportamento, regras de negócio, contratos, permissões, SQL/PL\\SQL, fluxos e decisões arquiteturais existentes.

Use os artefatos abaixo como fonte da verdade. Se não existir documentação, marque como 🔴 LACUNA e pergunte ao usuário.

---`;
}

function buildCompactHeader(
  engineName: string,
  targetFile: string,
  engineInstruction: string,
  projectName: string
): string {
  return `# TIC Coder Lite — Instruções para ${engineName}

> Gerado automaticamente para \`${targetFile}\`. ${engineInstruction}

**Projeto:** ${projectName} | **Especificação:** \`.tic-code/reverse-engineering/\`

Preserve comportamento existente. Use \`.tic-code/\` como fonte da verdade. Para 🔴 LACUNA, pergunte antes de agir.`;
}

function buildModuleList(summary: ProjectSummary): string {
  const modules = summary.inventory.modules;
  if (modules.length === 0) {
    // Tentar inferir de pastas de scan
    const folderMap = new Map<string, number>();
    for (const file of summary.scan.files) {
      const parts = file.relativePath.replace(/\\/g, '/').split('/');
      if (parts.length >= 2) {
        const folder = parts.slice(0, 2).join('/');
        folderMap.set(folder, (folderMap.get(folder) ?? 0) + 1);
      }
    }
    const topFolders = [...folderMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .filter(([f]) => !f.startsWith('node_modules') && !f.startsWith('dist'));
    if (topFolders.length === 0) return '';
    return topFolders.map(([folder, count]) => `- \`${folder}/\` — ${count} arquivo(s)`).join('\n');
  }
  return modules
    .slice(0, 10)
    .map((m) => `- **${m.kind}** — ${m.files.length} arquivo(s)`)
    .join('\n');
}

function buildPlSqlSection(summary: ProjectSummary): string {
  const plsql = summary.inventory.plsql;
  const triggers = plsql.entities.filter((e) => e.kind === 'trigger').length;
  const procedures = plsql.entities.filter((e) => e.kind === 'procedure').length;
  const functions = plsql.entities.filter((e) => e.kind === 'function').length;
  const packages = plsql.entities.filter((e) => e.kind === 'package' || e.kind === 'package_body').length;

  const lines = [
    '## PL/SQL / Banco de Dados',
    '',
    `- Arquivos PL/SQL: ${plsql.files.length}`,
    `- Packages: ${packages}`,
    `- Procedures: ${procedures}`,
    `- Functions: ${functions}`,
    `- Triggers: ${triggers}`,
    `- Tabelas referenciadas: ${plsql.tableReferences.length}`,
    '',
    '> **⚠️ Atenção:** Triggers, procedures e packages PL/SQL podem conter regras de negócio críticas.',
    '> Leia `.tic-code/reverse-engineering/plsql-analysis.md` antes de alterar queries ou tabelas.',
    '> **Não altere** COMMIT, ROLLBACK, triggers ou SQL dinâmico sem validação humana.'
  ];

  if (plsql.tableReferences.length > 10) {
    const top = plsql.tableReferences.slice(0, 5).map((t) => `\`${t.name}\``).join(', ');
    lines.push('');
    lines.push(`Tabelas mais referenciadas: ${top} + ${plsql.tableReferences.length - 5} outras.`);
    lines.push('> Ver lista completa: `.tic-code/reverse-engineering/database-analysis.md`');
  }

  return lines.join('\n');
}

function renderCompactConfidenceScale(): string {
  return `## Escala de Confiança

| Símbolo | Significado |
| --- | --- |
| 🟢 CONFIRMADO | Extraído diretamente do código |
| 🟡 INFERIDO | Deduzido por padrão — pode estar errado |
| 🔴 LACUNA | Requer validação humana — não invente |`;
}
