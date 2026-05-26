import * as fs from 'fs';
import * as path from 'path';
import type { ProjectModule } from './detectModules';
import type { DependencyGraph } from './buildDependencyGraph';

export function generateMermaidDiagram(
  outputDir: string,
  modules: ProjectModule[],
  graph: DependencyGraph
): void {
  if (modules.length === 0) return;

  const lines: string[] = [
    '# Diagrama de Módulos — TIC Analyzer',
    '',
    '> Gerado automaticamente. 🟢 = dependência detectada no código.',
    '',
    '```mermaid',
    'graph TD'
  ];

  // Nós dos módulos
  for (const mod of modules) {
    const label = `${mod.name}\\n${mod.files.length} arquivos`;
    lines.push(`  ${sanitize(mod.name)}["${label}"]`);
  }

  lines.push('');

  // Arestas — inferidas a partir do grafo de dependências por módulo
  const moduleNames = new Set(modules.map((m) => m.name));
  const edgesSeen = new Set<string>();

  for (const edge of graph.edges) {
    const fromMod = findModuleForFile(edge.from, modules);
    const toMod = findModuleForFile(edge.to, modules);

    if (!fromMod || !toMod || fromMod === toMod) continue;
    if (!moduleNames.has(fromMod) || !moduleNames.has(toMod)) continue;

    const key = `${fromMod}→${toMod}`;
    if (!edgesSeen.has(key)) {
      edgesSeen.add(key);
      lines.push(`  ${sanitize(fromMod)} --> ${sanitize(toMod)}`);
    }
  }

  lines.push('```', '');

  // Legenda
  lines.push('## Módulos');
  lines.push('');
  lines.push('| Módulo | Arquivos | Linguagens |');
  lines.push('| --- | --- | --- |');
  for (const mod of modules) {
    const langs = [...new Set(mod.files.map((f) => f.extension.replace('.', '')))].slice(0, 4).join(', ');
    lines.push(`| **${mod.name}** | ${mod.files.length} | ${langs} |`);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'diagram.md'), lines.join('\n'), 'utf8');
}

function findModuleForFile(filePath: string, modules: ProjectModule[]): string | null {
  for (const mod of modules) {
    if (mod.files.some((f) => f.relativePath === filePath || f.absolutePath === filePath)) {
      return mod.name;
    }
  }
  // Fallback: match por prefixo de path
  for (const mod of modules) {
    if (filePath.startsWith(mod.name + '/') || filePath.startsWith(mod.name + '\\')) {
      return mod.name;
    }
  }
  return null;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}
