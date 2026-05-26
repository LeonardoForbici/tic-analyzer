import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';
import type { DependencyGraph } from './buildDependencyGraph';

export interface LayerViolation {
  type: 'frontend_imports_server' | 'circular_dependency' | 'direct_db_from_controller';
  severity: 'critical' | 'high' | 'medium';
  from: string;
  to: string;
  detail: string;
}

const FRONTEND_PATTERNS = /\/(components?|pages?|views?|screens?|ui|hooks?|contexts?)\//i;
const SERVER_PATTERNS = /\/(controllers?|services?|repositories?|dao|persistence|database|db|server)\//i;
const DB_PATTERNS = /\/(repositories?|dao|persistence|database|db)\//i;
const CONTROLLER_PATTERNS = /\/(controllers?|handlers?|routes?)\//i;

/** Detecta violações arquiteturais por análise do grafo de dependências */
export function detectLayerViolations(
  files: ScannedFile[],
  graph: DependencyGraph
): LayerViolation[] {
  const violations: LayerViolation[] = [];
  const seen = new Set<string>();

  for (const edge of graph.edges) {
    const key = `${edge.from}→${edge.to}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Frontend importando diretamente servidor/repositório
    if (FRONTEND_PATTERNS.test(edge.from) && SERVER_PATTERNS.test(edge.to)) {
      violations.push({
        type: 'frontend_imports_server',
        severity: 'high',
        from: edge.from,
        to: edge.to,
        detail: `Componente frontend importa módulo de servidor/backend diretamente`
      });
    }

    // Controller chamando repositório/DB diretamente (sem service)
    if (CONTROLLER_PATTERNS.test(edge.from) && DB_PATTERNS.test(edge.to)) {
      violations.push({
        type: 'direct_db_from_controller',
        severity: 'medium',
        from: edge.from,
        to: edge.to,
        detail: `Controller acessa repositório diretamente (deveria passar por Service)`
      });
    }
  }

  // Detecta dependências circulares via DFS
  const circularPairs = detectCircularDeps(graph);
  for (const [a, b] of circularPairs.slice(0, 20)) {
    const key = `circ:${a}↔${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    violations.push({
      type: 'circular_dependency',
      severity: 'critical',
      from: a,
      to: b,
      detail: `Dependência circular detectada`
    });
  }

  return violations;
}

function detectCircularDeps(graph: DependencyGraph): [string, string][] {
  const adj: Record<string, string[]> = {};
  for (const edge of graph.edges) {
    if (!adj[edge.from]) adj[edge.from] = [];
    adj[edge.from].push(edge.to);
  }

  const pairs: [string, string][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(node: string, parent: string): void {
    if (pairs.length >= 20) return;
    if (stack.has(node)) {
      if (parent !== node) pairs.push([parent, node]);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    for (const next of adj[node] ?? []) {
      dfs(next, node);
    }
    stack.delete(node);
  }

  for (const node of graph.nodes.slice(0, 500).map((n) => n.path)) {
    if (!visited.has(node)) dfs(node, node);
  }

  return pairs;
}

/** Formata lista de violações como Markdown compacto */
export function formatViolations(violations: LayerViolation[]): string {
  if (violations.length === 0) return '✅ Nenhuma violação arquitetural detectada.\n';

  const bySeverity = {
    critical: violations.filter((v) => v.severity === 'critical'),
    high: violations.filter((v) => v.severity === 'high'),
    medium: violations.filter((v) => v.severity === 'medium')
  };

  const lines: string[] = [];

  if (bySeverity.critical.length > 0) {
    lines.push(`### 🔴 Crítico — Dependências Circulares (${bySeverity.critical.length})`);
    lines.push('| Arquivo A | Arquivo B |');
    lines.push('| --- | --- |');
    for (const v of bySeverity.critical.slice(0, 15)) {
      lines.push(`| \`${v.from}\` | \`${v.to}\` |`);
    }
    lines.push('');
  }

  if (bySeverity.high.length > 0) {
    lines.push(`### 🟠 Alto — Frontend importa Backend direto (${bySeverity.high.length})`);
    lines.push('| De | Para |');
    lines.push('| --- | --- |');
    for (const v of bySeverity.high.slice(0, 10)) {
      lines.push(`| \`${v.from}\` | \`${v.to}\` |`);
    }
    lines.push('');
  }

  if (bySeverity.medium.length > 0) {
    lines.push(`### 🟡 Médio — Controller acessa DB direto (${bySeverity.medium.length})`);
    lines.push('| Controller | Repositório |');
    lines.push('| --- | --- |');
    for (const v of bySeverity.medium.slice(0, 10)) {
      lines.push(`| \`${v.from}\` | \`${v.to}\` |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
