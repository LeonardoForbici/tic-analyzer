"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGraph = buildGraph;
exports.renderArchitectureMarkdown = renderArchitectureMarkdown;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const fileUtils_1 = require("../utils/fileUtils");
const classifyDependency_1 = require("./classifyDependency");
const parseImports_1 = require("./parseImports");
const SOURCE_EXTENSIONS = new Set(['.java', '.ts', '.tsx', '.js', '.jsx']);
async function buildGraph(scan, inventory, options = {}) {
    const moduleByPath = buildModuleIndex(inventory.modules);
    const fileByPath = new Map(scan.files.map((file) => [file.relativePath, file]));
    const nodeByPath = new Map();
    const packageNodes = new Map();
    const javaClassIndex = await buildJavaClassIndex(scan, options);
    for (const file of scan.files) {
        throwIfCancelled(options.token);
        const node = createFileNode(file, moduleByPath.get(file.relativePath) ?? 'unknown');
        nodeByPath.set(file.relativePath, node);
    }
    const edges = [];
    const edgeKeys = new Set();
    for (const [index, file] of scan.files.entries()) {
        throwIfCancelled(options.token);
        if (!SOURCE_EXTENSIONS.has(file.extension) && file.relativePath !== 'package.json') {
            continue;
        }
        const imports = await (0, parseImports_1.parseImports)(scan.rootPath, file);
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
            await (0, fileUtils_1.yieldToEventLoop)();
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
function isJavaClassName(name) {
    const lower = name.toLowerCase();
    return JAVA_CLASS_PREFIXES.some((prefix) => lower.startsWith(prefix)) || /^[a-z]+\.[A-Z]/.test(name);
}
function addPlSqlGraph(inventory, fileNodes, nodes, edges, edgeKeys, dbConfig) {
    if (!inventory.plsql.detected) {
        return;
    }
    const maxTableNodes = dbConfig?.largeMode ? (dbConfig.maxTablesInGraph ?? 100) : 10000;
    const plsqlNodes = new Map();
    const routineByName = new Map();
    const tableByName = new Map();
    for (const entity of inventory.plsql.entities) {
        const node = {
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
            const node = {
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
        let target;
        if (dependency.targetKind === 'table') {
            target = tableByName.get(dependency.targetName.toUpperCase());
        }
        else {
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
function pushEdge(edges, edgeKeys, from, to, type, sourcePath, targetPath) {
    const key = `${from}|${to}|${type}`;
    if (edgeKeys.has(key)) {
        return;
    }
    edgeKeys.add(key);
    edges.push({ from, to, type, sourcePath, targetPath });
}
function plsqlType(kind) {
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
function renderArchitectureMarkdown(graph, inventory) {
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
function resolveImportEdge(item, file, scan, fileByPath, nodeByPath, packageNodes, javaClassIndex) {
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
        const packageName = item.language === 'java' ? javaExternalPackage(item.specifier) : (0, parseImports_1.packageNameFromSpecifier)(item.specifier);
        const packageNode = getPackageNode(packageNodes, packageName);
        return { from: sourceNode.id, to: packageNode.id, type: 'USES_PACKAGE', sourcePath: item.sourcePath, targetPath: packageNode.path, evidence };
    }
    return undefined;
}
function resolveScriptImport(specifier, sourcePath, rootPath, fileByPath) {
    const candidates = [];
    if (specifier.startsWith('.')) {
        candidates.push(normalizeRelativePath(path.join(path.dirname(sourcePath), specifier)));
    }
    else if (specifier.startsWith('@/')) {
        candidates.push(normalizeRelativePath(path.join('src', specifier.slice(2))));
    }
    else if (specifier.startsWith('/')) {
        candidates.push(normalizeRelativePath(specifier.slice(1)));
    }
    for (const candidate of candidates.flatMap(expandScriptCandidates)) {
        if (fileByPath.has(candidate)) {
            return candidate;
        }
    }
    return resolveTsConfigPathAlias(specifier, rootPath, fileByPath);
}
function expandScriptCandidates(basePath) {
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
function resolveJavaImport(specifier, javaClassIndex) {
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
async function buildJavaClassIndex(scan, options) {
    const index = new Map();
    for (const [fileIndex, file] of scan.files.filter((item) => item.extension === '.java').entries()) {
        throwIfCancelled(options.token);
        const content = await readText(path.join(scan.rootPath, file.relativePath));
        const packageName = (0, parseImports_1.extractJavaPackage)(content);
        const className = (0, parseImports_1.extractJavaClassName)(content) ?? path.basename(file.relativePath, '.java');
        if (packageName) {
            index.set(`${packageName}.${className}`, file.relativePath);
        }
        if (fileIndex % 50 === 0) {
            await (0, fileUtils_1.yieldToEventLoop)();
        }
    }
    return index;
}
function createFileNode(file, module) {
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
function getPackageNode(packageNodes, packageName) {
    const id = `package:${packageName}`;
    const existing = packageNodes.get(id);
    if (existing) {
        return existing;
    }
    const classification = (0, classifyDependency_1.classifyDependency)(packageName, false);
    const node = {
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
function buildModuleIndex(modules) {
    const moduleByPath = new Map();
    for (const module of modules) {
        for (const file of module.files) {
            moduleByPath.set(file, module.kind);
        }
    }
    return moduleByPath;
}
function applyRiskLevels(nodes, edges) {
    const degree = new Map();
    for (const edge of edges) {
        degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
        degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    }
    for (const node of nodes) {
        const value = degree.get(node.id) ?? 0;
        if (value >= 10) {
            node.riskLevel = 'high';
        }
        else if (value >= 5) {
            node.riskLevel = 'medium';
        }
    }
}
function buildStats(nodes, edges) {
    const modules = {};
    const degree = new Map();
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
function buildExternalDependencySummary(nodes, edges) {
    const incomingEdgeCount = new Map();
    for (const edge of edges) {
        incomingEdgeCount.set(edge.to, (incomingEdgeCount.get(edge.to) ?? 0) + 1);
    }
    const summaryMap = new Map();
    for (const node of nodes) {
        if (node.origin === 'internal') {
            continue;
        }
        const count = incomingEdgeCount.get(node.id) ?? 0;
        const existing = summaryMap.get(node.label);
        if (existing) {
            existing.count += count;
        }
        else {
            summaryMap.set(node.label, {
                specifier: node.label,
                label: (0, classifyDependency_1.externalDependencyLabel)(node.label),
                origin: node.origin,
                frameworkName: node.frameworkName,
                count
            });
        }
    }
    return [...summaryMap.values()]
        .sort((a, b) => b.count - a.count || a.specifier.localeCompare(b.specifier));
}
function summarizeDependencies(graph) {
    const byPair = new Map();
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
function findCouplings(graph) {
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const couplings = new Map();
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
function typeFromFile(file) {
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
function languageFromExtension(extension) {
    const languages = {
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
function javaExternalPackage(specifier) {
    const parts = specifier.replace(/\.\*$/, '').split('.');
    return parts.slice(0, Math.min(3, parts.length)).join('.');
}
function normalizeRelativePath(value) {
    return value.split(path.sep).join('/');
}
function resolveTsConfigPathAlias(specifier, rootPath, fileByPath) {
    void rootPath;
    void specifier;
    void fileByPath;
    return undefined;
}
async function readText(filePath) {
    try {
        return await fs.readFile(filePath, 'utf8');
    }
    catch {
        return '';
    }
}
function throwIfCancelled(token) {
    if (token?.isCancellationRequested) {
        throw new Error('TIC_CODER_LITE_CANCELLED');
    }
}
//# sourceMappingURL=buildGraph.js.map