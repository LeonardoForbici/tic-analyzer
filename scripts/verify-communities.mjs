/**
 * Verificação da detecção de comunidades (Louvain).
 *
 * Roda a pipeline no fixture crosstier e prova que a tabela `communities` é
 * populada, que detectCommunities retorna clusters nomeados cobrindo os nós,
 * e que queryCommunities lê de volta com acoplamento cross-cluster.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:electron\`.`); process.exit(1); } return p; };

const { openIndexDb } = require(need(join(root, 'dist/src/analyzer/store/indexDb.js')));
const { runPipeline } = require(need(join(root, 'dist/src/analyzer/pipeline.js')));
const { detectCommunities } = require(need(join(root, 'dist/src/analyzer/detectCommunities.js')));
const { queryCommunities } = require(need(join(root, 'dist/src/analyzer/store/graphQueries.js')));

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
  console.log('\nComunidades do grafo (Louvain) — fixture crosstier\n');
  const fixture = join(root, 'test', 'fixtures', 'crosstier');
  cleanupFixture(fixture);
  const result = await runPipeline(fixture, () => {});
  check('C0: pipeline concluiu', result.success, result.error ?? '');
  check('C1: pipeline reporta communities > 0', (result.communities ?? 0) > 0, `communities=${result.communities}`);
  check('C2: fase communities nos timings', !!result.phaseTimings && 'communities' in result.phaseTimings);

  const db = openIndexDb(join(fixture, '.tic-code', 'index.db'));
  check('C3: index.db gerado', !!db);
  if (!db) { cleanupFixture(fixture); process.exit(1); }

  // Schema: tabela communities populada
  const hasTable = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='communities'").get();
  check('C4: tabela communities existe', hasTable);
  const count = hasTable ? db.prepare('SELECT COUNT(*) c FROM communities').get().c : 0;
  check('C5: communities populada', count > 0, `linhas=${count}`);
  const namedCount = hasTable ? db.prepare("SELECT COUNT(*) c FROM communities WHERE name IS NOT NULL AND name <> ''").get().c : 0;
  check('C6: todas as linhas têm nome', namedCount === count, `comNome=${namedCount}/${count}`);

  // queryCommunities lê de volta
  const q = queryCommunities(db);
  check('C7: queryCommunities retorna clusters', !!q && q.communities.length > 0, JSON.stringify(q?.communities?.length));
  check('C8: cada cluster tem nome e tamanho', !!q && q.communities.every((c) => !!c.name && c.size > 0));
  check('C9: byKind soma ao tamanho do cluster', !!q && q.communities.every((c) => Object.values(c.byKind).reduce((a, b) => a + b, 0) === c.size));

  db.close();

  // detectCommunities determinístico (mesma entrada → mesmo nº de clusters)
  const fakeEdges = [
    { from: 'file:a.ts', to: 'file:b.ts', fromKind: 'file', toKind: 'file', via: 'import', confidence: 'resolved' },
    { from: 'file:b.ts', to: 'file:a.ts', fromKind: 'file', toKind: 'file', via: 'import', confidence: 'resolved' },
    { from: 'file:x.ts', to: 'file:y.ts', fromKind: 'file', toKind: 'file', via: 'import', confidence: 'resolved' }
  ];
  const r1 = detectCommunities(fakeEdges);
  const r2 = detectCommunities(fakeEdges);
  check('C10: detecção determinística (RNG semeado)', r1.communities.length === r2.communities.length && r1.communities.length >= 2,
    `r1=${r1.communities.length} r2=${r2.communities.length}`);
  check('C11: byNode cobre todos os nós', r1.byNode.size === 4, `byNode=${r1.byNode.size}`);

  cleanupFixture(fixture);
  console.log('');
  if (failures.length) { console.error(`✗ ${failures.length} verificação(ões) falharam`); process.exit(1); }
  console.log('✓ todas as verificações de comunidades passaram');
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
