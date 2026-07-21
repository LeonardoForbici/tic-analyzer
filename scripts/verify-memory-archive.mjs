/**
 * Verificação da memória permanente vinculada a GitHub (Frente B) — roda contra dist/.
 *
 * Cobre: arquivamento do excedente FIFO (B1), githubLinks em appendMemory/
 * updateMemoryEntry/findMemoryByGithub (B2, na camada de store — a
 * exposição via MCP tools remember/recall_deep/link_memory_github/
 * find_memory_by_github é fina o bastante para não precisar de teste
 * end-to-end separado) e verifyGithubLinks (B3) contra um GhClient fake.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:server\`.`); process.exit(1); } return p; };

const {
  appendMemory,
  loadMemory,
  queryMemory,
  queryArchivedMemory,
  updateMemoryEntry,
  findMemoryByGithub,
  runMemoryMaintenance
} = require(need(join(root, 'dist/src/analyzer/store/memoryStore.js')));
const { verifyGithubLinks } = require(need(join(root, 'dist/src/analyzer/store/githubLinkVerifier.js')));

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name); }
};

const dir = mkdtempSync(join(tmpdir(), 'tic-memory-archive-'));
const ticCodeDir = join(dir, '.tic-code');

console.log('\n(1) githubLinks em appendMemory / find_memory_by_github (B2)\n');

const entry1 = appendMemory(ticCodeDir, {
  entity: 'file:src/api/user.ts', kind: 'decision', summary: 'Migrar para novo endpoint',
  githubLinks: [{ kind: 'pr', repo: 'acme/widgets', number: 42, url: 'http://mock/pr/42', title: 'Fix', state: 'open' }]
});
check('M1: appendMemory grava githubLinks', entry1.githubLinks?.length === 1);

const found = findMemoryByGithub(ticCodeDir, { repo: 'acme/widgets', pr: 42 });
check('M2: find_memory_by_github encontra por PR', found.length === 1 && found[0].id === entry1.id);

const notFound = findMemoryByGithub(ticCodeDir, { repo: 'acme/widgets', pr: 999 });
check('M3: find_memory_by_github não encontra PR errada', notFound.length === 0);

const updated = updateMemoryEntry(ticCodeDir, entry1.id, { githubLinks: [...entry1.githubLinks, { kind: 'commit', repo: 'acme/widgets', sha: 'abc123', url: 'http://mock/commit/abc123' }] });
check('M4: link_memory_github (updateMemoryEntry) anexa novo link', updated.githubLinks.length === 2);

console.log('\n(2) Arquivamento do excedente FIFO (B1)\n');

const dir2 = mkdtempSync(join(tmpdir(), 'tic-memory-archive-overflow-'));
const ticCodeDir2 = join(dir2, '.tic-code');
const MAX = 1000;
for (let i = 0; i < MAX + 25; i++) {
  appendMemory(ticCodeDir2, { entity: `file:overflow-${i}.ts`, kind: 'note', summary: `nota ${i}` });
}
const hot = loadMemory(ticCodeDir2);
check('B1: array quente respeita o cap de 1000', hot.length === MAX, `tamanho=${hot.length}`);

const archiveDir = join(ticCodeDir2, 'memory-archive');
const archiveFiles = existsSync(archiveDir) ? readdirSync(archiveDir).filter((f) => f.endsWith('.jsonl')) : [];
check('B2: overflow foi arquivado em .jsonl (não descartado)', archiveFiles.length > 0, `arquivos=${archiveFiles.join(',')}`);

let archivedCount = 0;
for (const f of archiveFiles) archivedCount += readFileSync(join(archiveDir, f), 'utf8').split('\n').filter(Boolean).length;
check('B3: nº de entradas arquivadas ≈ excedente (25)', archivedCount === 25, `arquivadas=${archivedCount}`);

const archivedQuery = queryArchivedMemory(ticCodeDir2, 'overflow-0.ts', 5);
check('B4: queryArchivedMemory encontra entrada antiga arquivada', archivedQuery.some((e) => e.entity === 'file:overflow-0.ts'));

const stillHotQuery = queryMemory(ticCodeDir2, `overflow-${MAX + 24}.ts`, 5);
check('B5: entrada recente ainda está no store quente', stillHotQuery.length === 1);

console.log('\n(3) Manutenção roda antes de arquivar — sem duplicatas indo pro arquivo (B1)\n');

const dir3 = mkdtempSync(join(tmpdir(), 'tic-memory-archive-dedup-'));
const ticCodeDir3 = join(dir3, '.tic-code');
for (let i = 0; i < MAX + 10; i++) {
  // Mesma entity+kind+summary repetida — dedup deveria colapsar antes de arquivar.
  appendMemory(ticCodeDir3, { entity: 'file:dup.ts', kind: 'note', summary: 'sempre a mesma nota' });
}
const { deduped } = runMemoryMaintenance(loadMemory(ticCodeDir3));
check('B6: após dedup, entity duplicada colapsa numa entrada só', deduped.filter((e) => e.entity === 'file:dup.ts').length === 1);

console.log('\n(4) verifyGithubLinks contra GhClient fake (B3)\n');

const fakeClient = {
  async resolvePr(repo, number) { return number === 42 ? { kind: 'pr', repo, number, url: 'http://mock/pr/42' } : null; },
  async resolveCommit() { return null; },
  async resolveIssue() { return null; }
};

const dir4 = mkdtempSync(join(tmpdir(), 'tic-memory-archive-verify-'));
const ticCodeDir4 = join(dir4, '.tic-code');
const withLink = appendMemory(ticCodeDir4, {
  entity: 'file:x.ts', kind: 'decision', summary: 'x',
  githubLinks: [
    { kind: 'pr', repo: 'acme/widgets', number: 42, url: 'http://mock/pr/42' },
    { kind: 'pr', repo: 'acme/widgets', number: 999, url: 'http://mock/pr/999' }
  ]
});
const verifyResult = await verifyGithubLinks(ticCodeDir4, fakeClient);
check('V1: verifyGithubLinks checa os 2 links pendentes', verifyResult.checked === 2);
check('V2: 1 confirmado (PR #42 existe), 1 falhou (PR #999 não existe)', verifyResult.verified === 1 && verifyResult.failed === 1);

const afterVerify = loadMemory(ticCodeDir4).find((e) => e.id === withLink.id);
const link42 = afterVerify.githubLinks.find((l) => l.number === 42);
const link999 = afterVerify.githubLinks.find((l) => l.number === 999);
check('V3: link confirmado ganha verifiedAt', typeof link42.verifiedAt === 'string');
check('V4: link não confirmado continua sem verifiedAt', link999.verifiedAt === undefined);

rmSync(dir, { recursive: true, force: true });
rmSync(dir2, { recursive: true, force: true });
rmSync(dir3, { recursive: true, force: true });
rmSync(dir4, { recursive: true, force: true });

if (failures.length) {
  console.log(`\n✗ ${failures.length} falha(s): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\n✓ memória permanente vinculada a GitHub verificada');
