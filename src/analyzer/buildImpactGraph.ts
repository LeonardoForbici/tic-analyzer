/**
 * Grafo de impacto unificado — consolida as fontes já computadas na pipeline
 * (imports, method edges Java, chamadas HTTP, Java→PL/SQL, PL/SQL→PL/SQL,
 * acessos a tabela/coluna e triggers) num único espaço de nós endereçáveis:
 *
 *   file:<rel_path>            arquivo de código
 *   method:<rel_path>#<m>      método (Java, via method_edges)
 *   plsql:<PKG.NOME>           procedure/function/trigger/view PL/SQL
 *   table:<NOME>               tabela
 *   column:<TABELA>.<COL>      coluna
 *
 * Semântica da aresta: `from` DEPENDE de `to` (A→B = A usa B). O impacto de
 * mudar X é o BFS reverso a partir de X — quem chega em X é afetado por X.
 * Sem novo parsing: apenas consolidação dos artefatos existentes.
 */
import type { DependencyGraph } from './buildDependencyGraph';
import type { MethodEdge } from './semantic/resolveReferences';
import type { CallGraph } from './buildCallGraph';
import type { PlsqlObject, PlsqlCall } from './detectPlsqlObjects';
import type { DbCall } from './detectBackendDbCalls';
import type { TableAccess, ColumnAccess } from './detectOrmMappings';

export type ImpactNodeKind = 'file' | 'method' | 'plsql' | 'table' | 'column';

export interface ImpactEdge {
  from: string;
  to: string;
  fromKind: ImpactNodeKind;
  toKind: ImpactNodeKind;
  /** Como a dependência foi detectada (import, call, db-call, reads, writes, trigger-on...). */
  via: string;
  confidence: 'resolved' | 'inferred';
}

export interface ImpactGraphInput {
  graph: DependencyGraph;
  methodEdges?: MethodEdge[];
  callGraph: CallGraph;
  plsqlObjects: PlsqlObject[];
  plsqlCalls: PlsqlCall[];
  dbCalls: DbCall[];
  tableAccess: TableAccess[];
  columnAccess: ColumnAccess[];
}

const conf = (c: '🟢' | '🟡'): 'resolved' | 'inferred' => (c === '🟢' ? 'resolved' : 'inferred');
const kindOf = (id: string): ImpactNodeKind => id.slice(0, id.indexOf(':')) as ImpactNodeKind;

export function buildImpactGraph(input: ImpactGraphInput): ImpactEdge[] {
  const edges: ImpactEdge[] = [];
  const seen = new Set<string>();
  const add = (from: string, to: string, via: string, confidence: 'resolved' | 'inferred') => {
    if (from === to) return;
    const key = `${from}→${to}:${via}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, fromKind: kindOf(from), toKind: kindOf(to), via, confidence });
  };

  // ── Registro de objetos PL/SQL declarados (p/ resolver chamadas e sinônimos) ──
  // NOME simples → ids declarados (um nome pode existir em mais de um package).
  const declaredByName = new Map<string, string[]>();
  const synonyms = new Map<string, string>(); // SINÔNIMO → nome alvo
  const plsqlId = (name: string, pkg?: string) =>
    pkg ? `plsql:${pkg.toUpperCase()}.${name.toUpperCase()}` : `plsql:${name.toUpperCase()}`;

  for (const obj of input.plsqlObjects) {
    if (obj.type === 'SYNONYM' && obj.synonymFor) {
      synonyms.set(obj.name.toUpperCase(), obj.synonymFor.toUpperCase().split('.').pop()!);
      continue;
    }
    const id = plsqlId(obj.name, obj.packageName);
    const list = declaredByName.get(obj.name.toUpperCase()) ?? [];
    if (!list.includes(id)) list.push(id);
    declaredByName.set(obj.name.toUpperCase(), list);
  }

  /**
   * Resolve uma referência a procedure/function. Retorna o id declarado quando
   * o alvo existe no projeto (resolved se único), senão um id sintético inferred
   * (objeto externo ao código analisado — ainda útil para agrupar chamadores).
   */
  const resolvePlsql = (name: string, pkg?: string): { id: string; confidence: 'resolved' | 'inferred' } => {
    let simple = name.toUpperCase();
    if (synonyms.has(simple)) simple = synonyms.get(simple)!;
    if (pkg) {
      const qualified = plsqlId(simple, pkg);
      const declared = declaredByName.get(simple) ?? [];
      if (declared.includes(qualified)) return { id: qualified, confidence: 'resolved' };
      if (declared.length === 1) return { id: declared[0], confidence: 'inferred' };
      return { id: qualified, confidence: 'inferred' };
    }
    const declared = declaredByName.get(simple) ?? [];
    if (declared.length === 1) return { id: declared[0], confidence: 'resolved' };
    if (declared.length > 1) return { id: declared[0], confidence: 'inferred' };
    return { id: plsqlId(simple), confidence: 'inferred' };
  };

  // ── 1. Imports/calls código→código (grafo de dependências) ──────────────────
  for (const e of input.graph.edges) {
    add(`file:${e.from}`, `file:${e.to}`, e.kind ?? 'import', e.confidence ?? 'inferred');
  }

  // ── 2. Method edges Java (granularidade de método) ──────────────────────────
  for (const m of input.methodEdges ?? []) {
    const fromLabel = m.fromType && m.fromMethod ? `${m.fromType}.${m.fromMethod}` : (m.fromMethod ?? '?');
    const toLabel = m.toMethod ?? '?';
    const fromId = `method:${m.fromFile}#${fromLabel}`;
    const toId = `method:${m.toFile}#${toLabel}`;
    add(fromId, toId, 'call', m.confidence);
    // Método depende do arquivo que o define: mudar o arquivo afeta o método.
    add(fromId, `file:${m.fromFile}`, 'defined-in', 'resolved');
    add(toId, `file:${m.toFile}`, 'defined-in', 'resolved');
  }

  // ── 3. Frontend → backend (HTTP) via call graph ─────────────────────────────
  const cgNodeById = new Map(input.callGraph.nodes.map((n) => [n.id, n]));
  for (const e of input.callGraph.edges) {
    if (e.type !== 'HTTP_CALL') continue;
    const fe = cgNodeById.get(e.from);
    const be = cgNodeById.get(e.to);
    if (fe?.file && be?.file) add(`file:${fe.file}`, `file:${be.file}`, 'http-call', conf(e.confidence));
  }

  // ── 4. Backend → PL/SQL (JDBC/@Procedure/CallableStatement) ─────────────────
  for (const c of input.dbCalls) {
    const target = resolvePlsql(c.procedureName, c.packageName);
    const confidence = c.confidence === '🟡' ? 'inferred' : target.confidence;
    add(`file:${c.fromFile}`, target.id, 'db-call', confidence);
  }

  // ── 5. PL/SQL → PL/SQL ───────────────────────────────────────────────────────
  for (const c of input.plsqlCalls) {
    if (c.isDynamic) continue; // SQL dinâmico: alvo não confiável p/ impacto
    const caller = resolvePlsql(c.callerObject);
    const callee = resolvePlsql(c.calledObject, c.calledPackage);
    add(caller.id, callee.id, 'plsql-call', callee.confidence);
  }

  // ── 6. PL/SQL → tabelas (e trigger ON tabela) ───────────────────────────────
  for (const obj of input.plsqlObjects) {
    if (obj.type === 'SYNONYM' || obj.type === 'SEQUENCE') continue;
    const id = plsqlId(obj.name, obj.packageName);
    for (const t of obj.tablesRead) add(id, `table:${t}`, 'reads', 'resolved');
    for (const t of obj.tablesWritten) add(id, `table:${t}`, 'writes', 'resolved');
    // Trigger dispara em mudanças na tabela: mudar a tabela afeta o trigger.
    if (obj.type === 'TRIGGER' && obj.onTable) add(id, `table:${obj.onTable}`, 'trigger-on', 'resolved');
    // Objeto depende do arquivo que o define (mudar o .sql afeta os chamadores).
    add(id, `file:${obj.file}`, 'defined-in', 'resolved');
  }

  // ── 7. Backend → tabelas/colunas (ORM/SQL embarcado) ────────────────────────
  for (const a of input.tableAccess) {
    add(`file:${a.fromFile}`, `table:${a.table.toUpperCase()}`, a.mode, conf(a.confidence));
  }
  for (const a of input.columnAccess) {
    const table = a.table.toUpperCase();
    const col = `column:${table}.${a.column.toUpperCase()}`;
    add(`file:${a.fromFile}`, col, a.mode, conf(a.confidence));
    // Coluna pertence à tabela: mudar a tabela afeta quem usa suas colunas.
    add(col, `table:${table}`, 'belongs-to', 'resolved');
  }

  return edges;
}
