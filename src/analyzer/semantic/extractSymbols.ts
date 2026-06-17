/**
 * Extrai símbolos de um arquivo via AST (tree-sitter), por linguagem.
 *
 * Produz declarações (classes/interfaces/enums, com extends/implements, campos e
 * métodos), imports/re-exports resolvíveis e chamadas de método com receptor —
 * a matéria-prima para resolução de símbolos em `resolveReferences.ts`.
 *
 * Nada aqui resolve nomes ainda: é puramente a leitura sintática rica da AST,
 * substituindo as heurísticas regex de `buildDependencyGraph`/`detectInheritance`.
 */
import type { SemanticLang, SyntaxNode } from './treeSitter';
import { getParser, langForExtension } from './treeSitter';

export interface ImportRef {
  /** String do módulo/origem como escrita (TS) ou FQN do tipo (Java). */
  source: string;
  /** Nomes importados/re-exportados (TS). Vazio = default/namespace/Java. */
  names: string[];
  /** TS: `export ... from` (barrel). */
  isReexport: boolean;
  /** `export * from` (TS) ou `import a.b.*` (Java). */
  isWildcard: boolean;
  line: number;
}

export interface FieldRef {
  name: string;
  /** Nome simples do tipo (sem genéricos). */
  type: string;
}

export interface TypeDeclSym {
  simpleName: string;
  kind: 'class' | 'interface' | 'enum';
  isAbstract: boolean;
  /** Nome simples do supertipo (sem genéricos), se houver. */
  extendsName?: string;
  /** Nomes simples de interfaces implementadas. */
  implementsNames: string[];
  line: number;
  methods: string[];
  /** Campos da classe (nome→tipo) — usados para tipar receptores de chamadas. */
  fields: FieldRef[];
}

export interface CallRef {
  /** Identificador do receptor (`userService` em `userService.save()`). */
  receiver?: string;
  method: string;
  line: number;
  /** Nome simples do tipo que declara o método onde a chamada ocorre. */
  enclosingType?: string;
  /** Nome do método onde a chamada ocorre (para arestas método→método). */
  enclosingMethod?: string;
}

export interface FileSymbols {
  file: string;
  lang: SemanticLang;
  /** Pacote Java. */
  packageName?: string;
  imports: ImportRef[];
  types: TypeDeclSym[];
  calls: CallRef[];
  /** Falhou ao parsear (consumidor deve usar fallback regex). */
  failed?: boolean;
}

/** Extrai símbolos de um arquivo. Retorna null se a linguagem não é suportada. */
export async function extractFileSymbols(
  absolutePath: string,
  relativePath: string,
  ext: string,
  content: string
): Promise<FileSymbols | null> {
  const lang = langForExtension(ext);
  if (!lang) return null;

  let root: SyntaxNode;
  try {
    const parser = await getParser(lang);
    const tree = parser.parse(content);
    root = tree.rootNode;
  } catch {
    return { file: relativePath, lang, imports: [], types: [], calls: [], failed: true };
  }

  if (lang === 'java') return extractJava(root, relativePath);
  return extractTsLike(root, relativePath, lang);
}

// ── Java ────────────────────────────────────────────────────────────────────

function extractJava(root: SyntaxNode, file: string): FileSymbols {
  const result: FileSymbols = { file, lang: 'java', imports: [], types: [], calls: [] };

  for (const node of root.namedChildren) {
    if (node.type === 'package_declaration') {
      const id = node.namedChildren.find((c) => c.type === 'scoped_identifier' || c.type === 'identifier');
      if (id) result.packageName = id.text;
    } else if (node.type === 'import_declaration') {
      const isWildcard = node.children.some((c) => c.type === 'asterisk');
      const id = node.namedChildren.find((c) => c.type === 'scoped_identifier' || c.type === 'identifier');
      if (id) result.imports.push({ source: id.text, names: [], isReexport: false, isWildcard, line: id.startPosition.row + 1 });
    }
  }

  // Tipos (podem estar no topo ou aninhados) + chamadas com tipo envolvente.
  walkJavaTypes(root, result, undefined);
  return result;
}

const JAVA_TYPE_NODES = new Set(['class_declaration', 'interface_declaration', 'enum_declaration']);

function walkJavaTypes(node: SyntaxNode, result: FileSymbols, enclosingType: string | undefined): void {
  for (const child of node.namedChildren) {
    if (JAVA_TYPE_NODES.has(child.type)) {
      const decl = readJavaType(child);
      result.types.push(decl);
      const body = child.childForFieldName('body');
      if (body) walkJavaBody(body, result, decl.simpleName);
    } else {
      walkJavaTypes(child, result, enclosingType);
    }
  }
}

function readJavaType(node: SyntaxNode): TypeDeclSym {
  const nameNode = node.childForFieldName('name');
  const simpleName = nameNode ? nameNode.text : '(anon)';
  const kind: TypeDeclSym['kind'] =
    node.type === 'interface_declaration' ? 'interface' : node.type === 'enum_declaration' ? 'enum' : 'class';
  const isAbstract = (node.childForFieldName('modifiers')?.text ?? '').includes('abstract');

  let extendsName: string | undefined;
  const superclass = node.childForFieldName('superclass');
  if (superclass) extendsName = baseTypeName(firstTypeNode(superclass) ?? superclass);

  const implementsNames: string[] = [];
  const interfaces = node.childForFieldName('interfaces');
  if (interfaces) {
    for (const t of interfaces.descendantsOfType(['type_identifier', 'scoped_type_identifier', 'generic_type'])) {
      const n = baseTypeName(t);
      if (n && !implementsNames.includes(n)) implementsNames.push(n);
    }
  }
  // Interface Java usa `extends` para herdar de outras interfaces (campo interfaces ausente).
  if (kind === 'interface' && node.childForFieldName('interfaces') == null) {
    const ext = node.children.find((c) => c.type === 'extends_interfaces');
    if (ext) for (const t of ext.descendantsOfType(['type_identifier'])) {
      const n = baseTypeName(t);
      if (n && !implementsNames.includes(n)) implementsNames.push(n);
    }
  }

  const methods: string[] = [];
  const fields: FieldRef[] = [];
  const seenField = new Set<string>();
  const addField = (name: string, type: string) => {
    if (!name || !type || seenField.has(name)) return;
    seenField.add(name);
    fields.push({ name, type });
  };
  const body = node.childForFieldName('body');
  if (body) {
    // 1ª passada: campos declarados (fonte de tipo mais confiável).
    for (const member of body.namedChildren) {
      if (member.type === 'field_declaration') {
        const typeNode = member.childForFieldName('type');
        const typeName = typeNode ? baseTypeName(typeNode) : '';
        for (const decl of member.namedChildren.filter((c) => c.type === 'variable_declarator')) {
          const fn = decl.childForFieldName('name');
          if (fn && typeName) addField(fn.text, typeName);
        }
      }
    }
    // 2ª passada: métodos + parâmetros como "campos virtuais" (DI por construtor/
    // método — padrão Spring/Jakarta) para resolver chamadas `param.metodo()`.
    for (const member of body.namedChildren) {
      if (member.type === 'method_declaration' || member.type === 'constructor_declaration') {
        const mn = member.childForFieldName('name');
        if (mn) methods.push(mn.text);
        const params = member.childForFieldName('parameters');
        if (params) {
          for (const p of params.namedChildren.filter((c) => c.type === 'formal_parameter')) {
            const pType = p.childForFieldName('type');
            const pName = p.childForFieldName('name');
            if (pType && pName) addField(pName.text, baseTypeName(pType));
          }
        }
      }
    }
  }

  return {
    simpleName,
    kind,
    isAbstract,
    extendsName,
    implementsNames,
    line: nameNode ? nameNode.startPosition.row + 1 : node.startPosition.row + 1,
    methods,
    fields
  };
}

function walkJavaBody(body: SyntaxNode, result: FileSymbols, enclosingType: string): void {
  for (const member of body.namedChildren) {
    const isMethod = member.type === 'method_declaration' || member.type === 'constructor_declaration';
    const enclosingMethod = isMethod ? member.childForFieldName('name')?.text : undefined;
    for (const call of member.descendantsOfType('method_invocation')) {
      const obj = call.childForFieldName('object');
      const name = call.childForFieldName('name');
      if (!name) continue;
      result.calls.push({
        receiver: obj && obj.type === 'identifier' ? obj.text : undefined,
        method: name.text,
        line: name.startPosition.row + 1,
        enclosingType,
        enclosingMethod
      });
    }
  }
}

// ── TS / JS / TSX ─────────────────────────────────────────────────────────────

function extractTsLike(root: SyntaxNode, file: string, lang: SemanticLang): FileSymbols {
  const result: FileSymbols = { file, lang, imports: [], types: [], calls: [] };

  for (const node of root.namedChildren) {
    if (node.type === 'import_statement') {
      const src = stringLiteralChild(node);
      if (src) result.imports.push({ source: src, names: importedNames(node), isReexport: false, isWildcard: false, line: node.startPosition.row + 1 });
    } else if (node.type === 'export_statement') {
      const src = stringLiteralChild(node);
      if (src) {
        const clause = node.namedChildren.find((c) => c.type === 'export_clause');
        const names = clause ? clause.descendantsOfType('identifier').map((n) => n.text) : [];
        result.imports.push({ source: src, names, isReexport: true, isWildcard: !clause, line: node.startPosition.row + 1 });
      } else {
        // export <decl> — captura tipos exportados
        collectTsTypes(node, result);
      }
    } else {
      collectTsTypes(node, result);
    }
  }
  return result;
}

function collectTsTypes(node: SyntaxNode, result: FileSymbols): void {
  for (const decl of node.descendantsOfType(['class_declaration', 'interface_declaration', 'abstract_class_declaration'])) {
    const nameNode = decl.childForFieldName('name');
    if (!nameNode) continue;
    const kind: TypeDeclSym['kind'] = decl.type === 'interface_declaration' ? 'interface' : 'class';
    const isAbstract = decl.type === 'abstract_class_declaration';

    let extendsName: string | undefined;
    const implementsNames: string[] = [];
    const heritage = decl.descendantsOfType('class_heritage')[0] ?? decl.childForFieldName('body')?.parent;
    // extends_clause / implements_clause aparecem como filhos do heritage
    for (const clause of decl.descendantsOfType(['extends_clause', 'implements_clause'])) {
      const names = clause.descendantsOfType(['type_identifier', 'identifier']).map((n) => n.text);
      if (clause.type === 'extends_clause') extendsName = names[0];
      else implementsNames.push(...names);
    }
    void heritage;

    result.types.push({
      simpleName: nameNode.text,
      kind,
      isAbstract,
      extendsName,
      implementsNames,
      line: nameNode.startPosition.row + 1,
      methods: [],
      fields: []
    });
  }
}

function importedNames(importStatement: SyntaxNode): string[] {
  const names: string[] = [];
  for (const spec of importStatement.descendantsOfType(['import_specifier'])) {
    const id = spec.childForFieldName('name') ?? spec.namedChildren[0];
    if (id) names.push(id.text);
  }
  // default / namespace imports não têm nome de símbolo re-exportável relevante
  return names;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function stringLiteralChild(node: SyntaxNode): string | null {
  const str = node.namedChildren.find((c) => c.type === 'string');
  if (!str) return null;
  const frag = str.namedChildren.find((c) => c.type === 'string_fragment');
  return frag ? frag.text : str.text.replace(/^['"`]|['"`]$/g, '');
}

function firstTypeNode(node: SyntaxNode): SyntaxNode | null {
  if (node.type.endsWith('type_identifier') || node.type === 'generic_type') return node;
  return node.descendantsOfType(['type_identifier', 'scoped_type_identifier', 'generic_type'])[0] ?? null;
}

/** Nome simples de um tipo: remove genéricos e qualificação (a.b.C → C). */
function baseTypeName(node: SyntaxNode): string {
  if (node.type === 'generic_type') {
    const inner = node.namedChildren.find((c) => c.type.includes('type_identifier'));
    return inner ? baseTypeName(inner) : node.text.split('<')[0];
  }
  if (node.type === 'scoped_type_identifier') {
    const ids = node.descendantsOfType('type_identifier');
    return ids.length ? ids[ids.length - 1].text : node.text;
  }
  return node.text.split('<')[0].trim();
}
