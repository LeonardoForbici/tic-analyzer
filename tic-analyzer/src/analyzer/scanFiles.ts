import * as fs from 'fs';
import * as path from 'path';

export interface ScannedFile {
  relativePath: string;
  absolutePath: string;
  extension: string;
  sizeBytes: number;
  lines: number;
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target', 'coverage',
  '.next', '.nuxt', '.svelte-kit', '__pycache__', '.venv', 'venv',
  '.idea', '.vscode', '.tic-code', 'vendor', 'bin', 'obj'
]);

const SUPPORTED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.java', '.kt', '.scala',
  '.py', '.rb', '.go', '.rs', '.cs', '.cpp', '.c', '.h',
  '.php', '.swift', '.dart',
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.sql', '.plsql', '.pls', '.pck', '.pks', '.pkb', '.prc', '.fnc', '.trg', '.pkg',
  '.json', '.yaml', '.yml', '.toml', '.xml', '.properties', '.env',
  '.md', '.mdx', '.graphql', '.gql', '.proto'
]);

const MAX_FILE_SIZE_BYTES = 512 * 1024; // 512KB

export interface ScanOptions {
  maxFiles?: number;
  onProgress?: (scanned: number, current: string) => void;
}

export function scanFiles(rootPath: string, options: ScanOptions = {}): ScannedFile[] {
  const { maxFiles = 200_000, onProgress } = options;
  const files: ScannedFile[] = [];

  function walk(dir: string): void {
    if (files.length >= maxFiles) return;

    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      if (files.length >= maxFiles) break;

      const abs = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walk(abs);
        }
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

      let stat: fs.Stats;
      try { stat = fs.statSync(abs); } catch { continue; }
      if (stat.size > MAX_FILE_SIZE_BYTES) continue;

      const rel = path.relative(rootPath, abs).replace(/\\/g, '/');

      let lines = 0;
      try {
        const content = fs.readFileSync(abs, 'utf8');
        lines = content.split('\n').length;
      } catch { lines = 0; }

      onProgress?.(files.length, rel);

      files.push({ relativePath: rel, absolutePath: abs, extension: ext, sizeBytes: stat.size, lines });
    }
  }

  walk(rootPath);
  return files;
}

export function countLines(abs: string): number {
  try { return fs.readFileSync(abs, 'utf8').split('\n').length; }
  catch { return 0; }
}

export function readFileSafe(abs: string): string {
  try { return fs.readFileSync(abs, 'utf8'); }
  catch { return ''; }
}
