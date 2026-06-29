/**
 * Verificação dos insights do grafo (god nodes + conexões surpreendentes).
 *
 * Roda a pipeline no fixture crosstier e prova que `graph-report.md` é gerado
 * com a seção de god nodes citando os hubs conhecidos (table:CLIENTE /
 * PKG_CLIENTE.SALVAR) e que `generateGraphReport` retorna estrutura coerente.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:server\`.`); process.exit(1); } return p; };

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
  console.log('\nInsights do grafo — fixture crosstier\n');
  const fixture = join(root, 'test', 'fixtures', 'crosstier');
  cleanupFixture(fixture);
  const result = await runPipeline(fixture, () => {});
  check('GR0: pipeline concluiu', result.success, result.error ?? '');
  check('GR1: pipeline reporta godNodes > 0', (result.godNodes ?? 0) > 0, `godNodes=${result.godNodes}`);
  check('GR2: fase graph-report nos timings', !!result.phaseTimings && 'graph-report' in result.phaseTimings);

  const reportPath = join(fixture, '.tic-code', 'graph-report.md');
  check('GR3: graph-report.md gerado', existsSync(reportPath));
  if (existsSync(reportPath)) {
    const md = readFileSync(reportPath, 'utf8');
    check('GR4: tem seção de god nodes', /## God nodes/.test(md), md.slice(0, 120));
    check('GR5: cita um hub conhecido (CLIENTE ou PKG_CLIENTE.SALVAR)',
      /CLIENTE/.test(md) || /PKG_CLIENTE\.SALVAR/.test(md));
    check('GR6: tem seção de conexões surpreendentes', /## Conexões surpreendentes/.test(md));
    check('GR7: tem perguntas sugeridas com tool MCP', /get_blast_radius\(/.test(md) || /get_impact_path\(/.test(md));
  }

  cleanupFixture(fixture);
  console.log('');
  if (failures.length) { console.error(`✗ ${failures.length} verificação(ões) falharam`); process.exit(1); }
  console.log('✓ todas as verificações de insights do grafo passaram');
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
