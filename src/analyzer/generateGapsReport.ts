import * as fs from 'fs';
import * as path from 'path';
import type { ProjectModule } from './detectModules';
import type { EndpointFound } from './detectEndpoints';
import type { DependencyGraph } from './buildDependencyGraph';
import type { BusinessRule } from './detectBusinessRules';

export function generateGapsReport(
  outputDir: string,
  modules: ProjectModule[],
  endpoints: EndpointFound[],
  graph: DependencyGraph,
  rules: BusinessRule[],
  totalFiles: number
): void {
  const lines: string[] = [
    '# Gaps e Lacunas — TIC Analyzer',
    '',
    '> 🔴 = não foi possível inferir estaticamente. Requer revisão humana ou análise mais profunda.',
    '',
    `> Gerado em: ${new Date().toISOString()}`,
    ''
  ];

  const gaps: string[] = [];

  // Módulos sem endpoints
  const endpointFiles = new Set(endpoints.map((e) => e.file));
  const modulesWithoutEndpoints = modules.filter((m) =>
    !m.files.some((f) => endpointFiles.has(f.relativePath))
  );
  if (modulesWithoutEndpoints.length > 0) {
    gaps.push('## 🔴 Módulos sem endpoints detectados');
    gaps.push('');
    gaps.push('> Pode ter endpoints em formatos não reconhecidos, ou são módulos puramente internos.');
    gaps.push('');
    for (const mod of modulesWithoutEndpoints) {
      gaps.push(`- **${mod.name}** (${mod.files.length} arquivos)`);
    }
    gaps.push('');
  }

  // Módulos com poucos arquivos (suspeitos de incompletos)
  const thinModules = modules.filter((m) => m.files.length < 3 && modules.length > 3);
  if (thinModules.length > 0) {
    gaps.push('## 🟡 Módulos com poucos arquivos (< 3)');
    gaps.push('');
    gaps.push('> Podem ser módulos incompletos, stubs ou artefatos isolados.');
    gaps.push('');
    for (const mod of thinModules) {
      gaps.push(`- **${mod.name}** (${mod.files.length} arquivo${mod.files.length !== 1 ? 's' : ''})`);
    }
    gaps.push('');
  }

  // Dependências externas não mapeadas
  if (graph.externalDeps.length > 0) {
    gaps.push('## 🟡 Dependências externas (não analisadas)');
    gaps.push('');
    gaps.push('> Bibliotecas e pacotes externos que o projeto usa mas cujo código não foi escaneado.');
    gaps.push('');
    for (const dep of graph.externalDeps.slice(0, 30)) {
      gaps.push(`- \`${dep}\``);
    }
    if (graph.externalDeps.length > 30) {
      gaps.push(`- ... e mais ${graph.externalDeps.length - 30} dependências`);
    }
    gaps.push('');
  }

  // Módulos sem regras de negócio detectadas
  const ruleFiles = new Set(rules.map((r) => r.file));
  const modulesWithoutRules = modules.filter((m) =>
    !m.files.some((f) => ruleFiles.has(f.relativePath))
  );
  if (modulesWithoutRules.length > 0 && rules.length > 0) {
    gaps.push('## 🟡 Módulos sem regras de negócio detectadas');
    gaps.push('');
    gaps.push('> Sem validações, enums, guards ou constantes de negócio encontradas. Pode indicar lógica implícita.');
    gaps.push('');
    for (const mod of modulesWithoutRules.slice(0, 10)) {
      gaps.push(`- **${mod.name}**`);
    }
    gaps.push('');
  }

  // Nós isolados no grafo
  const isolated = graph.nodes.filter((n) => n.inDegree === 0 && n.outDegree === 0);
  if (isolated.length > 0) {
    gaps.push('## 🟡 Arquivos isolados (sem imports detectados)');
    gaps.push('');
    gaps.push('> Não importam nem são importados por outros arquivos. Podem ser scripts standalone ou entrypoints.');
    gaps.push('');
    for (const node of isolated.slice(0, 15)) {
      gaps.push(`- \`${node.path}\``);
    }
    if (isolated.length > 15) {
      gaps.push(`- ... e mais ${isolated.length - 15} arquivos`);
    }
    gaps.push('');
  }

  if (gaps.length === 0) {
    lines.push('## ✅ Nenhum gap crítico detectado');
    lines.push('');
    lines.push('A análise estática cobriu todos os módulos com suficiente informação.');
  } else {
    lines.push(...gaps);
  }

  // Sumário
  lines.push('---');
  lines.push('');
  lines.push('## Sumário de cobertura da análise');
  lines.push('');
  lines.push('| Métrica | Valor |');
  lines.push('| --- | --- |');
  lines.push(`| Arquivos escaneados | ${totalFiles} |`);
  lines.push(`| Módulos detectados | ${modules.length} |`);
  lines.push(`| Endpoints detectados | ${endpoints.length} |`);
  lines.push(`| Regras de negócio | ${rules.length} |`);
  lines.push(`| Dependências no grafo | ${graph.edges.length} |`);
  lines.push(`| Dependências externas | ${graph.externalDeps.length} |`);
  lines.push(`| Módulos sem endpoints | ${modulesWithoutEndpoints.length} 🔴 |`);
  lines.push(`| Arquivos isolados | ${isolated.length} 🟡 |`);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'gaps.md'), lines.join('\n'), 'utf8');
}
