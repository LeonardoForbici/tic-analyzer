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
exports.detectRisks = detectRisks;
exports.renderRisksMarkdown = renderRisksMarkdown;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const fileUtils_1 = require("../utils/fileUtils");
const detectPlSql_1 = require("./detectPlSql");
const EMPTY_SUMMARY = {
    total: 0,
    low: 0,
    medium: 0,
    high: 0,
    critical: 0
};
async function detectRisks(scan, inventory, graph, options = {}) {
    const risks = [];
    const contentCache = new Map();
    for (const [index, file] of scan.files.entries()) {
        throwIfCancelled(options.token);
        // Arquivos de lock, minificados e mapas não produzem riscos de domínio úteis
        if (isNoisyMetaFile(file.relativePath)) {
            continue;
        }
        detectFileSizeRisks(file.relativePath, file.lines, risks);
        if (isCodeFile(file.extension)) {
            const content = await readFile(scan.rootPath, file.relativePath, contentCache);
            detectTodoFixme(file.relativePath, content, risks);
            detectEmptyCatch(file.relativePath, content, risks);
            detectSqlConcatenation(file.relativePath, content, risks);
            detectHardcodedRoles(file.relativePath, content, risks);
        }
        if (file.extension === '.java') {
            const content = await readFile(scan.rootPath, file.relativePath, contentCache);
            detectJavaImportVolume(file.relativePath, content, risks);
            detectLongJavaMethods(file.relativePath, content, risks);
        }
        if (['.ts', '.tsx'].includes(file.extension)) {
            const content = await readFile(scan.rootPath, file.relativePath, contentCache);
            detectTypeScriptAny(file.relativePath, content, risks);
            detectDirectProcessEnv(file.relativePath, content, risks);
        }
        if (['.js', '.jsx'].includes(file.extension)) {
            const content = await readFile(scan.rootPath, file.relativePath, contentCache);
            detectDirectProcessEnv(file.relativePath, content, risks);
        }
        if (index % 50 === 0) {
            await (0, fileUtils_1.yieldToEventLoop)();
        }
    }
    detectLayerViolations(graph, risks);
    detectCircularDependencies(graph, risks);
    detectControllerEndpointVolume(inventory, risks);
    detectLargePlSqlBase(inventory, risks);
    risks.push(...await (0, detectPlSql_1.detectPlSqlRisks)(scan, inventory.plsql));
    const uniqueRisks = dedupeRisks(risks).sort(compareRisks);
    return {
        projectName: scan.projectName,
        rootPath: scan.rootPath,
        generatedAt: new Date().toISOString(),
        summary: summarizeRisks(uniqueRisks),
        risks: uniqueRisks
    };
}
function renderRisksMarkdown(report) {
    const riskLines = report.risks
        .map((risk) => {
        const location = risk.line ? `${risk.file}:${risk.line}` : risk.file;
        return `### ${risk.level.toUpperCase()} - ${risk.title}

- ID: ${risk.id}
- Local: ${location}
- Motivo: ${risk.reason}
- Evidência: ${risk.evidence}
- Recomendação: ${risk.recommendation}`;
    })
        .join('\n\n');
    return `# Riscos do TIC Coder Lite

Gerado em: ${report.generatedAt}
Projeto: ${report.projectName}
Raiz: ${report.rootPath}

## Resumo

- Total: ${report.summary.total}
- Críticos: ${report.summary.critical}
- Altos: ${report.summary.high}
- Médios: ${report.summary.medium}
- Baixos: ${report.summary.low}

## Achados

${riskLines || '- Nenhum risco determinístico detectado'}
`;
}
function detectFileSizeRisks(file, lines, risks) {
    if (lines > 1500) {
        risks.push(createRisk('large-file-critical', 'critical', 'Arquivo tem mais de 1500 linhas', file, undefined, `O arquivo tem ${lines} linhas.`, 'Separe responsabilidades em módulos menores antes de mudanças amplas.', `${lines} linhas`));
        return;
    }
    if (lines > 800) {
        risks.push(createRisk('large-file-high', 'high', 'Arquivo tem mais de 800 linhas', file, undefined, `O arquivo tem ${lines} linhas.`, 'Revise fronteiras de responsabilidade e considere extrair seções coesas.', `${lines} linhas`));
    }
}
function detectJavaImportVolume(file, content, risks) {
    const importCount = countMatches(content, /^\s*import\s+/gm);
    if (importCount > 35) {
        risks.push(createRisk('java-many-imports', 'high', 'Classe Java tem muitos imports', file, firstLineOf(content, /^\s*import\s+/m), `A classe declara ${importCount} imports.`, 'Verifique se a classe está acumulando responsabilidades demais.', `${importCount} declarações de import`));
    }
    else if (importCount > 20) {
        risks.push(createRisk('java-many-imports', 'medium', 'Classe Java tem muitos imports', file, firstLineOf(content, /^\s*import\s+/m), `A classe declara ${importCount} imports.`, 'Revise se as dependências podem ser reduzidas ou agrupadas atrás de colaboradores menores.', `${importCount} declarações de import`));
    }
}
function detectTodoFixme(file, content, risks) {
    const markers = ['TO' + 'DO', 'FIX' + 'ME'];
    content.split(/\r\n|\r|\n/).forEach((text, index) => {
        const comment = extractCommentText(text);
        if (!comment) {
            return;
        }
        if (markers.some((marker) => new RegExp(`\\b${marker}\\b`, 'i').test(comment))) {
            risks.push(createRisk('todo-fixme', 'low', 'Marcador TODO/FIXME encontrado', file, index + 1, 'O código contém um marcador de trabalho não resolvido.', 'Resolva o marcador ou converta em trabalho rastreado com responsável e contexto.', trimEvidence(text)));
        }
    });
}
function detectEmptyCatch(file, content, risks) {
    const pattern = /catch\s*(?:\([^)]*\))?\s*\{\s*(?:(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)\s*)?\}/g;
    let match;
    while ((match = pattern.exec(content)) !== null) {
        risks.push(createRisk('empty-catch', 'high', 'Bloco catch vazio', file, lineAt(content, match.index), 'Uma exceção é capturada sem tratamento ou log.', 'Trate o erro explicitamente, relance a exceção ou registre contexto suficiente para diagnóstico.', trimEvidence(match[0])));
    }
}
function detectSqlConcatenation(file, content, risks) {
    // Arquivos de webview/UI/template/assets geram falsos positivos porque o HTML usa <select>,
    // textos usam "from"/"where" como preposições, e CSS usa seletores com essas palavras.
    if (isWebviewOrUiFile(file)) {
        return;
    }
    // Requer estrutura DML real: SELECT col FROM / INSERT INTO / UPDATE tbl SET / DELETE FROM / MERGE INTO
    // seguida de concatenação com variável — não apenas qualquer string contendo palavra SQL
    const pattern = /["'`][^"'`\n]{0,150}\b(SELECT\s+[\w\s*,]+FROM\s+\w|INSERT\s+INTO\s+\w|UPDATE\s+\w[\s\S]{0,60}\bSET\b|DELETE\s+FROM\s+\w|MERGE\s+INTO\s+\w)[\s\S]{0,180}["'`]\s*\+/gi;
    let match;
    while ((match = pattern.exec(content)) !== null) {
        risks.push(createRisk('sql-concatenation', 'critical', 'SQL concatenado em string', file, lineAt(content, match.index), 'SQL parece ser montado com concatenação de strings, o que pode causar SQL injection e consultas frágeis.', 'Use consultas parametrizadas, prepared statements ou query builder com valores vinculados.', trimEvidence(match[0])));
    }
}
function isWebviewOrUiFile(file) {
    const lower = file.toLowerCase();
    return (lower.includes('webview') ||
        lower.includes('/html') ||
        lower.includes('assets') ||
        lower.includes('template') ||
        lower.endsWith('.html') ||
        lower.endsWith('.min.js') ||
        lower.endsWith('.map'));
}
function detectHardcodedRoles(file, content, risks) {
    const pattern = /\b(?:hasRole|hasAnyRole|roles?|authorit(?:y|ies)|GrantedAuthority|PreAuthorize|Secured)\b[\s\S]{0,120}["'`](ROLE_[A-Z0-9_]+|ADMIN|USER|MANAGER|OWNER|SUPER_ADMIN)["'`]/g;
    let match;
    while ((match = pattern.exec(content)) !== null) {
        risks.push(createRisk('hardcoded-role', 'medium', 'Papel hardcoded detectado', file, lineAt(content, match.index), 'Valores de papéis de autorização estão embutidos diretamente no código.', 'Mova nomes de papéis para uma camada central de política/configuração e documente seu significado.', trimEvidence(match[0])));
    }
}
function detectLayerViolations(graph, risks) {
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const edge of graph.edges.filter((item) => item.type === 'IMPORTS')) {
        const source = nodes.get(edge.from);
        const target = nodes.get(edge.to);
        if (!source || !target) {
            continue;
        }
        if (source.module === 'controller' && target.module === 'repository') {
            risks.push(createRisk('controller-direct-repository', 'high', 'Controller depende diretamente de repository', edge.sourcePath, undefined, 'Um controller importa um repository diretamente, desviando da camada de service.', 'Mova orquestração/regra de negócio para um service e mantenha controllers finos.', `${edge.sourcePath} -> ${edge.targetPath}`));
        }
        if (source.module === 'service' && target.module === 'controller') {
            risks.push(createRisk('service-imports-controller', 'high', 'Service importa controller', edge.sourcePath, undefined, 'Um service depende de um tipo da camada web/controller.', 'Inverta a dependência para controllers chamarem services, não o contrário.', `${edge.sourcePath} -> ${edge.targetPath}`));
        }
    }
}
function detectCircularDependencies(graph, risks) {
    const adjacency = new Map();
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const edge of graph.edges.filter((item) => item.type === 'IMPORTS')) {
        adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
    }
    const cycles = findCycles(adjacency, 8).slice(0, 20);
    for (const cycle of cycles) {
        const readable = [...cycle, cycle[0]].map((id) => nodes.get(id)?.path ?? id).join(' -> ');
        risks.push(createRisk('circular-dependency', 'critical', 'Possível dependência circular', nodes.get(cycle[0])?.path ?? cycle[0], undefined, 'O grafo de imports contém um ciclo direcionado.', 'Extraia contratos/helpers compartilhados ou inverta uma dependência para quebrar o ciclo.', readable));
    }
}
function detectTypeScriptAny(file, content, risks) {
    const pattern = /(?::\s*any\b|<\s*any\s*>|\bas\s+any\b|Array\s*<\s*any\s*>)/g;
    let match;
    while ((match = pattern.exec(content)) !== null) {
        risks.push(createRisk('typescript-any', 'medium', 'Uso de any no TypeScript', file, lineAt(content, match.index), 'O código abre mão da checagem de tipos do TypeScript.', 'Substitua any por interface mais estreita, generic, unknown com validação ou tipo explícito de domínio.', trimEvidence(match[0])));
    }
}
function detectDirectProcessEnv(file, content, risks) {
    if (isConfigFile(file)) {
        return;
    }
    const pattern = /\bprocess\.env(?:\.[A-Za-z_][\w]*|\[['"`][^'"`]+['"`]\])/g;
    let match;
    while ((match = pattern.exec(content)) !== null) {
        risks.push(createRisk('direct-process-env', 'medium', 'process.env usado fora da camada de configuração', file, lineAt(content, match.index), 'Variáveis de ambiente são lidas diretamente fora de uma fronteira de configuração.', 'Leia valores de ambiente em um módulo dedicado de configuração e injete settings tipados no restante do código.', trimEvidence(match[0])));
    }
}
function detectLongJavaMethods(file, content, risks) {
    const methodPattern = /(?:public|protected|private|static|final|synchronized|abstract|\s)+[\w<>\[\], ?]+\s+([A-Za-z_$][\w$]*)\s*\([^;{}]*\)\s*(?:throws\s+[^{]+)?\{/g;
    let match;
    while ((match = methodPattern.exec(content)) !== null) {
        const openBraceIndex = content.indexOf('{', match.index);
        const closeBraceIndex = findMatchingBrace(content, openBraceIndex);
        if (closeBraceIndex < 0) {
            continue;
        }
        const methodText = content.slice(openBraceIndex, closeBraceIndex + 1);
        const lines = countLines(methodText);
        if (lines > 120) {
            risks.push(createRisk('long-java-method', 'high', 'Método Java muito longo', file, lineAt(content, match.index), `O método ${match[1]} tem aproximadamente ${lines} linhas.`, 'Extraia métodos privados menores ou colaboradores ao redor de responsabilidades distintas.', `${match[1]}: ${lines} linhas`));
        }
        else if (lines > 80) {
            risks.push(createRisk('long-java-method', 'medium', 'Método Java longo', file, lineAt(content, match.index), `O método ${match[1]} tem aproximadamente ${lines} linhas.`, 'Considere extrair blocos coesos e adicionar testes focados antes de editar.', `${match[1]}: ${lines} linhas`));
        }
    }
}
function detectControllerEndpointVolume(inventory, risks) {
    for (const file of inventory.javaSpring.files.filter((item) => item.kind === 'controller')) {
        if (file.endpoints.length > 15) {
            risks.push(createRisk('many-controller-endpoints', 'high', 'Controller expõe muitos endpoints', file.path, undefined, `Controller tem ${file.endpoints.length} anotações de mapeamento.`, 'Separe endpoints por recurso/caso de uso ou mova orquestração para services dedicados.', `${file.endpoints.length} endpoints`));
        }
        else if (file.endpoints.length > 8) {
            risks.push(createRisk('many-controller-endpoints', 'medium', 'Controller tem muitos endpoints', file.path, undefined, `Controller tem ${file.endpoints.length} anotações de mapeamento.`, 'Verifique se o controller está assumindo responsabilidades demais de API.', `${file.endpoints.length} endpoints`));
        }
    }
}
function detectLargePlSqlBase(inventory, risks) {
    const totalTables = inventory.plsql.tableReferences.length;
    if (totalTables >= 25000) {
        risks.push(createRisk('plsql-large-base-25000', 'critical', 'Base PL/SQL muito grande detectada (>= 25.000 tabelas)', '.tic-code/projects/database/index/tables.json', undefined, `Foram detectadas ${totalTables} tabelas referenciadas em artefatos PL/SQL.`, 'Ative e mantenha o PLSQL Enterprise Mode para renderização resumida e uso de contexto filtrado na IA Local.', `${totalTables} tabelas indexadas`));
        return;
    }
    if (totalTables >= 5000) {
        risks.push(createRisk('plsql-large-base-5000', 'high', 'Base PL/SQL grande detectada (>= 5.000 tabelas)', '.tic-code/projects/database/index/tables.json', undefined, `Foram detectadas ${totalTables} tabelas referenciadas em artefatos PL/SQL.`, 'Use visualização resumida (top objetos críticos) e busca por índice para evitar sobrecarga na WebView.', `${totalTables} tabelas indexadas`));
    }
}
function findCycles(adjacency, maxCycles) {
    const cycles = [];
    const seen = new Set();
    for (const start of adjacency.keys()) {
        dfs(start, start, [], new Set());
        if (cycles.length >= maxCycles) {
            break;
        }
    }
    function dfs(start, current, stack, visiting) {
        if (cycles.length >= maxCycles) {
            return;
        }
        visiting.add(current);
        stack.push(current);
        for (const next of adjacency.get(current) ?? []) {
            if (next === start && stack.length > 1) {
                const cycle = normalizeCycle(stack);
                const key = cycle.join('|');
                if (!seen.has(key)) {
                    seen.add(key);
                    cycles.push(cycle);
                }
                continue;
            }
            if (!visiting.has(next) && stack.length < 12) {
                dfs(start, next, stack, visiting);
            }
        }
        stack.pop();
        visiting.delete(current);
    }
    return cycles;
}
function normalizeCycle(cycle) {
    let start = 0;
    for (let i = 1; i < cycle.length; i += 1) {
        if (cycle[i].localeCompare(cycle[start]) < 0) {
            start = i;
        }
    }
    return [...cycle.slice(start), ...cycle.slice(0, start)];
}
function createRisk(id, level, title, file, line, reason, recommendation, evidence) {
    return { id, level, title, file, line, reason, recommendation, evidence };
}
function summarizeRisks(risks) {
    const summary = { ...EMPTY_SUMMARY };
    for (const risk of risks) {
        summary.total += 1;
        summary[risk.level] += 1;
    }
    return summary;
}
function dedupeRisks(risks) {
    const seen = new Set();
    return risks.filter((risk) => {
        const key = `${risk.id}|${risk.file}|${risk.line ?? 0}|${risk.evidence}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
function compareRisks(a, b) {
    const levelWeight = { critical: 4, high: 3, medium: 2, low: 1 };
    return levelWeight[b.level] - levelWeight[a.level] || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0);
}
async function readFile(rootPath, relativePath, cache) {
    const cached = cache.get(relativePath);
    if (cached !== undefined) {
        return cached;
    }
    try {
        const content = await fs.readFile(path.join(rootPath, relativePath), 'utf8');
        cache.set(relativePath, content);
        return content;
    }
    catch {
        cache.set(relativePath, '');
        return '';
    }
}
function isCodeFile(extension) {
    return ['.java', '.ts', '.tsx', '.js', '.jsx', '.sql'].includes(extension);
}
/** Retorna true para arquivos que geram ruído mas não fornecem riscos de domínio úteis */
function isNoisyMetaFile(file) {
    const lower = file.toLowerCase();
    const basename = lower.split('/').pop() ?? lower;
    return (basename === 'package-lock.json' ||
        basename === 'yarn.lock' ||
        basename === 'pnpm-lock.yaml' ||
        lower.endsWith('.min.js') ||
        lower.endsWith('.map') ||
        lower.includes('node_modules/') ||
        lower.includes('/dist/') ||
        lower.includes('/build/') ||
        lower.includes('/out/'));
}
function isConfigFile(file) {
    const lower = file.toLowerCase();
    return lower.includes('/config/') || lower.includes('/configs/') || /(^|\/)(config|env|settings|environment)[\w.-]*\.(ts|js|tsx|jsx)$/.test(lower);
}
function extractCommentText(line) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('*')) {
        return trimmed;
    }
    const lineComment = line.indexOf('//');
    const blockComment = line.indexOf('/*');
    const indexes = [lineComment, blockComment].filter((index) => index >= 0);
    if (indexes.length === 0) {
        return undefined;
    }
    return line.slice(Math.min(...indexes));
}
function firstLineOf(content, pattern) {
    const match = pattern.exec(content);
    return match ? lineAt(content, match.index) : undefined;
}
function lineAt(content, index) {
    return content.slice(0, index).split(/\r\n|\r|\n/).length;
}
function countMatches(content, pattern) {
    return [...content.matchAll(pattern)].length;
}
function trimEvidence(value) {
    return value.replace(/\s+/g, ' ').trim().slice(0, 240);
}
function countLines(content) {
    if (content.length === 0) {
        return 0;
    }
    const lineBreaks = content.match(/\r\n|\r|\n/g)?.length ?? 0;
    return lineBreaks + (/\r\n|\r|\n$/.test(content) ? 0 : 1);
}
function findMatchingBrace(content, openBraceIndex) {
    if (openBraceIndex < 0) {
        return -1;
    }
    let depth = 0;
    for (let i = openBraceIndex; i < content.length; i += 1) {
        const char = content[i];
        if (char === '{') {
            depth += 1;
        }
        else if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                return i;
            }
        }
    }
    return -1;
}
function throwIfCancelled(token) {
    if (token?.isCancellationRequested) {
        throw new Error('TIC_CODER_LITE_CANCELLED');
    }
}
//# sourceMappingURL=detectRisks.js.map