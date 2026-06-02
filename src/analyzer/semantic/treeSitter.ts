/**
 * Carrega o runtime tree-sitter (WASM) e as grammars vendoradas em
 * `grammars/`. Tudo é 100% local/offline — nenhuma chamada de rede ou API.
 *
 * O runtime WASM e as grammars são inicializados uma única vez e reaproveitados.
 * `parser.parse()` é síncrono depois que a grammar foi carregada, então o custo
 * assíncrono ocorre apenas no bootstrap.
 */
import * as path from 'path';
import * as fs from 'fs';
import Parser from 'web-tree-sitter';

export type SemanticLang = 'java' | 'typescript' | 'tsx' | 'javascript';
export type SyntaxNode = Parser.SyntaxNode;
export type Tree = Parser.Tree;

// Em runtime, este arquivo vive em dist/src/analyzer/semantic/; as grammars são
// copiadas para o lado dele no build (script `copy:grammars`).
const GRAMMARS_DIR = path.join(__dirname, 'grammars');

const GRAMMAR_FILES: Record<SemanticLang, string> = {
  java: 'tree-sitter-java.wasm',
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript.wasm'
};

let initPromise: Promise<void> | null = null;
const parsers = new Map<SemanticLang, Parser>();

/** Inicializa o runtime WASM apontando para o core vendorado. Idempotente. */
function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = Parser.init({
      locateFile: (file: string) => path.join(GRAMMARS_DIR, file)
    });
  }
  return initPromise;
}

/** Indica se as grammars vendoradas estão presentes (engine degrada sem elas). */
export function grammarsAvailable(): boolean {
  return fs.existsSync(path.join(GRAMMARS_DIR, GRAMMAR_FILES.java));
}

/** Retorna um parser com a grammar carregada (cacheado por linguagem). */
export async function getParser(lang: SemanticLang): Promise<Parser> {
  await ensureInit();
  const cached = parsers.get(lang);
  if (cached) return cached;

  const wasmPath = path.join(GRAMMARS_DIR, GRAMMAR_FILES[lang]);
  const language = await Parser.Language.load(wasmPath);
  const parser = new Parser();
  parser.setLanguage(language);
  parsers.set(lang, parser);
  return parser;
}

/** Mapeia uma extensão de arquivo para a linguagem semântica suportada. */
export function langForExtension(ext: string): SemanticLang | null {
  switch (ext) {
    case '.java':
      return 'java';
    case '.ts':
      return 'typescript';
    case '.tsx':
    case '.jsx':
      return 'tsx';
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    default:
      return null;
  }
}

/** Pré-carrega os parsers das linguagens presentes no projeto. */
export async function warmParsers(langs: SemanticLang[]): Promise<void> {
  await Promise.all([...new Set(langs)].map((l) => getParser(l)));
}
