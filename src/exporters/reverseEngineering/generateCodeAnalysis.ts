/**
 * Gerador de análise de código para Programação Reversa
 * Inspiração: Archaeologist do Reversa by Sandeco (MIT)
 *
 * Módulos são classificados por PASTA, nunca como "unknown" ou "desconhecido".
 */

import type { ReverseEngineeringInput, CodeModule } from './reverseEngineeringTypes';

/**
 * Mapeamento pasta → nome de módulo legível.
 * Ordem importa: mais específico primeiro.
 */
const FOLDER_MODULE_MAP: Array<{ prefix: string; name: string; kind: string }> = [
  { prefix: 'src/exporters/reverseengineering', name: 'Programação Reversa', kind: 'reverse-engineering' },
  { prefix: 'src/exporters/reverseEngineering', name: 'Programação Reversa', kind: 'reverse-engineering' },
  { prefix: 'src/exporters', name: 'Exportadores', kind: 'exporters' },
  { prefix: 'src/scanner', name: 'Scanner', kind: 'scanner' },
  { prefix: 'src/webview', name: 'WebView', kind: 'webview' },
  { prefix: 'src/local-ai', name: 'IA Local', kind: 'local-ai' },
  { prefix: 'src/reversa-adapter', name: 'Reversa Adapter', kind: 'reversa-adapter' },
  { prefix: 'src/commands', name: 'Comandos VS Code', kind: 'commands' },
  { prefix: 'src/utils', name: 'Utilitários', kind: 'utils' },
  { prefix: 'src/', name: 'Raiz do código-fonte', kind: 'src-root' }
];

export function classifyFileToModule(relativePath: string): { name: string; kind: string } {
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase();

  // Arquivo raiz especial
  if (normalized === 'src/types.ts' || normalized.endsWith('/types.ts')) {
    return { name: 'Tipos Centrais', kind: 'types' };
  }
  if (normalized === 'src/extension.ts' || normalized.endsWith('/extension.ts')) {
    return { name: 'Ponto de Entrada (extension)', kind: 'extension' };
  }

  for (const { prefix, name, kind } of FOLDER_MODULE_MAP) {
    if (normalized.startsWith(prefix.toLowerCase())) {
      return { name, kind };
    }
  }

  // Java/Spring por tipo de classe
  const lower = normalized;
  if (lower.includes('controller')) return { name: 'Controllers', kind: 'controller' };
  if (lower.includes('service')) return { name: 'Services', kind: 'service' };
  if (lower.includes('repository') || lower.includes('repo')) return { name: 'Repositories', kind: 'repository' };
  if (lower.includes('entity') || lower.endsWith('.entity.ts') || lower.endsWith('.entity.java')) return { name: 'Entidades', kind: 'entity' };
  if (['.sql', '.pks', '.pkb', '.prc', '.fnc', '.trg', '.pkg'].some((e) => lower.endsWith(e))) return { name: 'Banco de Dados / PL/SQL', kind: 'database' };

  // Fallback: usar nome da pasta pai
  const parts = normalized.split('/');
  if (parts.length >= 2) {
    const parentDir = parts[parts.length - 2];
    if (parentDir && parentDir !== '.' && parentDir !== '') {
      return { name: capitalize(parentDir), kind: parentDir };
    }
  }

  return { name: 'Outros', kind: 'other' };
}

export function generateCodeAnalysis(input: ReverseEngineeringInput): CodeModule[] {
  const { scan, inventory, graph } = input;
  const modules: CodeModule[] = [];

  // ── Java/Spring por módulo detectado ──────────────────────────────────────
  for (const mod of inventory.modules) {
    if (mod.files.length === 0) continue;

    const nodeIds = new Set(
      graph.nodes
        .filter((n) => mod.files.some((f) => n.path === f || n.label.includes(f)))
        .map((n) => n.id)
    );

    const coupling = graph.edges.filter((e) => nodeIds.has(e.from) || nodeIds.has(e.to)).length;
    const isCritical = coupling > 10 || mod.files.length > 20;

    modules.push({
      name: capitalize(mod.kind),
      kind: mod.kind,
      files: mod.files.slice(0, 15),
      coupling,
      critical: isCritical,
      confidence: 'confirmado'
    });
  }

  // ── Componentes TypeScript detectados ─────────────────────────────────────
  const ts = inventory.typeScript;
  if (ts.sourceFiles.components.length > 0) {
    modules.push({
      name: 'Componentes UI',
      kind: 'frontend-components',
      files: ts.sourceFiles.components.slice(0, 15),
      coupling: 0,
      critical: ts.sourceFiles.components.length > 20,
      confidence: 'confirmado'
    });
  }

  if (ts.sourceFiles.services.length > 0) {
    modules.push({
      name: 'Services Frontend',
      kind: 'frontend-services',
      files: ts.sourceFiles.services.slice(0, 15),
      coupling: 0,
      critical: false,
      confidence: 'confirmado'
    });
  }

  if (ts.sourceFiles.pages.length > 0) {
    modules.push({
      name: 'Páginas / Rotas',
      kind: 'frontend-pages',
      files: ts.sourceFiles.pages.slice(0, 15),
      coupling: 0,
      critical: false,
      confidence: 'confirmado'
    });
  }

  // ── Agrupamento por pasta para projetos TS/JS sem detecção específica ─────
  if (modules.length === 0 || inventory.javaSpring.files.length === 0) {
    const byModule = new Map<string, { name: string; kind: string; files: string[] }>();
    for (const file of scan.files) {
      // Excluir arquivos de ruído
      const lower = file.relativePath.toLowerCase();
      if (
        lower.includes('node_modules/') ||
        lower.includes('/dist/') ||
        lower.includes('/build/') ||
        lower.endsWith('.map') ||
        lower.endsWith('.min.js') ||
        lower.endsWith('package-lock.json') ||
        lower.endsWith('yarn.lock')
      ) {
        continue;
      }
      const { name, kind } = classifyFileToModule(file.relativePath);
      const entry = byModule.get(kind) ?? { name, kind, files: [] };
      if (entry.files.length < 15) entry.files.push(file.relativePath);
      byModule.set(kind, entry);
    }

    for (const { name, kind, files } of byModule.values()) {
      if (files.length === 0) continue;
      const alreadyAdded = modules.some((m) => m.kind === kind);
      if (!alreadyAdded) {
        // calcular acoplamento via grafo
        const fileSet = new Set(files);
        const nodeIds = new Set(graph.nodes.filter((n) => fileSet.has(n.path)).map((n) => n.id));
        const coupling = graph.edges.filter((e) => nodeIds.has(e.from) || nodeIds.has(e.to)).length;
        modules.push({
          name,
          kind,
          files,
          coupling,
          critical: coupling > 10,
          confidence: 'confirmado'
        });
      }
    }
  }

  // ── Arquivos grandes como módulos críticos (com nome classificado) ─────────
  const largeFiles = scan.files
    .filter((f) => {
      const lower = f.relativePath.toLowerCase();
      return (
        f.lines > 500 &&
        !lower.endsWith('package-lock.json') &&
        !lower.endsWith('yarn.lock') &&
        !lower.endsWith('pnpm-lock.yaml') &&
        !lower.endsWith('.map') &&
        !lower.endsWith('.min.js')
      );
    })
    .slice(0, 10);

  for (const f of largeFiles) {
    const { name: moduleName } = classifyFileToModule(f.relativePath);
    const basename = f.relativePath.split('/').pop() ?? f.relativePath;
    modules.push({
      name: `${moduleName}: ${basename} (arquivo grande)`,
      kind: 'large-file',
      files: [f.relativePath],
      coupling: 0,
      critical: true,
      confidence: 'inferido'
    });
  }

  return modules;
}

export function renderCodeAnalysisMd(modules: CodeModule[], input: ReverseEngineeringInput, projectName: string): string {
  const lines: string[] = [];
  lines.push(`# Análise de Código: ${projectName}`);
  lines.push('');
  lines.push('> Gerado por TIC Coder Lite — Modo Lite.');
  lines.push('> Inspiração metodológica: Archaeologist do Reversa by Sandeco (MIT).');
  lines.push('');

  const criticalModules = modules.filter((m) => m.critical);
  const normalModules = modules.filter((m) => !m.critical);

  if (criticalModules.length > 0) {
    lines.push('## Módulos Críticos');
    lines.push('');
    for (const mod of criticalModules) {
      const badge = mod.confidence === 'confirmado' ? '🟢 CONFIRMADO' : '🟡 INFERIDO';
      lines.push(`### ${mod.name} ${badge}`);
      lines.push('');
      lines.push(`- Tipo: ${mod.kind}`);
      lines.push(`- Acoplamento (conexões no grafo): ${mod.coupling}`);
      lines.push(`- Arquivos: ${mod.files.length}`);
      lines.push('');
      if (mod.files.length > 0) {
        lines.push('  Arquivos:');
        for (const f of mod.files.slice(0, 10)) {
          lines.push(`  - ${f}`);
        }
      }
      lines.push('');
    }
  }

  if (normalModules.length > 0) {
    lines.push('## Módulos Detectados');
    lines.push('');
    lines.push('| Módulo | Tipo | Arquivos | Acoplamento | Confiança |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const mod of normalModules) {
      const badge = mod.confidence === 'confirmado' ? '🟢' : '🟡';
      lines.push(`| ${mod.name} | ${mod.kind} | ${mod.files.length} | ${mod.coupling} | ${badge} |`);
    }
    lines.push('');
  }

  // Resumo Java/Spring
  const javaSpring = input.inventory.javaSpring;
  const controllers = javaSpring.files.filter((f) => f.kind === 'controller');
  const services = javaSpring.files.filter((f) => f.kind === 'service');
  const repositories = javaSpring.files.filter((f) => f.kind === 'repository');
  const entities = javaSpring.files.filter((f) => f.kind === 'entity');

  if (controllers.length > 0 || services.length > 0) {
    lines.push('## Controllers e Services Java/Spring');
    lines.push('');
    if (controllers.length > 0) {
      lines.push('### Controllers 🟢 CONFIRMADO');
      for (const c of controllers.slice(0, 20)) {
        lines.push(`- ${c.path} (${c.endpoints.length} endpoint(s))`);
      }
      lines.push('');
    }
    if (services.length > 0) {
      lines.push('### Services 🟢 CONFIRMADO');
      for (const s of services.slice(0, 20)) {
        lines.push(`- ${s.path}`);
      }
      lines.push('');
    }
    if (repositories.length > 0) {
      lines.push('### Repositories 🟢 CONFIRMADO');
      for (const r of repositories.slice(0, 20)) {
        lines.push(`- ${r.path}`);
      }
      lines.push('');
    }
    if (entities.length > 0) {
      lines.push('### Entities 🟢 CONFIRMADO');
      for (const e of entities.slice(0, 20)) {
        lines.push(`- ${e.className} em ${e.path}`);
      }
      lines.push('');
    }
  }

  // Resumo TypeScript / Frontend
  const ts = input.inventory.typeScript;
  const tsComponents = ts.sourceFiles.components;
  const tsPages = ts.sourceFiles.pages;
  if (tsComponents.length > 0 || tsPages.length > 0) {
    lines.push('## Componentes Frontend');
    lines.push('');
    if (tsComponents.length > 0) {
      lines.push(`### Componentes (${tsComponents.length}) 🟢 CONFIRMADO`);
      for (const c of tsComponents.slice(0, 20)) {
        lines.push(`- ${c}`);
      }
      lines.push('');
    }
    if (tsPages.length > 0) {
      lines.push(`### Páginas (${tsPages.length}) 🟢 CONFIRMADO`);
      for (const p of tsPages.slice(0, 10)) {
        lines.push(`- ${p}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
