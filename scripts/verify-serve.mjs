/**
 * Verificação do modo servidor (enterprise) — roda contra dist/.
 *
 * Sobe `tic-analyzer serve` num fixture analisado e prova: /health aberto,
 * /mcp exige Bearer token quando --token é passado, e aceita com o token.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:electron\`.`); process.exit(1); } return p; };
const { runPipeline } = require(need(join(root, 'dist/src/analyzer/pipeline.js')));
const cli = need(join(root, 'dist/src/cli/index.js'));

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

const PORT = 7497;
const TOKEN = 'segredo-do-time';

async function waitHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (r.ok) return r;
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

(async () => {
  console.log('\nModo servidor (tic-analyzer serve) — auth por token\n');
  const fixture = join(root, 'test', 'fixtures', 'crosstier');
  cleanupFixture(fixture);
  const r = await runPipeline(fixture, () => {}, { skipAiFiles: true });
  check('S0: análise prévia ok', r.success, r.error ?? '');

  const child = spawn(process.execPath, [cli, 'serve', fixture, '--no-analyze', '--port', String(PORT), '--token', TOKEN], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  child.stdout.on('data', (d) => { serverLog += d; });
  child.stderr.on('data', (d) => { serverLog += d; });

  try {
    const health = await waitHealth();
    check('S1: /health responde sem token (probe de monitoramento)', !!health, serverLog.slice(-300));

    const noAuth = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    check('S2: /mcp SEM token → 401', noAuth.status === 401);

    const withAuth = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    check('S3: /mcp COM token passa na auth (≠401)', withAuth.status !== 401, `status=${withAuth.status}`);
    const text = await withAuth.text();
    check('S4: tools/list retorna as tools (get_blast_radius presente)', text.includes('get_blast_radius'), text.slice(0, 200));

    const wrongAuth = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer errado' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    check('S5: token errado → 401', wrongAuth.status === 401, `status=${wrongAuth.status}`);
  } finally {
    child.kill('SIGTERM');
    cleanupFixture(fixture);
  }

  console.log('');
  if (failures.length) { console.error(`✗ ${failures.length} verificação(ões) falharam`); process.exit(1); }
  console.log('✓ modo servidor verificado');
  process.exit(0);
})().catch((e) => { console.error('Erro fatal:', e); process.exit(1); });
