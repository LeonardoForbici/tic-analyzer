/**
 * Verificação da camada "Valor & Custo" — roda contra dist/.
 *
 * ROI (puro), ownership/bus-factor, pipeline gerando roi.json/ownership.json,
 * relatório executivo HTML, MCP (get_roi/get_ownership/suggest_reviewers) e
 * a seção "Revisor sugerido" no PR review.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:server\`.`); process.exit(1); } return p; };

const { computeRoi, resolveRoiConfig, DEFAULT_ROI } = require(need(join(root, 'dist/src/analyzer/computeRoi.js')));
const { computeOwnership, suggestReviewers } = require(need(join(root, 'dist/src/analyzer/computeOwnership.js')));
const { renderExecutiveHtml, buildExecReportData } = require(need(join(root, 'dist/src/analyzer/generateExecutiveReport.js')));
const { runPipeline } = require(need(join(root, 'dist/src/analyzer/pipeline.js')));

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name); }
};
const cleanup = (dir) => { for (const p of ['.tic-code', '.github', 'CLAUDE.md']) rmSync(join(dir, p), { recursive: true, force: true }); };

(async () => {
  console.log('\n(1) ROI (puro)\n');
  const fm = [
    { file: 'a.ts', cyclomaticComplexity: 30, linesOfCode: 600, couplingIn: 8, couplingOut: 3, debtScore: 40, hotspot: true },
    { file: 'b.ts', cyclomaticComplexity: 5, linesOfCode: 50, couplingIn: 1, couplingOut: 1, debtScore: 0, hotspot: false }
  ];
  const mods = [{ name: 'core', path: 'src', files: [{ relativePath: 'a.ts' }, { relativePath: 'b.ts' }], fileCount: 2, languages: ['TypeScript'], estimatedTokens: 0 }];
  const roi = computeRoi(fm, mods, [{ totalImpacted: 120 }, { totalImpacted: 60 }], { hourlyRate: 100, currency: 'R$', hoursPerDebtPoint: 0.5 });
  check('R1: horas = debtScore × hoursPerDebtPoint', roi.remediationHours === 20, `=${roi.remediationHours}`);
  check('R2: custo = horas × taxa', roi.debtCost === 2000, `=${roi.debtCost}`);
  check('R3: dev-days = horas/8', roi.devDays === 2.5, `=${roi.devDays}`);
  check('R4: horas economizadas crescem com pr-history (180 × 5min)', roi.hoursSaved === 15, `=${roi.hoursSaved}`);
  check('R5: moeda propagada', roi.currency === 'R$');
  check('R6: byModule tem core com custo', roi.byModule.some((m) => m.module === 'core' && m.cost === 2000));
  check('R7: default aplicado sem config', resolveRoiConfig(undefined).hourlyRate === DEFAULT_ROI.hourlyRate && computeRoi(fm, mods, [], undefined).debtCost === 40 * 0.5 * DEFAULT_ROI.hourlyRate);

  console.log('\n(2) Ownership & bus-factor (puro)\n');
  const authorship = new Map([
    ['crit.ts', { authors: new Map([['ana', 9]]), primaryAuthor: 'ana', lastTouchDaysAgo: 3 }],
    ['shared.ts', { authors: new Map([['ana', 4], ['bob', 6]]), primaryAuthor: 'bob', lastTouchDaysAgo: 10 }]
  ]);
  const ownFm = [
    { file: 'crit.ts', cyclomaticComplexity: 20, linesOfCode: 300, couplingIn: 12, couplingOut: 2, debtScore: 30, hotspot: true },
    { file: 'shared.ts', cyclomaticComplexity: 8, linesOfCode: 120, couplingIn: 4, couplingOut: 1, debtScore: 5, hotspot: false }
  ];
  const ownMods = [{ name: 'core', path: 'src', files: [{ relativePath: 'crit.ts' }, { relativePath: 'shared.ts' }], fileCount: 2, languages: ['TypeScript'], estimatedTokens: 0 }];
  const own = computeOwnership(authorship, ownFm, ownMods);
  check('O1: módulo tem dono e bus-factor', own.modules[0]?.primaryOwner === 'bob' || own.modules[0]?.primaryOwner === 'ana', JSON.stringify(own.modules[0]));
  check('O2: crit.ts (1 autor, alto impacto) entra em conhecimento em risco', own.knowledgeRisk.some((k) => k.file === 'crit.ts' && k.author === 'ana'), JSON.stringify(own.knowledgeRisk));
  check('O3: shared.ts (2 autores) NÃO entra em risco de bus-factor', !own.knowledgeRisk.some((k) => k.file === 'shared.ts'));
  check('O4: onboardingHours e difficulty presentes', typeof own.modules[0]?.onboardingHours === 'number' && !!own.modules[0]?.difficulty);
  const reviewers = suggestReviewers(own.fileOwner, ['crit.ts', 'shared.ts']);
  check('O5: suggestReviewers devolve donos', reviewers.length >= 1 && reviewers[0].files.length >= 1, JSON.stringify(reviewers));

  console.log('\n(3) Relatório executivo (HTML)\n');
  const html = renderExecutiveHtml({
    projectName: 'Demo',
    health: { score: 72, grade: 'B' },
    roi: { currency: 'US$', remediationHours: 20, devDays: 2.5, debtCost: 2000, hoursSaved: 15, savedCost: 1500, net: -500, byModule: [{ module: 'core', cost: 2000 }] },
    risks: { total: 3, critical: 1, high: 1, items: [{ level: 'critical', title: 'eval', file: 'x.ts' }] },
    archViolations: { errorCount: 1, warnCount: 2 },
    ownership: { knowledgeRisk: [{ file: 'crit.ts', author: 'ana', reason: '12 dependentes' }], modules: [] },
    snapshots: [{ timestamp: 't1', score: 70 }, { timestamp: 't2', score: 72 }]
  });
  check('H1: HTML tem doctype e Tailwind', html.includes('<!doctype html') && html.includes('src="https://cdn.tailwindcss.com"'));
  check('H2: seções Health/ROI/Riscos/Bus-factor', html.includes('Health') && html.includes('Custo da dívida') && html.includes('Principais riscos') && html.includes('conhecimento'));
  check('H3: buildExecReportData lê analysis.json', (() => { const d = buildExecReportData((f) => f === 'analysis.json' ? { project: { name: 'P' }, health: { score: 80, grade: 'B' } } : null); return d.projectName === 'P' && d.health.score === 80; })());

  console.log('\n(4) Pipeline gera roi.json + ownership.json + analysis (fixture)\n');
  const fixture = join(root, 'test', 'fixtures', 'crosstier');
  cleanup(fixture);
  const r = await runPipeline(fixture, () => {}, { skipAiFiles: true });
  check('P0: pipeline concluiu', r.success, r.error ?? '');
  check('P1: roi.json gerado', existsSync(join(fixture, '.tic-code', 'roi.json')));
  check('P2: ownership.json gerado', existsSync(join(fixture, '.tic-code', 'ownership.json')));
  const analysis = JSON.parse(readFileSync(join(fixture, '.tic-code', 'analysis.json'), 'utf8'));
  check('P3: analysis.json inclui roi e ownership', !!analysis.roi && !!analysis.ownership);
  check('P4: PipelineResult expõe roiDebtCost', typeof r.roiDebtCost === 'number');

  console.log('\n(5) Artefatos que as tools MCP get_roi/get_ownership leem\n');
  const roiJson = JSON.parse(readFileSync(join(fixture, '.tic-code', 'roi.json'), 'utf8'));
  check('M1: roi.json tem currency/debtCost/devDays', !!roiJson.currency && typeof roiJson.debtCost === 'number' && typeof roiJson.devDays === 'number');
  const ownJson = JSON.parse(readFileSync(join(fixture, '.tic-code', 'ownership.json'), 'utf8'));
  check('M2: ownership.json tem modules/fileOwner', Array.isArray(ownJson.modules) && typeof ownJson.fileOwner === 'object');

  console.log('\n(6) PR review — Revisor sugerido\n');
  const { compareAnalyses, formatPrComment } = require(need(join(root, 'dist/src/cli/prReview.js')));
  // head = fixture (tem ownership.json); usa o próprio como base e head só p/ exercitar o formato
  const result = compareAnalyses(fixture, fixture, ['backend/repository/ClienteRepository.java']);
  const md = formatPrComment(result);
  check('PR1: result.reviewers presente (array)', Array.isArray(result.reviewers));
  check('PR2: comentário renderiza sem erro', md.includes('TIC Analyzer'));

  cleanup(fixture);
  console.log('');
  if (failures.length) { console.error(`✗ ${failures.length} verificação(ões) falharam`); process.exit(1); }
  console.log('✓ camada valor & custo verificada');
  process.exit(0);
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
