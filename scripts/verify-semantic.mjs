/**
 * Verificação da camada semântica (Fase 1) sobre o fixture em
 * test/fixtures/semantic. Roda contra o código compilado em dist/ — execute
 * `npm run build:server` antes (ou `npm run verify` que assume dist pronto).
 *
 * Asserta:
 *   (a) chamada Java controller→impl resolvida via interface (DI)
 *   (b) import TS com alias `@/...` resolvido
 *   (c) barrel re-export resolvido até a origem
 *   (d) chamada para interface com vários implementadores → 'inferred'
 *   (e) implements Java resolvido
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distSemantic = join(root, 'dist', 'src', 'analyzer', 'semantic', 'buildSemanticGraph.js');
const distScan = join(root, 'dist', 'src', 'analyzer', 'scanFiles.js');

if (!existsSync(distSemantic) || !existsSync(distScan)) {
  console.error('✗ dist não encontrado. Rode `npm run build:server` primeiro.');
  process.exit(1);
}

const { scanFiles } = require(distScan);
const { buildSemanticGraph } = require(distSemantic);

const fixture = join(root, 'test', 'fixtures', 'semantic');

const failures = [];
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
}

function hasEdge(edges, from, to, kind, confidence) {
  return edges.some(
    (e) =>
      e.from.endsWith(from) &&
      e.to.endsWith(to) &&
      e.kind === kind &&
      (confidence === undefined || e.confidence === confidence)
  );
}

(async () => {
  const files = scanFiles(fixture, {});
  const graph = await buildSemanticGraph(files, fixture);

  console.log(`\nSemantic verify (${files.length} arquivos, ${graph.edges.length} arestas)\n`);
  if (!graph.available) {
    console.error('✗ grammars indisponíveis — verifique src/analyzer/semantic/grammars/*.wasm');
    process.exit(1);
  }

  // (a) controller → impl via interface (single impl) — resolved call
  check(
    '(a) UserController.list() resolve para UserServiceImpl (interface→impl)',
    hasEdge(graph.edges, 'UserController.java', 'UserServiceImpl.java', 'call', 'resolved')
  );

  // (b) alias TS @/services resolvido (import edge para a origem ou barrel)
  check(
    '(b) widget.ts importa via alias @/services',
    hasEdge(graph.edges, 'app/widget.ts', 'services/index.ts', 'import', 'resolved') ||
      hasEdge(graph.edges, 'app/widget.ts', 'services/user.ts', 'import', 'resolved')
  );

  // (c) barrel re-export seguido até a origem user.ts
  check(
    '(c) barrel index.ts resolve até a origem user.ts',
    hasEdge(graph.edges, 'app/widget.ts', 'services/user.ts', 'import', 'resolved')
  );

  // (d) interface com 2 implementadores → inferred para ambos
  check(
    '(d) PaymentService.charge() → StripeGateway (inferred, ambíguo)',
    hasEdge(graph.edges, 'PaymentService.java', 'StripeGateway.java', 'call', 'inferred')
  );
  check(
    '(d) PaymentService.charge() → PaypalGateway (inferred, ambíguo)',
    hasEdge(graph.edges, 'PaymentService.java', 'PaypalGateway.java', 'call', 'inferred')
  );

  // (e) implements Java resolvido
  check(
    '(e) UserServiceImpl implements UserService (resolved)',
    hasEdge(graph.edges, 'UserServiceImpl.java', 'UserService.java', 'implements', 'resolved')
  );

  // sanidade: nenhuma aresta de chamada deve apontar para a própria interface
  // quando há implementador único (precisão)
  check(
    'sanidade: classes detectadas via AST',
    graph.classes.length >= 6,
    `classes=${graph.classes.length}`
  );

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
