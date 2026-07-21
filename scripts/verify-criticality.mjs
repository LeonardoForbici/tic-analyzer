/**
 * Verificação da Frente D5 (ranking de criticidade cross-tier) — roda contra dist/.
 *
 * Cobre computeCriticalityRanking (função pura, generateGraphReport.ts):
 * um nó que é ponte entre 2 comunidades + tem churn alto deve ranquear acima
 * de um nó com blast radius isolado mas sem churn/pontes.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const need = (p) => { if (!existsSync(p)) { console.error(`✗ dist ausente: ${p}. Rode \`npm run build:server\`.`); process.exit(1); } return p; };

const { computeCriticalityRanking } = require(need(join(root, 'dist/src/analyzer/generateGraphReport.js')));

const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name); }
};

console.log('\nRanking de criticidade cross-tier\n');

// Grafo sintético:
//  - "bridge.ts" conecta a comunidade 0 (isolated.ts) e a comunidade 1 (a.ts, b.ts) — é ponte.
//  - "isolated.ts" tem blast radius alto (3 dependentes) mas é tudo dentro da própria comunidade (0), sem ponte.
const impactEdges = [
  { from: 'file:dep1.ts', to: 'file:isolated.ts', fromKind: 'file', toKind: 'file', via: 'import' },
  { from: 'file:dep2.ts', to: 'file:isolated.ts', fromKind: 'file', toKind: 'file', via: 'import' },
  { from: 'file:dep3.ts', to: 'file:isolated.ts', fromKind: 'file', toKind: 'file', via: 'import' },
  { from: 'file:bridge.ts', to: 'file:isolated.ts', fromKind: 'file', toKind: 'file', via: 'import' },
  { from: 'file:bridge.ts', to: 'file:a.ts', fromKind: 'file', toKind: 'file', via: 'import' },
  { from: 'file:bridge.ts', to: 'file:b.ts', fromKind: 'file', toKind: 'file', via: 'import' }
];

// dep1/dep2/dep3/isolated na comunidade 0; bridge também na 0; a/b na comunidade 1.
const communityByNode = new Map([
  ['file:dep1.ts', 0], ['file:dep2.ts', 0], ['file:dep3.ts', 0], ['file:isolated.ts', 0],
  ['file:bridge.ts', 0],
  ['file:a.ts', 1], ['file:b.ts', 1]
]);

const churnByFile = new Map([
  ['bridge.ts', { commits: 20, fixes: 5 }],
  ['isolated.ts', { commits: 0, fixes: 0 }]
]);

const ranking = computeCriticalityRanking(impactEdges, communityByNode, churnByFile);

check('C1: ranking não está vazio', ranking.length > 0);

const bridge = ranking.find((n) => n.id === 'file:bridge.ts');
const isolated = ranking.find((n) => n.id === 'file:isolated.ts');
check('C2: bridge.ts aparece no ranking', !!bridge);
check('C3: isolated.ts aparece no ranking (blast radius alto)', !!isolated);
check('C4: bridge.ts tem bridgeScore > 0 (toca a comunidade 1)', bridge?.bridgeScore > 0);
check('C5: isolated.ts tem bridgeScore 0 (tudo na mesma comunidade)', isolated?.bridgeScore === 0);
check('C6: isolated.ts tem blastRadius > bridge.ts (4 dependentes vs 0)', isolated?.blastRadius === 4 && bridge?.blastRadius === 0);
check(
  'C7: bridge (churn alto + ponte) ranqueia ACIMA de isolated (só blast radius)',
  bridge && isolated && bridge.criticality > isolated.criticality,
  `bridge=${bridge?.criticality} isolated=${isolated?.criticality}`
);
check('C8: reasons descreve os motivos em texto', bridge?.reasons.some((r) => r.includes('comunidade')));

const empty = computeCriticalityRanking([], new Map(), new Map());
check('C9: grafo vazio não lança e retorna array vazio', Array.isArray(empty) && empty.length === 0);

if (failures.length) {
  console.log(`\n✗ ${failures.length} falha(s): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\n✓ ranking de criticidade verificado');
