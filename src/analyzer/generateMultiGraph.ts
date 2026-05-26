import * as fs from 'fs';
import * as path from 'path';
import type { CallGraph, CallGraphNode } from './buildCallGraph';

const MAX_PER_LAYER = 12;

export function generateMultiGraph(outputDir: string, graph: CallGraph): void {
  if (graph.nodes.length === 0) return;

  // Conta grau de saída para priorizar nós mais conectados quando há excesso
  const outDegree = new Map<string, number>();
  for (const e of graph.edges) {
    outDegree.set(e.from, (outDegree.get(e.from) ?? 0) + 1);
  }

  const topNodes = (layer: 'frontend' | 'backend' | 'database'): CallGraphNode[] =>
    graph.nodes
      .filter((n) => n.layer === layer)
      .sort((a, b) => (outDegree.get(b.id) ?? 0) - (outDegree.get(a.id) ?? 0))
      .slice(0, MAX_PER_LAYER);

  const byLayer = {
    frontend: topNodes('frontend'),
    backend: topNodes('backend'),
    database: topNodes('database')
  };

  const visible = new Set([
    ...byLayer.frontend.map((n) => n.id),
    ...byLayer.backend.map((n) => n.id),
    ...byLayer.database.map((n) => n.id)
  ]);

  const lines: string[] = [
    '# Multi-Grafo de Chamadas — TIC Analyzer',
    '',
    '> 🟢 = detectado diretamente no código &nbsp;|&nbsp; 🟡 = inferido',
    '',
    '```mermaid',
    'graph LR'
  ];

  if (byLayer.frontend.length > 0) {
    lines.push('  subgraph Frontend');
    for (const n of byLayer.frontend) lines.push(`    ${n.id}["${esc(n.label)}"]`);
    lines.push('  end');
  }

  if (byLayer.backend.length > 0) {
    lines.push('  subgraph Backend');
    for (const n of byLayer.backend) lines.push(`    ${n.id}["${esc(n.label)}"]`);
    lines.push('  end');
  }

  if (byLayer.database.length > 0) {
    lines.push('  subgraph PL_SQL["PL/SQL"]');
    for (const n of byLayer.database) lines.push(`    ${n.id}["${esc(n.label)}"]`);
    lines.push('  end');
  }

  lines.push('');

  for (const edge of graph.edges) {
    if (!visible.has(edge.from) || !visible.has(edge.to)) continue;
    const conf = edge.confidence;
    lines.push(`  ${edge.from} -->|"${conf}"| ${edge.to}`);
  }

  lines.push('```', '');

  // Resumo numérico
  const totalFE = graph.nodes.filter((n) => n.layer === 'frontend').length;
  const totalBE = graph.nodes.filter((n) => n.layer === 'backend').length;
  const totalDB = graph.nodes.filter((n) => n.layer === 'database').length;
  const httpEdges = graph.edges.filter((e) => e.type === 'HTTP_CALL');
  const dbEdges = graph.edges.filter((e) => e.type === 'DB_CALL');
  const plEdges = graph.edges.filter((e) => e.type === 'PLSQL_CALL');

  lines.push('## Resumo', '');
  lines.push('| Camada | Total | Conexões |');
  lines.push('| --- | --- | --- |');
  lines.push(`| Frontend (serviços/componentes) | ${totalFE} | ${httpEdges.length} chamadas HTTP |`);
  lines.push(`| Backend (controllers/services) | ${totalBE} | ${dbEdges.length} chamadas PL/SQL |`);
  lines.push(`| Database (packages PL/SQL) | ${totalDB} | ${plEdges.length} chamadas internas |`);
  lines.push('');

  if (totalFE > MAX_PER_LAYER || totalBE > MAX_PER_LAYER || totalDB > MAX_PER_LAYER) {
    lines.push(`> ⚠️ Diagrama mostra top ${MAX_PER_LAYER} por camada (mais conectados). Total: ${graph.nodes.length} nós.`, '');
  }

  // Detalhes: Frontend → Backend
  if (httpEdges.length > 0) {
    lines.push('## Frontend → Backend', '');
    lines.push('| Frontend | Confiança | Backend |');
    lines.push('| --- | --- | --- |');
    for (const e of httpEdges.slice(0, 40)) {
      const from = graph.nodes.find((n) => n.id === e.from);
      const to = graph.nodes.find((n) => n.id === e.to);
      lines.push(`| \`${from?.label ?? e.from}\` | ${e.confidence} | \`${to?.label ?? e.to}\` |`);
    }
    lines.push('');
  }

  // Detalhes: Backend → PL/SQL
  if (dbEdges.length > 0) {
    lines.push('## Backend → PL/SQL', '');
    lines.push('| Backend | Confiança | Procedure/Package |');
    lines.push('| --- | --- | --- |');
    for (const e of dbEdges.slice(0, 40)) {
      const from = graph.nodes.find((n) => n.id === e.from);
      lines.push(`| \`${from?.label ?? e.from}\` | ${e.confidence} | \`${e.label ?? e.to}\` |`);
    }
    lines.push('');
  }

  // Detalhes: PL/SQL → PL/SQL
  if (plEdges.length > 0) {
    lines.push('## PL/SQL → PL/SQL', '');
    lines.push('| Caller | Confiança | Callee |');
    lines.push('| --- | --- | --- |');
    for (const e of plEdges.slice(0, 40)) {
      const from = graph.nodes.find((n) => n.id === e.from);
      lines.push(`| \`${from?.label ?? e.from}\` | ${e.confidence} | \`${e.label ?? e.to}\` |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`> Gerado pelo TIC Analyzer em ${new Date().toISOString()}`);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'multigraph.md'), lines.join('\n'), 'utf8');
}

function esc(s: string): string {
  return s.replace(/"/g, "'").replace(/[<>]/g, '').replace(/\[/g, '(').replace(/\]/g, ')');
}
