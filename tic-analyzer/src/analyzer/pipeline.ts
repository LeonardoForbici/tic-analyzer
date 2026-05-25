import * as fs from 'fs';
import * as path from 'path';
import { scanFiles } from './scanFiles';
import { detectStack } from './detectStack';
import { detectModules } from './detectModules';
import { detectRisks } from './detectRisks';
import { detectEndpoints } from './detectEndpoints';
import { buildDependencyGraph } from './buildDependencyGraph';
import { generateQuickContext } from './generateQuickContext';
import { generateModuleContext } from './generateModuleContext';
import { generateMasterIndex } from './generateMasterIndex';

export type PhaseStatus = 'pending' | 'running' | 'done' | 'error';

export interface PipelinePhase {
  id: string;
  label: string;
  status: PhaseStatus;
  detail?: string;
}

export interface PipelineProgress {
  phase: string;
  percent: number;
  detail: string;
  phases: PipelinePhase[];
}

export interface PipelineResult {
  success: boolean;
  outputPath: string;
  totalFiles: number;
  totalLines: number;
  modulesGenerated: number;
  quickContextTokens: number;
  error?: string;
}

export type ProgressCallback = (progress: PipelineProgress) => void;

const PHASES: PipelinePhase[] = [
  { id: 'scan', label: 'Escaneando arquivos', status: 'pending' },
  { id: 'stack', label: 'Detectando stack', status: 'pending' },
  { id: 'graph', label: 'Mapeando dependências', status: 'pending' },
  { id: 'risks', label: 'Detectando riscos', status: 'pending' },
  { id: 'endpoints', label: 'Detectando endpoints', status: 'pending' },
  { id: 'modules', label: 'Detectando módulos', status: 'pending' },
  { id: 'context', label: 'Gerando quick-context.md', status: 'pending' },
  { id: 'module-context', label: 'Gerando contextos por módulo', status: 'pending' },
  { id: 'index', label: 'Gerando index.md', status: 'pending' },
  { id: 'ai-files', label: 'Gerando arquivos para IA', status: 'pending' }
];

export async function runPipeline(projectPath: string, onProgress: ProgressCallback): Promise<PipelineResult> {
  const phases = PHASES.map((p) => ({ ...p }));
  const ticCodeDir = path.join(projectPath, '.tic-code');
  const modulesDir = path.join(ticCodeDir, 'modules');

  const report = (phaseId: string, percent: number, detail: string) => {
    const phase = phases.find((p) => p.id === phaseId);
    if (phase) {
      phase.status = percent === 100 ? 'done' : 'running';
      if (phase.status === 'running') phase.detail = detail;
    }
    onProgress({ phase: phaseId, percent, detail, phases: [...phases] });
  };

  const markDone = (phaseId: string) => {
    const phase = phases.find((p) => p.id === phaseId);
    if (phase) phase.status = 'done';
  };

  try {
    // Garante que .tic-code existe
    fs.mkdirSync(ticCodeDir, { recursive: true });
    fs.mkdirSync(modulesDir, { recursive: true });

    // ── 1. SCAN ──────────────────────────────────────────────────────────────────
    report('scan', 5, 'Iniciando scan...');
    let scannedCount = 0;

    const files = scanFiles(projectPath, {
      onProgress: (count, current) => {
        scannedCount = count;
        if (count % 1000 === 0) {
          report('scan', 5, `${count.toLocaleString()} arquivos escaneados — ${current}`);
        }
      }
    });

    const totalLines = files.reduce((sum, f) => sum + f.lines, 0);
    markDone('scan');
    report('scan', 100, `${files.length.toLocaleString()} arquivos, ${totalLines.toLocaleString()} linhas`);

    // ── 2. STACK ─────────────────────────────────────────────────────────────────
    report('stack', 15, 'Detectando linguagens e frameworks...');
    const stack = detectStack(projectPath, files);
    markDone('stack');
    report('stack', 100, `${stack.primaryLanguage} — ${stack.frameworks.join(', ') || 'sem frameworks'}`);

    // ── 3. GRAFO ─────────────────────────────────────────────────────────────────
    report('graph', 25, 'Construindo grafo de dependências...');
    const graph = buildDependencyGraph(files, projectPath);
    markDone('graph');
    report('graph', 100, `${graph.nodes.length.toLocaleString()} nós, ${graph.edges.length.toLocaleString()} arestas`);

    // ── 4. RISCOS ────────────────────────────────────────────────────────────────
    report('risks', 40, 'Detectando riscos técnicos...');
    const risks = detectRisks(files);
    markDone('risks');
    report('risks', 100, `${risks.length} riscos detectados`);

    // ── 5. ENDPOINTS ─────────────────────────────────────────────────────────────
    report('endpoints', 50, 'Detectando endpoints REST...');
    const endpoints = detectEndpoints(files);
    markDone('endpoints');
    report('endpoints', 100, `${endpoints.length} endpoints detectados`);

    // ── 6. MÓDULOS ───────────────────────────────────────────────────────────────
    report('modules', 55, 'Detectando módulos por estrutura de diretório...');
    const modules = detectModules(files);
    markDone('modules');
    report('modules', 100, `${modules.length} módulos detectados`);

    const projectName = path.basename(projectPath);
    const generatedAt = new Date().toISOString();

    // ── 7. QUICK-CONTEXT ─────────────────────────────────────────────────────────
    report('context', 60, 'Gerando quick-context.md...');
    const quickContextContent = generateQuickContext({
      projectName, rootPath: projectPath, totalFiles: files.length,
      totalLines, stack, modules, risks, endpoints, graph, generatedAt
    });
    fs.writeFileSync(path.join(ticCodeDir, 'quick-context.md'), quickContextContent, 'utf8');
    const quickContextTokens = Math.ceil(quickContextContent.length / 4);
    markDone('context');
    report('context', 100, `~${quickContextTokens.toLocaleString()} tokens`);

    // ── 8. MÓDULOS CONTEXTO ──────────────────────────────────────────────────────
    report('module-context', 65, `Gerando contextos para ${modules.length} módulos...`);
    let modulesDone = 0;

    for (const mod of modules) {
      const moduleDir = path.join(modulesDir, mod.name);
      fs.mkdirSync(moduleDir, { recursive: true });

      const contextContent = generateModuleContext({ module: mod, risks, endpoints, graph, projectName });
      fs.writeFileSync(path.join(moduleDir, 'context.md'), contextContent, 'utf8');

      modulesDone++;
      const pct = 65 + Math.floor((modulesDone / modules.length) * 20);
      report('module-context', pct, `${mod.name} (${modulesDone}/${modules.length})`);
    }

    markDone('module-context');

    // ── 9. INDEX ────────────────────────────────────────────────────────────────
    report('index', 85, 'Gerando index.md...');
    const indexContent = generateMasterIndex({
      projectName, totalFiles: files.length, totalLines, stack, modules, risks, generatedAt
    });
    fs.writeFileSync(path.join(ticCodeDir, 'index.md'), indexContent, 'utf8');
    markDone('index');

    // ── 10. ARQUIVOS PARA IA ─────────────────────────────────────────────────────
    report('ai-files', 90, 'Gerando copilot-instructions.md e CLAUDE.md...');
    writeCopilotInstructions(projectPath, projectName, files.length, modules);
    writeClaudeMd(projectPath, projectName, files.length, modules);
    markDone('ai-files');

    report('ai-files', 100, 'Concluído!');

    return {
      success: true,
      outputPath: ticCodeDir,
      totalFiles: files.length,
      totalLines,
      modulesGenerated: modules.length,
      quickContextTokens
    };

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, outputPath: ticCodeDir, totalFiles: 0, totalLines: 0, modulesGenerated: 0, quickContextTokens: 0, error };
  }
}

function writeCopilotInstructions(projectPath: string, projectName: string, totalFiles: number, modules: ReturnType<typeof detectModules>): void {
  const githubDir = path.join(projectPath, '.github');
  fs.mkdirSync(githubDir, { recursive: true });

  const moduleList = modules.slice(0, 10).map((m) => `  - \`${m.name}\` (${m.fileCount} arquivos)`).join('\n');

  const content = `# ${projectName} — GitHub Copilot Instructions (TIC Analyzer)

> Projeto com ${totalFiles.toLocaleString()} arquivos. Modo Large Project ativo.
> Análise gerada localmente pelo TIC Analyzer — zero tokens de IA na análise.

## Instruções Operacionais

Antes de sugerir alterações:

1. **Leia apenas** \`.tic-code/quick-context.md\` para contexto geral (~12k tokens)
2. **Para módulo específico:** leia \`.tic-code/modules/{nome}/context.md\`
3. **NÃO carregue** todos os módulos de uma vez

## Módulos Disponíveis

${moduleList}

> Lista completa: \`.tic-code/index.md\`

## Regra de Ouro

> Leia APENAS o módulo relevante para a pergunta atual.
> Cada arquivo de módulo cabe em ~75k tokens — seguro para requests premium.
`;

  fs.writeFileSync(path.join(githubDir, 'copilot-instructions.md'), content, 'utf8');
}

function writeClaudeMd(projectPath: string, projectName: string, totalFiles: number, modules: ReturnType<typeof detectModules>): void {
  const moduleList = modules.slice(0, 10).map((m) => `- \`.tic-code/modules/${m.name}/context.md\` — ${m.fileCount} arquivos`).join('\n');

  const content = `# ${projectName} — Claude Code Context (TIC Analyzer)

> ${totalFiles.toLocaleString()} arquivos. Large Project Mode. Análise local, zero tokens de IA.

## Navegação

1. Para visão geral: leia \`.tic-code/quick-context.md\`
2. Para módulo específico: leia \`.tic-code/modules/{nome}/context.md\`
3. Para mapa completo: leia \`.tic-code/index.md\`

## Módulos Principais

${moduleList}

## MCP Server (se disponível)

Se o TIC Analyzer estiver rodando como MCP Server (\`localhost:7432\`):
- \`list_modules()\` — lista todos os módulos
- \`get_module("nome")\` — contexto do módulo
- \`get_quick_context()\` — quick-context.md completo
- \`search_module("query")\` — busca por módulo relevante
`;

  fs.writeFileSync(path.join(projectPath, 'CLAUDE.md'), content, 'utf8');
}
