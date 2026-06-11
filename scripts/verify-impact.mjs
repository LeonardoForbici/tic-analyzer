/**
 * Verificação do grafo de impacto unificado (Fase 1) — roda contra dist/.
 *
 * Prova, no fixture crosstier (React → Java → PL/SQL → tabela), que o impacto
 * atravessa camadas: mudar a tabela CLIENTE reporta a procedure que escreve
 * nela, o trigger que dispara nela, o repository Java que chama a procedure e
 * a tela React no topo da cadeia.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:electron\`.`); process.exit(1); } return p; };

const { openIndexDb } = require(need(join(root, 'dist/src/analyzer/store/indexDb.js')));
const { queryImpactOf, queryBlastRadius, resolveImpactId } = require(need(join(root, 'dist/src/analyzer/store/impactQueries.js')));
const { queryGraphLevel } = require(need(join(root, 'dist/src/analyzer/store/graphQueries.js')));
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
  console.log('\nGrafo de impacto unificado — fixture crosstier\n');
  const fixture = join(root, 'test', 'fixtures', 'crosstier');
  cleanupFixture(fixture);
  const result = await runPipeline(fixture, () => {});
  check('P0: pipeline concluiu com sucesso', result.success, result.error ?? '');
  check('P1: pipeline reporta arestas de impacto', (result.impactEdges ?? 0) > 0, `impactEdges=${result.impactEdges}`);
  check('P2: pipeline reporta phaseTimings', !!result.phaseTimings && 'impact-graph' in result.phaseTimings);

  const db = openIndexDb(join(fixture, '.tic-code', 'index.db'));
  check('P3: index.db gerado', !!db);
  if (!db) { cleanupFixture(fixture); process.exit(1); }

  // Schema novo: files.module, modules e impact_edges populados
  const moduleCount = db.prepare('SELECT COUNT(*) c FROM modules').get().c;
  const filesWithModule = db.prepare('SELECT COUNT(*) c FROM files WHERE module IS NOT NULL').get().c;
  const impactCount = db.prepare('SELECT COUNT(*) c FROM impact_edges').get().c;
  check('S1: tabela modules populada', moduleCount > 0, `modules=${moduleCount}`);
  check('S2: files.module populado', filesWithModule > 0, `files com módulo=${filesWithModule}`);
  check('S3: impact_edges populado', impactCount > 0, `impact_edges=${impactCount}`);

  // Impacto da TABELA atravessa todas as camadas
  const tbl = queryImpactOf(db, 'table:CLIENTE');
  const ids = tbl ? tbl.affected.map((n) => n.id) : [];
  check('I1: impacto de table:CLIENTE inclui procedure PKG_CLIENTE.SALVAR', ids.includes('plsql:PKG_CLIENTE.SALVAR'), ids.join(', '));
  check('I2: impacto de table:CLIENTE inclui trigger TRG_CLIENTE_AUDIT', ids.some((i) => i.includes('TRG_CLIENTE_AUDIT')), ids.join(', '));
  check('I3: impacto de table:CLIENTE inclui ClienteRepository.java (db-call)', ids.some((i) => i.endsWith('ClienteRepository.java')), ids.join(', '));
  check('I4: impacto de table:CLIENTE chega na tela React (TelaCliente.tsx)', ids.some((i) => i.endsWith('TelaCliente.tsx')), ids.join(', '));
  check('I5: resultado agrupa por kind', !!tbl && (tbl.byKind.file ?? 0) > 0 && (tbl.byKind.plsql ?? 0) > 0);

  // Resolução de nomes livres
  const resolved = resolveImpactId(db, 'PKG_CLIENTE.SALVAR');
  check('R1: resolveImpactId("PKG_CLIENTE.SALVAR") → plsql:PKG_CLIENTE.SALVAR', resolved.id === 'plsql:PKG_CLIENTE.SALVAR', String(resolved.id));
  const resolvedTbl = resolveImpactId(db, 'CLIENTE');
  check('R2: resolveImpactId("CLIENTE") resolve para a tabela', resolvedTbl.id === 'table:CLIENTE', String(resolvedTbl.id));

  // Blast radius compacto
  const blast = queryBlastRadius(db, 'PKG_CLIENTE.SALVAR');
  check('B1: blast radius da procedure inclui o repository no top', !!blast && blast.top.some((t) => t.id.endsWith('ClienteRepository.java')), JSON.stringify(blast?.top ?? []));
  check('B2: blast radius reporta totalAffected e truncated', !!blast && blast.totalAffected > 0 && blast.truncated === false);

  // Grafo hierárquico agregado (drill-down)
  const top = queryGraphLevel(db, { expanded: [] });
  check('G1: nível topo agrega por layer/module', top.nodes.length > 0 && top.nodes.every((n) => n.kind === 'layer' || n.kind === 'module'), top.nodes.map((n) => n.id).join(', '));
  const firstLayer = top.nodes.find((n) => n.kind === 'layer');
  if (firstLayer) {
    const lvl2 = queryGraphLevel(db, { expanded: [firstLayer.id] });
    check('G2: expandir layer revela módulos', lvl2.nodes.some((n) => n.kind === 'module'), lvl2.nodes.map((n) => n.id).join(', '));
  }
  const anyModule = db.prepare('SELECT name FROM modules LIMIT 1').get();
  if (anyModule) {
    const lvl3 = queryGraphLevel(db, { expanded: [`module:${anyModule.name}`] });
    check('G3: expandir módulo revela arquivos', lvl3.nodes.some((n) => n.kind === 'file'), lvl3.nodes.map((n) => n.id).join(', '));
    check('G4: arestas agregadas têm peso', lvl3.edges.every((e) => e.weight >= 1));
  }

  db.close();
  cleanupFixture(fixture);
  console.log('');
  if (failures.length) { console.error(`✗ ${failures.length} verificação(ões) falharam`); process.exit(1); }
  console.log('✓ todas as verificações de impacto passaram');
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
