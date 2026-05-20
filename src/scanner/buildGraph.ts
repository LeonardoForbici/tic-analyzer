import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { yieldToEventLoop } from '../utils/fileUtils';
import type { ArchitectureInventory, ModuleInventoryItem } from './detectStack';
import { classifyDependency, externalDependencyLabel } from './classifyDependency';
import {
  extractJavaClassName,
  extractJavaPackage,
  packageNameFromSpecifier,
  parseImports
} from './parseImports';
import type { ParsedImport } from './parseImports';
import type { CancellationLike, ScannedFile } from './scanFiles';
import type { ScanResult } from './scanWorkspace';
import type { DatabaseConfig } from '../utils/config';

export type GraphEdgeType = 'IMPORTS' | 'USES_PACKAGE' | 'DEPENDS_ON' | 'CALLS' | 'READS_TABLE' | 'WRITES_TABLE' | 'TRIGGERS_ON' | 'DEFINES' | 'USES_CURSOR';
export type GraphRiskLevel = 'low' | 'medium' | 'high';
export type GraphNodeOrigin = 'internal' | 'external' | 'framework';

export interface GraphNode {
  id: string;
  label: string;
  path: string;
  type: string;
  module: string;
  language: string;
  riskLevel?: GraphRiskLevel;
  /** Se este nó é interno ao workspace ('internal') ou uma dependência de terceiros. */
  origin: GraphNodeOrigin;
  /** Preenchido quando origin === 'framework'. Ex: 'Spring', 'React'. */
  frameworkName?: string;
  /** Se o nó deve aparecer na visualização padrão do grafo (interno=true, externo/framework=false). */
  visibleByDefault: boolean;
}

export interface ExternalDependencySummary {
  specifier: string;
  label: string;
  origin: 'external' | 'framework';
  frameworkName?: string;
  count: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: GraphEdgeType;
  sourcePath: string;
  targetPath: string;
  evidence?: string;
}

export interface LightweightGraph {
  projectName: string;
  rootPath: string;
  generatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    internalEdges: number;
    externalEdges: number;
    modules: Record<string, number>;
    centralFiles: Array<{ path: string; degree: number }>;
    /** Resumo de dependências externas/framework (para external-dependencies.json). */
    externalDependencies: ExternalDependencySummary[];
  };
}

const SOURCE_EXTENSIONS = new Set(['.java', '.ts', '.tsx', '.js', '.jsx']);

export interface BuildGraphOptions {
  token?: CancellationLike;
  /** Configuração de banco para limitar nós no grafo visual (PLSQL Enterprise Mode). */
  database?: Pick<DatabaseConfig, 'largeMode' | 'maxTablesInGraph' | 'maxVisualNodes'>;
}

export async function buildGraph(scan: ScanResult, inventory: ArchitectureInventory, options: BuildGraphOptions = {}): Promise<LightweightGraph> {
  const moduleByPath = buildModuleIndex(inventory.modules);
  const fileByPath = new Map(scan.files.map((file) => [file.relativePath, file]));
  const nodeByPath = new Map<string, GraphNode>();
  const packageNodes = new Map<string, GraphNode>();
  const javaClassIndex = await buildJavaClassIndex(scan, options);

  for (const file of scan.files) {
    throwIfCancelled(options.token);
    const node = createFileNode(file, moduleByPath.get(file.relativePath) ?? 'unknown');
    nodeByPath.set(file.relativePath, node);
  }

  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();

  for (const [index, file] of scan.files.entries()) {
    throwIfCancelled(options.token);
    if (!SOURCE_EXTENSIONS.has(file.extension) && file.relativePath !== 'package.json') {
      continue;
    }

    const imports = await parseImports(scan.rootPath, file);
    for (const item of imports) {
      const edge = resolveImportEdge(item, file, scan, fileByPath, nodeByPath, packageNodes, javaClassIndex);
      if (!edge) {
        continue;
      }

      const key = `${edge.from}|${edge.to}|${edge.type}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push(edge);
      }
    }

    if (index % 50 === 0) {
      await yieldToEventLoop();
    }
  }

  const nodes = [...nodeByPath.values(), ...packageNodes.values()];
  addPlSqlGraph(inventory, nodeByPath, nodes, edges, edgeKeys, options.database);
  applyRiskLevels(nodes, edges);

  return {
    projectName: scan.projectName,
    rootPath: scan.rootPath,
    generatedAt: new Date().toISOString(),
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => `${a.from}|${a.to}`.localeCompare(`${b.from}|${b.to}`)),
    stats: buildStats(nodes, edges)
  };
}

/** Padrões de nomes de classe Java/Spring que não devem aparecer no grafo de banco. */
const JAVA_CLASS_PREFIXES = ['java.', 'org.springframework', 'com.sun.', 'javax.', 'sun.', 'jdk.'];

function isJavaClassName(name: string): boolean {
  const lower = name.toLowerCase();
  return JAVA_CLASS_PREFIXES.some((prefix) => lower.startsWith(prefix)) || /^[a-z]+\.[A-Z]/.test(name);
}

function addPlSqlGraph(
  inventory: ArchitectureInventory,
  fileNodes: Map<string, GraphNode>,
  nodes: GraphNode[],
  edges: GraphEdge[],
  edgeKeys: Set<string>,
  dbConfig?: Pick<DatabaseConfig, 'largeMode' | 'maxTablesInGraph' | 'maxVisualNodes'>
): void {
  if (!inventory.plsql.detected) {
    return;
  }

  const maxTableNodes = dbConfig?.largeMode ? (dbConfig.maxTablesInGraph ?? 100) : 10000;

  const plsqlNodes = new Map<string, GraphNode>();
  const routineByName = new Map<string, GraphNode>();
  const tableByName = new Map<string, GraphNode>();

  for (const entity of inventory.plsql.entities) {
    const node: GraphNode = {
      id: entity.id,
      label: entity.name,
      path: entity.file,
      type: plsqlType(entity.kind),
      module: 'database',
      language: 'PL/SQL',
      origin: 'internal',
      visibleByDefault: true
    };
    plsqlNodes.set(entity.id, node);
    nodes.push(node);
    if (['package', 'package_body', 'procedure', 'function', 'trigger', 'cursor'].includes(entity.kind)) {
      routineByName.set(entity.name.toUpperCase(), node);
      routineByName.set(entity.name.split('.').pop()?.toUpperCase() ?? entity.name.toUpperCase(), node);
    }

    const fileNode = fileNodes.get(entity.file);
    if (fileNode) {
      pushEdge(edges, edgeKeys, fileNode.id, node.id, 'DEFINES', entity.file, entity.name);
    }
    if (entity.kind === 'table') {
      tableByName.set(entity.name.toUpperCase(), node);
    }
  }

  for (const table of inventory.plsql.tableReferences) {
    // Filtrar nomes de classe Java/Spring que não devem aparecer no grafo de banco
    if (isJavaClassName(table.name)) {
      continue;
    }
    if (!tableByName.has(table.name)) {
      if (tableByName.size >= maxTableNodes) {
        break;
      }
      const node: GraphNode = {
        id: `plsql:table:${table.name}`,
        label: table.name,
        path: table.name,
        type: 'plsql_table',
        module: 'database',
        language: 'PL/SQL',
        origin: 'internal',
        visibleByDefault: true
      };
      tableByName.set(table.name, node);
      nodes.push(node);
    }
  }

  for (const dependency of inventory.plsql.dependencies) {
    const source = plsqlNodes.get(dependency.sourceId);
    if (!source) {
      continue;
    }

    let target: GraphNode | undefined;
    if (dependency.targetKind === 'table') {
      target = tableByName.get(dependency.targetName.toUpperCase());
    } else {
      target = routineByName.get(dependency.targetName.toUpperCase()) ?? routineByName.get(dependency.targetName.split('.').pop()?.toUpperCase() ?? dependency.targetName.toUpperCase());
    }

    if (!target && dependency.targetKind === 'routine') {
      target = {
        id: `plsql:external_routine:${dependency.targetName}`,
        label: dependency.targetName,
        path: dependency.targetName,
        type: 'plsql_procedure',
        module: 'database',
        language: 'PL/SQL',
        origin: 'internal',
        visibleByDefault: true
      };
      routineByName.set(dependency.targetName.toUpperCase(), target);
      nodes.push(target);
    }

    if (target) {
      pushEdge(edges, edgeKeys, source.id, target.id, dependency.edgeType, dependency.file, target.path);
    }
  }
}

function pushEdge(edges: GraphEdge[], edgeKeys: Set<string>, from: string, to: string, type: GraphEdgeType, sourcePath: string, targetPath: string): void {
  const key = `${from}|${to}|${type}`;
  if (edgeKeys.has(key)) {
    return;
  }
  edgeKeys.add(key);
  edges.push({ from, to, type, sourcePath, targetPath });
}

function plsqlType(kind: string): string {
  return {
    package: 'plsql_package',
    package_body: 'plsql_package_body',
    procedure: 'plsql_procedure',
    function: 'plsql_function',
    trigger: 'plsql_trigger',
    table: 'plsql_table',
    view: 'plsql_view',
    cursor: 'plsql_cursor',
    type: 'plsql_type',
    synonym: 'plsql_synonym'
  }[kind] ?? 'plsql_object';
}

export function renderArchitectureMarkdown(graph: LightweightGraph, inventory: ArchitectureInventory): string {
  const modules = Object.entries(graph.stats.modules)
    .sort((a, b) => b[1] - a[1])
    .map(([module, count]) => `- ${module}: ${count} nós`)
    .join('\n');

  const dependencyLines = summarizeDependencies(graph)
    .slice(0, 40)
    .map((item) => `- ${item.from} -> ${item.to}: ${item.count} aresta(s) de dependência`)
    .join('\n');

  const centralFiles = graph.stats.centralFiles
    .slice(0, 15)
    .map((file) => `- ${file.path}: ${file.degree} conexão(ões)`)
    .join('\n');

  const couplingLines = findCouplings(graph)
    .slice(0, 30)
    .map((item) => `- ${item.sourceModule} -> ${item.targetModule}: ${item.count} aresta(s)`)
    .join('\n');

  const stacks = inventory.stack
    .filter((signal) => signal.detected)
    .map((signal) => `- ${signal.name}: ${signal.evidence.join(', ')}`)
    .join('\n');

  return `# Arquitetura do TIC Coder Lite

Gerado em: ${graph.generatedAt}
Projeto: ${graph.projectName}
Raiz: ${graph.rootPath}

## Resumo do Grafo

- Nós: ${graph.stats.nodeCount}
- Arestas: ${graph.stats.edgeCount}
- Arestas internas: ${graph.stats.internalEdges}
- Arestas externas/pacotes: ${graph.stats.externalEdges}

## Stack Detectada

${stacks || '- Nenhum sinal de stack detectado'}

## Módulos Encontrados

${modules || '- Nenhum módulo encontrado'}

## Principais Dependências

${dependencyLines || '- Nenhuma dependência de import/pacote resolvida'}

## Arquivos Centrais

${centralFiles || '- Nenhum arquivo central detectado ainda'}

## Acoplamentos Possíveis

${couplingLines || '- Nenhum acoplamento entre módulos detectado'}

## Notas de Leitura para Agentes de IA

- graph.json é um grafo leve de arquivos inspirado em conceitos de grafo em memória, não um banco de dados.
- IMPORTS significa que um arquivo fonte importa outro arquivo do workspace.
- USES_PACKAGE significa que um arquivo fonte importa um pacote que não foi resolvido como arquivo local.
- DEPENDS_ON significa que metadados de pacote declaram uma dependência.
- Arquivos marcados com risco médio ou alto têm mais conexões no grafo e merecem cuidado extra antes de edições.
`;
}

function resolveImportEdge(
  item: ParsedImport,
  file: ScannedFile,
  scan: ScanResult,
  fileByPath: Map<string, ScannedFile>,
  nodeByPath: Map<string, GraphNode>,
  packageNodes: Map<string, GraphNode>,
  javaClassIndex: Map<string, string>
): GraphEdge | undefined {
  const sourceNode = nodeByPath.get(item.sourcePath);
  if (!sourceNode) {
    return undefined;
  }

  const evidence = item.lineNumber > 0 ? `${item.rawText} (linha ${item.lineNumber})` : item.rawText;

  if (item.kind === 'package-dependency') {
    const packageNode = getPackageNode(packageNodes, item.specifier);
    return { from: sourceNode.id, to: packageNode.id, type: 'DEPENDS_ON', sourcePath: item.sourcePath, targetPath: packageNode.path, evidence };
  }

  const targetPath = item.language === 'java'
    ? resolveJavaImport(item.specifier, javaClassIndex)
    : resolveScriptImport(item.specifier, file.relativePath, scan.rootPath, fileByPath);

  if (targetPath && targetPath !== file.relativePath) {
    const targetNode = nodeByPath.get(targetPath);
    if (targetNode) {
      return { from: sourceNode.id, to: targetNode.id, type: 'IMPORTS', sourcePath: item.sourcePath, targetPath, evidence };
    }
  }

  if (!item.specifier.startsWith('.') && !item.specifier.startsWith('/') && !item.specifier.startsWith('@/')) {
    const packageName = item.language === 'java' ? javaExternalPackage(item.specifier) : packageNameFromSpecifier(item.specifier);
    const packageNode = getPackageNode(packageNodes, packageName);
    return { from: sourceNode.id, to: packageNode.id, type: 'USES_PACKAGE', sourcePath: item.sourcePath, targetPath: packageNode.path, evidence };
  }

  return undefined;
}

function resolveScriptImport(specifier: string, sourcePath: string, rootPath: string, fileByPath: Map<string, ScannedFile>): string | undefined {
  const candidates: string[] = [];

  if (specifier.startsWith('.')) {
    candidates.push(normalizeRelativePath(path.join(path.dirname(sourcePath), specifier)));
  } else if (specifier.startsWith('@/')) {
    candidates.push(normalizeRelativePath(path.join('src', specifier.slice(2))));
  } else if (specifier.startsWith('/')) {
    candidates.push(normalizeRelativePath(specifier.slice(1)));
  }

  for (const candidate of candidates.flatMap(expandScriptCandidates)) {
    if (fileByPath.has(candidate)) {
      return candidate;
    }
  }

  return resolveTsConfigPathAlias(specifier, rootPath, fileByPath);
}

function expandScriptCandidates(basePath: string): string[] {
  const extension = path.extname(basePath);
  if (extension) {
    return [basePath];
  }

  return [
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.json`,
    `${basePath}/index.ts`,
    `${basePath}/index.tsx`,
    `${basePath}/index.js`,
    `${basePath}/index.jsx`
  ];
}

function resolveJavaImport(specifier: string, javaClassIndex: Map<string, string>): string | undefined {
  if (specifier.endsWith('.*')) {
    const packagePrefix = specifier.slice(0, -2);
    return [...javaClassIndex.entries()].find(([className]) => className.startsWith(`${packagePrefix}.`))?.[1];
  }

  const exact = javaClassIndex.get(specifier);
  if (exact) {
    return exact;
  }

  const parts = specifier.split('.');
  while (parts.length > 1) {
    parts.pop();
    const candidate = javaClassIndex.get(parts.join('.'));
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

async function buildJavaClassIndex(scan: ScanResult, options: BuildGraphOptions): Promise<Map<string, string>> {
  const index = new Map<string, string>();

  for (const [fileIndex, file] of scan.files.filter((item) => item.extension === '.java').entries()) {
    throwIfCancelled(options.token);
    const content = await readText(path.join(scan.rootPath, file.relativePath));
    const packageName = extractJavaPackage(content);
    const className = extractJavaClassName(content) ?? path.basename(file.relativePath, '.java');
    if (packageName) {
      index.set(`${packageName}.${className}`, file.relativePath);
    }

    if (fileIndex % 50 === 0) {
      await yieldToEventLoop();
    }
  }

  return index;
}

function createFileNode(file: ScannedFile, module: string): GraphNode {
  return {
    id: file.relativePath,
    label: path.basename(file.relativePath),
    path: file.relativePath,
    type: typeFromFile(file),
    module,
    language: languageFromExtension(file.extension),
    origin: 'internal',
    visibleByDefault: true
  };
}

function getPackageNode(packageNodes: Map<string, GraphNode>, packageName: string): GraphNode {
  const id = `package:${packageName}`;
  const existing = packageNodes.get(id);
  if (existing) {
    return existing;
  }

  const classification = classifyDependency(packageName, false);
  const node: GraphNode = {
    id,
    label: packageName,
    path: packageName,
    type: 'external_dependency',
    module: 'external',
    language: 'package',
    origin: classification.origin === 'framework' ? 'framework' : 'external',
    frameworkName: classification.frameworkName,
    visibleByDefault: false
  };
  packageNodes.set(id, node);
  return node;
}

function buildModuleIndex(modules: ModuleInventoryItem[]): Map<string, string> {
  const moduleByPath = new Map<string, string>();
  for (const module of modules) {
    for (const file of module.files) {
      moduleByPath.set(file, module.kind);
    }
  }
  return moduleByPath;
}

function applyRiskLevels(nodes: GraphNode[], edges: GraphEdge[]): void {
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }

  for (const node of nodes) {
    const value = degree.get(node.id) ?? 0;
    if (value >= 10) {
      node.riskLevel = 'high';
    } else if (value >= 5) {
      node.riskLevel = 'medium';
    }
  }
}

function buildStats(nodes: GraphNode[], edges: GraphEdge[]): LightweightGraph['stats'] {
  const modules: Record<string, number> = {};
  const degree = new Map<string, number>();

  for (const node of nodes) {
    modules[node.module] = (modules[node.module] ?? 0) + 1;
  }

  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }

  const externalDependencies = buildExternalDependencySummary(nodes, edges);

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    internalEdges: edges.filter((edge) => edge.type === 'IMPORTS').length,
    externalEdges: edges.filter((edge) => edge.type !== 'IMPORTS').length,
    modules: Object.fromEntries(Object.entries(modules).sort((a, b) => b[1] - a[1])),
    centralFiles: [...degree.entries()]
      .filter(([id]) => !id.startsWith('package:'))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([filePath, value]) => ({ path: filePath, degree: value })),
    externalDependencies
  };
}

function buildExternalDependencySummary(nodes: GraphNode[], edges: GraphEdge[]): ExternalDependencySummary[] {
  const incomingEdgeCount = new Map<string, number>();
  for (const edge of edges) {
    incomingEdgeCount.set(edge.to, (incomingEdgeCount.get(edge.to) ?? 0) + 1);
  }

  const summaryMap = new Map<string, ExternalDependencySummary>();
  for (const node of nodes) {
    if (node.origin === 'internal') {
      continue;
    }
    const count = incomingEdgeCount.get(node.id) ?? 0;
    const existing = summaryMap.get(node.label);
    if (existing) {
      existing.count += count;
    } else {
      summaryMap.set(node.label, {
        specifier: node.label,
        label: externalDependencyLabel(node.label),
        origin: node.origin as 'external' | 'framework',
        frameworkName: node.frameworkName,
        count
      });
    }
  }

  return [...summaryMap.values()]
    .sort((a, b) => b.count - a.count || a.specifier.localeCompare(b.specifier));
}

function summarizeDependencies(graph: LightweightGraph): Array<{ from: string; to: string; count: number }> {
  const byPair = new Map<string, { from: string; to: string; count: number }>();
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));

  for (const edge of graph.edges) {
    const source = nodes.get(edge.from);
    const target = nodes.get(edge.to);
    if (!source || !target) {
      continue;
    }

    const key = `${source.label}|${target.label}`;
    const current = byPair.get(key) ?? { from: source.path, to: target.path, count: 0 };
    current.count += 1;
    byPair.set(key, current);
  }

  return [...byPair.values()].sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));
}

function findCouplings(graph: LightweightGraph): Array<{ sourceModule: string; targetModule: string; count: number }> {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const couplings = new Map<string, { sourceModule: string; targetModule: string; count: number }>();

  for (const edge of graph.edges.filter((item) => item.type === 'IMPORTS')) {
    const source = nodes.get(edge.from);
    const target = nodes.get(edge.to);
    if (!source || !target || source.module === target.module) {
      continue;
    }

    const key = `${source.module}|${target.module}`;
    const current = couplings.get(key) ?? { sourceModule: source.module, targetModule: target.module, count: 0 };
    current.count += 1;
    couplings.set(key, current);
  }

  return [...couplings.values()].sort((a, b) => b.count - a.count);
}

function typeFromFile(file: ScannedFile): string {
  if (file.relativePath.endsWith('package.json')) {
    return 'package_manifest';
  }

  if (file.extension === '.java') {
    return 'java_source';
  }

  if (['.ts', '.tsx', '.js', '.jsx'].includes(file.extension)) {
    return 'script_source';
  }

  if (['.sql', '.pks', '.pkb', '.prc', '.fnc', '.pkg', '.trg', '.pls', '.plsql'].includes(file.extension)) {
    return 'plsql_script';
  }

  if (['.json', '.xml', '.yml', '.yaml'].includes(file.extension)) {
    return 'config';
  }

  if (file.extension === '.md') {
    return 'documentation';
  }

  return 'file';
}

function languageFromExtension(extension: string): string {
  const languages: Record<string, string> = {
    '.java': 'Java',
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript React',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript React',
    '.json': 'JSON',
    '.xml': 'XML',
    '.yml': 'YAML',
    '.yaml': 'YAML',
    '.sql': 'SQL',
    '.pks': 'PL/SQL',
    '.pkb': 'PL/SQL',
    '.prc': 'PL/SQL',
    '.fnc': 'PL/SQL',
    '.pkg': 'PL/SQL',
    '.trg': 'PL/SQL',
    '.pls': 'PL/SQL',
    '.plsql': 'PL/SQL',
    '.md': 'Markdown'
  };

  return languages[extension] ?? 'Desconhecido';
}

function javaExternalPackage(specifier: string): string {
  const parts = specifier.replace(/\.\*$/, '').split('.');
  return parts.slice(0, Math.min(3, parts.length)).join('.');
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join('/');
}

function resolveTsConfigPathAlias(specifier: string, rootPath: string, fileByPath: Map<string, ScannedFile>): string | undefined {
  void rootPath;
  void specifier;
  void fileByPath;
  return undefined;
}

async function readText(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function throwIfCancelled(token?: CancellationLike): void {
  if (token?.isCancellationRequested) {
    throw new Error('TIC_CODER_LITE_CANCELLED');
  }
}
