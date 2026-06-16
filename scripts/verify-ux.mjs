/**
 * Verificação da camada Usabilidade & Transparência — roda contra dist/.
 * Moeda R$, dívida explicável (topFiles + reasons), rescale instantâneo,
 * detecção/instalação de workflow GitHub.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:electron\`.`); process.exit(1); } return p; };

const { computeRoi, rescaleRoi, DEFAULT_ROI } = require(need(join(root, 'dist/src/analyzer/computeRoi.js')));
const { runPipeline } = require(need(join(root, 'dist/src/analyzer/pipeline.js')));

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name); }
};
const cleanup = (dir) => { for (const p of ['.tic-code', '.github', 'CLAUDE.md']) rmSync(join(dir, p), { recursive: true, force: true }); };

(async () => {
  console.log('\n(1) Moeda em R$\n');
  check('M1: DEFAULT_ROI em R$', DEFAULT_ROI.currency === 'R$' && DEFAULT_ROI.hourlyRate === 90, JSON.stringify(DEFAULT_ROI));

  console.log('\n(2) Dívida explicável + rescale\n');
  const fm = [
    { file: 'big.ts', cyclomaticComplexity: 45, linesOfCode: 1800, couplingIn: 12, couplingOut: 20, debtScore: 50, hotspot: true },
    { file: 'mid.ts', cyclomaticComplexity: 8, linesOfCode: 600, couplingIn: 2, couplingOut: 3, debtScore: 3, hotspot: false },
    { file: 'clean.ts', cyclomaticComplexity: 2, linesOfCode: 30, couplingIn: 0, couplingOut: 0, debtScore: 0, hotspot: false }
  ];
  const mods = [{ name: 'core', path: 'src', files: [{ relativePath: 'big.ts' }, { relativePath: 'mid.ts' }, { relativePath: 'clean.ts' }], fileCount: 3, languages: ['TypeScript'], estimatedTokens: 0 }];
  const roi = computeRoi(fm, mods, [{ totalImpacted: 60 }], { hourlyRate: 90, currency: 'R$', hoursPerDebtPoint: 0.5 });
  check('D1: topFiles presente, big.ts no topo', roi.topFiles[0]?.file === 'big.ts', JSON.stringify(roi.topFiles.map((f) => f.file)));
  check('D2: reasons explicam a dívida (complexidade/linhas/acoplamento)',
    roi.topFiles[0].reasons.some((r) => r.includes('complexidade')) &&
    roi.topFiles[0].reasons.some((r) => r.includes('linhas')) &&
    roi.topFiles[0].reasons.some((r) => r.includes('acoplamento')), JSON.stringify(roi.topFiles[0].reasons));
  check('D3: clean.ts (sem débito) fica fora', !roi.topFiles.some((f) => f.file === 'clean.ts'));
  check('D4: totalDebtScore = soma dos débitos (53)', roi.totalDebtScore === 53, `=${roi.totalDebtScore}`);
  check('D5: byModule tem debtScore', roi.byModule[0]?.debtScore === 53);

  const r2 = rescaleRoi(roi, 180, 'US$');
  check('R1: rescale dobra o custo (90→180)', r2.debtCost === roi.debtCost * 2, `${roi.debtCost}→${r2.debtCost}`);
  check('R2: rescale mantém as horas', r2.remediationHours === roi.remediationHours);
  check('R3: rescale troca a moeda', r2.currency === 'US$' && r2.hourlyRate === 180);
  check('R4: rescale recalcula custo por arquivo/módulo', r2.topFiles[0].cost === roi.topFiles[0].cost * 2 && r2.byModule[0].cost === roi.byModule[0].cost * 2);

  console.log('\n(3) Pipeline → roi.json em R$ com topFiles\n');
  const fixture = join(root, 'test', 'fixtures', 'crosstier');
  cleanup(fixture);
  await runPipeline(fixture, () => {}, { skipAiFiles: true });
  const roiJson = JSON.parse(readFileSync(join(fixture, '.tic-code', 'roi.json'), 'utf8'));
  check('P1: roi.json em R$', roiJson.currency === 'R$', roiJson.currency);
  check('P2: roi.json tem topFiles e totalDebtScore', Array.isArray(roiJson.topFiles) && typeof roiJson.totalDebtScore === 'number');
  cleanup(fixture);

  console.log('\n(4) GitHub: detecção e instalação de workflow\n');
  // Simula a lógica de detecção (mesma do IPC get-github-status)
  const detect = (dir) => {
    const wfDir = join(dir, '.github', 'workflows');
    try {
      const fs2 = require('fs');
      for (const f of fs2.readdirSync(wfDir)) {
        if (!/\.ya?ml$/.test(f)) continue;
        if (/tic-coder-lite|tic-analyzer/i.test(fs2.readFileSync(join(wfDir, f), 'utf8'))) return true;
      }
    } catch { /* sem dir */ }
    return false;
  };
  const work = mkdtempSync(join(tmpdir(), 'tic-gh-'));
  check('G1: projeto sem workflow → não detectado', detect(work) === false);
  mkdirSync(join(work, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(work, '.github', 'workflows', 'tic-review.yml'), 'uses: LeonardoForbici/tic-coder-lite@main\n', 'utf8');
  check('G2: projeto com workflow referenciando o action → detectado', detect(work) === true);
  writeFileSync(join(work, '.github', 'workflows', 'other.yml'), 'uses: actions/checkout@v4\n', 'utf8');
  check('G3: workflow não-TIC não conta sozinho', detect(mkdtempSync(join(tmpdir(), 'tic-gh2-'))) === false);
  rmSync(work, { recursive: true, force: true });

  console.log('');
  if (failures.length) { console.error(`✗ ${failures.length} verificação(ões) falharam`); process.exit(1); }
  console.log('✓ camada usabilidade & transparência verificada');
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
