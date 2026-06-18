/**
 * Detecção de comunidades (Louvain) — inspirado no community detection do
 * graphify (que usa Leiden). Em vez de agrupar por pasta/estrutura (o que os
 * `modules` já fazem), agrupa por TOPOLOGIA do grafo de impacto: nós que
 * conversam muito entre si caem na mesma comunidade, atravessando fronteiras de
 * diretório/camada.
 *
 * 100% local e determinístico (RNG semeado), sobre o `ImpactEdge[]` já em
 * memória na pipeline. graphology + graphology-communities-louvain são puro-JS
 * (zero risco para o ABI nativo do better-sqlite3).
 */
import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import type { ImpactEdge } from './buildImpactGraph';

export interface Community {
  id: number;
  name: string;
  nodeIds: string[];
}

export interface SurprisingCoupling {
  from: number; // community id
  to: number;
  fromName: string;
  toName: string;
  weight: number; // arestas cruzando o par
}

export interface CommunityResult {
  communities: Community[];
  /** node id → community id (para persistir e consultar). */
  byNode: Map<string, number>;
  /** Pares de comunidades com acoplamento cross alto vs. interno (acoplamento atípico). */
  surprising: SurprisingCoupling[];
}

/** LCG simples e semeado — torna o Louvain determinístico entre execuções. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const shortId = (id: string) => (id.startsWith('file:') ? id.slice(5) : id.startsWith('method:') ? id.slice(7) : id.slice(id.indexOf(':') + 1));

/** Nome heurístico: prefixo de path/módulo mais comum, ou prefixo de objeto de banco. */
function nameCommunity(nodeIds: string[]): string {
  const segCount = new Map<string, number>();
  let dbHeavy = 0;
  for (const id of nodeIds) {
    if (id.startsWith('table:') || id.startsWith('plsql:') || id.startsWith('column:')) {
      dbHeavy++;
      // prefixo do package PL/SQL (PKG_X.SALVAR → PKG_X) ou da tabela
      const body = shortId(id);
      const seg = body.includes('.') ? body.split('.')[0] : body;
      segCount.set(`db:${seg}`, (segCount.get(`db:${seg}`) ?? 0) + 1);
    } else {
      const p = shortId(id).split('#')[0];
      const parts = p.split('/').filter(Boolean);
      // primeiro segmento de diretório significativo (pula 'src')
      const seg = parts.length > 1 ? (parts[0] === 'src' && parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0]) : parts[0] ?? p;
      segCount.set(seg, (segCount.get(seg) ?? 0) + 1);
    }
  }
  const top = [...segCount.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return 'comunidade';
  const name = top[0].startsWith('db:') ? top[0].slice(3) : top[0];
  return dbHeavy > nodeIds.length / 2 ? `db/${name}` : name;
}

export function detectCommunities(impactEdges: ImpactEdge[]): CommunityResult {
  const graph = new Graph({ type: 'undirected', multi: false });

  // Grafo não-direcionado ponderado: dedupe A↔B somando pesos.
  for (const e of impactEdges) {
    if (e.from === e.to) continue;
    if (!graph.hasNode(e.from)) graph.addNode(e.from);
    if (!graph.hasNode(e.to)) graph.addNode(e.to);
    if (graph.hasEdge(e.from, e.to)) {
      graph.updateEdgeAttribute(e.from, e.to, 'weight', (w) => (w ?? 1) + 1);
    } else {
      graph.addEdge(e.from, e.to, { weight: 1 });
    }
  }

  const byNode = new Map<string, number>();
  if (graph.order === 0) return { communities: [], byNode, surprising: [] };

  const mapping = louvain(graph, { getEdgeWeight: 'weight', rng: seededRng(42) }) as Record<string, number>;
  const members = new Map<number, string[]>();
  for (const [node, comm] of Object.entries(mapping)) {
    byNode.set(node, comm);
    members.set(comm, [...(members.get(comm) ?? []), node]);
  }

  const communities: Community[] = [...members.entries()]
    .map(([id, nodeIds]) => ({ id, name: nameCommunity(nodeIds), nodeIds }))
    .sort((a, b) => b.nodeIds.length - a.nodeIds.length);
  const nameById = new Map(communities.map((c) => [c.id, c.name]));

  // ── Acoplamento entre comunidades + peso interno ──────────────────────────
  const crossWeight = new Map<string, number>(); // "a-b" (a<b) → arestas cruzando
  const internalWeight = new Map<number, number>();
  for (const e of impactEdges) {
    const ca = byNode.get(e.from);
    const cb = byNode.get(e.to);
    if (ca === undefined || cb === undefined) continue;
    if (ca === cb) {
      internalWeight.set(ca, (internalWeight.get(ca) ?? 0) + 1);
    } else {
      const key = ca < cb ? `${ca}-${cb}` : `${cb}-${ca}`;
      crossWeight.set(key, (crossWeight.get(key) ?? 0) + 1);
    }
  }

  // "Surpreendente": par cujo peso cruzado é alto frente ao menor peso interno
  // das duas comunidades (acoplamento que rivaliza com a coesão interna).
  const surprising: SurprisingCoupling[] = [];
  for (const [key, w] of crossWeight) {
    const [a, b] = key.split('-').map(Number);
    const minInternal = Math.max(1, Math.min(internalWeight.get(a) ?? 0, internalWeight.get(b) ?? 0));
    if (w >= minInternal * 0.5) {
      surprising.push({ from: a, to: b, fromName: nameById.get(a) ?? String(a), toName: nameById.get(b) ?? String(b), weight: w });
    }
  }
  surprising.sort((a, b) => b.weight - a.weight);

  return { communities, byNode, surprising: surprising.slice(0, 20) };
}
