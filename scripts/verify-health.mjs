/**
 * Verificação do health score + snapshots (Fase 3) — roda contra dist/.
 *
 * Roda a pipeline 2× no fixture crosstier e prova que: o score existe e está
 * em [0,100], é determinístico para o mesmo código, e snapshots.json acumula
 * histórico entre execuções (não é recriado como o index.db).
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:electron\`.`); process.exit(1); } return p; };

const { runPipeline } = require(need(join(root, 'dist/src/analyzer/pipeline.js')));

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name); }
};

function cleanupFixture(fixture) {
  for (const p of ['.tic-code', '.github', 'CLAUDE.md']) {
    rmSync(join(fixture, p), { recursive: true, force: true });
  }
}

(async () => {
  console.log('\nHealth score + snapshots — fixture crosstier\n');
  const fixture = join(root, 'test', 'fixtures', 'crosstier');
  cleanupFixture(fixture);

  const r1 = await runPipeline(fixture, () => {});
  check('H0: pipeline concluiu', r1.success, r1.error ?? '');
  check('H1: healthScore presente e em [0,100]', typeof r1.healthScore === 'number' && r1.healthScore >= 0 && r1.healthScore <= 100, `score=${r1.healthScore}`);
  check('H2: healthGrade em A-E', ['A', 'B', 'C', 'D', 'E'].includes(r1.healthGrade), `grade=${r1.healthGrade}`);

  const r2 = await runPipeline(fixture, () => {});
  check('H3: score determinístico p/ mesmo código', r2.healthScore === r1.healthScore, `${r1.healthScore} vs ${r2.healthScore}`);

  const snapPath = join(fixture, '.tic-code', 'snapshots.json');
  check('H4: snapshots.json existe', existsSync(snapPath));
  const snaps = JSON.parse(readFileSync(snapPath, 'utf8'));
  check('H5: 2 execuções → 2 snapshots acumulados', Array.isArray(snaps) && snaps.length === 2, `len=${snaps.length}`);
  const last = snaps[snaps.length - 1];
  check('H6: snapshot tem breakdown e counts', !!last.breakdown && !!last.counts && typeof last.counts.risks === 'number');
  check('H7: breakdown cobre as 6 dimensões', ['debt', 'risks', 'violations', 'deadCode', 'coupling', 'resolution'].every((k) => k in last.breakdown), Object.keys(last.breakdown).join(','));

  // analysis.json carrega o health junto
  const analysis = JSON.parse(readFileSync(join(fixture, '.tic-code', 'analysis.json'), 'utf8'));
  check('H8: analysis.json inclui health', !!analysis.health && analysis.health.score === r2.healthScore);

  cleanupFixture(fixture);
  console.log('');
  if (failures.length) { console.error(`✗ ${failures.length} verificação(ões) falharam`); process.exit(1); }
  console.log('✓ todas as verificações de health passaram');
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
