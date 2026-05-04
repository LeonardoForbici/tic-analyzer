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
exports.writeTicCodeFolder = writeTicCodeFolder;
const vscode = __importStar(require("vscode"));
const buildGraph_1 = require("../scanner/buildGraph");
const detectProjects_1 = require("../scanner/detectProjects");
const detectStack_1 = require("../scanner/detectStack");
const detectRisks_1 = require("../scanner/detectRisks");
const generateAgentContextMd_1 = require("./generateAgentContextMd");
const generateConfidenceReportMd_1 = require("./generateConfidenceReportMd");
const generateQuestionsMd_1 = require("./generateQuestionsMd");
const generateReverseEngineering_1 = require("./reverseEngineering/generateReverseEngineering");
const databaseLargeMode_1 = require("../scanner/databaseLargeMode");
const config_1 = require("../utils/config");
const runReversaLikePipeline_1 = require("../reversa-engine/runReversaLikePipeline");
async function writeTicCodeFolder(root, summary, extensionUri) {
    const ticCodeDir = vscode.Uri.joinPath(root.uri, '.tic-code');
    const artifacts = {
        scanJson: vscode.Uri.joinPath(ticCodeDir, 'scan.json'),
        modulesJson: vscode.Uri.joinPath(ticCodeDir, 'modules.json'),
        inventoryMd: vscode.Uri.joinPath(ticCodeDir, 'inventory.md'),
        graphJson: vscode.Uri.joinPath(ticCodeDir, 'graph.json'),
        architectureMd: vscode.Uri.joinPath(ticCodeDir, 'architecture.md'),
        risksJson: vscode.Uri.joinPath(ticCodeDir, 'risks.json'),
        risksMd: vscode.Uri.joinPath(ticCodeDir, 'risks.md'),
        agentContextMd: vscode.Uri.joinPath(ticCodeDir, 'agent-context.md'),
        confidenceReportMd: vscode.Uri.joinPath(ticCodeDir, 'confidence-report.md'),
        questionsMd: vscode.Uri.joinPath(ticCodeDir, 'questions.md')
    };
    await vscode.workspace.fs.createDirectory(ticCodeDir);
    await writeText(artifacts.scanJson, `${JSON.stringify(summary.scan, null, 2)}\n`);
    await writeText(artifacts.modulesJson, `${JSON.stringify(summary.inventory, null, 2)}\n`);
    await writeText(artifacts.inventoryMd, (0, detectStack_1.renderInventoryMarkdown)(summary.inventory, summary.scan));
    await writeText(artifacts.graphJson, `${JSON.stringify(summary.graph, null, 2)}\n`);
    await writeText(artifacts.architectureMd, (0, buildGraph_1.renderArchitectureMarkdown)(summary.graph, summary.inventory));
    await writeText(artifacts.risksJson, `${JSON.stringify(summary.risks, null, 2)}\n`);
    await writeText(artifacts.risksMd, (0, detectRisks_1.renderRisksMarkdown)(summary.risks));
    await writeText(artifacts.agentContextMd, (0, generateAgentContextMd_1.generateAgentContextMd)(summary));
    await writeText(artifacts.confidenceReportMd, (0, generateConfidenceReportMd_1.generateConfidenceReportMd)(summary));
    await writeText(artifacts.questionsMd, (0, generateQuestionsMd_1.generateQuestionsMd)(summary));
    // Resumo de dependências externas para ferramentas e programação reversa
    const externalDepsJson = vscode.Uri.joinPath(ticCodeDir, 'external-dependencies.json');
    await writeText(externalDepsJson, `${JSON.stringify(summary.graph.stats.externalDependencies, null, 2)}\n`);
    await writeProjectArtifacts(root, summary);
    await (0, generateReverseEngineering_1.writeReverseEngineering)(root, summary);
    // Motor Reversa — gera .tic-code/reversa/ e expande .tic-code/reverse-engineering/
    await (0, runReversaLikePipeline_1.runReversaLikePipeline)(root, summary, extensionUri);
    return artifacts;
}
async function writeProjectArtifacts(root, summary) {
    const projects = (0, detectProjects_1.detectProjects)(summary.scan, summary.risks);
    for (const project of projects) {
        const projectDir = vscode.Uri.joinPath(root.uri, '.tic-code', 'projects', project.id);
        await vscode.workspace.fs.createDirectory(projectDir);
        // Filtrar arquivos, nós e arestas para o projeto
        const projectFiles = filterProjectFiles(summary, project);
        const projectNodeIds = new Set(getProjectNodeIds(summary, project, projectFiles));
        // Criar grafo filtrado
        const graph = {
            ...summary.graph,
            projectName: project.name,
            nodes: summary.graph.nodes.filter((node) => projectNodeIds.has(node.id)),
            edges: summary.graph.edges.filter((edge) => projectNodeIds.has(edge.from) && projectNodeIds.has(edge.to)),
            stats: buildGraphStats(summary.graph.nodes.filter((node) => projectNodeIds.has(node.id)), summary.graph.edges.filter((edge) => projectNodeIds.has(edge.from) && projectNodeIds.has(edge.to)))
        };
        // Criar riscos filtrados
        const risks = {
            ...summary.risks,
            risks: summary.risks.risks.filter((risk) => isRiskInProject(risk, project, projectFiles)),
            summary: summarizeRisks(summary.risks.risks.filter((risk) => isRiskInProject(risk, project, projectFiles)))
        };
        // Criar scan filtrado
        const scan = {
            ...summary.scan,
            files: projectFiles,
            totals: {
                files: projectFiles.length,
                lines: projectFiles.reduce((total, file) => total + file.lines, 0),
                size: projectFiles.reduce((total, file) => total + file.size, 0)
            }
        };
        // Escrever artefatos do projeto
        await writeText(vscode.Uri.joinPath(projectDir, 'scan.json'), `${JSON.stringify(scan, null, 2)}\n`);
        await writeText(vscode.Uri.joinPath(projectDir, 'graph.json'), `${JSON.stringify(graph, null, 2)}\n`);
        await writeText(vscode.Uri.joinPath(projectDir, 'risks.json'), `${JSON.stringify(risks, null, 2)}\n`);
        // Gerar markdown de contexto específico por tipo
        const contextMd = generateProjectContextMd(summary, project, scan, risks, graph);
        await writeText(vscode.Uri.joinPath(projectDir, 'agent-context.md'), contextMd);
        // Para projetos de banco de dados: escrever índices (PLSQL Enterprise Mode)
        if (project.kind === 'database' && summary.inventory.plsql.detected) {
            await writeDatabaseIndexArtifacts(root, projectDir, summary);
        }
    }
}
function filterProjectFiles(summary, project) {
    const fileSet = new Set();
    switch (project.kind) {
        case 'backend':
            for (const file of summary.scan.files) {
                if (isBackendFile(file.relativePath)) {
                    fileSet.add(file.relativePath);
                }
            }
            break;
        case 'frontend':
            for (const file of summary.scan.files) {
                if (isFrontendFile(file.relativePath)) {
                    fileSet.add(file.relativePath);
                }
            }
            break;
        case 'mobile':
            for (const file of summary.scan.files) {
                if (isMobileFile(file.relativePath)) {
                    fileSet.add(file.relativePath);
                }
            }
            break;
        case 'infra':
            for (const file of summary.scan.files) {
                if (isInfraFile(file.relativePath)) {
                    fileSet.add(file.relativePath);
                }
            }
            break;
        case 'shared':
            for (const file of summary.scan.files) {
                if (isSharedFile(file.relativePath)) {
                    fileSet.add(file.relativePath);
                }
            }
            break;
        case 'database':
            for (const file of summary.scan.files) {
                if (isDatabaseFile(file.relativePath, file.extension)) {
                    fileSet.add(file.relativePath);
                }
            }
            break;
    }
    return summary.scan.files.filter((file) => fileSet.has(file.relativePath));
}
function getProjectNodeIds(summary, project, projectFiles) {
    const projectFileSet = new Set(projectFiles.map((f) => f.relativePath));
    if (project.kind === 'database') {
        const plsql = summary.inventory.plsql;
        const databaseFileSet = new Set(plsql.files);
        return summary.graph.nodes
            .filter((node) => node.module === 'database' ||
            databaseFileSet.has(node.path) ||
            node.type.startsWith('plsql_'))
            .map((node) => node.id);
    }
    return summary.graph.nodes
        .filter((node) => projectFileSet.has(node.path) || node.module === project.id)
        .map((node) => node.id);
}
function isRiskInProject(risk, project, projectFiles) {
    const projectFileSet = new Set(projectFiles.map((f) => f.relativePath));
    if (project.kind === 'database' && risk.category === 'plsql') {
        return true;
    }
    return projectFileSet.has(risk.file);
}
function isBackendFile(path) {
    const lower = path.toLowerCase();
    return (lower.includes('backend') ||
        lower.includes('src/main/java') ||
        lower.includes('src/main/kotlin') ||
        lower.includes('api') ||
        lower.includes('server'));
}
function isFrontendFile(path) {
    const lower = path.toLowerCase();
    return (lower.includes('frontend') ||
        lower.includes('/src/') ||
        lower.includes('public') ||
        lower.includes('components') ||
        lower.includes('pages'));
}
function isMobileFile(path) {
    const lower = path.toLowerCase();
    return (lower.includes('mobile') ||
        lower.includes('android') ||
        lower.includes('ios') ||
        lower.includes('/lib/') ||
        lower.includes('react-native'));
}
function isInfraFile(path) {
    const lower = path.toLowerCase();
    return (lower.includes('docker') ||
        lower.includes('k8s') ||
        lower.includes('helm') ||
        lower.includes('terraform') ||
        lower.includes('.github/workflows') ||
        lower.includes('infra'));
}
function isSharedFile(path) {
    const lower = path.toLowerCase();
    return lower.includes('shared') || lower.includes('libs') || lower.includes('packages');
}
function isDatabaseFile(path, extension) {
    const PLSQL_EXTENSIONS = new Set(['.sql', '.pks', '.pkb', '.prc', '.fnc', '.pkg', '.trg', '.pls', '.plsql']);
    const DATABASE_DIRS = new Set(['db', 'database', 'sql', 'oracle', 'plsql', 'migrations']);
    const first = path.split('/')[0]?.toLowerCase();
    return PLSQL_EXTENSIONS.has(extension.toLowerCase()) || DATABASE_DIRS.has(first);
}
function generateProjectContextMd(summary, project, scan, risks, graph) {
    const header = `# Contexto: ${project.name}

**Workspace:** ${summary.workspaceName}  
**Projeto:** ${project.name}  
**Tipo:** ${project.kind}  
**Stack:** ${project.stack.join(', ')}  
**Arquivos:** ${scan.totals.files}  
**Linhas:** ${scan.totals.lines}  
**Riscos:** ${risks.summary.total}  

`;
    if (project.kind === 'database') {
        return header + generateDatabaseContextDetails(summary);
    }
    // Contexto genérico para outros projetos
    const modules = Object.entries(graph.stats.modules || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => `- ${name}: ${count} nó(s)`)
        .join('\n');
    const risksByLevel = `
- Críticos: ${risks.summary.critical}
- Altos: ${risks.summary.high}
- Médios: ${risks.summary.medium}
- Baixos: ${risks.summary.low}
`;
    const topRisks = risks.risks.slice(0, 20).map((r) => `- **${r.level.toUpperCase()}**: ${r.title} (${r.file})`).join('\n');
    const centralFiles = graph.stats.centralFiles
        .slice(0, 10)
        .map((f) => `- ${f.path}: ${f.degree} conexão(ões)`)
        .join('\n');
    return (header +
        `## Estrutura de Módulos

${modules || '- Nenhum módulo detectado.'}

## Riscos por Severidade

${risksByLevel}

## Top 20 Riscos

${topRisks || '- Nenhum risco detectado.'}

## Arquivos Centrais (Hub)

${centralFiles || '- Nenhum arquivo central detectado.'}

## Recomendações

1. Revise os riscos críticos e altos primeiro
2. Considere o impacto ao refatorar arquivos centrais
3. Mantenha a coesão dentro dos módulos
4. Documente regras de negócio críticas
`);
}
function generateDatabaseContextDetails(summary) {
    const plsql = summary.inventory.plsql;
    const packages = plsql.entities.filter((entity) => entity.kind === 'package' || entity.kind === 'package_body').slice(0, 30);
    const routines = plsql.entities.filter((entity) => entity.kind === 'procedure' || entity.kind === 'function').slice(0, 30);
    const triggers = plsql.entities.filter((entity) => entity.kind === 'trigger').slice(0, 30);
    return `
## Packages Detectados

${packages.map((entity) => `- ${entity.name} (${entity.kind}) em ${entity.file}:${entity.line}`).join('\n') || '- Nenhum package detectado.'}

## Procedures e Functions Críticas

${routines.map((entity) => `- ${entity.name} em ${entity.file}:${entity.line}`).join('\n') || '- Nenhuma procedure/function detectada.'}

## Triggers

${triggers.map((entity) => `- ${entity.name}${entity.targetTable ? ` ON ${entity.targetTable}` : ''} em ${entity.file}:${entity.line}`).join('\n') || '- Nenhum trigger detectado.'}

## Tabelas Mais Referenciadas

${plsql.tableReferences.slice(0, 20).map((table) => `- ${table.name}: ${table.reads} leitura(s), ${table.writes} escrita(s)`).join('\n') || '- Nenhuma tabela referenciada.'}

## Aviso para IA

- Regras críticas podem estar escondidas no banco, especialmente em packages, triggers e procedures.
- Não assuma que a aplicação é a única fonte de regra de negócio.
- Não altere transações, COMMIT, ROLLBACK, triggers ou SQL dinâmico sem validação humana.
- Leia primeiro packages, triggers, tabelas mais referenciadas e riscos transacionais.
`;
}
function buildGraphStats(nodes, edges) {
    const modules = {};
    const degree = new Map();
    for (const node of nodes) {
        modules[node.module] = (modules[node.module] ?? 0) + 1;
    }
    for (const edge of edges) {
        degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
        degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    }
    const incomingEdgeCount = new Map();
    for (const edge of edges) {
        incomingEdgeCount.set(edge.to, (incomingEdgeCount.get(edge.to) ?? 0) + 1);
    }
    const externalDependencies = nodes
        .filter((node) => node.origin !== 'internal')
        .map((node) => ({
        specifier: node.label,
        label: node.label,
        origin: node.origin,
        frameworkName: node.frameworkName,
        count: incomingEdgeCount.get(node.id) ?? 0
    }))
        .sort((a, b) => b.count - a.count);
    return {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        internalEdges: edges.filter((edge) => edge.type === 'IMPORTS').length,
        externalEdges: edges.filter((edge) => edge.type !== 'IMPORTS').length,
        modules,
        centralFiles: [...degree.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([filePath, value]) => ({ path: filePath, degree: value })),
        externalDependencies
    };
}
function summarizeRisks(risks) {
    return {
        total: risks.length,
        low: risks.filter((risk) => risk.level === 'low').length,
        medium: risks.filter((risk) => risk.level === 'medium').length,
        high: risks.filter((risk) => risk.level === 'high').length,
        critical: risks.filter((risk) => risk.level === 'critical').length
    };
}
async function writeText(uri, content) {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
}
async function writeDatabaseIndexArtifacts(_root, projectDir, summary) {
    const config = (0, config_1.getTicCoderLiteConfig)();
    if (!config.database.enableTableIndex) {
        return;
    }
    const { index, summary: dbSummary, graphSummary } = (0, databaseLargeMode_1.buildDatabaseLargeModeData)(summary.inventory.plsql, config.database);
    const indexDir = vscode.Uri.joinPath(projectDir, 'index');
    await vscode.workspace.fs.createDirectory(indexDir);
    await writeText(vscode.Uri.joinPath(indexDir, 'tables.json'), `${JSON.stringify(index.tables, null, 2)}\n`);
    await writeText(vscode.Uri.joinPath(indexDir, 'views.json'), `${JSON.stringify(index.views, null, 2)}\n`);
    await writeText(vscode.Uri.joinPath(indexDir, 'packages.json'), `${JSON.stringify(index.packages, null, 2)}\n`);
    await writeText(vscode.Uri.joinPath(indexDir, 'procedures.json'), `${JSON.stringify(index.procedures, null, 2)}\n`);
    await writeText(vscode.Uri.joinPath(indexDir, 'functions.json'), `${JSON.stringify(index.functions, null, 2)}\n`);
    await writeText(vscode.Uri.joinPath(indexDir, 'triggers.json'), `${JSON.stringify(index.triggers, null, 2)}\n`);
    await writeText(vscode.Uri.joinPath(projectDir, 'summary.json'), `${JSON.stringify(dbSummary, null, 2)}\n`);
    await writeText(vscode.Uri.joinPath(projectDir, 'graph.summary.json'), `${JSON.stringify(graphSummary, null, 2)}\n`);
    await writeText(vscode.Uri.joinPath(projectDir, 'critical-objects.json'), `${JSON.stringify(index.criticalObjects, null, 2)}\n`);
}
//# sourceMappingURL=writeTicCodeFolder.js.map