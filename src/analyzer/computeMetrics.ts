import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';
import type { DependencyGraph } from './buildDependencyGraph';
import type { ProjectModule } from './detectModules';

export interface FileMetrics {
  file: string;
  cyclomaticComplexity: number;
  linesOfCode: number;
  couplingIn: number;
  couplingOut: number;
  debtScore: number;
  hotspot: boolean;
}

export interface ModuleMetrics {
  name: string;
  avgComplexity: number;
  maxComplexity: number;
  maxComplexityFile: string;
  totalLines: number;
  avgCouplingIn: number;
  debtScore: number;
  hotspots: string[];
}

export interface ProjectMetrics {
  files: FileMetrics[];
  modules: ModuleMetrics[];
  totalDebt: number;
  hotspotCount: number;
}

const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.java', '.py', '.cs', '.go', '.rb', '.php']);

export function computeMetrics(
  files: ScannedFile[],
  graph: DependencyGraph,
  modules: ProjectModule[]
): ProjectMetrics {
  const couplingIn: Record<string, number> = {};
  const couplingOut: Record<string, number> = {};
  for (const node of graph.nodes) {
    couplingIn[node.path] = node.inDegree;
    couplingOut[node.path] = node.outDegree;
  }

  const fileMetrics: FileMetrics[] = [];

  for (const file of files) {
    if (!CODE_EXTS.has(file.extension)) continue;

    let content: string;
    try { content = fs.readFileSync(file.absolutePath, 'utf8'); }
    catch { continue; }

    const complexity = computeCyclomaticComplexity(content);
    const ci = couplingIn[file.relativePath] ?? 0;
    const co = couplingOut[file.relativePath] ?? 0;

    let debt = 0;
    if (complexity > 20) debt += Math.min((complexity - 20) * 2, 40);
    if (file.lines > 1500) debt += 10;
    else if (file.lines > 500) debt += 3;
    if (co > 15) debt += Math.min(co - 15, 15);

    fileMetrics.push({
      file: file.relativePath,
      cyclomaticComplexity: complexity,
      linesOfCode: file.lines,
      couplingIn: ci,
      couplingOut: co,
      debtScore: debt,
      hotspot: complexity > 15 && ci > 3
    });
  }

  const moduleMetrics: ModuleMetrics[] = modules.map((mod) => {
    const modFiles = fileMetrics.filter((m) =>
      mod.files.some((f) => f.relativePath === m.file)
    );
    if (modFiles.length === 0) {
      return { name: mod.name, avgComplexity: 0, maxComplexity: 0, maxComplexityFile: '', totalLines: mod.files.reduce((s, f) => s + f.lines, 0), avgCouplingIn: 0, debtScore: 0, hotspots: [] };
    }
    const sorted = [...modFiles].sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity);
    const hotspots = modFiles.filter((f) => f.hotspot).map((f) => f.file).slice(0, 5);
    return {
      name: mod.name,
      avgComplexity: Math.round(modFiles.reduce((s, f) => s + f.cyclomaticComplexity, 0) / modFiles.length),
      maxComplexity: sorted[0].cyclomaticComplexity,
      maxComplexityFile: sorted[0].file,
      totalLines: modFiles.reduce((s, f) => s + f.linesOfCode, 0),
      avgCouplingIn: Math.round(modFiles.reduce((s, f) => s + f.couplingIn, 0) / modFiles.length * 10) / 10,
      debtScore: modFiles.reduce((s, f) => s + f.debtScore, 0),
      hotspots
    };
  });

  return {
    files: fileMetrics,
    modules: moduleMetrics,
    totalDebt: fileMetrics.reduce((s, f) => s + f.debtScore, 0),
    hotspotCount: fileMetrics.filter((f) => f.hotspot).length
  };
}

function computeCyclomaticComplexity(content: string): number {
  const clean = content
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');

  let cc = 1;
  const patterns = [/\bif\s*\(/g, /\belse\s+if\s*\(/g, /\bfor\s*\(/g, /\bwhile\s*\(/g, /\bdo\s*\{/g, /\bcase\s+[^:]+:/g, /\bcatch\s*\(/g, /&&/g, /\|\|/g, /\?(?!\?)/g];
  for (const p of patterns) {
    const m = clean.match(p);
    if (m) cc += m.length;
  }
  return Math.min(cc, 999);
}
