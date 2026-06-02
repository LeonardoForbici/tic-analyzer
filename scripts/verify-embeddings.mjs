/**
 * Verificação da infraestrutura de busca semântica (Fase 4) — roda contra dist/.
 *
 * IMPORTANTE: o embedder NEURAL (@xenova/transformers) baixa o modelo da rede;
 * em sandboxes onde o host de modelos é bloqueado ele fica inativo e a busca cai
 * para FTS. Este verify cobre a parte determinística e real: armazenamento de
 * vetores no SQLite + ranking por similaridade de cosseno. Os vetores aqui são
 * fixos (não vêm do modelo) — propositalmente, para testar a MÁQUINA, não o modelo.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}.`); process.exit(1); } return p; };

const { writeIndexDb, openIndexDb } = require(need(join(root, 'dist/src/analyzer/store/indexDb.js')));
const { queryVectorSearch, embeddingsCount } = require(need(join(root, 'dist/src/mcp/queries.js')));
const { cosine, vectorToBlob, blobToVector } = require(need(join(root, 'dist/src/analyzer/semantic/embeddings.js')));

const failures = [];
const check = (n, c, d = '') => { if (c) console.log(`  ✓ ${n}`); else { console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); failures.push(n); } };

console.log('\nBusca semântica (Fase 4) — infra determinística\n');

// cosseno + roundtrip de BLOB
check('cosine(v, v) == 1', Math.abs(cosine(new Float32Array([1, 2, 3]), new Float32Array([1, 2, 3])) - 1) < 1e-6);
check('cosine ortogonais == 0', Math.abs(cosine(new Float32Array([1, 0]), new Float32Array([0, 1]))) < 1e-6);
const rt = blobToVector(vectorToBlob(new Float32Array([0.5, -0.25, 0.125])));
check('roundtrip vector→BLOB→vector', Math.abs(rt[0] - 0.5) < 1e-6 && Math.abs(rt[1] + 0.25) < 1e-6 && Math.abs(rt[2] - 0.125) < 1e-6);

// armazenamento + ranking por similaridade
const dbPath = join(tmpdir(), 'tic-verify-emb.db');
for (const s of ['', '-wal', '-shm']) if (existsSync(dbPath + s)) rmSync(dbPath + s);
writeIndexDb(dbPath, {
  files: [],
  graph: { nodes: [], edges: [], centralFiles: [], externalDeps: [], semanticClasses: [], methodEdges: [] },
  callGraph: { nodes: [], edges: [] },
  searchEntries: [],
  embeddings: [
    { file: 'auth.ts', vector: new Float32Array([1, 0, 0]) },
    { file: 'pagamento.ts', vector: new Float32Array([0, 1, 0]) },
    { file: 'login.ts', vector: new Float32Array([0.9, 0.1, 0]) }
  ]
});

const db = openIndexDb(dbPath);
check('embeddings persistidos no index.db', embeddingsCount(db) === 3);
const hits = queryVectorSearch(db, new Float32Array([1, 0, 0]), 3);
check('ranking por cosseno: auth.ts primeiro', hits[0]?.file === 'auth.ts', hits.map((h) => h.file).join(','));
check('ranking por cosseno: login.ts (similar) antes de pagamento.ts',
  hits.findIndex((h) => h.file === 'login.ts') < hits.findIndex((h) => h.file === 'pagamento.ts'),
  hits.map((h) => `${h.file}:${h.score}`).join(', '));
db.close();

console.log('\n  (embedder neural fica ativo onde o modelo é acessível; aqui o host está bloqueado → FTS segue ativo)');
console.log('');
if (failures.length) { console.error(`✗ ${failures.length} verificação(ões) falharam`); process.exit(1); }
console.log('✓ infraestrutura de busca semântica verificada');
