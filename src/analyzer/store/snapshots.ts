/**
 * Snapshots de saúde por análise — histórico para tendências no dashboard.
 *
 * Vive em `.tic-code/snapshots.json` (append-only, cap 200) e NÃO no index.db,
 * porque o index.db é apagado e recriado a cada análise; o histórico precisa
 * sobreviver entre execuções.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { HealthScore } from '../computeHealthScore';

export const SNAPSHOTS_FILE = 'snapshots.json';
const MAX_SNAPSHOTS = 200;

export interface HealthSnapshot {
  timestamp: string;
  gitSha?: string;
  totalFiles: number;
  totalLines: number;
  score: number;
  grade: string;
  breakdown: HealthScore['breakdown'];
  counts: {
    risks: number;
    violations: number;
    hotspots: number;
    deadComponents: number;
    deadPlsql: number;
    resolvedEdges: number;
    totalEdges: number;
    endpoints: number;
    modules: number;
    impactEdges: number;
  };
}

export function loadSnapshots(ticCodeDir: string): HealthSnapshot[] {
  const file = path.join(ticCodeDir, SNAPSHOTS_FILE);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendSnapshot(ticCodeDir: string, projectPath: string, snapshot: Omit<HealthSnapshot, 'timestamp' | 'gitSha'>): HealthSnapshot {
  const full: HealthSnapshot = {
    timestamp: new Date().toISOString(),
    gitSha: gitSha(projectPath),
    ...snapshot
  };
  const all = loadSnapshots(ticCodeDir);
  all.push(full);
  const trimmed = all.slice(-MAX_SNAPSHOTS);
  fs.writeFileSync(path.join(ticCodeDir, SNAPSHOTS_FILE), JSON.stringify(trimmed), 'utf8');
  return full;
}

function gitSha(projectPath: string): string | undefined {
  try {
    return execSync('git rev-parse HEAD', { cwd: projectPath, encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined;
  } catch {
    return undefined;
  }
}
