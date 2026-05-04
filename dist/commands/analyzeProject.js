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
exports.getWorkspaceRoot = void 0;
exports.analyzeProject = analyzeProject;
exports.analyzeWorkspace = analyzeWorkspace;
exports.analyzeWorkspaceInternal = analyzeWorkspaceInternal;
exports.getLastAnalysis = getLastAnalysis;
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const writeTicCodeFolder_1 = require("../exporters/writeTicCodeFolder");
const buildGraph_1 = require("../scanner/buildGraph");
const detectStack_1 = require("../scanner/detectStack");
const detectRisks_1 = require("../scanner/detectRisks");
const scanWorkspace_1 = require("../scanner/scanWorkspace");
const config_1 = require("../utils/config");
const outputChannel_1 = require("../utils/outputChannel");
const workspace_1 = require("../utils/workspace");
var workspace_2 = require("../utils/workspace");
Object.defineProperty(exports, "getWorkspaceRoot", { enumerable: true, get: function () { return workspace_2.getWorkspaceRoot; } });
const LANGUAGE_BY_EXTENSION = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript React',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript React',
    '.java': 'Java',
    '.sql': 'SQL / PL/SQL',
    '.pks': 'Oracle PL/SQL',
    '.pkb': 'Oracle PL/SQL',
    '.prc': 'Oracle PL/SQL',
    '.fnc': 'Oracle PL/SQL',
    '.pkg': 'Oracle PL/SQL',
    '.trg': 'Oracle PL/SQL',
    '.pls': 'Oracle PL/SQL',
    '.plsql': 'Oracle PL/SQL',
    '.json': 'JSON',
    '.xml': 'XML',
    '.yml': 'YAML',
    '.yaml': 'YAML',
    '.md': 'Markdown'
};
const AGENT_ENGINES = [
    { id: 'codex', name: 'Codex', entryFile: 'AGENTS.md' },
    { id: 'claude-code', name: 'Claude Code', entryFile: 'CLAUDE.md' },
    { id: 'cursor', name: 'Cursor', entryFile: '.cursorrules' },
    { id: 'gemini-cli', name: 'Gemini CLI', entryFile: 'GEMINI.md' },
    { id: 'github-copilot', name: 'GitHub Copilot', entryFile: '.github/copilot-instructions.md' },
    { id: 'aider', name: 'Aider', entryFile: 'CONVENTIONS.md' }
];
const PACKAGE_MANAGER_FILES = [
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lockb',
    'requirements.txt',
    'pyproject.toml',
    'poetry.lock',
    'pom.xml',
    'build.gradle',
    'Cargo.toml',
    'go.mod'
];
const KEY_FILE_NAMES = new Set([
    'package.json',
    'tsconfig.json',
    'README.md',
    'pyproject.toml',
    'requirements.txt',
    'pom.xml',
    'build.gradle',
    'Cargo.toml',
    'go.mod',
    'docker-compose.yml',
    'AGENTS.md',
    'CLAUDE.md'
]);
async function analyzeProject(context) {
    const root = (0, workspace_1.getWorkspaceRoot)();
    if (!root) {
        vscode.window.showWarningMessage('Abra uma pasta de workspace antes de executar o TIC Coder Lite.');
        return undefined;
    }
    const config = (0, config_1.getTicCoderLiteConfig)();
    (0, outputChannel_1.logInfo)(`Análise do workspace iniciada em ${root.uri.fsPath}`);
    (0, outputChannel_1.logInfo)(`Limites do scan: maxFiles=${config.scan.maxFiles}, maxFileSizeKb=${config.scan.maxFileSizeKb}`);
    try {
        const summary = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'TIC Coder Lite: analisando workspace',
            cancellable: true
        }, async (progress, token) => analyzeWorkspaceInternal(root, { progress, token }));
        progressLogWriteArtifacts();
        await (0, writeTicCodeFolder_1.writeTicCodeFolder)(root, summary, context.extensionUri);
        await context.globalState.update('ticCoderLite.lastAnalysis', summary);
        vscode.commands.executeCommand('ticCoderLite.refreshSidebar');
        if (config.output.openAfterScan) {
            (0, outputChannel_1.showOutputChannel)();
        }
        (0, outputChannel_1.logInfo)(`Análise do workspace concluída: ${summary.totalFiles} arquivos, ${summary.totalLines} linhas, ${summary.risks.summary.total} riscos, ${summary.detectedProjects?.length ?? 0} projetos detectados.`);
        vscode.window.showInformationMessage(`✓ Modo Lite: ${summary.totalFiles} arquivos analisados sem IA, banco, Docker ou servidor. ${summary.detectedProjects?.length ?? 0} subprojeto(s) detectado(s).`);
        return summary;
    }
    catch (error) {
        if (isCancellation(error)) {
            (0, outputChannel_1.logWarn)('Análise cancelada pelo usuário.');
            vscode.window.showInformationMessage('Análise do TIC Coder Lite cancelada. Nenhum arquivo do projeto foi alterado.');
            return undefined;
        }
        (0, outputChannel_1.logError)('Falha na análise do workspace.', error);
        (0, outputChannel_1.showOutputChannel)();
        vscode.window.showErrorMessage('O TIC Coder Lite não conseguiu analisar este workspace. Veja a saída "TIC Coder Lite" para detalhes.');
        return undefined;
    }
}
// Exportar com nome original para compatibilidade
async function analyzeWorkspace(root, options = {}) {
    return analyzeWorkspaceInternal(root, options);
}
async function analyzeWorkspaceInternal(root, options = {}) {
    const config = (0, config_1.getTicCoderLiteConfig)();
    options.progress?.report({ message: 'Escaneando arquivos', increment: 5 });
    const scan = await (0, scanWorkspace_1.scanWorkspace)(root, {
        config: config.scan,
        token: options.token,
        progress: options.progress,
        logger: {
            info: outputChannel_1.logInfo,
            warn: outputChannel_1.logWarn,
            error: outputChannel_1.logError
        }
    });
    if (!scan) {
        throw new Error('Nenhuma pasta de workspace está aberta.');
    }
    throwIfCancelled(options.token);
    const languages = {};
    const directories = new Map();
    const keyFiles = [];
    options.progress?.report({ message: 'Detectando stack e módulos', increment: 20 });
    const inventory = await (0, detectStack_1.detectStack)(scan, { plsql: { maxSqlFiles: config.database.maxSqlFiles } });
    throwIfCancelled(options.token);
    options.progress?.report({ message: 'Montando grafo', increment: 20 });
    const graph = await (0, buildGraph_1.buildGraph)(scan, inventory, { token: options.token, database: config.database });
    throwIfCancelled(options.token);
    options.progress?.report({ message: 'Detectando riscos determinísticos', increment: 20 });
    const risks = await (0, detectRisks_1.detectRisks)(scan, inventory, graph, { token: options.token });
    scan.riskSummary = risks.summary;
    for (const file of scan.files) {
        const relative = file.relativePath;
        const extension = file.extension;
        const language = LANGUAGE_BY_EXTENSION[extension] ?? 'Outros';
        languages[language] = (languages[language] ?? 0) + 1;
        const firstSegment = relative.split('/')[0] || '.';
        directories.set(firstSegment, (directories.get(firstSegment) ?? 0) + 1);
        if (KEY_FILE_NAMES.has(path.basename(relative)) || KEY_FILE_NAMES.has(relative)) {
            keyFiles.push(relative);
        }
    }
    // Detectar subprojetos e adicionar à summary
    const { detectProjects } = await Promise.resolve().then(() => __importStar(require('../scanner/detectProjects')));
    const detectedProjects = detectProjects(scan, risks);
    return {
        workspaceName: scan.projectName,
        rootPath: scan.rootPath,
        generatedAt: scan.scannedAt,
        totalFiles: scan.totals.files,
        totalLines: scan.totals.lines,
        languages: sortRecord(languages),
        topDirectories: [...directories.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12)
            .map(([name, count]) => ({ name, files: count })),
        packageManagers: await detectPackageManagers(root.uri),
        detectedAgentEngines: await detectAgentEngines(root.uri),
        keyFiles: keyFiles.sort().slice(0, 40),
        detectedProjects,
        scan,
        inventory,
        graph,
        risks
    };
}
function getLastAnalysis(context) {
    return context.globalState.get('ticCoderLite.lastAnalysis');
}
async function detectPackageManagers(root) {
    const found = [];
    for (const file of PACKAGE_MANAGER_FILES) {
        if (await exists(vscode.Uri.joinPath(root, file))) {
            found.push(file);
        }
    }
    return found;
}
async function detectAgentEngines(root) {
    const engines = [];
    for (const engine of AGENT_ENGINES) {
        engines.push({
            ...engine,
            detected: await exists(vscode.Uri.joinPath(root, engine.entryFile))
        });
    }
    return engines;
}
async function exists(uri) {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    }
    catch {
        return false;
    }
}
function sortRecord(input) {
    return Object.fromEntries(Object.entries(input).sort((a, b) => b[1] - a[1]));
}
function throwIfCancelled(token) {
    if (token?.isCancellationRequested) {
        throw new Error('TIC_CODER_LITE_CANCELLED');
    }
}
function isCancellation(error) {
    return error instanceof Error && error.message === 'TIC_CODER_LITE_CANCELLED';
}
function progressLogWriteArtifacts() {
    (0, outputChannel_1.logInfo)('Gravando artefatos .tic-code.');
}
//# sourceMappingURL=analyzeProject.js.map