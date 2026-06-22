/**
 * Complexidade **real** por função sobre a AST (tree-sitter) — substitui a
 * contagem por regex de `computeMetrics.ts` para as linguagens com gramática
 * (Java, TypeScript, TSX/JSX, JavaScript). 100% local/offline, zero tokens.
 *
 * Mede, por função:
 *   - Ciclomática (McCabe): 1 + nº de pontos de decisão.
 *   - Cognitiva (aproximação SonarSource): +1 por estrutura de controle, somado
 *     ao nível de aninhamento corrente; +1 por operador lógico (&&/||). É uma
 *     aproximação — não reproduz cada regra do whitepaper SonarSource (ex.:
 *     `else if` é tratado como `if` aninhado), mas captura bem o custo de
 *     aninhamento que a ciclomática pura ignora.
 *   - maxNesting: profundidade máxima de estruturas de controle aninhadas.
 *
 * Linguagens sem gramática (Python/Go/C#/...) não aparecem no resultado: o
 * consumidor (`computeMetrics`) cai no fallback regex para esses arquivos.
 */
import * as fs from 'fs';
import type { ScannedFile } from '../scanFiles';
import type { SemanticLang, SyntaxNode } from './treeSitter';
import { getParser, langForExtension, grammarsAvailable } from './treeSitter';

export interface FunctionMetric {
  name: string;
  line: number;
  cyclomatic: number;
  cognitive: number;
  maxNesting: number;
}

export interface AstFileMetric {
  file: string;
  /** Soma das funções top-level (comparável ao CC por arquivo do regex). */
  cyclomatic: number;
  cognitive: number;
  maxNesting: number;
  functionCount: number;
  /** Funções top-level não-triviais (CC ≥ 2), ordenáveis pelo consumidor. */
  functions: FunctionMetric[];
  /** Pior função do arquivo (maior CC), para apontar o ofensor. */
  worstFunction?: FunctionMetric;
}

/** Limites a partir dos quais uma função é considerada ofensora (acionável). */
export const FUNCTION_COMPLEXITY_THRESHOLDS = {
  cyclomatic: 10,
  cognitive: 15,
  maxNesting: 4
};

/** Verdadeiro se a função excede algum limite de complexidade. */
export function isOffenderFunction(m: {
  cyclomatic: number;
  cognitive: number;
  maxNesting: number;
}): boolean {
  return (
    m.cyclomatic > FUNCTION_COMPLEXITY_THRESHOLDS.cyclomatic ||
    m.cognitive > FUNCTION_COMPLEXITY_THRESHOLDS.cognitive ||
    m.maxNesting > FUNCTION_COMPLEXITY_THRESHOLDS.maxNesting
  );
}

// Nós que delimitam uma função/método nas linguagens suportadas.
const FUNCTION_TYPES = new Set([
  // Java
  'method_declaration',
  'constructor_declaration',
  // TS / JS
  'function_declaration',
  'function_expression',
  'generator_function_declaration',
  'method_definition',
  'arrow_function'
]);

// Nós de decisão que incrementam a ciclomática (McCabe) e contam como estrutura
// de controle para a cognitiva.
const DECISION_TYPES = new Set([
  // Java + TS/JS
  'if_statement',
  'while_statement',
  'do_statement',
  'for_statement',
  'catch_clause',
  // Java for-each
  'enhanced_for_statement',
  // TS/JS for-in / for-of
  'for_in_statement',
  // ternário
  'ternary_expression',
  'conditional_expression',
  // case de switch (cada label é um ramo)
  'switch_label',
  'case_statement',
  'switch_case'
]);

/**
 * Computa métricas AST por arquivo. Retorna Map vazio se as gramáticas não
 * estiverem disponíveis (degrada para regex no consumidor).
 */
export async function computeAstMetrics(
  files: ScannedFile[]
): Promise<Map<string, AstFileMetric>> {
  const result = new Map<string, AstFileMetric>();
  if (!grammarsAvailable()) return result;

  for (const file of files) {
    const lang = langForExtension(file.extension);
    if (!lang) continue;

    let content: string;
    try {
      content = fs.readFileSync(file.absolutePath, 'utf8');
    } catch {
      continue;
    }

    let root: SyntaxNode;
    try {
      const parser = await getParser(lang);
      root = parser.parse(content).rootNode;
    } catch {
      continue;
    }

    const metric = measureFile(root, file.relativePath);
    if (metric) result.set(file.relativePath, metric);
  }

  return result;
}

/** Mede um arquivo já parseado. Exportado para testes/uso direto. */
export function measureFile(root: SyntaxNode, file: string): AstFileMetric | null {
  // Apenas funções top-level: a unidade acionável. Callbacks aninhados já
  // contam dentro da subárvore da função que os contém (sem dupla contagem).
  const topLevel = root
    .descendantsOfType([...FUNCTION_TYPES])
    .filter((fn) => !hasAncestorFunction(fn));
  if (topLevel.length === 0) {
    return { file, cyclomatic: 0, cognitive: 0, maxNesting: 0, functionCount: 0, functions: [] };
  }

  let cyclomatic = 0;
  let cognitive = 0;
  let maxNesting = 0;
  let worst: FunctionMetric | undefined;
  const functions: FunctionMetric[] = [];

  for (const fn of topLevel) {
    const m = measureFunction(fn);
    cyclomatic += m.cyclomatic;
    cognitive += m.cognitive;
    if (m.maxNesting > maxNesting) maxNesting = m.maxNesting;
    if (!worst || m.cyclomatic > worst.cyclomatic) worst = m;
    // Retém apenas funções não-triviais para a lista (getters/setters CC=1 fora).
    if (m.cyclomatic >= 2) functions.push(m);
  }

  return {
    file,
    cyclomatic,
    cognitive,
    maxNesting,
    functionCount: topLevel.length,
    functions,
    worstFunction: worst
  };
}

/** Verdadeiro se o nó tem um ancestral que também é uma função (aninhamento). */
function hasAncestorFunction(node: SyntaxNode): boolean {
  let cur = node.parent;
  while (cur) {
    if (FUNCTION_TYPES.has(cur.type)) return true;
    cur = cur.parent;
  }
  return false;
}

/** Mede uma única função sobre toda a sua subárvore (inclui callbacks aninhados). */
function measureFunction(fn: SyntaxNode): FunctionMetric {
  const acc = { cyclomatic: 1, cognitive: 0, maxNesting: 0 };
  // Percorre apenas o corpo: a assinatura/parâmetros não têm decisões relevantes.
  const body = fn.childForFieldName('body') ?? fn;
  visit(body, 0, acc);
  return {
    name: functionName(fn),
    line: fn.startPosition.row + 1,
    cyclomatic: acc.cyclomatic,
    cognitive: acc.cognitive,
    maxNesting: acc.maxNesting
  };
}

function visit(
  node: SyntaxNode,
  nesting: number,
  acc: { cyclomatic: number; cognitive: number; maxNesting: number }
): void {
  let childNesting = nesting;

  if (DECISION_TYPES.has(node.type)) {
    acc.cyclomatic += 1;
    acc.cognitive += 1 + nesting;
    const depth = nesting + 1;
    if (depth > acc.maxNesting) acc.maxNesting = depth;
    childNesting = depth;
  } else if (node.type === 'binary_expression' && isLogicalOp(node)) {
    // Operadores lógicos adicionam um ramo cada (sem penalidade de aninhamento).
    acc.cyclomatic += 1;
    acc.cognitive += 1;
  }

  for (const child of node.namedChildren) {
    visit(child, childNesting, acc);
  }
}

function isLogicalOp(node: SyntaxNode): boolean {
  const op = node.childForFieldName('operator')?.text;
  return op === '&&' || op === '||';
}

function functionName(fn: SyntaxNode): string {
  const named = fn.childForFieldName('name');
  if (named) return named.text;
  // Arrow/expression atribuída: tenta o nome do binding pai.
  const parent = fn.parent;
  if (parent) {
    if (parent.type === 'variable_declarator' || parent.type === 'field_definition' || parent.type === 'public_field_definition') {
      const n = parent.childForFieldName('name');
      if (n) return n.text;
    }
    if (parent.type === 'pair') {
      const key = parent.childForFieldName('key');
      if (key) return key.text;
    }
    if (parent.type === 'assignment_expression') {
      const left = parent.childForFieldName('left');
      if (left) return left.text;
    }
  }
  return '(anonymous)';
}
