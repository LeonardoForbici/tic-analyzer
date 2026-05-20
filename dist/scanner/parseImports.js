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
exports.parseImports = parseImports;
exports.parseTypeScriptImports = parseTypeScriptImports;
exports.parseJavaImports = parseJavaImports;
exports.parsePackageJsonDependencies = parsePackageJsonDependencies;
exports.extractJavaPackage = extractJavaPackage;
exports.extractJavaClassName = extractJavaClassName;
exports.packageNameFromSpecifier = packageNameFromSpecifier;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
async function parseImports(rootPath, file) {
    const absolutePath = path.join(rootPath, file.relativePath);
    const content = await readText(absolutePath);
    if (!content) {
        return [];
    }
    if (['.ts', '.tsx', '.js', '.jsx'].includes(file.extension)) {
        return parseTypeScriptImports(file.relativePath, content, file.extension === '.js' || file.extension === '.jsx' ? 'javascript' : 'typescript');
    }
    if (file.extension === '.java') {
        return parseJavaImports(file.relativePath, content);
    }
    if (file.relativePath.endsWith('package.json')) {
        return parsePackageJsonDependencies(file.relativePath, content);
    }
    return [];
}
function parseTypeScriptImports(sourcePath, content, language = 'typescript') {
    const imports = [];
    const patterns = [
        { kind: 'import', pattern: /\bimport\s+(?!type\b)(?:[^'"`]*?\s+from\s+)?["'`]([^"'`]+)["'`]/g },
        { kind: 'export', pattern: /\bexport\s+(?!type\b)(?:[^'"`]*?\s+from\s+)["'`]([^"'`]+)["'`]/g },
        { kind: 'dynamic-import', pattern: /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g },
        { kind: 'require', pattern: /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g }
    ];
    for (const { kind, pattern } of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            const lineNumber = content.slice(0, match.index).split('\n').length;
            const rawText = match[0].replace(/\s+/g, ' ').trim().slice(0, 100);
            imports.push({ sourcePath, specifier: match[1], kind, language, lineNumber, rawText });
        }
    }
    return dedupeImports(imports);
}
function parseJavaImports(sourcePath, content) {
    const imports = [];
    const pattern = /^\s*import\s+(?:static\s+)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\.\*)+)\s*;/gm;
    let match;
    while ((match = pattern.exec(content)) !== null) {
        const lineNumber = content.slice(0, match.index).split('\n').length;
        const rawText = match[0].replace(/\s+/g, ' ').trim().slice(0, 100);
        imports.push({ sourcePath, specifier: match[1], kind: 'java-import', language: 'java', lineNumber, rawText });
    }
    return dedupeImports(imports);
}
function parsePackageJsonDependencies(sourcePath, content) {
    let packageJson;
    try {
        packageJson = JSON.parse(content);
    }
    catch {
        return [];
    }
    const dependencies = {
        ...readDependencyBlock(packageJson.dependencies),
        ...readDependencyBlock(packageJson.devDependencies),
        ...readDependencyBlock(packageJson.peerDependencies),
        ...readDependencyBlock(packageJson.optionalDependencies)
    };
    return Object.keys(dependencies)
        .sort()
        .map((specifier) => ({
        sourcePath,
        specifier,
        kind: 'package-dependency',
        language: 'json',
        lineNumber: 0,
        rawText: specifier
    }));
}
function extractJavaPackage(content) {
    return content.match(/^\s*package\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/m)?.[1];
}
function extractJavaClassName(content) {
    return content.match(/\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/)?.[1];
}
function packageNameFromSpecifier(specifier) {
    if (specifier.startsWith('@')) {
        const [scope, name] = specifier.split('/');
        return name ? `${scope}/${name}` : specifier;
    }
    return specifier.split('/')[0];
}
async function readText(filePath) {
    try {
        return await fs.readFile(filePath, 'utf8');
    }
    catch {
        return '';
    }
}
function readDependencyBlock(value) {
    if (!value || typeof value !== 'object') {
        return {};
    }
    return Object.fromEntries(Object.entries(value)
        .filter((entry) => typeof entry[1] === 'string'));
}
function dedupeImports(imports) {
    const seen = new Set();
    return imports.filter((item) => {
        const key = `${item.sourcePath}|${item.kind}|${item.specifier}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
//# sourceMappingURL=parseImports.js.map