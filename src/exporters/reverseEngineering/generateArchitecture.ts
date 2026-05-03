/**
 * Gerador de arquitetura para Programação Reversa
 * Inspiração: Architect do Reversa by Sandeco (MIT)
 */

import type { ReverseEngineeringInput } from './reverseEngineeringTypes';
import type { LightweightGraph } from '../../scanner/buildGraph';

export function renderArchitectureMd(input: ReverseEngineeringInput, projectName: string): string {
  const { inventory, graph } = input;
  const lines: string[] = [];

  lines.push(`# Arquitetura: ${projectName}`);
  lines.push('');
  lines.push('> Gerado por TIC Coder Lite — Modo Lite.');
  lines.push('> Inspiração metodológica: Architect do Reversa by Sandeco (MIT).');
  lines.push('');

  // Visão geral
  lines.push('## Visão Geral');
  lines.push('');
  const detectedStacks = inventory.stack.filter((s) => s.detected).map((s) => s.name);
  if (detectedStacks.length > 0) {
    lines.push(`Stack detectada: ${detectedStacks.join(', ')} 🟢 CONFIRMADO`);
  } else {
    lines.push('Stack não identificada claramente 🔴 LACUNA');
  }
  lines.push('');

  // Camadas arquiteturais
  lines.push('## Camadas Detectadas');
  lines.push('');

  const moduleKinds = inventory.modules.map((m) => m.kind);
  const hasController = moduleKinds.includes('controller');
  const hasService = moduleKinds.includes('service');
  const hasRepository = moduleKinds.includes('repository');
  const hasEntity = moduleKinds.includes('entity');
  const hasFrontend = inventory.typeScript.detected;
  const hasDatabase = inventory.database.detected;
  const hasDocker = inventory.docker.detected;
  const hasPlSql = inventory.plsql.detected;

  if (hasController || hasService || hasRepository) {
    lines.push('### Backend (Java/Spring) 🟢 CONFIRMADO');
    lines.push('');
    lines.push('Camadas detectadas:');
    if (hasController) lines.push(`- Controller: ${inventory.modules.filter((m) => m.kind === 'controller').flatMap((m) => m.files).length} arquivo(s)`);
    if (hasService) lines.push(`- Service: ${inventory.modules.filter((m) => m.kind === 'service').flatMap((m) => m.files).length} arquivo(s)`);
    if (hasRepository) lines.push(`- Repository: ${inventory.modules.filter((m) => m.kind === 'repository').flatMap((m) => m.files).length} arquivo(s)`);
    if (hasEntity) lines.push(`- Entity: ${inventory.modules.filter((m) => m.kind === 'entity').flatMap((m) => m.files).length} arquivo(s)`);
    lines.push('');
  }

  if (hasFrontend) {
    lines.push('### Frontend (TypeScript/JS) 🟢 CONFIRMADO');
    lines.push('');
    const tsFrameworks = inventory.typeScript.frameworks;
    if (tsFrameworks.length > 0) {
      lines.push(`Frameworks: ${tsFrameworks.join(', ')}`);
    }
    lines.push(`Componentes: ${inventory.typeScript.sourceFiles.components.length}`);
    lines.push(`Serviços: ${inventory.typeScript.sourceFiles.services.length}`);
    lines.push('');
  }

  if (hasDatabase) {
    const badge = hasPlSql ? '🟢 CONFIRMADO' : '🟡 INFERIDO';
    lines.push(`### Banco de Dados ${badge}`);
    lines.push('');
    for (const ev of inventory.database.evidence.slice(0, 5)) {
      lines.push(`- ${ev}`);
    }
    lines.push('');
  }

  if (hasPlSql) {
    lines.push('### Oracle PL/SQL 🟢 CONFIRMADO');
    lines.push('');
    lines.push(`- Packages: ${inventory.plsql.counts.package}`);
    lines.push(`- Procedures: ${inventory.plsql.counts.procedure}`);
    lines.push(`- Functions: ${inventory.plsql.counts.function}`);
    lines.push(`- Triggers: ${inventory.plsql.counts.trigger}`);
    lines.push('');
  }

  if (hasDocker) {
    lines.push('### Infraestrutura 🟢 CONFIRMADO');
    lines.push('');
    for (const ev of inventory.docker.evidence.slice(0, 5)) {
      lines.push(`- ${ev}`);
    }
    lines.push('');
  }

  // Diagrama C4 simplificado (Mermaid)
  lines.push('## Diagrama C4 Nível 1 — Contexto (Inferido)');
  lines.push('');
  lines.push('> 🟡 INFERIDO — baseado em arquivos detectados, sem documentação de arquitetura explícita.');
  lines.push('');
  lines.push('```mermaid');
  lines.push('graph TB');
  lines.push(`  User([Usuário]) --> System[${projectName}]`);
  if (hasFrontend) {
    lines.push(`  System --> Frontend[Frontend<br/>${inventory.typeScript.frameworks.join('/')}]`);
  }
  if (hasController) {
    lines.push('  System --> Backend[Backend API]');
  }
  if (hasDatabase || hasPlSql) {
    lines.push('  System --> DB[(Banco de Dados)]');
    if (hasPlSql) {
      lines.push('  DB --> PLSQL[Oracle PL/SQL]');
    }
  }
  lines.push('```');
  lines.push('');

  // Acoplamentos e riscos
  const highCouplingNodes = findHighCouplingNodes(graph);
  if (highCouplingNodes.length > 0) {
    lines.push('## Pontos de Alto Acoplamento 🟡 INFERIDO');
    lines.push('');
    for (const node of highCouplingNodes.slice(0, 10)) {
      lines.push(`- ${node.label} (${node.connections} conexões) — ${node.path}`);
    }
    lines.push('');
  }

  // Dívida técnica
  lines.push('## Dívida Técnica Detectada');
  lines.push('');
  const largeFiles = input.scan.files.filter((f) => f.lines > 800);
  if (largeFiles.length > 0) {
    lines.push(`- ${largeFiles.length} arquivo(s) com mais de 800 linhas 🟢 CONFIRMADO`);
    for (const f of largeFiles.slice(0, 5)) {
      lines.push(`  - ${f.relativePath} (${f.lines} linhas)`);
    }
  } else {
    lines.push('- Nenhum arquivo crítico por tamanho detectado 🟢 CONFIRMADO');
  }

  return lines.join('\n');
}

function findHighCouplingNodes(graph: LightweightGraph): Array<{ label: string; path: string; connections: number }> {
  const connectionCount = new Map<string, number>();

  for (const edge of graph.edges) {
    connectionCount.set(edge.from, (connectionCount.get(edge.from) ?? 0) + 1);
    connectionCount.set(edge.to, (connectionCount.get(edge.to) ?? 0) + 1);
  }

  return graph.nodes
    .map((node) => ({
      label: node.label,
      path: node.path,
      connections: connectionCount.get(node.id) ?? 0
    }))
    .filter((n) => n.connections > 5)
    .sort((a, b) => b.connections - a.connections);
}
