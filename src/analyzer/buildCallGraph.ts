import type { FrontendCall } from './detectFrontendCalls';
import type { EndpointFound } from './detectEndpoints';
import type { PlsqlObject, PlsqlCall } from './detectPlsqlObjects';
import type { DbCall } from './detectBackendDbCalls';

export type LayerType = 'frontend' | 'endpoint' | 'backend' | 'database';
export type EdgeType = 'HTTP_CALL' | 'HANDLES' | 'DB_CALL' | 'PLSQL_CALL';

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
  dbCalls: DbCall[]
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

  // ── 1. Frontend → Endpoint (HTTP_CALL) ──────────────────────────────────────
  // Agrupa frontend calls por arquivo
  const frontendFilesSeen = new Set<string>();
  for (const call of frontendCalls) {
    const frontendId = `fe:${sanitize(call.file)}`;
    if (!frontendFilesSeen.has(call.file)) {
      addNode({ id: frontendId, label: basename(call.file), layer: 'frontend', file: call.file, line: call.line });
      frontendFilesSeen.add(call.file);
    }

    // Tenta correlacionar com endpoint do backend por URL pattern matching
    const matchedEndpoint = matchEndpoint(call, endpoints);
    if (matchedEndpoint) {
      const epId = endpointId(matchedEndpoint);
      addNode({ id: epId, label: `${matchedEndpoint.method} ${matchedEndpoint.path}`, layer: 'endpoint', file: matchedEndpoint.file, line: matchedEndpoint.line });
      addEdge({ from: frontendId, to: epId, type: 'HTTP_CALL', confidence: call.confidence, label: `${call.method} ${call.urlPattern}` });
    }
  }

  // ── 2. Endpoint → Backend file (HANDLES) ────────────────────────────────────
  for (const ep of endpoints) {
    const epId = endpointId(ep);
    addNode({ id: epId, label: `${ep.method} ${ep.path}`, layer: 'endpoint', file: ep.file, line: ep.line });

    // O arquivo que declara o endpoint é o backend handler
    const backendId = `be:${sanitize(ep.file)}`;
    addNode({ id: backendId, label: basename(ep.file), layer: 'backend', file: ep.file, line: ep.line });
    addEdge({ from: epId, to: backendId, type: 'HANDLES', confidence: '🟢', label: `@${ep.method}Mapping` });
  }

  // ── 3. Backend → PL/SQL (DB_CALL) ───────────────────────────────────────────
  for (const dbCall of dbCalls) {
    const backendId = `be:${sanitize(dbCall.fromFile)}`;
    addNode({ id: backendId, label: basename(dbCall.fromFile), layer: 'backend', file: dbCall.fromFile, line: dbCall.fromLine });

    const dbId = plsqlNodeId(dbCall.procedureName, dbCall.packageName);
    const dbLabel = dbCall.packageName ? `${dbCall.packageName}.${dbCall.procedureName}` : dbCall.procedureName;
    addNode({ id: dbId, label: dbLabel, layer: 'database', file: dbCall.fromFile, line: dbCall.fromLine });
    addEdge({ from: backendId, to: dbId, type: 'DB_CALL', confidence: dbCall.confidence, label: dbLabel });
  }

  // ── 4. PL/SQL → PL/SQL (PLSQL_CALL) ─────────────────────────────────────────
  for (const plsqlObj of plsqlObjects) {
    const dbId = plsqlNodeId(plsqlObj.name, plsqlObj.packageName);
    const dbLabel = plsqlObj.packageName ? `${plsqlObj.packageName}.${plsqlObj.name}` : plsqlObj.name;
    addNode({ id: dbId, label: dbLabel, layer: 'database', file: plsqlObj.file, line: plsqlObj.line });
  }

  for (const call of plsqlCalls) {
    const callerId = plsqlNodeId(call.callerObject, call.calledPackage ? undefined : undefined);
    const calleeId = plsqlNodeId(call.calledObject, call.calledPackage);
    const calleeLabel = call.calledPackage ? `${call.calledPackage}.${call.calledObject}` : call.calledObject;
    addNode({ id: calleeId, label: calleeLabel, layer: 'database', file: call.file, line: call.line });
    addEdge({ from: callerId, to: calleeId, type: 'PLSQL_CALL', confidence: call.isDynamic ? '🟡' : '🟢', label: calleeLabel });
  }

  return { nodes: [...nodes.values()], edges };
}

function matchEndpoint(call: FrontendCall, endpoints: EndpointFound[]): EndpointFound | null {
  const callPath = normalizeUrlPath(call.urlPattern);
  for (const ep of endpoints) {
    const epPath = normalizeUrlPath(ep.path);
    if (epPath === callPath) return ep;
    // Match com path params: /api/users/{id} ↔ /api/users/
    if (pathsMatch(callPath, epPath)) return ep;
  }
  return null;
}

function normalizeUrlPath(p: string): string {
  return p.replace(/\/+$/, '').toLowerCase().split('?')[0];
}

function pathsMatch(callPath: string, epPath: string): boolean {
  // Substitui {param} e :param por wildcard
  const epNorm = epPath.replace(/\{[^}]+\}|:[^/]+/g, '*');
  const callParts = callPath.split('/');
  const epParts = epNorm.split('/');
  if (callParts.length !== epParts.length) return false;
  return callParts.every((part, i) => epParts[i] === '*' || epParts[i] === part);
}

function endpointId(ep: EndpointFound): string {
  return `ep:${ep.method.toUpperCase()}_${sanitize(ep.path)}`;
}

function plsqlNodeId(name: string, pkg?: string): string {
  return `db:${pkg ? `${sanitize(pkg)}_` : ''}${sanitize(name)}`;
}

function basename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath;
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 40);
}
