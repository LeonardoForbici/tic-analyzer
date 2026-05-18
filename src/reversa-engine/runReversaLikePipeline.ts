/**
 * Orquestra a pipeline completa do motor Reversa embutido.
 *
 * Sequência:
 *   a) Scanner TIC Coder Lite → scan.json/graph.json/risks.json (já feito antes desta chamada)
 *   b) Gerar context/surface.json e context/modules.json
 *   c) Gerar .tic-code/reversa/state.json, config.json, plan.md, version
 *   d) Gerar estrutura .tic-code/reverse-engineering/
 *   e) Copiar assets do Reversa
 *   f) Atualizar state.json
 *
 * Créditos: Reversa by Sandeco — MIT License (adapted)
 */

import * as vscode from 'vscode';
import type { ProjectSummary } from '../types';
import {
  REVERSA_DIR,
  CONTEXT_DIR,
  CONFIG_DIR,
  STATE_FILE,
  CONFIG_FILE,
  PLAN_FILE,
  VERSION_FILE,
  SURFACE_JSON,
  MODULES_JSON,
  GRAPH_JSON,
  RISKS_JSON,
  WORKSPACE_SUMMARY_JSON,
  FILES_MANIFEST_JSON,
  toWorkspaceUri
} from './embeddedReversaPaths';
import { generateReversaState } from './generateReversaState';
import { generateReversaConfig, renderManifestYaml } from './generateReversaConfig';
import { generateReversaPlan } from './generateReversaPlan';
import { generateReversaSddStructure } from './generateReversaSddStructure';
import { generateReversaTaskPrompt } from './generateReversaTaskPrompt';
import { copyEmbeddedReversa } from './copyEmbeddedReversa';
import type { ReversaEngineResult } from './reversaEngineTypes';
import type { ReversaSurface, ReversaModulesContext } from './reversaEngineTypes';

const REVERSA_VERSION = '1.1.0';

export async function runReversaLikePipeline(
  root: vscode.WorkspaceFolder,
  summary: ProjectSummary,
  extensionUri?: vscode.Uri
): Promise<ReversaEngineResult> {
  const contextFiles: string[] = [];
  const sddFiles: string[] = [];
  const agentFiles = await detectAgentFiles(root, summary.scan.files.map((f) => f.relativePath));

  // ── Criar pastas base ────────────────────────────────────────────────────
  for (const dir of [REVERSA_DIR, CONTEXT_DIR, CONFIG_DIR]) {
    await vscode.workspace.fs.createDirectory(toWorkspaceUri(root, dir));
  }

  // ── b) Context files ─────────────────────────────────────────────────────
  const surface = buildSurface(summary);
  await write(root, SURFACE_JSON, JSON.stringify(surface, null, 2));
  contextFiles.push(SURFACE_JSON);

  const modules = buildModulesContext(summary);
  await write(root, MODULES_JSON, JSON.stringify(modules, null, 2));
  contextFiles.push(MODULES_JSON);

  // Copiar graph.json e risks.json para o context
  const graphContent = JSON.stringify(summary.graph, null, 2);
  await write(root, GRAPH_JSON, graphContent);
  contextFiles.push(GRAPH_JSON);

  const risksContent = JSON.stringify(summary.risks, null, 2);
  await write(root, RISKS_JSON, risksContent);
  contextFiles.push(RISKS_JSON);

  // Workspace summary compacto
  const workspaceSummaryCompact = {
    workspaceName: summary.workspaceName,
    rootPath: summary.rootPath,
    generatedAt: summary.generatedAt,
    totalFiles: summary.totalFiles,
    totalLines: summary.totalLines,
    languages: summary.languages,
    stack: summary.inventory.stack.filter((s) => s.detected).map((s) => s.name),
    riskCount: summary.risks.risks.length,
    graphNodes: summary.graph.stats.nodeCount,
    graphEdges: summary.graph.stats.edgeCount
  };
  await write(root, WORKSPACE_SUMMARY_JSON, JSON.stringify(workspaceSummaryCompact, null, 2));
  contextFiles.push(WORKSPACE_SUMMARY_JSON);

  // ── c) State, config, plan, version ──────────────────────────────────────
  const state = generateReversaState(summary);
  await write(root, STATE_FILE, JSON.stringify(state, null, 2));

  const config = generateReversaConfig(summary);
  await write(root, CONFIG_FILE, JSON.stringify(config, null, 2));

  const manifest = renderManifestYaml(summary);
  await write(root, `${REVERSA_DIR}/_config/manifest.yaml`, manifest);

  const plan = generateReversaPlan(summary);
  await write(root, PLAN_FILE, plan);

  const taskPrompt = generateReversaTaskPrompt(summary);
  await write(root, `${REVERSA_DIR}/reversa-task.md`, taskPrompt);

  await write(root, VERSION_FILE, REVERSA_VERSION);

  // Files manifest
  const allFiles = [...contextFiles, STATE_FILE, CONFIG_FILE, PLAN_FILE];
  await write(root, FILES_MANIFEST_JSON, JSON.stringify({ files: allFiles, generatedAt: new Date().toISOString() }, null, 2));

  // ── d) SDD structure ─────────────────────────────────────────────────────
  await generateReversaSddStructure(root, summary);
  await generateCoreAgentArtifacts(root);

  // ── e) Copy embedded Reversa assets ──────────────────────────────────────
  if (extensionUri) {
    await copyEmbeddedReversa(root, extensionUri);
  }

  return {
    stateFile: STATE_FILE,
    configFile: CONFIG_FILE,
    planFile: PLAN_FILE,
    contextFiles,
    sddFiles,
    agentFiles
  };
}

// ── Builders ─────────────────────────────────────────────────────────────────

function buildSurface(summary: ProjectSummary): ReversaSurface {
  const langStats = Object.entries(summary.languages ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const extMap: Record<string, string[]> = {
    TypeScript: ['.ts', '.tsx'],
    JavaScript: ['.js', '.mjs', '.cjs', '.jsx'],
    Java: ['.java'],
    Python: ['.py'],
    'C#': ['.cs'],
    PHP: ['.php'],
    Ruby: ['.rb'],
    Go: ['.go'],
    Rust: ['.rs'],
    SQL: ['.sql', '.plsql', '.pls', '.pck'],
    HTML: ['.html', '.htm'],
    CSS: ['.css', '.scss', '.sass', '.less']
  };

  const languages = langStats.map(([name, count]) => ({
    name,
    extensions: extMap[name] ?? [],
    fileCount: count
  }));

  const primaryLanguage = languages[0]?.name ?? 'Unknown';
  const detectedStack = summary.inventory.stack.filter((s) => s.detected);
  const frameworks = detectedStack.map((s) => ({
    name: s.name,
    source: s.evidence[0] ?? 'detected'
  }));

  const plsql = summary.inventory.plsql;
  const databaseHints = plsql.files.slice(0, 5).map((f) => ({ path: f, type: 'plsql' }));

  const centralFiles = summary.graph.stats.centralFiles.slice(0, 5).map((f) => ({
    path: f.path,
    type: 'entry_point'
  }));

  const modules = summary.inventory.modules.length > 0
    ? summary.inventory.modules.map((m) => m.kind)
    : inferModulesFromFolders(summary);

  return {
    generatedAt: new Date().toISOString(),
    projectRoot: summary.rootPath,
    languages,
    primaryLanguage,
    frameworks,
    packageManager: detectPackageManager(summary),
    entryPoints: centralFiles,
    configFiles: [],
    databaseHints,
    testFileCount: countTestFiles(summary),
    modules,
    totalFiles: summary.totalFiles,
    totalLines: summary.totalLines
  };
}

function buildModulesContext(summary: ProjectSummary): ReversaModulesContext {
  const now = new Date().toISOString();

  if (summary.inventory.modules.length > 0) {
    return {
      generatedAt: now,
      modules: summary.inventory.modules.slice(0, 20).map((m) => ({
        name: m.kind,
        path: m.files[0] ?? '',
        fileCount: m.files.length,
        language: 'unknown',
        mainFiles: m.files.slice(0, 3),
        dependencies: [],
        confidence: '🟡'
      }))
    };
  }

  // Inferir de pastas
  const folderMap = new Map<string, string[]>();
  for (const file of summary.scan.files) {
    const parts = file.relativePath.replace(/\\/g, '/').split('/');
    if (parts.length >= 2) {
      const folder = parts.slice(0, 2).join('/');
      if (!folder.startsWith('node_modules') && !folder.startsWith('dist') && !folder.startsWith('.')) {
        if (!folderMap.has(folder)) folderMap.set(folder, []);
        folderMap.get(folder)!.push(file.relativePath);
      }
    }
  }

  return {
    generatedAt: now,
    modules: [...folderMap.entries()].slice(0, 15).map(([name, files]) => ({
      name,
      path: name,
      fileCount: files.length,
      language: 'unknown',
      mainFiles: files.slice(0, 3),
      dependencies: [],
      confidence: '🟡'
    }))
  };
}

function inferModulesFromFolders(summary: ProjectSummary): string[] {
  const folders = new Set<string>();
  for (const file of summary.scan.files) {
    const parts = file.relativePath.replace(/\\/g, '/').split('/');
    if (parts.length >= 2 && !parts[0].startsWith('node_modules') && !parts[0].startsWith('.')) {
      folders.add(parts[0]);
    }
  }
  return [...folders].slice(0, 10);
}

function detectPackageManager(summary: ProjectSummary): string {
  const managers = summary.packageManagers ?? [];
  if (managers.includes('npm')) return 'npm';
  if (managers.includes('yarn')) return 'yarn';
  if (managers.includes('pnpm')) return 'pnpm';
  return 'unknown';
}

function countTestFiles(summary: ProjectSummary): number {
  return summary.scan.files.filter((f) => {
    const p = f.relativePath.toLowerCase();
    return p.includes('.spec.') || p.includes('.test.') || p.includes('__tests__');
  }).length;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function write(root: vscode.WorkspaceFolder, relativePath: string, content: string): Promise<void> {
  const uri = toWorkspaceUri(root, relativePath);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
}

async function detectAgentFiles(root: vscode.WorkspaceFolder, paths: string[]): Promise<string[]> {
  const wanted = ['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md', '.cursorrules', 'GEMINI.md'];
  const normalized = new Set(paths.map((p) => p.replace(/\\/g, '/')));
  const found = wanted.filter((w) => normalized.has(w));
  for (const f of wanted) {
    try {
      await vscode.workspace.fs.stat(toWorkspaceUri(root, f));
      if (!found.includes(f)) found.push(f);
    } catch {}
  }
  return found;
}


async function generateCoreAgentArtifacts(root: vscode.WorkspaceFolder): Promise<void> {
  const files: Record<string, string> = {
    '.tic-code/reverse-engineering/dynamic.md': '# Dynamic Analysis\n\nStatus: pending input (logs/traces).\n',
    '.tic-code/reverse-engineering/traceability/runtime-evidence.md': '# Runtime Evidence\n\nNenhuma evidência de runtime importada.\n',
    '.tic-code/reverse-engineering/ui/screenshots-index.md': '# Screenshots Index\n\nNenhum screenshot importado.\n',
    '.tic-code/reverse-engineering/ui/ui-analysis.md': '# UI Analysis\n\nLacuna: screenshots não fornecidas.\n',
    '.tic-code/reverse-engineering/ui/user-flows.md': '# User Flows\n\nLacuna: sem fluxo inferido por falta de imagens.\n',
    '.tic-code/reverse-engineering/ui/screenshots-analysis.json': '[]\n',
    '.tic-code/reverse-engineering/database/README.md': '# Database\n\nArtefatos de banco gerados por análise estática.\n',
    '.tic-code/reverse-engineering/database/tables.md': '# Tables\n\nBanco não detectado ou sem DDL explícito.\n',
    '.tic-code/reverse-engineering/database/views.md': '# Views\n\nSem views detectadas.\n',
    '.tic-code/reverse-engineering/database/procedures.md': '# Procedures\n\nSem procedures detectadas.\n',
    '.tic-code/reverse-engineering/database/functions.md': '# Functions\n\nSem functions detectadas.\n',
    '.tic-code/reverse-engineering/database/triggers.md': '# Triggers\n\nSem triggers detectadas.\n',
    '.tic-code/reverse-engineering/database/packages.md': '# Packages\n\nSem packages detectados.\n',
    '.tic-code/reverse-engineering/design-system/tokens.md': '# Tokens\n\nDesign system não detectado (lacuna explícita).\n',
    '.tic-code/reverse-engineering/design-system/components.md': '# Components\n\nSem componentes de design system catalogados.\n',
    '.tic-code/reverse-engineering/design-system/themes.md': '# Themes\n\nSem themes explícitos detectados.\n',
    '.tic-code/reverse-engineering/review-report.md': '# Review Report\n\nValidação executada sobre artefatos disponíveis.\n',
    '.tic-code/reverse-engineering/changelog.md': '# Changelog\n\n- Sessão inicial registrada.\n',
    '.tic-code/reversa/chronicler/session.md': '# Session\n\nSessão de análise registrada.\n',
    '.tic-code/reversa/chronicler/history.json': '{\"sessions\":[]}\n'
  };
  for (const [path, content] of Object.entries(files)) {
    await write(root, path, content);
  }
}
