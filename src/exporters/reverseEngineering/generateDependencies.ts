/**
 * Gerador de dependências para Programação Reversa
 * Inspiração: Scout / Archaeologist do Reversa by Sandeco (MIT)
 */

import type { ReverseEngineeringInput, DependencyItem } from './reverseEngineeringTypes';

export function generateDependencies(input: ReverseEngineeringInput): DependencyItem[] {
  const items: DependencyItem[] = [];
  const { inventory, scan } = input;

  // Detectar gerenciadores de pacotes presentes
  const paths = scan.files.map((f) => f.relativePath);

  if (paths.some((p) => p.endsWith('package.json') && !p.includes('node_modules'))) {
    items.push({ name: 'Node.js / npm', kind: 'external', source: 'package.json', confidence: 'confirmado' });
  }
  if (paths.some((p) => p.endsWith('pom.xml'))) {
    items.push({ name: 'Maven', kind: 'external', source: 'pom.xml', confidence: 'confirmado' });
  }
  if (paths.some((p) => p.endsWith('build.gradle') || p.endsWith('build.gradle.kts'))) {
    items.push({ name: 'Gradle', kind: 'external', source: 'build.gradle', confidence: 'confirmado' });
  }
  if (paths.some((p) => p.endsWith('requirements.txt'))) {
    items.push({ name: 'pip / Python', kind: 'external', source: 'requirements.txt', confidence: 'confirmado' });
  }
  if (paths.some((p) => p.endsWith('go.mod'))) {
    items.push({ name: 'Go Modules', kind: 'external', source: 'go.mod', confidence: 'confirmado' });
  }
  if (paths.some((p) => p.endsWith('pubspec.yaml'))) {
    items.push({ name: 'Flutter / Dart pub', kind: 'external', source: 'pubspec.yaml', confidence: 'confirmado' });
  }
  if (paths.some((p) => p.endsWith('Cargo.toml'))) {
    items.push({ name: 'Cargo / Rust', kind: 'external', source: 'Cargo.toml', confidence: 'confirmado' });
  }

  // Stack detectada como dependências
  for (const signal of inventory.stack) {
    if (signal.detected) {
      items.push({
        name: signal.name,
        kind: 'external',
        source: signal.evidence[0] ?? 'detectado por convenção',
        confidence: signal.evidence.length > 0 ? 'confirmado' : 'inferido'
      });
    }
  }

  // Dependências internas por módulos Java/Spring
  const javaModules = ['controller', 'service', 'repository', 'entity', 'dto', 'config'];
  for (const mod of javaModules) {
    const moduleFiles = inventory.modules.filter((m) => m.kind === mod).flatMap((m) => m.files);
    if (moduleFiles.length > 0) {
      items.push({
        name: `Módulo ${mod}`,
        kind: 'internal',
        source: moduleFiles[0] ?? mod,
        confidence: 'confirmado'
      });
    }
  }

  // Dependência Docker / infra
  if (inventory.docker.detected) {
    for (const ev of inventory.docker.evidence) {
      items.push({ name: 'Docker', kind: 'external', source: ev, confidence: 'confirmado' });
    }
  }

  // Deduplica
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.name}:${item.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function renderDependenciesMd(deps: DependencyItem[], projectName: string): string {
  const lines: string[] = [];
  lines.push(`# Dependências: ${projectName}`);
  lines.push('');
  lines.push(`> Gerado por TIC Coder Lite — Modo Lite.`);
  lines.push('');

  const external = deps.filter((d) => d.kind === 'external');
  const internal = deps.filter((d) => d.kind === 'internal');

  lines.push('## Dependências Externas');
  lines.push('');
  if (external.length > 0) {
    lines.push('| Nome | Fonte | Confiança |');
    lines.push('| --- | --- | --- |');
    for (const dep of external) {
      const badge = dep.confidence === 'confirmado' ? '🟢 CONFIRMADO' : '🟡 INFERIDO';
      lines.push(`| ${dep.name} | ${dep.source} | ${badge} |`);
    }
  } else {
    lines.push('- Nenhuma dependência externa detectada 🔴 LACUNA');
  }

  lines.push('');
  lines.push('## Dependências Internas (Módulos)');
  lines.push('');
  if (internal.length > 0) {
    lines.push('| Módulo | Arquivo | Confiança |');
    lines.push('| --- | --- | --- |');
    for (const dep of internal) {
      const badge = dep.confidence === 'confirmado' ? '🟢 CONFIRMADO' : '🟡 INFERIDO';
      lines.push(`| ${dep.name} | ${dep.source} | ${badge} |`);
    }
  } else {
    lines.push('- Nenhuma dependência interna detectada');
  }

  return lines.join('\n');
}
