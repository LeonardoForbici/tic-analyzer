/**
 * Verificação do Portfólio multi-projeto — roda contra dist/.
 * Usa TIC_PORTFOLIO_DIR num temp para não tocar o registro real do usuário.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}`); process.exit(1); } return p; };

// isola o registro global ANTES de carregar o módulo
process.env.TIC_PORTFOLIO_DIR = mkdtempSync(join(tmpdir(), 'tic-portfolio-'));

const { loadPortfolio, upsertProject, summarizeProject, removeProject, projectId } = require(need(join(root, 'dist/src/analyzer/store/portfolioStore.js')));
const { runPipeline } = require(need(join(root, 'dist/src/analyzer/pipeline.js')));

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name); }
};
const cleanup = (dir) => { for (const p of ['.tic-code', '.github', 'CLAUDE.md']) rmSync(join(dir, p), { recursive: true, force: true }); };

(async () => {
  console.log('\nPortfólio multi-projeto\n');
  check('B0: registro começa vazio', loadPortfolio().length === 0);
  check('B1: summarizeProject de projeto não analisado é null', summarizeProject(join(root, 'test', 'fixtures', 'orm')) === null);

  // analisa dois fixtures e registra
  const fixA = join(root, 'test', 'fixtures', 'crosstier');
  const fixB = join(root, 'test', 'fixtures', 'orm');
  cleanup(fixA); cleanup(fixB);
  await runPipeline(fixA, () => {}, { skipAiFiles: true });
  await runPipeline(fixB, () => {}, { skipAiFiles: true });

  const sumA = upsertProject(fixA);
  check('U1: upsert retorna resumo com health e nome', !!sumA && typeof sumA.healthScore === 'number' && !!sumA.name, JSON.stringify(sumA));
  upsertProject(fixB);
  check('U2: portfólio tem 2 projetos', loadPortfolio().length === 2);

  // idempotência por caminho
  upsertProject(fixA);
  check('U3: re-upsert do mesmo caminho não duplica', loadPortfolio().length === 2);

  // ordenação: pior saúde primeiro
  const list = loadPortfolio();
  check('S1: ordenado por pior saúde primeiro', (list[0].healthScore ?? 101) <= (list[1].healthScore ?? 101), list.map((p) => p.healthScore).join(','));
  check('S2: resumo tem campos de risco/drift/custo', list.every((p) => p.risks && typeof p.archErrors === 'number' && 'debtCost' in p));

  // id estável por caminho
  check('I1: projectId é estável p/ o mesmo caminho', projectId(fixA) === projectId(fixA) && projectId(fixA) !== projectId(fixB));

  // remoção
  removeProject(list[0].id);
  check('R1: removeProject tira do registro', loadPortfolio().length === 1);

  cleanup(fixA); cleanup(fixB);
  rmSync(process.env.TIC_PORTFOLIO_DIR, { recursive: true, force: true });
  console.log('');
  if (failures.length) { console.error(`✗ ${failures.length} verificação(ões) falharam`); process.exit(1); }
  console.log('✓ portfólio multi-projeto verificado');
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
