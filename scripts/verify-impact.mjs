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
const { queryImpactOf, queryBlastRadius, resolveImpactId, queryImpactPath } = require(need(join(root, 'dist/src/analyzer/store/impactQueries.js')));
const { queryGraphLevel, queryUnifiedGraph } = require(need(join(root, 'dist/src/analyzer/store/graphQueries.js')));
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

  // Telas .osw (JSON do frontend) entram na cadeia de impacto
  const ctrl = queryImpactOf(db, 'file:src/pages/KitAssemblyController.tsx');
  const ctrlIds = ctrl ? ctrl.affected.map((n) => n.id) : [];
  check('O1: impacto do Controller inclui a tela kitAssembly.osw', ctrlIds.some((i) => i.endsWith('kitAssembly.osw')), ctrlIds.join(', '));
  check('O2: impacto de table:CLIENTE atravessa até o .osw (coluna→osw)', ids.some((i) => i.endsWith('kitAssembly.osw')), ids.join(', '));
  const oswLayer = db.prepare("SELECT layer FROM files WHERE rel_path LIKE '%.osw'").get();
  check('O3: arquivo .osw tem layer frontend', oswLayer?.layer === 'frontend', JSON.stringify(oswLayer));

  // Resolução de nomes livres
  const resolved = resolveImpactId(db, 'PKG_CLIENTE.SALVAR');
  check('R1: resolveImpactId("PKG_CLIENTE.SALVAR") → plsql:PKG_CLIENTE.SALVAR', resolved.id === 'plsql:PKG_CLIENTE.SALVAR', String(resolved.id));
  const resolvedTbl = resolveImpactId(db, 'CLIENTE');
  check('R2: resolveImpactId("CLIENTE") resolve para a tabela', resolvedTbl.id === 'table:CLIENTE', String(resolvedTbl.id));

  // Blast radius compacto
  const blast = queryBlastRadius(db, 'PKG_CLIENTE.SALVAR');
  check('B1: blast radius da procedure inclui o repository no top', !!blast && blast.top.some((t) => t.id.endsWith('ClienteRepository.java')), JSON.stringify(blast?.top ?? []));
  check('B2: blast radius reporta totalAffected e truncated', !!blast && blast.totalAffected > 0 && blast.truncated === false);

  // Path finding: "por que mexer em table:CLIENTE afeta a tela React"
  const pth = queryImpactPath(db, 'table:CLIENTE', 'src/pages/TelaCliente.tsx');
  const path0 = pth && pth.paths.length > 0 ? pth.paths[0] : [];
  const vias = path0.map((h) => h.via);
  check('PF1: caminho CLIENTE→TelaCliente encontrado', !!pth && pth.paths.length > 0, JSON.stringify(pth));
  check('PF2: caminho tem ≥3 saltos', !!pth && pth.hops >= 3, `hops=${pth?.hops}`);
  check('PF3: caminho passa pela procedure PKG_CLIENTE.SALVAR', path0.some((h) => h.to === 'plsql:PKG_CLIENTE.SALVAR' || h.from === 'plsql:PKG_CLIENTE.SALVAR'), JSON.stringify(path0));
  check('PF4: caminho usa via de banco (writes/reads/db-call)', vias.some((v) => ['writes', 'reads', 'db-call'].includes(v)), vias.join(', '));
  check('PF5: cada salto tem via e confiança', path0.every((h) => !!h.via && (h.confidence === 'resolved' || h.confidence === 'inferred')), JSON.stringify(path0));
  // direction='depends': caminho inverso (TelaCliente depende de CLIENTE)
  const dep = queryImpactPath(db, 'src/pages/TelaCliente.tsx', 'table:CLIENTE', { direction: 'depends' });
  check('PF6: direction=depends acha caminho TelaCliente→CLIENTE', !!dep && dep.paths.length > 0, JSON.stringify(dep?.paths?.length));
  // Sem caminho: duas entidades não conectadas → paths vazio, sem erro
  const none = queryImpactPath(db, 'src/pages/TelaCliente.tsx', 'table:CLIENTE', { direction: 'impact' });
  check('PF7: entidades não conectadas (nessa direção) retornam paths vazio sem erro', !!none && Array.isArray(none.paths), JSON.stringify(none?.paths?.length));

  // PF8: k-shortest devolve rotas ALTERNATIVAS num grafo diamante (lock do bug do ban-key).
  // Diamante: A→B, A→C, B→D, C→D (X→Y = X depende de Y). Impacto de D alcança A por
  // duas rotas (D←B←A e D←C←A). max_paths=2 deve retornar as 2.
  const Database = require('better-sqlite3');
  const mem = new Database(':memory:');
  mem.exec(`CREATE TABLE impact_edges (from_id TEXT, to_id TEXT, from_kind TEXT, to_kind TEXT, via TEXT, confidence TEXT);
            CREATE INDEX i1 ON impact_edges(to_id); CREATE INDEX i2 ON impact_edges(from_id);
            CREATE TABLE files (rel_path TEXT PRIMARY KEY, module TEXT);`);
  const ins = mem.prepare("INSERT INTO impact_edges VALUES (?,?,'file','file','import','resolved')");
  for (const [f, t] of [['file:A', 'file:B'], ['file:A', 'file:C'], ['file:B', 'file:D'], ['file:C', 'file:D']]) ins.run(f, t);
  const multi = queryImpactPath(mem, 'file:D', 'file:A', { direction: 'impact', maxPaths: 2 });
  check('PF8: k-shortest devolve 2 rotas distintas no diamante', !!multi && multi.paths.length === 2, JSON.stringify(multi?.paths?.map((p) => p.map((h) => h.to))));
  mem.close();

  // Sanidade dos módulos persistidos (bugs do Explorador: módulo com nome de
  // arquivo tipo "frontend/package.json" e camada errada por arquivo)
  const modRows = db.prepare('SELECT name FROM modules').all().map((r) => r.name);
  check('M1: nenhum módulo com nome de arquivo', modRows.every((n) => !/\.(json|md|ts|tsx|js|java|sql|yml|yaml|lock)$/i.test(n)), modRows.join(', '));
  const layerRows = db.prepare("SELECT rel_path, layer FROM files WHERE rel_path LIKE '%.tsx'").all();
  check('M2: arquivos .tsx têm layer frontend (por arquivo, não por módulo)', layerRows.length > 0 && layerRows.every((r) => r.layer === 'frontend'), JSON.stringify(layerRows));
  const plsqlLayer = db.prepare("SELECT layer FROM files WHERE rel_path LIKE '%.pkb' OR rel_path LIKE '%.trg'").all();
  check('M3: arquivos PL/SQL têm layer database', plsqlLayer.length > 0 && plsqlLayer.every((r) => r.layer === 'database'), JSON.stringify(plsqlLayer));

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

  // Grafo unificado cross-tier (queryUnifiedGraph)
  const db2 = openIndexDb(join(fixture, '.tic-code', 'index.db'));
  if (db2) {
    const top = queryUnifiedGraph(db2, { expanded: [] });
    check('U1: grafo unificado retorna nós de layer', top.nodes.some((n) => n.kind === 'layer'), top.nodes.map((n) => n.id).join(', '));
    check('U2: grafo unificado tem arestas cross-tier', top.edges.length > 0, `edges=${top.edges.length}`);
    check('U3: arestas do grafo unificado têm via', top.edges.some((e) => !!e.via), top.edges.map((e) => e.via).join(', '));
    const dbLayer = top.nodes.find((n) => n.id === 'layer:database');
    check('U4: layer:database presente no topo', !!dbLayer, top.nodes.map((n) => n.id).join(', '));
    // Expandir database: deve expor nós plsql e table
    const expanded = queryUnifiedGraph(db2, { expanded: ['layer:database'] });
    check('U5: expandir layer:database revela nós plsql ou table', expanded.nodes.some((n) => n.kind === 'plsql' || n.kind === 'table'), expanded.nodes.map((n) => n.kind + ':' + n.label).join(', '));
    db2.close();
  }

  db.close();
  cleanupFixture(fixture);

  // ── Workspace monorepo: <projeto>-backend / <projeto>-frontend lado a lado ──
  console.log('\nMonorepo <projeto>-backend / <projeto>-frontend\n');
  const mono = join(root, 'test', 'fixtures', 'monorepo');
  cleanupFixture(mono);
  const rMono = await runPipeline(mono, () => {});
  check('W0: pipeline concluiu no monorepo', rMono.success, rMono.error ?? '');
  const mdb = openIndexDb(join(mono, '.tic-code', 'index.db'));
  if (mdb) {
    const names = mdb.prepare('SELECT name, layer FROM modules').all();
    check('W1: subprojetos viram módulos de nome curto (backend/frontend)',
      names.some((m) => m.name === 'backend' || m.name.startsWith('backend/')) &&
      names.some((m) => m.name === 'frontend' || m.name.startsWith('frontend/')),
      JSON.stringify(names));
    check('W2: nenhum módulo com nome longo pending-approval-*', names.every((m) => !m.name.startsWith('pending-approval-')), JSON.stringify(names));
    const feTs = mdb.prepare("SELECT layer FROM files WHERE rel_path LIKE 'pending-approval-frontend/%.ts'").all();
    check('W3: .ts dentro de *-frontend tem layer frontend', feTs.length > 0 && feTs.every((r) => r.layer === 'frontend'), JSON.stringify(feTs));
    const beJava = mdb.prepare("SELECT layer FROM files WHERE rel_path LIKE 'pending-approval-backend/%.java'").all();
    check('W4: .java dentro de *-backend tem layer backend', beJava.length > 0 && beJava.every((r) => r.layer === 'backend'), JSON.stringify(beJava));
    mdb.close();
  }
  cleanupFixture(mono);
  console.log('');
  if (failures.length) { console.error(`✗ ${failures.length} verificação(ões) falharam`); process.exit(1); }
  console.log('✓ todas as verificações de impacto passaram');
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
