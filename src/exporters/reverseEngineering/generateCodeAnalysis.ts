/**
 * Gerador de análise de código para Programação Reversa
 * Inspiração: Archaeologist do Reversa by Sandeco (MIT)
 */

import type { ReverseEngineeringInput, CodeModule } from './reverseEngineeringTypes';

export function generateCodeAnalysis(input: ReverseEngineeringInput): CodeModule[] {
  const { scan, inventory, graph } = input;
  const modules: CodeModule[] = [];

  // Processar módulos Java/Spring
  for (const mod of inventory.modules) {
    if (mod.files.length === 0) continue;

    const nodeIds = new Set(
      graph.nodes.filter((n) => mod.files.some((f) => n.path === f || n.label.includes(f))).map((n) => n.id)
    );

    const coupling = graph.edges.filter(
      (e) => nodeIds.has(e.from) || nodeIds.has(e.to)
    ).length;

    const isCritical = coupling > 10 || mod.files.length > 20;

    modules.push({
      name: mod.kind,
      kind: mod.kind,
      files: mod.files.slice(0, 15),
      coupling,
      critical: isCritical,
      confidence: 'confirmado'
    });
  }

  // Processar componentes TypeScript
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

  // Detectar arquivos grandes (possivelmente críticos)
  const largeFiles = scan.files.filter((f) => f.lines > 500).slice(0, 10);
  for (const f of largeFiles) {
    modules.push({
      name: `Arquivo crítico: ${f.relativePath.split('/').pop() ?? f.relativePath}`,
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
  lines.push(`> Gerado por TIC Coder Lite — Modo Lite.`);
  lines.push(`> Inspiração metodológica: Archaeologist do Reversa by Sandeco (MIT).`);
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
      lines.push(`- Acoplamento (conexões): ${mod.coupling}`);
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

  // Resumo de entidades Java/Spring
  const javaSpring = input.inventory.javaSpring;
  const controllers = javaSpring.files.filter((f) => f.kind === 'controller');
  const services = javaSpring.files.filter((f) => f.kind === 'service');
  const repositories = javaSpring.files.filter((f) => f.kind === 'repository');
  const entities = javaSpring.files.filter((f) => f.kind === 'entity');

  if (controllers.length > 0 || services.length > 0) {
    lines.push('## Controllers e Services Detectados');
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
    lines.push('## Componentes Frontend Detectados');
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
