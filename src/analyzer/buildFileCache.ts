import * as fs from 'fs';
import * as path from 'path';

export interface FileCache {
  version: number;
  analyzedAt: number;
  fileMtimes: Record<string, number>;
}

const CACHE_VERSION = 1;

export function loadFileCache(ticCodeDir: string): FileCache | null {
  const cachePath = path.join(ticCodeDir, 'file-cache.json');
  try {
    if (!fs.existsSync(cachePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as FileCache;
    if (parsed.version !== CACHE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function computeChangedFiles(
  files: Array<{ relativePath: string; absolutePath: string }>,
  cache: FileCache | null
): Set<string> {
  if (!cache) return new Set(files.map((f) => f.relativePath));
  const changed = new Set<string>();
  for (const file of files) {
    try {
      const mtime = fs.statSync(file.absolutePath).mtimeMs;
      if (cache.fileMtimes[file.relativePath] !== mtime) changed.add(file.relativePath);
    } catch {
      changed.add(file.relativePath);
    }
  }
  return changed;
}

export function saveFileCache(
  ticCodeDir: string,
  files: Array<{ relativePath: string; absolutePath: string }>
): void {
  const fileMtimes: Record<string, number> = {};
  for (const file of files) {
    try { fileMtimes[file.relativePath] = fs.statSync(file.absolutePath).mtimeMs; } catch { /* skip */ }
  }
  fs.writeFileSync(
    path.join(ticCodeDir, 'file-cache.json'),
    JSON.stringify({ version: CACHE_VERSION, analyzedAt: Date.now(), fileMtimes }),
    'utf8'
  );
}
