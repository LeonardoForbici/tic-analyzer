/**
 * Verificação da complexidade real por função sobre a AST (P0 #2), em
 * test/fixtures/complexity. Roda contra o código compilado em dist/ — execute
 * `npm run build:server` antes (ou `npm run verify`).
 *
 * Asserta:
 *   (a) gramáticas disponíveis
 *   (b) ciclomática McCabe correta (Java classify = 8, TS rank = 6)
 *   (c) cognitiva > ciclomática em função aninhada (captura o aninhamento)
 *   (d) maxNesting reflete o aninhamento real (classify = 3)
 *   (e) arquivo sem gramática (.py) não aparece no Map → fallback regex
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distAst = join(root, 'dist', 'src', 'analyzer', 'semantic', 'computeAstMetrics.js');
const distScan = join(root, 'dist', 'src', 'analyzer', 'scanFiles.js');
const distTs = join(root, 'dist', 'src', 'analyzer', 'semantic', 'treeSitter.js');

if (!existsSync(distAst) || !existsSync(distScan)) {
  console.error('✗ dist não encontrado. Rode `npm run build:server` primeiro.');
  process.exit(1);
}

const { scanFiles } = require(distScan);
const { computeAstMetrics, isOffenderFunction } = require(distAst);
const { grammarsAvailable } = require(distTs);

const fixture = join(root, 'test', 'fixtures', 'complexity');

const failures = [];
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
}

(async () => {
  // (a) gramáticas disponíveis
  check('(a) gramáticas tree-sitter disponíveis', grammarsAvailable());
  if (!grammarsAvailable()) {
    console.error('✗ grammars indisponíveis — verifique src/analyzer/semantic/grammars/*.wasm');
    process.exit(1);
  }

  const files = scanFiles(fixture, {});
  const metrics = await computeAstMetrics(files);
  console.log(`\nAST metrics verify (${files.length} arquivos, ${metrics.size} com AST)\n`);

  const java = metrics.get('Complex.java');
  check('Complex.java tem métrica AST', !!java, `keys=${[...metrics.keys()].join(', ')}`);
  if (java) {
    check('(b) Complex.java tem 2 funções', java.functionCount === 2, `functionCount=${java.functionCount}`);
    check('(b) soma ciclomática do arquivo = 9 (classify 8 + simple 1)', java.cyclomatic === 9, `cyclomatic=${java.cyclomatic}`);
    const w = java.worstFunction;
    check('pior função = classify', w && w.name === 'classify', `worst=${w && w.name}`);
    check('(b) classify ciclomática McCabe = 8', w && w.cyclomatic === 8, `cc=${w && w.cyclomatic}`);
    check('(c) classify cognitiva > ciclomática (aninhamento)', w && w.cognitive > w.cyclomatic, `cognitive=${w && w.cognitive} cc=${w && w.cyclomatic}`);
    check('(d) classify maxNesting = 3', w && w.maxNesting === 3, `maxNesting=${w && w.maxNesting}`);
  }

  const ts = metrics.get('complex.ts');
  check('complex.ts tem métrica AST', !!ts);
  if (ts) {
    check('(b) complex.ts tem 2 funções (rank + noop)', ts.functionCount === 2, `functionCount=${ts.functionCount}`);
    const w = ts.worstFunction;
    check('pior função = rank', w && w.name === 'rank', `worst=${w && w.name}`);
    check('(b) rank ciclomática McCabe = 6', w && w.cyclomatic === 6, `cc=${w && w.cyclomatic}`);
    check('(c) rank cognitiva > ciclomática', w && w.cognitive > w.cyclomatic, `cognitive=${w && w.cognitive} cc=${w && w.cyclomatic}`);
  }

  // (f) lista de funções por arquivo (não só a pior)
  if (java) {
    check('(f) Complex.java expõe lista de funções', Array.isArray(java.functions) && java.functions.length >= 1, `functions=${java && java.functions && java.functions.length}`);
    check('(f) classify NÃO é ofensora (abaixo dos limites)', java.worstFunction && !isOffenderFunction(java.worstFunction), `cc=${java.worstFunction?.cyclomatic} cog=${java.worstFunction?.cognitive} nest=${java.worstFunction?.maxNesting}`);
  }

  // (g) detecção de ofensora: deep() excede cognitiva (21>15) e aninhamento (6>4)
  const off = metrics.get('Offender.java');
  check('Offender.java tem métrica AST', !!off);
  if (off) {
    const w = off.worstFunction;
    check('pior função = deep', w && w.name === 'deep', `worst=${w && w.name}`);
    check('(g) deep ciclomática = 7', w && w.cyclomatic === 7, `cc=${w && w.cyclomatic}`);
    check('(g) deep maxNesting = 6', w && w.maxNesting === 6, `nest=${w && w.maxNesting}`);
    check('(g) deep cognitiva > 15', w && w.cognitive > 15, `cog=${w && w.cognitive}`);
    check('(g) deep é ofensora', w && isOffenderFunction(w));
  }

  // (e) fallback: linguagem sem gramática não entra no Map
  check('(e) legacy.py não tem métrica AST (cai no regex)', !metrics.has('legacy.py'));

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
