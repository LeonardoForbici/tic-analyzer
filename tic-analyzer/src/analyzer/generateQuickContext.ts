import type { ScannedFile } from './scanFiles';
import type { StackInfo } from './detectStack';
import type { ProjectModule } from './detectModules';
import type { RiskFinding } from './detectRisks';
import type { EndpointFound } from './detectEndpoints';
import type { DependencyGraph } from './buildDependencyGraph';
import { TokenBudget, estimateTokens } from './tokenBudget';

export interface QuickContextInput {
  projectName: string;
  rootPath: string;
  totalFiles: number;
  totalLines: number;
  stack: StackInfo;
  modules: ProjectModule[];
  risks: RiskFinding[];
  endpoints: EndpointFound[];
  graph: DependencyGraph;
  generatedAt: string;
}

/** Gera quick-context.md — arquivo compacto único para Copilot/Claude (~50KB, ~12k tokens) */
export function generateQuickContext(input: QuickContextInput, maxTokens = 12_000): string {
  const budget = new TokenBudget(maxTokens);
  const sections: string[] = [];

  // ── HEADER (sempre) ──────────────────────────────────────────────────────────
  const header = `# ${input.projectName} — Quick Context (TIC Analyzer)

> Gerado em: ${input.generatedAt}
> Arquivos: **${input.totalFiles.toLocaleString()}** | Linhas: **${input.totalLines.toLocaleString()}**
> Modo: Large Project — Engine local, zero tokens de análise

---
`;
  budget.consume(header);
  sections.push(header);

  // ── STACK (sempre) ───────────────────────────────────────────────────────────
  const stackLines = [
    '## Stack Detectada\n',
    `- **Linguagem principal:** ${input.stack.primaryLanguage}`,
    ...Object.entries(input.stack.languages)
      .slice(0, 6)
      .map(([lang, count]) => `- ${lang}: ${count} arquivos`),
    '',
    input.stack.frameworks.length > 0
      ? `**Frameworks:** ${input.stack.frameworks.join(', ')}`
      : '',
    input.stack.packageManagers.length > 0
      ? `**Package managers:** ${input.stack.packageManagers.join(', ')}`
      : '',
    ''
  ].filter(Boolean).join('\n');

  budget.consume(stackLines);
  sections.push(stackLines);

  // ── MÓDULOS (sempre) ─────────────────────────────────────────────────────────
  const moduleRows = input.modules.slice(0, 15).map((m) =>
    `| \`${m.path}\` | ${m.fileCount.toLocaleString()} | ${m.languages.join(', ')} | ~${Math.ceil(m.estimatedTokens / 1000)}k tokens |`
  );
  const modulesSection = [
    '## Módulos Detectados\n',
    '| Módulo | Arquivos | Linguagens | Contexto estimado |',
    '| --- | --- | --- | --- |',
    ...moduleRows,
    '',
    '> Para contexto detalhado de um módulo: `.tic-code/modules/{nome}/context.md`',
    '> Para lista completa: `.tic-code/index.md`',
    ''
  ].join('\n');

  budget.consume(modulesSection);
  sections.push(modulesSection);

  // ── ARQUIVOS CENTRAIS (sempre) ────────────────────────────────────────────────
  if (input.graph.centralFiles.length > 0) {
    const centralSection = [
      '## Arquivos Mais Referenciados\n',
      ...input.graph.centralFiles.slice(0, 10).map((f) => `- \`${f}\``),
      ''
    ].join('\n');
    budget.consume(centralSection);
    sections.push(centralSection);
  }

  // ── RISCOS CRÍTICOS (sempre) ──────────────────────────────────────────────────
  const criticalRisks = input.risks.filter((r) => r.level === 'critical');
  const highRisks = input.risks.filter((r) => r.level === 'high');

  if (criticalRisks.length > 0 || highRisks.length > 0) {
    const riskLines: string[] = ['## Riscos Técnicos\n'];

    if (criticalRisks.length > 0) {
      riskLines.push('### 🔴 Críticos');
      for (const r of criticalRisks.slice(0, 8)) {
        riskLines.push(`- **${r.title}** → \`${r.file}${r.line ? `:${r.line}` : ''}\``);
      }
      riskLines.push('');
    }

    if (highRisks.length > 0) {
      riskLines.push('### 🟠 Altos');
      for (const r of highRisks.slice(0, 5)) {
        riskLines.push(`- **${r.title}** → \`${r.file}${r.line ? `:${r.line}` : ''}\``);
      }
      riskLines.push('');
    }

    const risksSection = riskLines.join('\n');
    budget.consume(risksSection);
    sections.push(risksSection);
  }

  // ── ENDPOINTS (se tiver budget) ───────────────────────────────────────────────
  if (input.endpoints.length > 0) {
    const epRows = input.endpoints.slice(0, 20).map((e) =>
      `| \`${e.method}\` | \`${e.path}\` | \`${e.file}:${e.line}\` |`
    );
    const epSection = [
      '## Endpoints REST Detectados\n',
      `Total encontrado: ${input.endpoints.length}`,
      '',
      '| Método | Path | Arquivo |',
      '| --- | --- | --- |',
      ...epRows,
      input.endpoints.length > 20 ? `\n> ...e mais ${input.endpoints.length - 20} endpoints` : '',
      ''
    ].join('\n');

    if (budget.fits(epSection)) {
      budget.consume(epSection);
      sections.push(epSection);
    } else {
      const truncated = budget.truncate(epSection);
      sections.push(truncated);
    }
  }

  // ── DEPENDÊNCIAS EXTERNAS (se tiver budget) ───────────────────────────────────
  if (input.graph.externalDeps.length > 0 && budget.remaining > 500) {
    const depsSection = [
      '## Dependências Externas Principais\n',
      ...input.graph.externalDeps.slice(0, 20).map((d) => `- \`${d}\``),
      ''
    ].join('\n');

    if (budget.fits(depsSection)) {
      budget.consume(depsSection);
      sections.push(depsSection);
    }
  }

  // ── FOOTER (sempre) ───────────────────────────────────────────────────────────
  const footer = [
    '---',
    '',
    '## Como Usar Este Contexto',
    '',
    '| Necessidade | Arquivo |',
    '| --- | --- |',
    '| Visão geral dos módulos | `.tic-code/index.md` |',
    '| Detalhe de um módulo específico | `.tic-code/modules/{nome}/context.md` |',
    '| Todos os endpoints | `.tic-code/modules/{nome}/context.md` |',
    '',
    '> **Instrução para IA:** Antes de responder sobre um módulo específico, leia apenas o arquivo de contexto daquele módulo.',
    '> Não leia todos os arquivos de módulo de uma vez — use apenas o relevante para a pergunta atual.',
    '',
    `> Tokens estimados neste arquivo: ~${budget.usedTokens.toLocaleString()}`,
    ''
  ].join('\n');

  budget.consume(footer);
  sections.push(footer);

  return sections.join('');
}
