import * as fs from 'fs';
import * as path from 'path';
import type { GitHistory, FileChurn } from './analyzeGitHistory';
import type { FileMetrics } from './computeMetrics';

export interface BehavioralHotspot {
  file: string;
  commits: number;
  complexity: number;
  linesOfCode: number;
  ageDays: number;
  mainAuthor: string;
  /** 0–100: alta complexidade × alta frequência de mudança (estilo CodeScene). */
  score: number;
}

/**
 * Hotspot comportamental = complexidade × frequência de mudança. Um arquivo
 * complexo que ninguém toca é dívida fria; um arquivo complexo que muda toda
 * semana é onde os bugs nascem. É a métrica-assinatura do CodeScene, impossível
 * de calcular sem o histórico do git.
 */
export function computeBehavioralHotspots(churn: FileChurn[], metrics: FileMetrics[]): BehavioralHotspot[] {
  if (churn.length === 0) return [];
  const ccByFile = new Map<string, FileMetrics>();
  for (const m of metrics) ccByFile.set(m.file, m);

  const maxCommits = Math.max(...churn.map((c) => c.commits), 1);
  const maxCc = Math.max(...metrics.map((m) => m.cyclomaticComplexity), 1);

  const hotspots: BehavioralHotspot[] = [];
  for (const c of churn) {
    const m = ccByFile.get(c.file);
    if (!m) continue; // sem métrica estática (ex.: arquivo não-código)
    const normChange = c.commits / maxCommits;
    const normComplexity = m.cyclomaticComplexity / maxCc;
    const score = Math.round(normChange * normComplexity * 100);
    if (score <= 0) continue;
    hotspots.push({
      file: c.file,
      commits: c.commits,
      complexity: m.cyclomaticComplexity,
      linesOfCode: m.linesOfCode,
      ageDays: c.ageDays,
      mainAuthor: c.mainAuthor,
      score
    });
  }
  hotspots.sort((a, b) => b.score - a.score);
  return hotspots;
}

/** Gera behavioral-hotspots.md, change-coupling.md, knowledge-map.md e git-history.json. */
export function generateGitReport(
  outputDir: string,
  history: GitHistory,
  metrics: FileMetrics[]
): { behavioralHotspots: number } {
  fs.mkdirSync(outputDir, { recursive: true });

  if (!history.available) {
    const note = `# Análise Temporal (git)\n\n> Indisponível: ${history.reason ?? 'histórico git não encontrado'}.\n\nA análise comportamental (hotspots por mudança, change coupling, bus factor) requer um repositório git com histórico de commits.\n`;
    fs.writeFileSync(path.join(outputDir, 'behavioral-hotspots.md'), note, 'utf8');
    fs.writeFileSync(path.join(outputDir, 'git-history.json'), JSON.stringify({ available: false, reason: history.reason }), 'utf8');
    return { behavioralHotspots: 0 };
  }

  const hotspots = computeBehavioralHotspots(history.churn, metrics);

  // ── behavioral-hotspots.md ────────────────────────────────────────────────
  const hLines: string[] = [
    '# 🔥 Hotspots Comportamentais (Complexidade × Mudança)',
    '',
    `> ${history.analyzedCommits.toLocaleString()} commits analisados (${history.rangeFrom} → ${history.rangeTo})`,
    '> Score = complexidade ciclomática × frequência de mudança, normalizado 0–100.',
    '> Arquivos com score alto concentram risco: complexos **e** sob mudança constante.',
    '',
    '| Arquivo | Score | Commits | Complexidade | Linhas | Idade (dias) | Autor principal |',
    '| --- | --- | --- | --- | --- | --- | --- |'
  ];
  for (const h of hotspots.slice(0, 30)) {
    const flag = h.score > 60 ? '🔴' : h.score > 30 ? '🟠' : '🟡';
    hLines.push(`| \`${h.file}\` | ${flag} ${h.score} | ${h.commits} | ${h.complexity} | ${h.linesOfCode} | ${h.ageDays} | ${h.mainAuthor} |`);
  }
  if (hotspots.length === 0) hLines.push('| _nenhum hotspot comportamental detectado_ | | | | | | |');
  hLines.push('');
  hLines.push('---');
  hLines.push('> Priorize refatoração nos hotspots 🔴: é onde a complexidade encontra a mudança frequente.');
  fs.writeFileSync(path.join(outputDir, 'behavioral-hotspots.md'), hLines.join('\n'), 'utf8');

  // ── change-coupling.md ────────────────────────────────────────────────────
  const cLines: string[] = [
    '# 🔗 Change Coupling (Acoplamento Temporal)',
    '',
    '> Arquivos que mudam **juntos** nos mesmos commits — acoplamento invisível ao grafo de imports.',
    '> Grau = co-mudanças / mudanças do arquivo menos alterado (0–1). Grau alto sugere dependência oculta.',
    '',
    '| Arquivo A | Arquivo B | Co-mudanças | Grau |',
    '| --- | --- | --- | --- |'
  ];
  for (const p of history.coupling.slice(0, 40)) {
    const flag = p.degree >= 0.8 ? '🔴' : p.degree >= 0.5 ? '🟠' : '🟡';
    cLines.push(`| \`${p.a}\` | \`${p.b}\` | ${p.coChanges} | ${flag} ${p.degree} |`);
  }
  if (history.coupling.length === 0) cLines.push('| _nenhum acoplamento temporal relevante_ | | | |');
  fs.writeFileSync(path.join(outputDir, 'change-coupling.md'), cLines.join('\n'), 'utf8');

  // ── knowledge-map.md ──────────────────────────────────────────────────────
  const kLines: string[] = [
    '# 👥 Knowledge Map / Bus Factor',
    '',
    '> **Bus factor** = nº mínimo de autores que concentram >50% das mudanças do módulo.',
    '> Bus factor 1–2 = risco de pessoa-chave (conhecimento concentrado).',
    '',
    '| Módulo | Bus Factor | Autores | Autor principal | % do principal |',
    '| --- | --- | --- | --- | --- |'
  ];
  for (const k of history.knowledge.slice(0, 40)) {
    const flag = k.busFactor <= 1 ? '🔴' : k.busFactor === 2 ? '🟠' : '🟢';
    kLines.push(`| **${k.module}** | ${flag} ${k.busFactor} | ${k.authors} | ${k.mainAuthor} | ${k.mainAuthorPct}% |`);
  }
  if (history.knowledge.length === 0) kLines.push('| _sem dados de autoria por módulo_ | | | | |');
  fs.writeFileSync(path.join(outputDir, 'knowledge-map.md'), kLines.join('\n'), 'utf8');

  // ── git-history.json (consumo programático / UI) ──────────────────────────
  fs.writeFileSync(path.join(outputDir, 'git-history.json'), JSON.stringify({
    available: true,
    analyzedCommits: history.analyzedCommits,
    rangeFrom: history.rangeFrom,
    rangeTo: history.rangeTo,
    behavioralHotspots: hotspots.slice(0, 100),
    coupling: history.coupling.slice(0, 100),
    knowledge: history.knowledge
  }), 'utf8');

  return { behavioralHotspots: hotspots.length };
}
