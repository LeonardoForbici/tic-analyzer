/**
 * Verificação do PR review (Fase 5) — roda contra dist/.
 *
 * Simula base vs head: copia o fixture crosstier, introduz um risco (eval) e
 * um arquivo novo importado, analisa os dois lados e prova que o comparador
 * acusa o risco novo + impacto, e que o markdown tem marker e <details>.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, cpSync, writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:electron\`.`); process.exit(1); } return p; };

const { runPipeline } = require(need(join(root, 'dist/src/analyzer/pipeline.js')));
const { compareAnalyses, evaluateGates, formatPrComment, REPORT_MARKER } = require(need(join(root, 'dist/src/cli/prReview.js')));

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name); }
};

(async () => {
  console.log('\nPR review — base vs head (fixture crosstier mutado)\n');
  const fixture = join(root, 'test', 'fixtures', 'crosstier');
  const work = mkdtempSync(join(tmpdir(), 'tic-pr-'));
  const baseDir = join(work, 'base');
  const headDir = join(work, 'head');
  cpSync(fixture, baseDir, { recursive: true });
  cpSync(fixture, headDir, { recursive: true });

  // Mutação no head: risco novo (eval) + import novo na tela
  const mutated = join(headDir, 'src', 'pages', 'helper.ts');
  writeFileSync(mutated, `export function render(tpl: string) {\n  return eval(tpl);\n}\n`, 'utf8');
  const tela = join(headDir, 'src', 'pages', 'TelaCliente.tsx');
  writeFileSync(tela, `import { render } from './helper';\n${readFileSync(tela, 'utf8')}`, 'utf8');

  const rBase = await runPipeline(baseDir, () => {}, { skipAiFiles: true });
  const rHead = await runPipeline(headDir, () => {}, { skipAiFiles: true });
  check('P0: pipelines base/head concluíram', rBase.success && rHead.success, `${rBase.error ?? ''}${rHead.error ?? ''}`);
  check('P1: --skipAiFiles não sujou o checkout', !existsSync(join(headDir, 'CLAUDE.md')) && !existsSync(join(headDir, '.github')));

  const changed = ['src/pages/helper.ts', 'src/pages/TelaCliente.tsx'];
  const result = compareAnalyses(baseDir, headDir, changed);

  check('C1: risco novo (eval) detectado', result.newRisks.some((r) => r.file.endsWith('helper.ts')), JSON.stringify(result.newRisks));
  check('C2: impacto do arquivo mudado reportado', result.impacts.some((i) => i.file.endsWith('helper.ts') && i.totalAffected > 0), JSON.stringify(result.impacts));
  check('C3: health base e head presentes', result.healthBase !== null && result.healthHead !== null, `${result.healthBase} vs ${result.healthHead}`);

  const gate = evaluateGates(result, 'new-high-risks,health-drop:5');
  check('G1: gate new-high-risks falha com eval novo', gate.failed && gate.reasons.some((r) => r.includes('risco')), JSON.stringify(gate));
  const gateOk = evaluateGates({ ...result, newRisks: [] }, 'new-high-risks');
  check('G2: gate passa sem riscos novos', !gateOk.failed);

  const md = formatPrComment(result, gate);
  check('M1: markdown contém o marker sticky', md.includes(REPORT_MARKER));
  check('M2: markdown tem seções <details>', md.includes('<details>') && md.includes('</details>'));
  check('M3: markdown sinaliza gate falho', md.includes('Quality gate falhou'));

  rmSync(work, { recursive: true, force: true });
  console.log('');
  if (failures.length) { console.error(`✗ ${failures.length} verificação(ões) falharam`); process.exit(1); }
  console.log('✓ todas as verificações de PR review passaram');
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
