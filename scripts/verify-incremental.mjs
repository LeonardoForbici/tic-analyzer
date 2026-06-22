/**
 * Verificação da re-análise incremental (cache de símbolos AST).
 *
 * Garante o que importa: o grafo incremental é IDÊNTICO ao grafo completo para
 * o mesmo estado do código — caching não pode mudar o resultado, só a velocidade.
 * Trabalha numa cópia temporária do fixture para não sujar o repo.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:electron\`.`); process.exit(1); } return p; };

const { runPipeline } = require(need(join(root, 'dist/src/analyzer/pipeline.js')));
const { openIndexDb } = require(need(join(root, 'dist/src/analyzer/store/indexDb.js')));

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name); }
};

/** Assinatura canônica do grafo de arestas (do index.db) — independe de ordem. */
function edgeSignature(projectDir) {
  const db = openIndexDb(join(projectDir, '.tic-code', 'index.db'));
  const rows = db.prepare('SELECT from_file, to_file, kind, confidence FROM edges').all();
  db.close();
  return rows.map((r) => `${r.from_file}|${r.to_file}|${r.kind}|${r.confidence}`).sort().join('\n');
}

(async () => {
  console.log('\nRe-análise incremental — cache de símbolos AST\n');
  const work = mkdtempSync(join(tmpdir(), 'tic-inc-'));
  const proj = join(work, 'crosstier');
  cpSync(join(root, 'test', 'fixtures', 'crosstier'), proj, { recursive: true });

  // ── Run 1: análise completa (sem cache) ─────────────────────────────────────
  const r1 = await runPipeline(proj, () => {}, { skipAiFiles: true });
  check('A0: 1ª análise concluiu', r1.success, r1.error ?? '');
  check('A1: symbol-cache.json criado', existsSync(join(proj, '.tic-code', 'symbol-cache.json')));
  const sigFull1 = edgeSignature(proj);

  // ── Run 2: re-análise SEM mudanças → deve reusar o cache e dar grafo idêntico ─
  const r2 = await runPipeline(proj, () => {}, { skipAiFiles: true });
  check('B1: 2ª análise reusou símbolos do cache (astCacheHits>0)', (r2.astCacheHits ?? 0) > 0, `astCacheHits=${r2.astCacheHits}`);
  const sigInc2 = edgeSignature(proj);
  check('B2: grafo idêntico após re-análise sem mudanças', sigInc2 === sigFull1, `Δ=${sigInc2 === sigFull1 ? 0 : 'difere'}`);

  // ── Run 3: modifica um arquivo TS (cria aresta nova) → incremental ───────────
  const tela = join(proj, 'src', 'pages', 'TelaCliente.tsx');
  const orig = readFileSync(tela, 'utf8');
  writeFileSync(tela, `import { KitAssemblyController } from './KitAssemblyController';\nvoid KitAssemblyController;\n${orig}`, 'utf8');
  const r3 = await runPipeline(proj, () => {}, { skipAiFiles: true });
  check('C0: 3ª análise (incremental, arquivo mudado) concluiu', r3.success);
  const sigIncChanged = edgeSignature(proj);
  check('C1: mudança foi captada (grafo difere do anterior)', sigIncChanged !== sigFull1);
  check('C2: nova aresta TelaCliente→KitAssemblyController presente',
    sigIncChanged.split('\n').some((l) => l.includes('TelaCliente.tsx') && l.includes('KitAssemblyController.tsx')),
    'aresta não encontrada');

  // ── Run 4: MESMO estado, análise COMPLETA (sem cache) → deve bater 1:1 ───────
  rmSync(join(proj, '.tic-code', 'symbol-cache.json'), { force: true });
  rmSync(join(proj, '.tic-code', 'file-cache.json'), { force: true });
  const r4 = await runPipeline(proj, () => {}, { skipAiFiles: true });
  check('D0: 4ª análise (completa, mesmo estado) concluiu', r4.success);
  const sigFullChanged = edgeSignature(proj);
  check('D1: INCREMENTAL == COMPLETO para o mesmo estado (correção)', sigIncChanged === sigFullChanged,
    sigIncChanged === sigFullChanged ? '' : 'grafo incremental difere do completo!');

  writeFileSync(tela, orig, 'utf8');
  rmSync(work, { recursive: true, force: true });
  console.log('');
  if (failures.length) { console.error(`✗ ${failures.length} verificação(ões) falharam`); process.exit(1); }
  console.log('✓ re-análise incremental verificada (grafo idêntico ao completo)');
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
