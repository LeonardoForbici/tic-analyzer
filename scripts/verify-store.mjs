/**
 * Verificação do índice persistente (Fase 2) — roda contra dist/.
 *
 * Parte A (escala sintética >3000 nós): prova que o teto de 3000 nós/5000
 * arestas do dep-graph.json NÃO existe no index.db, e que find_path/impact
 * percorrem o grafo inteiro.
 *
 * Parte B (pipeline real no fixture semântico): prova que get_impact, find_path
 * e search_code consultam o SQLite e retornam os resultados resolvidos da Fase 1.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:server\`.`); process.exit(1); } return p; };

const { writeIndexDb, openIndexDb } = require(need(join(root, 'dist/src/analyzer/store/indexDb.js')));
const { queryImpact, queryFindPath, querySearch } = require(need(join(root, 'dist/src/mcp/queries.js')));
const { runPipeline } = require(need(join(root, 'dist/src/analyzer/pipeline.js')));

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name); }
};

// ── Parte A: escala sintética (> 3000 nós) ──────────────────────────────────
function partA() {
  console.log('\nParte A — escala sintética (> 3000 nós)\n');
  const N = 3500;
  const files = [];
  const nodes = [];
  const edges = [];
  for (let i = 0; i < N; i++) {
    const p = `f${i}.ts`;
    files.push({ relativePath: p, extension: '.ts', lines: 10, absolutePath: '' });
    nodes.push({ id: p, path: p, inDegree: i > 0 ? 1 : 0, outDegree: i < N - 1 ? 1 : 0 });
    if (i < N - 1) edges.push({ from: p, to: `f${i + 1}.ts`, kind: 'import', confidence: 'resolved' });
  }
  const dbPath = join(tmpdir(), 'tic-verify-store.db');
  for (const s of ['', '-wal', '-shm']) if (existsSync(dbPath + s)) rmSync(dbPath + s);

  const stats = writeIndexDb(dbPath, {
    files,
    graph: { nodes, edges, centralFiles: [], externalDeps: [], semanticClasses: [] },
    callGraph: { nodes: [], edges: [] },
    searchEntries: [{ file: 'f0.ts', terms: ['alpha', 'beta'], snippet: 'synthetic' }]
  });

  const db = openIndexDb(dbPath);
  const fileCount = db.prepare('SELECT COUNT(*) c FROM files').get().c;
  const edgeCount = db.prepare('SELECT COUNT(*) c FROM edges').get().c;

  check('A1: todos os 3500 nós persistidos (sem truncar em 3000)', fileCount === N, `files=${fileCount}`);
  check('A2: todas as 3499 arestas persistidas (sem truncar em 5000)', edgeCount === N - 1, `edges=${edgeCount}`);
  check('A3: writeIndexDb reporta contagem completa', stats.nodes === N && stats.edges === N - 1);

  const pathRes = queryFindPath(db, 'f0.ts', `f${N - 1}.ts`);
  check('A4: find_path percorre o grafo inteiro (3500 saltos)', !('error' in pathRes) && pathRes.pathFiles?.length === N, `len=${pathRes.pathFiles?.length}`);

  const impact = queryImpact(db, `f${N - 1}.ts`);
  check('A5: get_impact retorna dependentes transitivos', !!impact && impact.transitiveCount > 0, `transitive=${impact?.transitiveCount}`);

  db.close();
}

// ── Parte B: pipeline real no fixture semântico ─────────────────────────────
async function partB() {
  console.log('\nParte B — pipeline real (fixture semântico)\n');
  const fixture = join(root, 'test', 'fixtures', 'semantic');
  const result = await runPipeline(fixture, () => {});
  check('B0: pipeline concluiu com sucesso', result.success, result.error ?? '');

  const dbPath = join(fixture, '.tic-code', 'index.db');
  const db = openIndexDb(dbPath);
  check('B1: index.db foi gerado pela pipeline', !!db);
  if (!db) { cleanupFixture(fixture); return; }

  // UserService.java é implementado por UserServiceImpl e chamado via UserController
  const impact = queryImpact(db, 'com/acme/user/UserService.java');
  const deps = impact ? [...impact.direct, ...impact.transitive] : [];
  check('B2: get_impact(UserService) inclui UserServiceImpl', deps.some((d) => d.endsWith('UserServiceImpl.java')), deps.join(','));

  const pathRes = queryFindPath(db, 'src/app/widget.ts', 'src/services/user.ts');
  check('B3: find_path widget.ts → user.ts existe', !('error' in pathRes) && !!pathRes.pathFiles);

  const hits = querySearch(db, ['user', 'service'], 10);
  check('B4: search_code (FTS5) retorna resultados', hits.length > 0, `hits=${hits.length}`);

  db.close();
  cleanupFixture(fixture);
}

/** Remove artefatos gerados pela pipeline no fixture (não fazem parte dele). */
function cleanupFixture(fixture) {
  for (const p of ['.tic-code', '.github', 'CLAUDE.md']) {
    rmSync(join(fixture, p), { recursive: true, force: true });
  }
}

(async () => {
  partA();
  await partB();
  console.log('');
  if (failures.length) { console.error(`✗ ${failures.length} verificação(ões) falharam`); process.exit(1); }
  console.log('✓ todas as verificações de store passaram');
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
