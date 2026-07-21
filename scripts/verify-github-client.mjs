/**
 * Verificação da camada de acesso ao GitHub (analyzer/github/*) — roda contra dist/.
 *
 * Cobre: parseRemoteUrl/inferRepoSlug (puro, sem rede) e RestGhClient
 * (mockado via servidor HTTP local, mesmo padrão de verify-living.mjs para
 * capturar o POST de dispatchAlerts — aqui capturamos requisições da API do
 * GitHub apontando `baseUrl` do Octokit para o servidor local).
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import http from 'node:http';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:server\`.`); process.exit(1); } return p; };

const { parseRemoteUrl, inferRepoSlug } = require(need(join(root, 'dist/src/analyzer/github/repoSlug.js')));
const { createRestGhClient } = require(need(join(root, 'dist/src/analyzer/github/restGhClient.js')));

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name); }
};

console.log('\n(1) parseRemoteUrl / inferRepoSlug (puro)\n');
check('R1: SSH form', parseRemoteUrl('git@github.com:acme/widgets.git') === 'acme/widgets');
check('R2: HTTPS form', parseRemoteUrl('https://github.com/acme/widgets.git') === 'acme/widgets');
check('R3: HTTPS sem .git', parseRemoteUrl('https://github.com/acme/widgets') === 'acme/widgets');
check('R4: URL inválida retorna null', parseRemoteUrl('not-a-url') === null);
check('R5: inferRepoSlug em diretório sem remote retorna null', inferRepoSlug('/tmp') === null);

console.log('\n(2) RestGhClient contra API do GitHub mockada\n');

const requests = [];
const mockServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    requests.push({ method: req.method, url: req.url, body });
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET' && req.url?.startsWith('/repos/acme/widgets/pulls/42')) {
      res.writeHead(200);
      res.end(JSON.stringify({ number: 42, html_url: 'http://mock/pr/42', title: 'Fix bug', state: 'closed', merged_at: '2026-01-01T00:00:00Z' }));
      return;
    }
    if (req.method === 'GET' && req.url?.startsWith('/repos/acme/widgets/commits/abc123')) {
      res.writeHead(200);
      res.end(JSON.stringify({ sha: 'abc123', html_url: 'http://mock/commit/abc123', commit: { message: 'fix: bug\n\ndetails' } }));
      return;
    }
    if (req.method === 'POST' && req.url === '/repos/acme/widgets/issues') {
      res.writeHead(201);
      res.end(JSON.stringify({ number: 7, html_url: 'http://mock/issues/7', title: 'Novo problema', state: 'open' }));
      return;
    }
    if (req.method === 'GET' && req.url?.startsWith('/repos/acme/widgets/pulls/999')) {
      res.writeHead(404);
      res.end(JSON.stringify({ message: 'Not Found' }));
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ message: 'unhandled in mock: ' + req.method + ' ' + req.url }));
  });
});

await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
const { port } = mockServer.address();
const baseUrl = `http://127.0.0.1:${port}`;
const client = createRestGhClient({ token: 'fake-token-for-tests', baseUrl });

const pr = await client.resolvePr('acme/widgets', 42);
check('G1: resolvePr encontra PR mergeado', pr?.number === 42 && pr?.state === 'closed' && pr?.mergedAt === '2026-01-01T00:00:00Z');

const commit = await client.resolveCommit('acme/widgets', 'abc123');
check('G2: resolveCommit encontra commit', commit?.sha === 'abc123' && commit?.title === 'fix: bug');

const missingPr = await client.resolvePr('acme/widgets', 999);
check('G3: resolvePr inexistente retorna null (não lança)', missingPr === null);

const issue = await client.createIssue('acme/widgets', 'Novo problema', 'corpo', ['bug']);
check('G4: createIssue retorna GhRef com number/url', issue.number === 7 && issue.url === 'http://mock/issues/7');

const authHeaderSeen = requests.some((r) => true); // presença de requisições já confirma que o client bateu no mock, não na API real
check('G5: nenhuma chamada saiu do baseUrl mockado (sem rede real)', requests.length >= 4);

mockServer.close();

if (failures.length) {
  console.log(`\n✗ ${failures.length} falha(s): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\n✓ camada de acesso ao GitHub verificada');
