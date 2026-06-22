import * as fs from 'fs';
import * as path from 'path';
import type { FileMetrics, ProjectMetrics } from './computeMetrics';
import type { LayerViolation } from './detectLayerViolations';
import { formatViolations } from './detectLayerViolations';

/** Célula de complexidade cognitiva — `—` quando a origem é regex (sem AST). */
function cognitiveCell(f: FileMetrics): string {
  return f.complexitySource === 'ast' ? String(f.cognitiveComplexity) : '—';
}

/** Célula de profundidade de aninhamento — `—` quando a origem é regex. */
function nestingCell(f: FileMetrics): string {
  return f.complexitySource === 'ast' ? String(f.maxNesting) : '—';
}

/** Célula da pior função (`nome:linha (CC)`) — `—` quando indisponível. */
function worstCell(f: FileMetrics): string {
  const w = f.worstFunction;
  return w ? `\`${w.name}:${w.line}\` (${w.cyclomatic})` : '—';
}

/** Gera metrics-summary.md e metrics.md por módulo */
export function generateMetricsReport(
  outputDir: string,
  metrics: ProjectMetrics,
  violations: LayerViolation[]
): void {
  fs.mkdirSync(outputDir, { recursive: true });

  // ── metrics-summary.md ────────────────────────────────────────────────────────
  const lines: string[] = [
    '# Métricas de Qualidade — TIC Analyzer',
    '',
    `> Gerado em ${new Date().toISOString()}`,
    '',
    '## Resumo do Projeto',
    '',
    '| Métrica | Valor |',
    '| --- | --- |',
    `| Arquivos analisados | ${metrics.files.length} |`,
    `| Funções analisadas (AST) | ${metrics.functions.length} |`,
    `| Funções acima do limite | ${metrics.offenderFunctionCount} |`,
    `| Score de dívida técnica total | ${metrics.totalDebt} pts |`,
    `| Hotspots (alta complexidade + alto acoplamento) | ${metrics.hotspotCount} |`,
    `| Violações arquiteturais | ${violations.length} |`,
    ''
  ];

  // ── Funções mais complexas (visão por função, via AST) ───────────────────────
  if (metrics.functions.length > 0) {
    const topFns = metrics.functions.slice(0, 15);
    lines.push('## 🧩 Funções mais Complexas');
    lines.push('');
    lines.push('| Função | Arquivo | CC | Cognitiva | Aninhamento |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const fn of topFns) {
      const flag = fn.offender ? '🔴' : fn.cyclomatic > 7 ? '🟠' : '🟡';
      lines.push(`| \`${fn.name}:${fn.line}\` | \`${fn.file}\` | ${flag} ${fn.cyclomatic} | ${fn.cognitive} | ${fn.maxNesting} |`);
    }
    lines.push('');

    const offenders = metrics.functions.filter((f) => f.offender);
    if (offenders.length > 0) {
      const t = metrics.thresholds;
      lines.push(`## 🚨 Funções que Excedem Limites (CC>${t.cyclomatic} · Cognitiva>${t.cognitive} · Aninhamento>${t.maxNesting})`);
      lines.push('');
      lines.push(`> ${offenders.length} função(ões) acionável(is) — priorize refatoração aqui.`);
      lines.push('');
      lines.push('| Função | Arquivo | CC | Cognitiva | Aninhamento |');
      lines.push('| --- | --- | --- | --- | --- |');
      for (const fn of offenders.slice(0, 25)) {
        lines.push(`| \`${fn.name}:${fn.line}\` | \`${fn.file}\` | ${fn.cyclomatic} | ${fn.cognitive} | ${fn.maxNesting} |`);
      }
      if (offenders.length > 25) lines.push(`\n*... e mais ${offenders.length - 25} função(ões)*`);
      lines.push('');
    }
  }

  // Top 10 hotspots
  const hotspots = [...metrics.files]
    .filter((f) => f.hotspot)
    .sort((a, b) => b.debtScore - a.debtScore)
    .slice(0, 10);

  if (hotspots.length > 0) {
    lines.push('## 🔥 Top Hotspots (Alta Complexidade + Alto Acoplamento)');
    lines.push('');
    lines.push('| Arquivo | Complexidade | Cognitiva | Aninhamento | Acoplamento In | Debt | Pior Função |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const f of hotspots) {
      const flag = f.cyclomaticComplexity > 30 ? '🔴' : f.cyclomaticComplexity > 15 ? '🟠' : '🟡';
      lines.push(`| \`${f.file}\` | ${flag} ${f.cyclomaticComplexity} | ${cognitiveCell(f)} | ${nestingCell(f)} | ${f.couplingIn} | ${f.debtScore} pts | ${worstCell(f)} |`);
    }
    lines.push('');
  }

  // Top arquivos mais complexos
  const mostComplex = [...metrics.files]
    .sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity)
    .slice(0, 10);

  lines.push('## 📊 Arquivos mais Complexos');
  lines.push('');
  lines.push('| Arquivo | Complexidade Ciclomática | Cognitiva | Aninhamento | Linhas | Pior Função |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const f of mostComplex) {
    const flag = f.cyclomaticComplexity > 30 ? '🔴' : f.cyclomaticComplexity > 15 ? '🟠' : '🟡';
    lines.push(`| \`${f.file}\` | ${flag} ${f.cyclomaticComplexity} | ${cognitiveCell(f)} | ${nestingCell(f)} | ${f.linesOfCode} | ${worstCell(f)} |`);
  }
  lines.push('');

  // Métricas por módulo
  const sortedMods = [...metrics.modules].sort((a, b) => b.debtScore - a.debtScore);
  lines.push('## 📦 Métricas por Módulo');
  lines.push('');
  lines.push('| Módulo | Complexidade Média | Complexidade Máx | Cognitiva Média | Aninhamento Máx | Debt | Hotspots |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const m of sortedMods) {
    const flag = m.debtScore > 50 ? '🔴' : m.debtScore > 20 ? '🟠' : '🟢';
    lines.push(`| **${m.name}** | ${m.avgComplexity} | ${m.maxComplexity} | ${m.avgCognitive} | ${m.maxNesting} | ${flag} ${m.debtScore} pts | ${m.hotspots.length} |`);
  }
  lines.push('');

  // Violações
  lines.push('## ⚠️ Violações Arquiteturais');
  lines.push('');
  lines.push(formatViolations(violations));

  lines.push('---');
  lines.push('> **Complexidade Ciclomática (McCabe)**: 1-10 = baixa 🟢, 11-20 = média 🟡, 21-30 = alta 🟠, >30 = crítica 🔴');
  lines.push('> **Cognitiva** e **Aninhamento**: medidos por função via AST real (Java/TS/JS); `—` indica fallback regex (linguagem sem gramática).');
  lines.push('> **Pior Função**: função de maior complexidade ciclomática no arquivo (`nome:linha`).');
  lines.push(`> **Funções acima do limite** 🔴: CC>${metrics.thresholds.cyclomatic}, cognitiva>${metrics.thresholds.cognitive} ou aninhamento>${metrics.thresholds.maxNesting}.`);
  lines.push('> **Debt Score**: pontos de dívida técnica ponderados (complexidade + cognitiva + tamanho + acoplamento)');

  fs.writeFileSync(path.join(outputDir, 'metrics-summary.md'), lines.join('\n'), 'utf8');

  // ── metrics.md por módulo ──────────────────────────────────────────────────
  for (const mod of metrics.modules) {
    const modDir = path.join(outputDir, 'modules', mod.name);
    if (!fs.existsSync(modDir)) continue;

    const modFiles = metrics.files.filter((f) => f.file.includes(mod.name + '/') || f.file.startsWith(mod.name));
    if (modFiles.length === 0) continue;

    const mLines = [
      `# Métricas — ${mod.name}`,
      '',
      `| Métrica | Valor |`,
      `| --- | --- |`,
      `| Complexidade média | ${mod.avgComplexity} |`,
      `| Complexidade máxima | ${mod.maxComplexity} (\`${path.basename(mod.maxComplexityFile)}\`) |`,
      `| Cognitiva média | ${mod.avgCognitive} |`,
      `| Aninhamento máximo | ${mod.maxNesting} |`,
      `| Acoplamento médio (in) | ${mod.avgCouplingIn} |`,
      `| Score de dívida | ${mod.debtScore} pts |`,
      `| Hotspots | ${mod.hotspots.length} |`,
      ''
    ];

    if (mod.hotspots.length > 0) {
      mLines.push('## Hotspots');
      mLines.push('');
      for (const h of mod.hotspots) {
        mLines.push(`- \`${h}\``);
      }
      mLines.push('');
    }

    const sorted = [...modFiles].sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity).slice(0, 10);
    mLines.push('## Complexidade por Arquivo');
    mLines.push('');
    mLines.push('| Arquivo | CC | Cognitiva | Aninhamento | Linhas | Coupling In | Debt |');
    mLines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const f of sorted) {
      const flag = f.cyclomaticComplexity > 30 ? '🔴' : f.cyclomaticComplexity > 15 ? '🟠' : '🟢';
      mLines.push(`| \`${path.basename(f.file)}\` | ${flag} ${f.cyclomaticComplexity} | ${cognitiveCell(f)} | ${nestingCell(f)} | ${f.linesOfCode} | ${f.couplingIn} | ${f.debtScore} |`);
    }

    const modFns = metrics.functions.filter((fn) => fn.module === mod.name).slice(0, 10);
    if (modFns.length > 0) {
      mLines.push('');
      mLines.push('## Funções mais Complexas');
      mLines.push('');
      mLines.push('| Função | Arquivo | CC | Cognitiva | Aninhamento |');
      mLines.push('| --- | --- | --- | --- | --- |');
      for (const fn of modFns) {
        const flag = fn.offender ? '🔴' : fn.cyclomatic > 7 ? '🟠' : '🟡';
        mLines.push(`| \`${fn.name}:${fn.line}\` | \`${path.basename(fn.file)}\` | ${flag} ${fn.cyclomatic} | ${fn.cognitive} | ${fn.maxNesting} |`);
      }
    }

    fs.writeFileSync(path.join(modDir, 'metrics.md'), mLines.join('\n'), 'utf8');
  }

  // ── complex-functions.json (consumido pelo MCP list_complex_functions) ───────
  const fnPayload = {
    thresholds: metrics.thresholds,
    totalFunctions: metrics.functions.length,
    offenderCount: metrics.offenderFunctionCount,
    functions: metrics.functions.slice(0, 500)
  };
  fs.writeFileSync(path.join(outputDir, 'complex-functions.json'), JSON.stringify(fnPayload), 'utf8');
}
