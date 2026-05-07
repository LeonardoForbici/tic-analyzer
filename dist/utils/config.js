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
exports.getTicCoderLiteConfig = getTicCoderLiteConfig;
const vscode = __importStar(require("vscode"));
const DEFAULT_EXCLUDE = [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/target/**',
    '**/coverage/**',
    '**/.next/**',
    '**/.idea/**',
    '**/.vscode/**',
    '**/.tic-code/**'
];
function getTicCoderLiteConfig() {
    const config = vscode.workspace.getConfiguration('ticCoderLite');
    return {
        scan: {
            maxFiles: readPositiveNumber(config, 'scan.maxFiles', 30000),
            maxFileSizeKb: readPositiveNumber(config, 'scan.maxFileSizeKb', 512),
            include: readStringArray(config, 'scan.include', ['**/*']),
            exclude: readStringArray(config, 'scan.exclude', DEFAULT_EXCLUDE)
        },
        output: {
            openAfterScan: config.get('output.openAfterScan', false)
        },
        exports: {
            safeWriteMode: readSafeWriteMode(config.get('exports.safeWriteMode', 'ask'))
        },
        localAi: {
            enabled: config.get('localAi.enabled', false),
            ollamaUrl: config.get('localAi.ollamaUrl', 'http://localhost:11434'),
            model: config.get('localAi.model', 'qwen2.5-coder:3b'),
            fastModel: config.get('localAi.fastModel', 'qwen2.5-coder:3b'),
            qualityModel: config.get('localAi.qualityModel', 'qwen2.5-coder:7b'),
            mode: validateMode(config.get('localAi.mode', 'auto')),
            visionEnabled: config.get('localAi.visionEnabled', true),
            visionModel: config.get('localAi.visionModel', 'llava:7b')
        },
        database: {
            largeMode: config.get('database.largeMode', true),
            maxVisualNodes: readPositiveNumber(config, 'database.maxVisualNodes', 300),
            maxTablesInGraph: readPositiveNumber(config, 'database.maxTablesInGraph', 100),
            maxCriticalTables: readPositiveNumber(config, 'database.maxCriticalTables', 200),
            enableTableIndex: config.get('database.enableTableIndex', true),
            criticalNamePatterns: readStringArray(config, 'database.criticalNamePatterns', []),
            maxSqlFiles: readPositiveNumber(config, 'database.maxSqlFiles', 100000),
        }
    };
}
function readPositiveNumber(config, key, fallback) {
    const value = config.get(key, fallback);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
function readStringArray(config, key, fallback) {
    const value = config.get(key, fallback);
    if (!Array.isArray(value)) {
        return fallback;
    }
    const cleaned = value.filter((item) => typeof item === 'string' && item.trim().length > 0);
    return cleaned.length > 0 ? cleaned : fallback;
}
function readSafeWriteMode(value) {
    return value === 'append' || value === 'ignore' ? value : 'ask';
}
function validateMode(value) {
    return value === 'fast' || value === 'quality' ? value : 'auto';
}
//# sourceMappingURL=config.js.map