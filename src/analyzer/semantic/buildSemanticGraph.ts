/**
 * Orquestra a camada semântica: lê os aliases do tsconfig do projeto analisado,
 * extrai símbolos de todos os arquivos suportados (Java/TS/JS/TSX) e resolve as
 * referências em arestas com confiança.
 *
 * É o ponto de entrada usado por `buildDependencyGraph` — 100% local/offline.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { ScannedFile } from '../scanFiles';
import { extractFileSymbols, type FileSymbols } from './extractSymbols';
import { resolveReferences, type ModuleResolver, type SemanticResult } from './resolveReferences';
import { langForExtension, grammarsAvailable } from './treeSitter';

const TS_EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.d.ts'];
const TS_INDEX = TS_EXTS.map((e) => `/index${e}`).filter((e) => e !== '/index');

export interface SemanticGraph extends SemanticResult {
  /** Arquivos que foram parseados com sucesso (relativePath). */
  parsedFiles: Set<string>;
  available: boolean;
}

export async function buildSemanticGraph(files: ScannedFile[], projectPath: string): Promise<SemanticGraph> {
  if (!grammarsAvailable()) {
    return { edges: [], externalDeps: [], classes: [], parsedFiles: new Set(), available: false };
  }

  const fileSet = new Set(files.map((f) => f.relativePath));
  const supported = files.filter((f) => langForExtension(f.extension) !== null);

  const allSymbols: FileSymbols[] = [];
  const parsedFiles = new Set<string>();
  for (const file of supported) {
    let content: string;
    try {
      content = fs.readFileSync(file.absolutePath, 'utf8');
    } catch {
      continue;
    }
    const sym = await extractFileSymbols(file.absolutePath, file.relativePath, file.extension, content);
    if (!sym) continue;
    allSymbols.push(sym);
    if (!sym.failed) parsedFiles.add(file.relativePath);
  }

  const resolver = makeTsResolver(projectPath, fileSet);
  const result = resolveReferences(allSymbols, resolver, fileSet);
  return { ...result, parsedFiles, available: true };
}

/** Resolve módulos TS (relativos + aliases de tsconfig) para relativePaths. */
function makeTsResolver(projectPath: string, fileSet: Set<string>): ModuleResolver {
  const aliases = loadTsAliases(projectPath);

  const tryCandidates = (base: string): string | null => {
    const normalized = base.replace(/\\/g, '/').replace(/\/+$/, '');
    for (const ext of TS_EXTS) {
      const cand = `${normalized}${ext}`;
      if (fileSet.has(cand)) return cand;
    }
    for (const idx of TS_INDEX) {
      const cand = `${normalized}${idx}`;
      if (fileSet.has(cand)) return cand;
    }
    return null;
  };

  return (source: string, fromFile: string): string | null => {
    if (source.startsWith('.')) {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), source));
      if (base.startsWith('..')) return null; // fora do projeto
      return tryCandidates(base);
    }
    for (const alias of aliases) {
      const mapped = alias.match(source);
      if (mapped) {
        for (const base of mapped) {
          const found = tryCandidates(base);
          if (found) return found;
        }
      }
    }
    return null;
  };
}

interface AliasRule {
  match(source: string): string[] | null;
}

function loadTsAliases(projectPath: string): AliasRule[] {
  const config = readTsconfig(projectPath);
  const baseUrl = config?.compilerOptions?.baseUrl ?? '.';
  const paths: Record<string, string[]> = config?.compilerOptions?.paths ?? {};
  const rules: AliasRule[] = [];

  for (const [pattern, targets] of Object.entries(paths)) {
    if (pattern.includes('*')) {
      const prefix = pattern.slice(0, pattern.indexOf('*'));
      rules.push({
        match(source) {
          if (!source.startsWith(prefix)) return null;
          const captured = source.slice(prefix.length);
          return targets.map((t) =>
            path.posix.normalize(path.posix.join(baseUrl, t.replace('*', captured)))
          );
        }
      });
    } else {
      rules.push({
        match(source) {
          if (source !== pattern) return null;
          return targets.map((t) => path.posix.normalize(path.posix.join(baseUrl, t)));
        }
      });
    }
  }
  return rules;
}

function readTsconfig(projectPath: string): any {
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    const p = path.join(projectPath, name);
    if (!fs.existsSync(p)) continue;
    try {
      return JSON.parse(stripJsonComments(fs.readFileSync(p, 'utf8')));
    } catch {
      return null;
    }
  }
  return null;
}

/** Remove comentários e vírgulas finais — tsconfig é JSONC. */
function stripJsonComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
}
