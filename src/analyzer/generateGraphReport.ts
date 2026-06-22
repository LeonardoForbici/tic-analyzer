/**
 * Relatório de insights do grafo — inspirado no `GRAPH_REPORT.md` do graphify.
 *
 * Roda sobre o grafo de impacto unificado (`ImpactEdge[]`, já em memória na
 * pipeline) e destaca, em zero token de IA:
 *   - "god nodes": os nós mais conectados (in+out degree) — tudo passa por eles;
 *   - conexões surpreendentes: arestas que cruzam tiers não-adjacentes (ex.: uma
 *     tela frontend que fala direto com PL/SQL) ou módulos pouco acoplados;
 *   - perguntas sugeridas: chamadas MCP prontas para investigar cada god node.
 *
 * Gera `.tic-code/graph-report.md`. Mesmo padrão de `generateZoomOut.ts`:
 * recebe dados em memória e escreve um markdown navegável.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { ImpactEdge, ImpactNodeKind } from './buildImpactGraph';

const TOP_GOD_NODES = 15;
const TOP_SURPRISING = 15;

export interface GodNode {
  id: string;
  kind: ImpactNodeKind;
  inDegree: number; // quantos dependem dele
  outDegree: number; // de quantos ele depende
  total: number;
  module?: string;
}

export interface SurprisingLink {
  from: string;
  to: string;
  via: string;
  reason: 'cross-tier' | 'cross-module';
}

export interface GraphReportResult {
  godNodes: GodNode[];
  surprising: SurprisingLink[];
}

// Distância entre tiers na cadeia canônica frontend→…→banco. Saltos > 1 são
// "surpreendentes" (ex.: file→table pula a procedure; column→file sobe demais).
const TIER_RANK: Record<ImpactNodeKind, number> = { file: 0, method: 0, plsql: 1, table: 2, column: 2 };

function shortId(id: string): string {
  if (id.startsWith('file:')) return id.slice(5);
  if (id.startsWith('method:')) return id.slice(7);
  return id.slice(id.indexOf(':') + 1);
}

function fileOf(id: string): string | null {
  if (id.startsWith('file:')) return id.slice(5);
  if (id.startsWith('method:')) return id.slice(7).split('#')[0];
  return null;
}

export function generateGraphReport(
  ticCodeDir: string,
  projectName: string,
  impactEdges: ImpactEdge[],
  fileToModule: Map<string, string>
): GraphReportResult {
  // ── Degree por nó (uma passada) ──────────────────────────────────────────
  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  const kindOf = new Map<string, ImpactNodeKind>();
  for (const e of impactEdges) {
    outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    kindOf.set(e.from, e.fromKind);
    kindOf.set(e.to, e.toKind);
  }

  const moduleOfNode = (id: string): string | undefined => {
    const f = fileOf(id);
    return f ? fileToModule.get(f) : undefined;
  };

  const godNodes: GodNode[] = [...kindOf.keys()]
    .map((id) => {
      const i = inDeg.get(id) ?? 0;
      const o = outDeg.get(id) ?? 0;
      return { id, kind: kindOf.get(id)!, inDegree: i, outDegree: o, total: i + o, module: moduleOfNode(id) };
    })
    .sort((a, b) => b.total - a.total || b.inDegree - a.inDegree)
    .slice(0, TOP_GOD_NODES);

  // ── Conexões surpreendentes ──────────────────────────────────────────────
  // Acoplamento por par de módulos para decidir o que é "raro".
  const modulePairCount = new Map<string, number>();
  for (const e of impactEdges) {
    const fm = moduleOfNode(e.from);
    const tm = moduleOfNode(e.to);
    if (fm && tm && fm !== tm) {
      const key = `${fm}→${tm}`;
      modulePairCount.set(key, (modulePairCount.get(key) ?? 0) + 1);
    }
  }

  const surprising: SurprisingLink[] = [];
  const seenSurprise = new Set<string>();
  for (const e of impactEdges) {
    const key = `${e.from}→${e.to}`;
    if (seenSurprise.has(key)) continue;
    // (a) salto de tier > 1 (ex.: file frontend → table, pulando a procedure)
    const tierJump = Math.abs(TIER_RANK[e.fromKind] - TIER_RANK[e.toKind]) >= 2;
    // (b) aresta entre módulos cujo par é raro (acoplamento isolado = 1)
    const fm = moduleOfNode(e.from);
    const tm = moduleOfNode(e.to);
    const rareModulePair = !!fm && !!tm && fm !== tm && (modulePairCount.get(`${fm}→${tm}`) ?? 0) === 1;
    if (tierJump || rareModulePair) {
      seenSurprise.add(key);
      surprising.push({ from: e.from, to: e.to, via: e.via, reason: tierJump ? 'cross-tier' : 'cross-module' });
    }
    if (surprising.length >= TOP_SURPRISING * 3) break; // teto de varredura
  }
  // Prioriza cross-tier (mais raras/relevantes) e corta no top.
  surprising.sort((a, b) => (a.reason === b.reason ? 0 : a.reason === 'cross-tier' ? -1 : 1));
  const topSurprising = surprising.slice(0, TOP_SURPRISING);

  // ── Markdown ─────────────────────────────────────────────────────────────
  const md: string[] = [
    `# Insights do Grafo — ${projectName}`,
    '',
    `Hubs e conexões atípicas do grafo de impacto unificado (${impactEdges.length.toLocaleString()} arestas). Zero token de IA.`,
    '',
    '## God nodes — tudo passa por aqui',
    '',
    'Os nós mais conectados. Mexer neles tem o maior raio de impacto.',
    '',
    '| Entidade | Tipo | Dependentes (in) | Depende de (out) | Módulo |',
    '| --- | --- | --- | --- | --- |',
    ...godNodes.map((n) => `| \`${shortId(n.id)}\` | ${n.kind} | ${n.inDegree} | ${n.outDegree} | ${n.module ?? '—'} |`)
  ];

  md.push('', '## Conexões surpreendentes', '');
  if (topSurprising.length === 0) {
    md.push('_Nenhuma conexão atípica detectada — o grafo segue a hierarquia esperada de camadas._');
  } else {
    md.push(
      'Arestas que pulam camadas (cross-tier) ou ligam módulos quase sem outro acoplamento (cross-module). Bons pontos para revisar acoplamento indevido.',
      '',
      '| De | Para | Via | Motivo |',
      '| --- | --- | --- | --- |',
      ...topSurprising.map((s) => `| \`${shortId(s.from)}\` | \`${shortId(s.to)}\` | ${s.via} | ${s.reason} |`)
    );
  }

  md.push('', '## Perguntas sugeridas', '');
  if (godNodes.length === 0) {
    md.push('_Grafo sem arestas de impacto._');
  } else {
    md.push('Investigue os god nodes com as tools MCP:', '');
    for (const n of godNodes.slice(0, 5)) {
      md.push(`- \`get_blast_radius("${shortId(n.id)}")\` — raio de impacto de ${shortId(n.id)}`);
    }
    if (godNodes.length >= 2) {
      md.push(
        `- \`get_impact_path("${shortId(godNodes[1].id)}", "${shortId(godNodes[0].id)}")\` — por que um afeta o outro`
      );
    }
  }

  fs.writeFileSync(path.join(ticCodeDir, 'graph-report.md'), md.join('\n'), 'utf8');
  return { godNodes, surprising: topSurprising };
}
