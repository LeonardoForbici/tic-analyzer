/**
 * Copia o runtime WASM do tree-sitter (core) e as grammars das linguagens para
 * junto do código compilado em dist/. Necessário porque treeSitter.ts resolve as
 * grammars relativas ao __dirname, que em runtime é dist/src/analyzer/semantic/.
 *
 * Fonte = node_modules (versões fixadas no package.json). Assim não commitamos
 * binários no git, mantendo o build 100% offline (depende só do npm install).
 * Cross-platform (Windows/mac/linux).
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dest = join(root, 'dist', 'src', 'analyzer', 'semantic', 'grammars');

const sources = [
  join(root, 'node_modules', 'web-tree-sitter', 'tree-sitter.wasm'),
  join(root, 'node_modules', 'tree-sitter-wasms', 'out', 'tree-sitter-java.wasm'),
  join(root, 'node_modules', 'tree-sitter-wasms', 'out', 'tree-sitter-typescript.wasm'),
  join(root, 'node_modules', 'tree-sitter-wasms', 'out', 'tree-sitter-tsx.wasm'),
  join(root, 'node_modules', 'tree-sitter-wasms', 'out', 'tree-sitter-javascript.wasm')
];

const missing = sources.filter((s) => !existsSync(s));
if (missing.length) {
  console.error('[copy-grammars] grammars não encontradas no node_modules:');
  for (const m of missing) console.error('  - ' + m);
  console.error('Rode `npm install` (web-tree-sitter + tree-sitter-wasms).');
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
for (const src of sources) copyFileSync(src, join(dest, src.split(/[\\/]/).pop()));
console.log(`[copy-grammars] ${sources.length} grammars WASM copiadas → ${dest}`);
