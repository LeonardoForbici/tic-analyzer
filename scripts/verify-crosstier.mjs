/**
 * Verificação do trace cross-tier unificado (Fase 3) — roda contra dist/.
 *
 * Roda a pipeline no fixture test/fixtures/crosstier (TelaCliente.tsx → Controller
 * → Service → Repository → PKG_CLIENTE.SALVAR) e prova que queryCrossTierTrace
 * reconstrói a cadeia INTEIRA a partir do PL/SQL, atravessando os dois grafos
 * (intra-código resolvido + cross-tier HTTP/DB) que vivem no index.db.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:electron\`.`); process.exit(1); } return p; };

const { openIndexDb } = require(need(join(root, 'dist/src/analyzer/store/indexDb.js')));
const { queryCrossTierTrace } = require(need(join(root, 'dist/src/mcp/queries.js')));
const { runPipeline } = require(need(join(root, 'dist/src/analyzer/pipeline.js')));

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name); }
};

function cleanup(fixture) {
  for (const p of ['.tic-code', '.github', 'CLAUDE.md']) rmSync(join(fixture, p), { recursive: true, force: true });
}

(async () => {
  console.log('\nCross-tier trace (Fase 3) — fixture crosstier\n');
  const fixture = join(root, 'test', 'fixtures', 'crosstier');
  const result = await runPipeline(fixture, () => {});
  check('pipeline concluiu com sucesso', result.success, result.error ?? '');

  const db = openIndexDb(join(fixture, '.tic-code', 'index.db'));
  check('index.db gerado', !!db);
  if (!db) { cleanup(fixture); finish(); return; }

  const trace = queryCrossTierTrace(db, 'PKG_CLIENTE.SALVAR');

  check('entry resolvido para o objeto de banco PKG_CLIENTE', trace.entry?.layer === 'database', JSON.stringify(trace.entry));

  const pathLabels = trace.samplePath.map((n) => n.label);
  const hasInOrder = (needle) => {
    let idx = -1;
    for (const want of needle) {
      const at = pathLabels.findIndex((l, i) => i > idx && l.includes(want));
      if (at === -1) return false;
      idx = at;
    }
    return true;
  };

  // Cadeia: TelaCliente → ClienteController → ClienteServiceImpl → ClienteRepository → PKG_CLIENTE
  check('cadeia atravessa Frontend → Controller', hasInOrder(['TelaCliente', 'ClienteController']), pathLabels.join(' → '));
  check('cadeia inclui o miolo Service (antes ausente no multigrafo)', pathLabels.some((l) => l.includes('ClienteServiceImpl')), pathLabels.join(' → '));
  check('cadeia inclui o Repository', pathLabels.some((l) => l.includes('ClienteRepository')), pathLabels.join(' → '));
  check('cadeia termina no PL/SQL PKG_CLIENTE', pathLabels.some((l) => l.includes('PKG_CLIENTE')), pathLabels.join(' → '));
  check('cadeia ininterrupta na ordem correta', hasInOrder(['TelaCliente', 'ClienteController', 'ClienteServiceImpl', 'ClienteRepository', 'PKG_CLIENTE']), pathLabels.join(' → '));

  // Granularidade de método: o rótulo deve trazer Classe.metodo nas chamadas Java
  check('granularidade de método (ClienteController.salvar)', pathLabels.some((l) => l.includes('ClienteController.salvar')), pathLabels.join(' → '));
  check('granularidade de método (ClienteServiceImpl.salvar)', pathLabels.some((l) => l.includes('ClienteServiceImpl.salvar')), pathLabels.join(' → '));

  const layers = new Set(trace.upstream.map((n) => n.layer));
  check('impacto cruza ao menos frontend + backend', layers.has('frontend') && (layers.has('backend') || layers.has('code')), [...layers].join(','));

  console.log('\n  Cadeia reconstruída: ' + pathLabels.join('  →  '));

  db.close();
  cleanup(fixture);
  finish();
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });

function finish() {
  console.log('');
  if (failures.length) { console.error(`✗ ${failures.length} verificação(ões) falharam`); process.exit(1); }
  console.log('✓ trace cross-tier verificado');
}
