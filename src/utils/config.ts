import * as vscode from 'vscode';

export type SafeWriteMode = 'ask' | 'append' | 'ignore';

export interface ScanConfig {
  maxFiles: number;
  maxFileSizeKb: number;
  include: string[];
  exclude: string[];
}

export interface DatabaseConfig {
  /** Ativa PLSQL Enterprise Mode para projetos com bases muito grandes. */
  largeMode: boolean;
  /** Número máximo de nós exibidos no grafo visual. */
  maxVisualNodes: number;
  /** Número máximo de tabelas exibidas no grafo de banco. */
  maxTablesInGraph: number;
  /** Número máximo de tabelas críticas indexadas no critical-objects.json. */
  maxCriticalTables: number;
  /** Habilita geração de índice de tabelas em .tic-code/projects/database/index/. */
  enableTableIndex: boolean;
  /** Padrões de nome que aumentam a criticidade de tabelas e packages. */
  criticalNamePatterns: string[];
  /** Número máximo de arquivos SQL/PL/SQL analisados pelo scanner. */
  maxSqlFiles: number;
}

export interface TicCoderLiteConfig {
  scan: ScanConfig;
  output: {
    openAfterScan: boolean;
  };
  exports: {
    safeWriteMode: SafeWriteMode;
  };
  localAi: {
    enabled: boolean;
    ollamaUrl: string;
    model: string;
    fastModel: string;
    qualityModel: string;
    mode: 'auto' | 'fast' | 'quality';
    visionEnabled: boolean;
    visionModel: string;
  };
  database: DatabaseConfig;
}

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

export function getTicCoderLiteConfig(): TicCoderLiteConfig {
  const config = vscode.workspace.getConfiguration('ticCoderLite');

  return {
    scan: {
      maxFiles: readPositiveNumber(config, 'scan.maxFiles', 30000),
      maxFileSizeKb: readPositiveNumber(config, 'scan.maxFileSizeKb', 512),
      include: readStringArray(config, 'scan.include', ['**/*']),
      exclude: readStringArray(config, 'scan.exclude', DEFAULT_EXCLUDE)
    },
    output: {
      openAfterScan: config.get<boolean>('output.openAfterScan', false)
    },
    exports: {
      safeWriteMode: readSafeWriteMode(config.get<string>('exports.safeWriteMode', 'ask'))
    },
    localAi: {
      enabled: config.get<boolean>('localAi.enabled', false),
      ollamaUrl: config.get<string>('localAi.ollamaUrl', 'http://localhost:11434'),
      model: config.get<string>('localAi.model', 'qwen2.5-coder:3b'),
      fastModel: config.get<string>('localAi.fastModel', 'qwen2.5-coder:3b'),
      qualityModel: config.get<string>('localAi.qualityModel', 'qwen2.5-coder:7b'),
      mode: validateMode(config.get<string>('localAi.mode', 'auto')),
      visionEnabled: config.get<boolean>('localAi.visionEnabled', true),
      visionModel: config.get<string>('localAi.visionModel', 'llava:7b')
    },
    database: {
      largeMode: config.get<boolean>('database.largeMode', true),
      maxVisualNodes: readPositiveNumber(config, 'database.maxVisualNodes', 300),
      maxTablesInGraph: readPositiveNumber(config, 'database.maxTablesInGraph', 100),
      maxCriticalTables: readPositiveNumber(config, 'database.maxCriticalTables', 200),
      enableTableIndex: config.get<boolean>('database.enableTableIndex', true),
      criticalNamePatterns: readStringArray(config, 'database.criticalNamePatterns', []),
      maxSqlFiles: readPositiveNumber(config, 'database.maxSqlFiles', 100000),
    }
  };
}

function readPositiveNumber(config: vscode.WorkspaceConfiguration, key: string, fallback: number): number {
  const value = config.get<number>(key, fallback);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function readStringArray(config: vscode.WorkspaceConfiguration, key: string, fallback: string[]): string[] {
  const value = config.get<unknown>(key, fallback);
  if (!Array.isArray(value)) {
    return fallback;
  }

  const cleaned = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return cleaned.length > 0 ? cleaned : fallback;
}

function readSafeWriteMode(value: string): SafeWriteMode {
  return value === 'append' || value === 'ignore' ? value : 'ask';
}

function validateMode(value: string): 'auto' | 'fast' | 'quality' {
  return value === 'fast' || value === 'quality' ? value : 'auto';
}
