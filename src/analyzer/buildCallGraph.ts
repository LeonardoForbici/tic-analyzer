import type { FrontendCall } from './detectFrontendCalls';
import type { EndpointFound } from './detectEndpoints';
import type { PlsqlObject, PlsqlCall } from './detectPlsqlObjects';
import type { DbCall } from './detectBackendDbCalls';
import type { TableAccess } from './detectOrmMappings';

export type LayerType = 'frontend' | 'backend' | 'database';
export type EdgeType = 'HTTP_CALL' | 'DB_CALL' | 'PLSQL_CALL' | 'TABLE_ACCESS';

export interface CallGraphNode {
  id: string;
  label: string;
  layer: LayerType;
  file: string;
  line?: number;
}

export interface CallGraphEdge {
  from: string;
  to: string;
  type: EdgeType;
  confidence: '🟢' | '🟡';
  label?: string;
}

export interface CallGraph {
  nodes: CallGraphNode[];
  edges: CallGraphEdge[];
}

export function buildCallGraph(
  frontendCalls: FrontendCall[],
  endpoints: EndpointFound[],
  plsqlObjects: PlsqlObject[],
  plsqlCalls: PlsqlCall[],
  dbCalls: DbCall[],
  tableAccess: TableAccess[] = []
): CallGraph {
  const nodes = new Map<string, CallGraphNode>();
  const edges: CallGraphEdge[] = [];
  const edgesSeen = new Set<string>();

  const addNode = (node: CallGraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };

  const addEdge = (edge: CallGraphEdge) => {
    const key = `${edge.from}→${edge.to}:${edge.type}`;
    if (!edgesSeen.has(key)) {
      edgesSeen.add(key);
      edges.push(edge);
    }
  };

  // ── 1. Frontend nodes — um nó por arquivo de serviço ─────────────────────
  const frontendFilesSeen = new Set<string>();
  for (const call of frontendCalls) {
    const id = feId(call.file);
    if (!frontendFilesSeen.has(call.file)) {
      addNode({ id, label: className(call.file), layer: 'frontend', file: call.file });
      frontendFilesSeen.add(call.file);
    }
  }

  // ── 2. Backend nodes — um nó por controller class ─────────────────────────
  const backendFilesSeen = new Set<string>();
  for (const ep of endpoints) {
    const id = beId(ep.file);
    if (!backendFilesSeen.has(ep.file)) {
      addNode({ id, label: ep.controller ?? className(ep.file), layer: 'backend', file: ep.file });
      backendFilesSeen.add(ep.file);
    }
  }
  for (const dbCall of dbCalls) {
    const id = beId(dbCall.fromFile);
    if (!backendFilesSeen.has(dbCall.fromFile)) {
      addNode({ id, label: className(dbCall.fromFile), layer: 'backend', file: dbCall.fromFile });
      backendFilesSeen.add(dbCall.fromFile);
    }
  }

  // ── 3. Database nodes — um nó por package PL/SQL ──────────────────────────
  for (const obj of plsqlObjects) {
    const key = obj.packageName ?? obj.name;
    addNode({ id: dbId(key), label: key.toUpperCase(), layer: 'database', file: obj.file, line: obj.line });
  }
  for (const dbCall of dbCalls) {
    const key = dbCall.packageName ?? dbCall.procedureName;
    addNode({ id: dbId(key), label: key.toUpperCase(), layer: 'database', file: dbCall.fromFile });
  }

  // ── 4. Frontend → Backend (HTTP_CALL) ─────────────────────────────────────
  const callsByFile = new Map<string, FrontendCall[]>();
  for (const call of frontendCalls) {
    const arr = callsByFile.get(call.file) ?? [];
    arr.push(call);
    callsByFile.set(call.file, arr);
  }

  for (const [file, calls] of callsByFile) {
    const frontId = feId(file);
    const matched = new Set<string>();

    for (const call of calls) {
      const ep = matchByUrl(call, endpoints);
      if (ep) {
        const backId = beId(ep.file);
        if (!matched.has(backId)) {
          matched.add(backId);
          addEdge({ from: frontId, to: backId, type: 'HTTP_CALL', confidence: call.confidence });
        }
      }
    }

    // fallback: pessoa-service.ts → PessoaController.java
    if (matched.size === 0) {
      const ep = matchByName(file, endpoints);
      if (ep) addEdge({ from: frontId, to: beId(ep.file), type: 'HTTP_CALL', confidence: '🟡' });
    }
  }

  // ── 5. Backend → PL/SQL (DB_CALL) ─────────────────────────────────────────
  for (const dbCall of dbCalls) {
    const key = dbCall.packageName ?? dbCall.procedureName;
    const label = dbCall.packageName
      ? `${dbCall.packageName}.${dbCall.procedureName}`
      : dbCall.procedureName;
    addEdge({ from: beId(dbCall.fromFile), to: dbId(key), type: 'DB_CALL', confidence: dbCall.confidence, label });
  }

  // ── 5b. Backend → Tabela (TABLE_ACCESS, via JPA/Hibernate/SQL) ────────────
  for (const acc of tableAccess) {
    if (!backendFilesSeen.has(acc.fromFile)) {
      addNode({ id: beId(acc.fromFile), label: className(acc.fromFile), layer: 'backend', file: acc.fromFile });
      backendFilesSeen.add(acc.fromFile);
    }
    addNode({ id: tblId(acc.table), label: acc.table.toUpperCase(), layer: 'database', file: '' });
    addEdge({ from: beId(acc.fromFile), to: tblId(acc.table), type: 'TABLE_ACCESS', confidence: acc.confidence, label: acc.mode });
  }

  // ── 5c. PL/SQL → Tabela (TABLE_ACCESS, lidas/escritas pela procedure) ──────
  for (const obj of plsqlObjects) {
    const objKey = obj.packageName ?? obj.name;
    for (const t of obj.tablesWritten ?? []) {
      addNode({ id: tblId(t), label: t.toUpperCase(), layer: 'database', file: '' });
      addEdge({ from: dbId(objKey), to: tblId(t), type: 'TABLE_ACCESS', confidence: '🟢', label: 'write' });
    }
    for (const t of obj.tablesRead ?? []) {
      addNode({ id: tblId(t), label: t.toUpperCase(), layer: 'database', file: '' });
      addEdge({ from: dbId(objKey), to: tblId(t), type: 'TABLE_ACCESS', confidence: '🟢', label: 'read' });
    }
  }

  // ── 6. PL/SQL → PL/SQL (PLSQL_CALL) ──────────────────────────────────────
  const objPackageMap = new Map<string, string>();
  for (const obj of plsqlObjects) {
    if (obj.packageName) objPackageMap.set(obj.name.toUpperCase(), obj.packageName);
  }

  for (const call of plsqlCalls) {
    const callerPkg = objPackageMap.get(call.callerObject.toUpperCase());
    const callerKey = callerPkg ?? call.callerObject;
    const calleeKey = call.calledPackage ?? call.calledObject;
    const callerId = dbId(callerKey);
    const calleeId = dbId(calleeKey);
    if (callerId === calleeId) continue;
    addNode({ id: calleeId, label: calleeKey.toUpperCase(), layer: 'database', file: call.file, line: call.line });
    const label = call.calledPackage ? `${call.calledPackage}.${call.calledObject}` : call.calledObject;
    addEdge({ from: callerId, to: calleeId, type: 'PLSQL_CALL', confidence: call.isDynamic ? '🟡' : '🟢', label });
  }

  return { nodes: [...nodes.values()], edges };
}

// ── URL matching ─────────────────────────────────────────────────────────────

function matchByUrl(call: FrontendCall, endpoints: EndpointFound[]): EndpointFound | null {
  const callPath = normPath(call.urlPattern);
  for (const ep of endpoints) {
    if (pathsMatch(callPath, normPath(ep.path))) return ep;
  }
  return null;
}

function matchByName(frontendFile: string, endpoints: EndpointFound[]): EndpointFound | null {
  const kw = domainKeyword(basename(frontendFile));
  if (!kw || kw.length < 3) return null;
  for (const ep of endpoints) {
    const epKw = domainKeyword(basename(ep.file));
    if (epKw && (epKw.startsWith(kw) || kw.startsWith(epKw))) return ep;
  }
  return null;
}

function normPath(p: string): string {
  return p
    .replace(/\/+$/, '')
    .toLowerCase()
    .split('?')[0]
    .replace(/^\/api\/v\d+/, '')
    .replace(/^\/api/, '');
}

function pathsMatch(callPath: string, epPath: string): boolean {
  const epNorm = epPath.replace(/\{[^}]+\}|:[^/]+/g, '*');
  const a = callPath.split('/').filter(Boolean);
  const b = epNorm.split('/').filter(Boolean);
  if (a.length !== b.length) return false;
  return a.every((part, i) => b[i] === '*' || b[i] === part);
}

// "pessoa-service.ts" → "pessoa", "PessoaController.java" → "pessoa"
function domainKeyword(filename: string): string {
  return filename
    .replace(/\.(java|ts|tsx|js|jsx|py|cs|kt)$/, '')
    .replace(/[-_](service|controller|resource|api|client|repository|repo|facade|handler|component|module)$/i, '')
    .replace(/(Controller|Service|Resource|Api|Client|Repository|Facade|Handler|Component|Module)$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// ── ID / label helpers ───────────────────────────────────────────────────────

function feId(file: string): string { return `fe_${sanitize(file)}`; }
function beId(file: string): string { return `be_${sanitize(file)}`; }
function dbId(name: string): string { return `db_${sanitize(name.toUpperCase())}`; }
function tblId(name: string): string { return `tbl_${sanitize(name.toUpperCase())}`; }

function className(file: string): string {
  return basename(file).replace(/\.(java|ts|tsx|js|jsx|py|cs|kt)$/, '');
}

function basename(p: string): string {
  return p.split(/[/\\]/).pop() ?? p;
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 50);
}
