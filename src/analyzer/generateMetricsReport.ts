import * as fs from 'fs';
import * as path from 'path';
import type { ProjectMetrics } from './computeMetrics';
import type { LayerViolation } from './detectLayerViolations';
import { formatViolations } from './detectLayerViolations';

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
    `| Score de dívida técnica total | ${metrics.totalDebt} pts |`,
    `| Hotspots (alta complexidade + alto acoplamento) | ${metrics.hotspotCount} |`,
    `| Violações arquiteturais | ${violations.length} |`,
    ''
  ];

  // Top 10 hotspots
  const hotspots = [...metrics.files]
    .filter((f) => f.hotspot)
    .sort((a, b) => b.debtScore - a.debtScore)
    .slice(0, 10);

  if (hotspots.length > 0) {
    lines.push('## 🔥 Top Hotspots (Alta Complexidade + Alto Acoplamento)');
    lines.push('');
    lines.push('| Arquivo | Complexidade | Acoplamento In | Debt |');
    lines.push('| --- | --- | --- | --- |');
    for (const f of hotspots) {
      const flag = f.cyclomaticComplexity > 30 ? '🔴' : f.cyclomaticComplexity > 15 ? '🟠' : '🟡';
      lines.push(`| \`${f.file}\` | ${flag} ${f.cyclomaticComplexity} | ${f.couplingIn} | ${f.debtScore} pts |`);
    }
    lines.push('');
  }

  // Top arquivos mais complexos
  const mostComplex = [...metrics.files]
    .sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity)
    .slice(0, 10);

  lines.push('## 📊 Arquivos mais Complexos');
  lines.push('');
  lines.push('| Arquivo | Complexidade Ciclomática | Linhas |');
  lines.push('| --- | --- | --- |');
  for (const f of mostComplex) {
    const flag = f.cyclomaticComplexity > 30 ? '🔴' : f.cyclomaticComplexity > 15 ? '🟠' : '🟡';
    lines.push(`| \`${f.file}\` | ${flag} ${f.cyclomaticComplexity} | ${f.linesOfCode} |`);
  }
  lines.push('');

  // Métricas por módulo
  const sortedMods = [...metrics.modules].sort((a, b) => b.debtScore - a.debtScore);
  lines.push('## 📦 Métricas por Módulo');
  lines.push('');
  lines.push('| Módulo | Complexidade Média | Complexidade Máx | Debt | Hotspots |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const m of sortedMods) {
    const flag = m.debtScore > 50 ? '🔴' : m.debtScore > 20 ? '🟠' : '🟢';
    lines.push(`| **${m.name}** | ${m.avgComplexity} | ${m.maxComplexity} | ${flag} ${m.debtScore} pts | ${m.hotspots.length} |`);
  }
  lines.push('');

  // Violações
  lines.push('## ⚠️ Violações Arquiteturais');
  lines.push('');
  lines.push(formatViolations(violations));

  lines.push('---');
  lines.push('> **Complexidade Ciclomática**: 1-10 = baixa 🟢, 11-20 = média 🟡, 21-30 = alta 🟠, >30 = crítica 🔴');
  lines.push('> **Debt Score**: pontos de dívida técnica ponderados (complexidade + tamanho + acoplamento)');

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
    mLines.push('| Arquivo | CC | Linhas | Coupling In | Debt |');
    mLines.push('| --- | --- | --- | --- | --- |');
    for (const f of sorted) {
      const flag = f.cyclomaticComplexity > 30 ? '🔴' : f.cyclomaticComplexity > 15 ? '🟠' : '🟢';
      mLines.push(`| \`${path.basename(f.file)}\` | ${flag} ${f.cyclomaticComplexity} | ${f.linesOfCode} | ${f.couplingIn} | ${f.debtScore} |`);
    }

    fs.writeFileSync(path.join(modDir, 'metrics.md'), mLines.join('\n'), 'utf8');
  }
}
