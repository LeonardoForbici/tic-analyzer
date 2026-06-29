/**
 * Verificação da análise temporal via git (hotspots comportamentais, change
 * coupling, bus factor). Roda contra o próprio repositório TIC, que sempre tem
 * histórico git. Usa o código compilado em dist/ — rode `npm run build:server`
 * antes (ou `npm run verify`, que assume dist pronto).
 *
 * Asserta:
 *   (a) histórico disponível e commits lidos > 0
 *   (b) churn por arquivo populado, com campos coerentes
 *   (c) hotspots comportamentais = complexidade × mudança
 *   (d) gracefully indisponível fora de um repo git
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distGit = join(root, 'dist', 'src', 'analyzer', 'analyzeGitHistory.js');
const distReport = join(root, 'dist', 'src', 'analyzer', 'generateGitReport.js');
const distScan = join(root, 'dist', 'src', 'analyzer', 'scanFiles.js');
const distMetrics = join(root, 'dist', 'src', 'analyzer', 'computeMetrics.js');
const distGraph = join(root, 'dist', 'src', 'analyzer', 'buildDependencyGraph.js');
const distModules = join(root, 'dist', 'src', 'analyzer', 'detectModules.js');

for (const p of [distGit, distReport, distScan, distMetrics, distGraph, distModules]) {
  if (!existsSync(p)) {
    console.error(`✗ dist não encontrado (${p}). Rode \`npm run build:server\` primeiro.`);
    process.exit(1);
  }
}

const { analyzeGitHistory } = require(distGit);
const { computeBehavioralHotspots } = require(distReport);
const { scanFiles } = require(distScan);
const { computeMetrics } = require(distMetrics);
const { buildDependencyGraph } = require(distGraph);
const { detectModules } = require(distModules);

const failures = [];
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
}

(async () => {
  const files = scanFiles(root, {});
  const knownFiles = new Set(files.map((f) => f.relativePath));
  const modules = detectModules(files);
  const fileModule = new Map();
  for (const mod of modules) for (const f of mod.files) fileModule.set(f.relativePath, mod.name);

  const history = analyzeGitHistory(root, { knownFiles, fileModule, maxCommits: 500 });

  console.log(`\nGit-history verify (${files.length} arquivos, ${history.analyzedCommits} commits)\n`);

  // (a) disponível
  check('(a) histórico git disponível', history.available === true, history.reason ?? '');
  check('(a) commits analisados > 0', history.analyzedCommits > 0, `commits=${history.analyzedCommits}`);

  // (b) churn coerente
  check('(b) churn por arquivo populado', Array.isArray(history.churn) && history.churn.length > 0, `churn=${history.churn.length}`);
  const sample = history.churn[0];
  check('(b) churn tem campos esperados', sample && sample.commits >= 1 && typeof sample.mainAuthor === 'string' && sample.ageDays >= 0,
    sample ? JSON.stringify({ commits: sample.commits, ageDays: sample.ageDays }) : 'sem amostra');
  check('(b) churn só contém arquivos conhecidos', history.churn.every((c) => knownFiles.has(c.file)));

  // (c) hotspots comportamentais
  const graph = await buildDependencyGraph(files, root);
  const metrics = computeMetrics(files, graph, modules);
  const hotspots = computeBehavioralHotspots(history.churn, metrics.files);
  check('(c) hotspots comportamentais calculados', Array.isArray(hotspots) && hotspots.length > 0, `hotspots=${hotspots.length}`);
  check('(c) score 0–100 e ordenado desc', hotspots.length === 0 ||
    (hotspots[0].score <= 100 && hotspots[0].score >= hotspots[hotspots.length - 1].score),
    hotspots.length ? `top=${hotspots[0].score}` : '');
  check('(c) hotspot combina commits e complexidade', hotspots.length === 0 ||
    (hotspots[0].commits >= 1 && hotspots[0].complexity >= 1));

  // (d) gracefully indisponível fora de git
  const tmp = mkdtempSync(join(tmpdir(), 'tic-nogit-'));
  const noGit = analyzeGitHistory(tmp, { knownFiles: new Set() });
  check('(d) retorna available=false fora de um repo git', noGit.available === false, noGit.reason ?? '');

  console.log('');
  if (failures.length) {
    console.error(`✗ ${failures.length} verificação(ões) falharam`);
    process.exit(1);
  }
  console.log('✓ todas as verificações passaram');
})().catch((e) => {
  console.error('Erro fatal na verificação:', e);
  process.exit(1);
});
