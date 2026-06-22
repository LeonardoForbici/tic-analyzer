import * as fs from 'fs';
import type { ScannedFile } from './scanFiles';
import type { DependencyGraph } from './buildDependencyGraph';
import type { ProjectModule } from './detectModules';
import type { AstFileMetric } from './semantic/computeAstMetrics';

export interface FileMetrics {
  file: string;
  cyclomaticComplexity: number;
  /** Complexidade cognitiva (estilo SonarSource). 0 quando origem = regex. */
  cognitiveComplexity: number;
  /** Profundidade máxima de aninhamento. 0 quando origem = regex. */
  maxNesting: number;
  linesOfCode: number;
  couplingIn: number;
  couplingOut: number;
  debtScore: number;
  hotspot: boolean;
  /** Origem da complexidade: AST real (Java/TS/JS) ou fallback regex. */
  complexitySource: 'ast' | 'regex';
  /** Pior função do arquivo (apenas quando origem = AST). */
  worstFunction?: { name: string; line: number; cyclomatic: number };
}

export interface ModuleMetrics {
  name: string;
  avgComplexity: number;
  maxComplexity: number;
  maxComplexityFile: string;
  avgCognitive: number;
  maxNesting: number;
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
  modules: ProjectModule[],
  astMetrics?: Map<string, AstFileMetric>
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

    // Prefere a complexidade AST real quando há funções detectadas; senão, regex.
    const ast = astMetrics?.get(file.relativePath);
    const useAst = !!ast && ast.functionCount > 0;
    const complexity = useAst ? ast!.cyclomatic : computeCyclomaticComplexity(content);
    const cognitive = useAst ? ast!.cognitive : 0;
    const maxNesting = useAst ? ast!.maxNesting : 0;
    const ci = couplingIn[file.relativePath] ?? 0;
    const co = couplingOut[file.relativePath] ?? 0;

    let debt = 0;
    if (complexity > 20) debt += Math.min((complexity - 20) * 2, 40);
    // Cognitiva captura manutenibilidade melhor que CC pura: penaliza aninhamento.
    if (cognitive > 15) debt += Math.min(cognitive - 15, 20);
    if (file.lines > 1500) debt += 10;
    else if (file.lines > 500) debt += 3;
    if (co > 15) debt += Math.min(co - 15, 15);

    fileMetrics.push({
      file: file.relativePath,
      cyclomaticComplexity: complexity,
      cognitiveComplexity: cognitive,
      maxNesting,
      linesOfCode: file.lines,
      couplingIn: ci,
      couplingOut: co,
      debtScore: debt,
      hotspot: complexity > 15 && ci > 3,
      complexitySource: useAst ? 'ast' : 'regex',
      worstFunction: useAst && ast!.worstFunction
        ? { name: ast!.worstFunction.name, line: ast!.worstFunction.line, cyclomatic: ast!.worstFunction.cyclomatic }
        : undefined
    });
  }

  const moduleMetrics: ModuleMetrics[] = modules.map((mod) => {
    const modFiles = fileMetrics.filter((m) =>
      mod.files.some((f) => f.relativePath === m.file)
    );
    if (modFiles.length === 0) {
      return { name: mod.name, avgComplexity: 0, maxComplexity: 0, maxComplexityFile: '', avgCognitive: 0, maxNesting: 0, totalLines: mod.files.reduce((s, f) => s + f.lines, 0), avgCouplingIn: 0, debtScore: 0, hotspots: [] };
    }
    const sorted = [...modFiles].sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity);
    const hotspots = modFiles.filter((f) => f.hotspot).map((f) => f.file).slice(0, 5);
    return {
      name: mod.name,
      avgComplexity: Math.round(modFiles.reduce((s, f) => s + f.cyclomaticComplexity, 0) / modFiles.length),
      maxComplexity: sorted[0].cyclomaticComplexity,
      maxComplexityFile: sorted[0].file,
      avgCognitive: Math.round(modFiles.reduce((s, f) => s + f.cognitiveComplexity, 0) / modFiles.length),
      maxNesting: modFiles.reduce((s, f) => Math.max(s, f.maxNesting), 0),
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
