/**
 * Verificação do barramento de eventos único (analyzer/eventBus.ts) — roda contra dist/.
 *
 * Antes desta peça, server/index.ts e mcp/server.ts mantinham cada um seu
 * próprio Set<Response> de SSE, sem se enxergarem. Este teste confirma que
 * um evento publicado no bus chega a QUALQUER assinante registrado,
 * simulando os dois consumidores (Express SSE e MCP SSE) sem precisar subir
 * HTTP de verdade — a cobertura fim-a-fim de cada endpoint já é feita por
 * verify-living.mjs (S0-S3, MCP /events) e verify-serve.mjs.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:server\`.`); process.exit(1); } return p; };

const { eventBus } = require(need(join(root, 'dist/src/analyzer/eventBus.js')));

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name); }
};

console.log('\nBarramento de eventos único (eventBus)\n');

// E1: dois assinantes independentes recebem o mesmo evento (simula server + mcp)
{
  const receivedByServerSim = [];
  const receivedByMcpSim = [];
  const unsubServer = eventBus.subscribe((e) => receivedByServerSim.push(e));
  const unsubMcp = eventBus.subscribe((e) => receivedByMcpSim.push(e));

  eventBus.publish({ source: 'pipeline', type: 'risk-new', payload: { file: 'x.ts', level: 'critical' } });

  check('E1: assinante "server" recebeu o evento', receivedByServerSim.length === 1);
  check('E1: assinante "mcp" recebeu o mesmo evento', receivedByMcpSim.length === 1);
  check(
    'E1: payload chega intacto nos dois lados',
    JSON.stringify(receivedByServerSim[0]?.payload) === JSON.stringify(receivedByMcpSim[0]?.payload)
  );
  check('E1: ts é preenchido automaticamente no publish', typeof receivedByServerSim[0]?.ts === 'string' && receivedByServerSim[0].ts.length > 0);

  unsubServer();
  unsubMcp();
}

// E2: subscribe() retorna função de unsubscribe funcional
{
  const received = [];
  const unsub = eventBus.subscribe((e) => received.push(e));
  unsub();
  eventBus.publish({ source: 'server', type: 'analysis-done', payload: {} });
  check('E2: após unsubscribe, assinante não recebe mais eventos', received.length === 0);
}

// E3: múltiplos publishes preservam ordem por assinante
{
  const received = [];
  const unsub = eventBus.subscribe((e) => received.push(e.type));
  eventBus.publish({ source: 'agent', type: 'trigger-fired', payload: 1 });
  eventBus.publish({ source: 'agent', type: 'agent-dispatched', payload: 2 });
  check('E3: eventos chegam na ordem de publicação', received.join(',') === 'trigger-fired,agent-dispatched');
  unsub();
}

if (failures.length) {
  console.log(`\n✗ ${failures.length} falha(s): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\n✓ barramento de eventos verificado');
