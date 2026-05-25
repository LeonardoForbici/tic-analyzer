import * as fs from 'fs';
import * as path from 'path';
import type { CallGraph } from './buildCallGraph';

const MAX_NODES_PER_LAYER = 30;

export function generateMultiGraph(outputDir: string, graph: CallGraph): void {
  if (graph.nodes.length === 0) return;

  const byLayer = {
    frontend: graph.nodes.filter((n) => n.layer === 'frontend').slice(0, MAX_NODES_PER_LAYER),
    endpoint: graph.nodes.filter((n) => n.layer === 'endpoint').slice(0, MAX_NODES_PER_LAYER),
    backend: graph.nodes.filter((n) => n.layer === 'backend').slice(0, MAX_NODES_PER_LAYER),
    database: graph.nodes.filter((n) => n.layer === 'database').slice(0, MAX_NODES_PER_LAYER)
  };

  const visibleIds = new Set([
    ...byLayer.frontend.map((n) => n.id),
    ...byLayer.endpoint.map((n) => n.id),
    ...byLayer.backend.map((n) => n.id),
    ...byLayer.database.map((n) => n.id)
  ]);

  const lines: string[] = [
    '# Multi-Grafo de Chamadas — TIC Analyzer',
    '',
    '> Mapa completo: Frontend → Endpoint REST → Backend → PL/SQL',
    '> 🟢 = detectado diretamente no código | 🟡 = inferido por padrão',
    '',
    '```mermaid',
    'graph LR'
  ];

  // Subgraphs por camada
  if (byLayer.frontend.length > 0) {
    lines.push('  subgraph Frontend');
    for (const n of byLayer.frontend) {
      lines.push(`    ${n.id}["${escMermaid(n.label)}"]`);
    }
    lines.push('  end');
  }

  if (byLayer.endpoint.length > 0) {
    lines.push('  subgraph Endpoints_REST["Endpoints REST"]');
    for (const n of byLayer.endpoint) {
      lines.push(`    ${n.id}["${escMermaid(n.label)}"]`);
    }
    lines.push('  end');
  }

  if (byLayer.backend.length > 0) {
    lines.push('  subgraph Backend');
    for (const n of byLayer.backend) {
      lines.push(`    ${n.id}["${escMermaid(n.label)}"]`);
    }
    lines.push('  end');
  }

  if (byLayer.database.length > 0) {
    lines.push('  subgraph Database_PL_SQL["Database PL/SQL"]');
    for (const n of byLayer.database) {
      lines.push(`    ${n.id}["${escMermaid(n.label)}"]`);
    }
    lines.push('  end');
  }

  lines.push('');

  // Arestas — somente entre nós visíveis
  for (const edge of graph.edges) {
    if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) continue;
    const label = edge.label ? `"${edge.confidence} ${escMermaid(edge.label.slice(0, 30))}"` : `"${edge.confidence}"`;
    lines.push(`  ${edge.from} -->|${label}| ${edge.to}`);
  }

  lines.push('```', '');

  // Tabelas por camada
  const totalFrontend = graph.nodes.filter((n) => n.layer === 'frontend').length;
  const totalEndpoints = graph.nodes.filter((n) => n.layer === 'endpoint').length;
  const totalBackend = graph.nodes.filter((n) => n.layer === 'backend').length;
  const totalDb = graph.nodes.filter((n) => n.layer === 'database').length;

  lines.push('## Resumo');
  lines.push('');
  lines.push('| Camada | Nós | Conexões |');
  lines.push('| --- | --- | --- |');
  lines.push(`| Frontend (HTTP calls) | ${totalFrontend} | ${graph.edges.filter((e) => e.type === 'HTTP_CALL').length} |`);
  lines.push(`| Endpoints REST | ${totalEndpoints} | ${graph.edges.filter((e) => e.type === 'HANDLES').length} |`);
  lines.push(`| Backend (services/controllers) | ${totalBackend} | ${graph.edges.filter((e) => e.type === 'DB_CALL').length} |`);
  lines.push(`| Database PL/SQL (procedures/funcs) | ${totalDb} | ${graph.edges.filter((e) => e.type === 'PLSQL_CALL').length} |`);
  lines.push('');

  if (totalFrontend > MAX_NODES_PER_LAYER || totalEndpoints > MAX_NODES_PER_LAYER || totalDb > MAX_NODES_PER_LAYER) {
    lines.push(`> ⚠️ Diagrama limitado a ${MAX_NODES_PER_LAYER} nós por camada para legibilidade. Total real: ${graph.nodes.length} nós.`);
    lines.push('');
  }

  // Tabela de endpoints conectados ao frontend
  const httpEdges = graph.edges.filter((e) => e.type === 'HTTP_CALL');
  if (httpEdges.length > 0) {
    lines.push('## Frontend → Endpoints detectados');
    lines.push('');
    lines.push('| Arquivo Frontend | Chamada | Endpoint Backend |');
    lines.push('| --- | --- | --- |');
    for (const edge of httpEdges.slice(0, 50)) {
      const fromNode = graph.nodes.find((n) => n.id === edge.from);
      const toNode = graph.nodes.find((n) => n.id === edge.to);
      lines.push(`| \`${fromNode?.file ?? edge.from}\` | ${edge.confidence} \`${edge.label ?? ''}\` | \`${toNode?.label ?? edge.to}\` |`);
    }
    lines.push('');
  }

  // Tabela de chamadas backend→PL/SQL
  const dbEdges = graph.edges.filter((e) => e.type === 'DB_CALL');
  if (dbEdges.length > 0) {
    lines.push('## Backend → PL/SQL detectados');
    lines.push('');
    lines.push('| Arquivo Backend | Confiança | Procedure/Function |');
    lines.push('| --- | --- | --- |');
    for (const edge of dbEdges.slice(0, 50)) {
      const fromNode = graph.nodes.find((n) => n.id === edge.from);
      lines.push(`| \`${fromNode?.file ?? edge.from}\` | ${edge.confidence} | \`${edge.label ?? edge.to}\` |`);
    }
    lines.push('');
  }

  // Tabela PL/SQL → PL/SQL
  const plsqlEdges = graph.edges.filter((e) => e.type === 'PLSQL_CALL');
  if (plsqlEdges.length > 0) {
    lines.push('## PL/SQL → PL/SQL (chamadas internas)');
    lines.push('');
    lines.push('| Caller | Confiança | Callee |');
    lines.push('| --- | --- | --- |');
    for (const edge of plsqlEdges.slice(0, 50)) {
      lines.push(`| \`${edge.from.replace('db:', '')}\` | ${edge.confidence} | \`${edge.label ?? edge.to}\` |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`> Gerado pelo TIC Analyzer em ${new Date().toISOString()}`);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'multigraph.md'), lines.join('\n'), 'utf8');
}

function escMermaid(s: string): string {
  return s.replace(/"/g, "'").replace(/[<>]/g, '').replace(/\[/g, '(').replace(/\]/g, ')');
}
