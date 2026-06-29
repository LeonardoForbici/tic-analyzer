/**
 * Verificação do export standalone do grafo (html / mermaid / svg).
 *
 * Roda a pipeline no fixture crosstier, abre o index.db e exporta cada formato,
 * conferindo que o conteúdo é coerente (HTML embute Cytoscape + DATA; Mermaid
 * começa com flowchart; SVG é um <svg> válido) e que os arquivos são escritos.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:server\`.`); process.exit(1); } return p; };

const { openIndexDb } = require(need(join(root, 'dist/src/analyzer/store/indexDb.js')));
const { runPipeline } = require(need(join(root, 'dist/src/analyzer/pipeline.js')));
const { exportGraphFiles, renderGraphMermaid, renderGraphSvg, renderGraphHtml } = require(need(join(root, 'dist/src/analyzer/exportGraph.js')));
const { queryGraphLevel } = require(need(join(root, 'dist/src/analyzer/store/graphQueries.js')));

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
  console.log('\nExport standalone do grafo — fixture crosstier\n');
  const fixture = join(root, 'test', 'fixtures', 'crosstier');
  cleanupFixture(fixture);
  const result = await runPipeline(fixture, () => {});
  check('E0: pipeline concluiu', result.success, result.error ?? '');

  const ticCodeDir = join(fixture, '.tic-code');
  const db = openIndexDb(join(ticCodeDir, 'index.db'));
  check('E1: index.db gerado', !!db);
  if (!db) { cleanupFixture(fixture); process.exit(1); }

  const level = queryGraphLevel(db, { expanded: [] });
  check('E2: nível topo tem nós', level.nodes.length > 0, `nodes=${level.nodes.length}`);

  // HTML
  const html = renderGraphHtml(level, 'crosstier');
  check('E3: HTML embute cytoscape', /cytoscape/.test(html));
  check('E4: HTML embute o DATA inline', /const DATA = /.test(html) && /"nodes"/.test(html));
  check('E5: HTML tem botões PNG/SVG', /Baixar PNG/.test(html) && /Baixar SVG/.test(html));

  // Mermaid
  const mmd = renderGraphMermaid(level, 'crosstier');
  check('E6: Mermaid começa com flowchart', mmd.startsWith('flowchart'), mmd.slice(0, 40));
  check('E7: Mermaid tem arestas com peso (-->|n|)', level.edges.length === 0 || /-->\|\d+\|/.test(mmd));

  // SVG
  const svg = renderGraphSvg(level, 'crosstier');
  check('E8: SVG é um <svg> válido', svg.startsWith('<svg') && svg.includes('</svg>'));

  // exportGraphFiles escreve os arquivos
  const rHtml = exportGraphFiles(db, ticCodeDir, { format: 'html' });
  const rMmd = exportGraphFiles(db, ticCodeDir, { format: 'mermaid' });
  const rSvg = exportGraphFiles(db, ticCodeDir, { format: 'svg' });
  check('E9: graph.html escrito', existsSync(rHtml.path) && readFileSync(rHtml.path, 'utf8').length > 100);
  check('E10: graph.mmd escrito', existsSync(rMmd.path) && rMmd.path.endsWith('.mmd'));
  check('E11: graph.svg escrito', existsSync(rSvg.path) && readFileSync(rSvg.path, 'utf8').startsWith('<svg'));

  // --out custom
  const customOut = join(ticCodeDir, 'meu-grafo.html');
  const rCustom = exportGraphFiles(db, ticCodeDir, { format: 'html', out: customOut });
  check('E12: --out respeitado', rCustom.path === customOut && existsSync(customOut));

  db.close();
  cleanupFixture(fixture);
  console.log('');
  if (failures.length) { console.error(`✗ ${failures.length} verificação(ões) falharam`); process.exit(1); }
  console.log('✓ todas as verificações de export do grafo passaram');
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
