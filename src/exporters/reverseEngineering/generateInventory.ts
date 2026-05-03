/**
 * Gerador de inventário para Programação Reversa
 * Inspiração: Scout do Reversa by Sandeco (MIT)
 */

import type { ReverseEngineeringInput, InventoryItem } from './reverseEngineeringTypes';

export function generateInventory(input: ReverseEngineeringInput): InventoryItem {
  const { scan, inventory, plsql, projectName, projectKind } = input;

  const languages = Object.entries(
    scan.files.reduce<Record<string, number>>((acc, file) => {
      const ext = file.extension.toLowerCase();
      const lang = EXT_TO_LANG[ext] ?? ext;
      acc[lang] = (acc[lang] ?? 0) + 1;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang);

  const frameworks: string[] = [];
  const stacks: string[] = [];

  for (const signal of inventory.stack) {
    if (signal.detected) {
      stacks.push(signal.name);
      if (FRAMEWORK_SIGNALS.includes(signal.id)) {
        frameworks.push(signal.name);
      }
    }
  }

  const javaSpring = inventory.javaSpring;
  const ts = inventory.typeScript;

  const controllers =
    javaSpring.files.filter((f) => f.kind === 'controller').length +
    ts.sourceFiles.components.length;
  const services = javaSpring.files.filter((f) => f.kind === 'service').length;
  const repositories = javaSpring.files.filter((f) => f.kind === 'repository').length;
  const entities = javaSpring.files.filter((f) => f.kind === 'entity').length;

  const endpointCount = javaSpring.files.flatMap((f) => f.endpoints).length;

  const entrypoints = detectEntrypoints(scan.files.map((f) => f.relativePath));
  const keyFiles = scan.files
    .filter((f) => KEY_BASENAMES.has(f.relativePath.split('/').pop() ?? ''))
    .map((f) => f.relativePath)
    .slice(0, 20);

  return {
    project: projectName,
    kind: projectKind ?? 'workspace',
    stack: stacks,
    languages,
    frameworks,
    entrypoints,
    keyFiles,
    totalFiles: scan.totals.files,
    totalLines: scan.totals.lines,
    controllers,
    services,
    repositories,
    entities,
    endpoints: endpointCount,
    plsqlPackages: plsql.counts.package + plsql.counts.package_body,
    plsqlProcedures: plsql.counts.procedure,
    plsqlTriggers: plsql.counts.trigger
  };
}

export function renderInventoryMd(item: InventoryItem, projectName: string): string {
  const lines: string[] = [];
  lines.push(`# Inventário: ${projectName}`);
  lines.push('');
  lines.push(`> Gerado por TIC Coder Lite — Modo Lite (sem IA, banco, Docker ou servidor).`);
  lines.push(`> Inspiração metodológica: Scout do Reversa by Sandeco (MIT).`);
  lines.push('');
  lines.push('## Resumo');
  lines.push('');
  lines.push(`| Métrica | Valor |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Projeto | ${item.project} |`);
  lines.push(`| Tipo | ${item.kind} |`);
  lines.push(`| Total de arquivos | ${item.totalFiles} |`);
  lines.push(`| Total de linhas | ${item.totalLines} |`);
  lines.push(`| Linguagens | ${item.languages.slice(0, 6).join(', ') || 'N/D'} |`);
  lines.push(`| Stack | ${item.stack.slice(0, 6).join(', ') || 'N/D'} |`);
  lines.push(`| Frameworks | ${item.frameworks.join(', ') || 'N/D'} |`);
  lines.push(`| Controllers | ${item.controllers} |`);
  lines.push(`| Services | ${item.services} |`);
  lines.push(`| Repositories | ${item.repositories} |`);
  lines.push(`| Entities / Models | ${item.entities} |`);
  lines.push(`| Endpoints detectados | ${item.endpoints} |`);

  if (item.plsqlPackages > 0 || item.plsqlProcedures > 0 || item.plsqlTriggers > 0) {
    lines.push(`| Packages PL/SQL | ${item.plsqlPackages} |`);
    lines.push(`| Procedures PL/SQL | ${item.plsqlProcedures} |`);
    lines.push(`| Triggers PL/SQL | ${item.plsqlTriggers} |`);
  }

  lines.push('');
  lines.push('## Entrypoints detectados');
  lines.push('');
  if (item.entrypoints.length > 0) {
    for (const ep of item.entrypoints) {
      lines.push(`- ${ep} 🟢 CONFIRMADO`);
    }
  } else {
    lines.push('- Nenhum entrypoint identificado 🔴 LACUNA');
  }

  lines.push('');
  lines.push('## Arquivos-chave');
  lines.push('');
  if (item.keyFiles.length > 0) {
    for (const f of item.keyFiles) {
      lines.push(`- ${f} 🟢 CONFIRMADO`);
    }
  } else {
    lines.push('- Nenhum arquivo-chave identificado');
  }

  return lines.join('\n');
}

function detectEntrypoints(paths: string[]): string[] {
  const entrypoints: string[] = [];
  const ENTRY_PATTERNS = [
    'src/main/java',
    'src/index.ts',
    'src/index.js',
    'src/main.ts',
    'src/main.tsx',
    'src/App.tsx',
    'src/app.ts',
    'lib/main.dart',
    'index.ts',
    'index.js',
    'main.ts',
    'main.go',
    'main.py',
    'app.py',
    'manage.py',
    'server.ts',
    'server.js'
  ];

  for (const p of paths) {
    const normalized = p.replace(/\\/g, '/');
    for (const pattern of ENTRY_PATTERNS) {
      if (normalized.endsWith(pattern) || normalized.includes(pattern)) {
        if (!entrypoints.includes(p)) {
          entrypoints.push(p);
        }
      }
    }
  }

  return entrypoints.slice(0, 15);
}

const KEY_BASENAMES = new Set([
  'package.json',
  'pom.xml',
  'build.gradle',
  'requirements.txt',
  'pyproject.toml',
  'go.mod',
  'Cargo.toml',
  'tsconfig.json',
  'docker-compose.yml',
  'Dockerfile',
  'README.md',
  'AGENTS.md',
  'CLAUDE.md'
]);

const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript/React',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript/React',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.py': 'Python',
  '.go': 'Go',
  '.dart': 'Dart',
  '.sql': 'SQL/PL/SQL',
  '.pks': 'Oracle PL/SQL',
  '.pkb': 'Oracle PL/SQL',
  '.prc': 'Oracle PL/SQL',
  '.fnc': 'Oracle PL/SQL',
  '.trg': 'Oracle PL/SQL',
  '.json': 'JSON',
  '.xml': 'XML',
  '.yml': 'YAML',
  '.yaml': 'YAML',
  '.md': 'Markdown'
};

const FRAMEWORK_SIGNALS = [
  'spring-boot',
  'react',
  'vue',
  'angular',
  'nextjs',
  'nestjs',
  'express',
  'fastapi',
  'django',
  'flutter',
  'expo',
  'react-native'
];
