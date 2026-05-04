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
exports.detectStack = detectStack;
exports.renderInventoryMarkdown = renderInventoryMarkdown;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const fileUtils_1 = require("../utils/fileUtils");
const ignoreRules_1 = require("./ignoreRules");
const detectJavaSpring_1 = require("./detectJavaSpring");
const detectPlSql_1 = require("./detectPlSql");
const detectTypeScriptProject_1 = require("./detectTypeScriptProject");
const MODULE_KINDS = ['controller', 'service', 'repository', 'entity', 'dto', 'config', 'security', 'database', 'unknown'];
async function detectStack(scan, options = {}) {
    const projectFiles = await collectProjectFiles(scan.rootPath, Math.min(scan.limits?.maxFiles ?? 10000, 10000));
    const fileSet = new Set([...scan.files.map((file) => file.relativePath), ...projectFiles]);
    const javaSpring = await (0, detectJavaSpring_1.detectJavaSpring)(scan);
    const typeScript = await (0, detectTypeScriptProject_1.detectTypeScriptProject)(scan);
    const plsql = await (0, detectPlSql_1.detectPlSql)(scan, options.plsql ?? {});
    const databaseEvidence = detectDatabaseEvidence(fileSet);
    const dockerEvidence = findByBasename(fileSet, ['docker-compose.yml', 'docker-compose.yaml']);
    return {
        projectName: scan.projectName,
        rootPath: scan.rootPath,
        generatedAt: new Date().toISOString(),
        stack: buildStackSignals(fileSet, javaSpring, typeScript, databaseEvidence, dockerEvidence),
        javaSpring,
        typeScript,
        modules: buildModules(scan, javaSpring),
        database: {
            detected: databaseEvidence.length > 0 || plsql.detected,
            evidence: databaseEvidence
        },
        docker: {
            detected: dockerEvidence.length > 0,
            evidence: dockerEvidence
        },
        plsql
    };
}
function renderInventoryMarkdown(inventory, scan) {
    const detectedStacks = inventory.stack.filter((signal) => signal.detected);
    const moduleSections = inventory.modules
        .filter((module) => module.files.length > 0)
        .map((module) => {
        const files = module.files.slice(0, 25).map((file) => `- ${file}`).join('\n');
        return `### ${titleCase(module.kind)}\n\n${files}`;
    })
        .join('\n\n');
    const endpoints = inventory.javaSpring.files
        .flatMap((file) => file.endpoints.map((endpoint) => `- ${endpoint} -> ${file.path}`))
        .slice(0, 80)
        .join('\n');
    const frameworkLines = inventory.typeScript.frameworks.map((framework) => `- ${framework}`).join('\n');
    const stackLines = detectedStacks.map((signal) => `- ${signal.name}: ${signal.evidence.join(', ')}`).join('\n');
    const dependencyLines = Object.entries(inventory.typeScript.dependencies).slice(0, 30).map(([name, version]) => `- ${name}: ${version}`).join('\n');
    const plsqlLines = [
        `- Arquivos PL/SQL: ${inventory.plsql.files.length}`,
        `- Packages: ${inventory.plsql.counts.package}`,
        `- Package bodies: ${inventory.plsql.counts.package_body}`,
        `- Procedures: ${inventory.plsql.counts.procedure}`,
        `- Functions: ${inventory.plsql.counts.function}`,
        `- Triggers: ${inventory.plsql.counts.trigger}`,
        `- Tabelas referenciadas: ${inventory.plsql.tableReferences.length}`
    ].join('\n');
    const plsqlTables = inventory.plsql.tableReferences
        .slice(0, 20)
        .map((table) => `- ${table.name}: ${table.reads} leitura(s), ${table.writes} escrita(s)`)
        .join('\n');
    return `# Inventario do TIC Coder Lite

Gerado em: ${inventory.generatedAt}
Projeto: ${inventory.projectName}
Raiz: ${inventory.rootPath}

## Resumo do Scan

- Arquivos analisados: ${scan.totals.files}
- Linhas analisadas: ${scan.totals.lines}
- Bytes analisados: ${scan.totals.size}

## Stack Detectada

${stackLines || '- Nenhum sinal convencional de stack detectado'}

## Arquitetura por Convencao

${moduleSections || '- Nenhum modulo Java/Spring classificado ainda'}

## Sinais Java / Spring

- Anotacoes Spring detectadas: ${inventory.javaSpring.detected ? 'sim' : 'nao'}
- Arquivos Java classificados: ${inventory.javaSpring.files.length}

${formatAnnotationCounts(inventory.javaSpring.annotations)}

## Endpoints HTTP

${endpoints || '- Nenhuma anotacao de mapeamento Spring detectada'}

## Sinais TypeScript / Node

${frameworkLines || '- Nenhum sinal de framework TypeScript/Node detectado'}

### Dependencias de Runtime

${dependencyLines || '- Nenhuma dependencia de package.json detectada'}

## Dados e Infraestrutura

- Evidencia de banco/SQL: ${inventory.database.evidence.join(', ') || 'nenhuma'}
- Evidencia de Docker: ${inventory.docker.evidence.join(', ') || 'nenhuma'}

## Banco / PL/SQL

${inventory.plsql.detected ? plsqlLines : '- Nenhum PL/SQL detectado'}

### Tabelas mais referenciadas

${plsqlTables || '- Nenhuma referencia a tabela detectada'}

## Orientacao para Agentes de IA

- Trate este arquivo como inventario local baseado em convencoes, nao como grafo semantico completo.
- Prefira arquivos listados em Arquitetura por Convencao ao alterar comportamento em uma camada especifica.
- Confirme modulos inferidos abrindo os arquivos citados antes de editar.
- Regras criticas podem estar escondidas em packages, triggers e procedures PL/SQL.
- Este inventario foi gerado sem IA, bancos, RAG, servidores ou servicos remotos.
`;
}
function buildStackSignals(fileSet, javaSpring, typeScript, databaseEvidence, dockerEvidence) {
    const plsqlEvidence = [...fileSet].filter((file) => isPlSqlPath(file)).slice(0, 20);
    return [
        signal('java-maven', 'Java / Maven', findByBasename(fileSet, ['pom.xml'])),
        signal('java-gradle', 'Java / Gradle', findByBasename(fileSet, ['build.gradle', 'build.gradle.kts'])),
        signal('node', 'Node.js', findByBasename(fileSet, ['package.json'])),
        signal('react', 'React', typeScript.frameworks.includes('React'), dependencyEvidence(typeScript, ['react', 'react-dom'])),
        signal('angular', 'Angular', findByBasename(fileSet, ['angular.json']).length > 0 || typeScript.frameworks.includes('Angular'), dependencyEvidence(typeScript, ['@angular/core']).concat(findByBasename(fileSet, ['angular.json']))),
        signal('next', 'Next.js', findByBasename(fileSet, ['next.config.js', 'next.config.ts']).length > 0 || typeScript.frameworks.includes('Next.js'), dependencyEvidence(typeScript, ['next']).concat(findByBasename(fileSet, ['next.config.js', 'next.config.ts']))),
        signal('vite', 'Vite', findByBasename(fileSet, ['vite.config.ts', 'vite.config.js']).length > 0 || typeScript.frameworks.includes('Vite'), dependencyEvidence(typeScript, ['vite']).concat(findByBasename(fileSet, ['vite.config.ts', 'vite.config.js']))),
        signal('spring-boot', 'Spring Boot', javaSpring.detected || findByBasename(fileSet, ['application.yml', 'application.yaml', 'application.properties']).length > 0, findByBasename(fileSet, ['application.yml', 'application.yaml', 'application.properties']).concat(Object.keys(javaSpring.annotations).map((annotation) => `@${annotation}`))),
        signal('docker', 'Docker Compose', dockerEvidence.length > 0, dockerEvidence),
        signal('database', 'SQL / Database', databaseEvidence.length > 0, databaseEvidence),
        signal('oracle-plsql', 'Oracle PL/SQL', plsqlEvidence.length > 0, plsqlEvidence)
    ];
}
function buildModules(scan, javaSpring) {
    const javaFilesByKind = new Map(javaSpring.files.map((file) => [file.path, file.kind]));
    const filesByKind = new Map(MODULE_KINDS.map((kind) => [kind, new Set()]));
    for (const file of scan.files) {
        if (!['.java', '.ts', '.tsx', '.js', '.jsx', '.sql', '.pks', '.pkb', '.prc', '.fnc', '.pkg', '.trg', '.pls', '.plsql'].includes(file.extension)) {
            continue;
        }
        const kind = isPlSqlPath(file.relativePath) ? 'database' : javaFilesByKind.get(file.relativePath) ?? classifyByPath(file.relativePath);
        filesByKind.get(kind)?.add(file.relativePath);
    }
    return MODULE_KINDS.map((kind) => ({
        kind,
        files: [...(filesByKind.get(kind) ?? new Set())].sort()
    }));
}
function classifyByPath(relativePath) {
    const lower = relativePath.toLowerCase();
    const baseName = path.basename(lower, path.extname(lower));
    if (isPlSqlPath(relativePath) || lower.includes('/db/') || lower.includes('/database/') || lower.includes('/oracle/') || lower.includes('/plsql/') || lower.includes('/migrations/')) {
        return 'database';
    }
    if (lower.includes('/controller/') || lower.includes('/controllers/') || baseName.endsWith('controller')) {
        return 'controller';
    }
    if (lower.includes('/service/') || lower.includes('/services/') || baseName.endsWith('service')) {
        return 'service';
    }
    if (lower.includes('/repository/') || lower.includes('/repositories/') || baseName.endsWith('repository') || baseName.endsWith('repo')) {
        return 'repository';
    }
    if (lower.includes('/entity/') || lower.includes('/entities/') || lower.includes('/model/') || lower.includes('/models/')) {
        return 'entity';
    }
    if (lower.includes('/dto/') || lower.includes('/dtos/') || baseName.endsWith('dto') || baseName.endsWith('request') || baseName.endsWith('response')) {
        return 'dto';
    }
    if (lower.includes('/config/') || lower.includes('/configs/') || baseName.includes('config') || baseName.endsWith('rc')) {
        return 'config';
    }
    if (lower.includes('/security/') || lower.includes('/auth/') || baseName.includes('security') || baseName.includes('auth')) {
        return 'security';
    }
    return 'unknown';
}
async function collectProjectFiles(rootPath, maxFiles) {
    const files = [];
    await walk(rootPath, rootPath, files, maxFiles);
    return files.sort();
}
async function walk(rootPath, currentPath, files, maxFiles) {
    if (files.length >= maxFiles) {
        return;
    }
    let entries;
    try {
        entries = await fs.readdir(currentPath, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const entry of entries) {
        if (files.length >= maxFiles) {
            return;
        }
        if (entry.isDirectory()) {
            if (!(0, ignoreRules_1.shouldIgnoreDirectory)(entry.name)) {
                await walk(rootPath, path.join(currentPath, entry.name), files, maxFiles);
            }
            continue;
        }
        if (entry.isFile()) {
            files.push(normalizeRelativePath(path.relative(rootPath, path.join(currentPath, entry.name))));
            if (files.length % 250 === 0) {
                await (0, fileUtils_1.yieldToEventLoop)();
            }
        }
    }
}
function detectDatabaseEvidence(fileSet) {
    const evidence = new Set();
    for (const file of fileSet) {
        const lower = file.toLowerCase();
        if (lower.endsWith('/schema.sql') || lower === 'schema.sql' || lower.endsWith('.sql') || lower.includes('/migrations/') || lower.includes('/migration/') || isPlSqlPath(lower)) {
            evidence.add(file);
        }
    }
    return [...evidence].sort().slice(0, 80);
}
function signal(id, name, detectedOrEvidence, evidence = []) {
    if (Array.isArray(detectedOrEvidence)) {
        return { id, name, detected: detectedOrEvidence.length > 0, evidence: detectedOrEvidence };
    }
    return { id, name, detected: detectedOrEvidence, evidence };
}
function dependencyEvidence(typeScript, names) {
    return names
        .filter((name) => typeScript.dependencies[name] || typeScript.devDependencies[name])
        .map((name) => `${name}@${typeScript.dependencies[name] ?? typeScript.devDependencies[name]}`);
}
function findByBasename(fileSet, basenames) {
    const expected = new Set(basenames.map((name) => name.toLowerCase()));
    return [...fileSet]
        .filter((file) => expected.has(path.basename(file).toLowerCase()))
        .sort();
}
function formatAnnotationCounts(annotations) {
    const lines = Object.entries(annotations).map(([annotation, count]) => `- @${annotation}: ${count}`);
    return lines.length > 0 ? lines.join('\n') : '- Nenhuma anotacao Spring encontrada';
}
function titleCase(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
function normalizeRelativePath(value) {
    return value.split(path.sep).join('/');
}
function isPlSqlPath(file) {
    return /\.(sql|pks|pkb|prc|fnc|pkg|trg|pls|plsql)$/i.test(file);
}
//# sourceMappingURL=detectStack.js.map