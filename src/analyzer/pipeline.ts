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
import { detectBusinessRules } from './detectBusinessRules';
import { detectPermissions } from './detectPermissions';
import { generateMermaidDiagram } from './generateMermaidDiagram';
import { generateGapsReport } from './generateGapsReport';
import { generateOpenApi } from './generateOpenApi';
import { detectFrontendCalls } from './detectFrontendCalls';
import { detectPlsqlObjects } from './detectPlsqlObjects';
import { detectBackendDbCalls } from './detectBackendDbCalls';
import { buildCallGraph } from './buildCallGraph';
import { generateMultiGraph } from './generateMultiGraph';
import { buildImpactIndex } from './buildImpactIndex';
import { computeMetrics } from './computeMetrics';
import { detectLayerViolations } from './detectLayerViolations';
import { generateMetricsReport } from './generateMetricsReport';
import { detectInheritance, formatInheritanceReport } from './detectInheritance';
import { detectPatterns, formatPatternsReport } from './detectPatterns';
import { detectDbSchema, formatDbSchemaReport, formatDbSchemaSummary } from './detectDbSchema';
import { exportAnalysis } from './exportAnalysis';
import { loadFileCache, computeChangedFiles, saveFileCache } from './buildFileCache';

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
  plsqlObjects: number;
  frontendCalls: number;
  dbCalls: number;
  hotspots: number;
  violations: number;
  patterns: number;
  impactedFiles: number;
  inheritanceClasses: number;
  dbTables: number;
  cacheHits: number;
  error?: string;
}

export type ProgressCallback = (progress: PipelineProgress) => void;

const PHASES: PipelinePhase[] = [
  { id: 'scan', label: 'Escaneando arquivos', status: 'pending' },
  { id: 'stack', label: 'Detectando stack', status: 'pending' },
  { id: 'graph', label: 'Mapeando dependências', status: 'pending' },
  { id: 'risks', label: 'Detectando riscos', status: 'pending' },
  { id: 'endpoints', label: 'Detectando endpoints REST', status: 'pending' },
  { id: 'frontend-calls', label: 'Detectando chamadas HTTP (frontend)', status: 'pending' },
  { id: 'plsql', label: 'Analisando procedures PL/SQL', status: 'pending' },
  { id: 'db-calls', label: 'Mapeando chamadas backend→banco', status: 'pending' },
  { id: 'modules', label: 'Detectando módulos', status: 'pending' },
  { id: 'context', label: 'Gerando quick-context.md', status: 'pending' },
  { id: 'module-context', label: 'Gerando contextos por módulo', status: 'pending' },
  { id: 'business-rules', label: 'Extraindo regras de negócio', status: 'pending' },
  { id: 'permissions', label: 'Mapeando permissões e roles', status: 'pending' },
  { id: 'index', label: 'Gerando index.md', status: 'pending' },
  { id: 'diagram', label: 'Gerando diagrama Mermaid', status: 'pending' },
  { id: 'openapi', label: 'Gerando openapi.yaml', status: 'pending' },
  { id: 'gaps', label: 'Gerando relatório de gaps', status: 'pending' },
  { id: 'multigraph', label: 'Gerando multi-grafo (frontend→endpoint→backend→PL/SQL)', status: 'pending' },
  { id: 'impact', label: 'Construindo índice de impacto', status: 'pending' },
  { id: 'metrics', label: 'Computando métricas de qualidade', status: 'pending' },
  { id: 'inheritance', label: 'Detectando hierarquia de classes', status: 'pending' },
  { id: 'patterns', label: 'Identificando padrões arquiteturais', status: 'pending' },
  { id: 'db-schema', label: 'Detectando schema de banco de dados', status: 'pending' },
  { id: 'export-json', label: 'Exportando analysis.json', status: 'pending' },
  { id: 'ai-files', label: 'Gerando arquivos para IA', status: 'pending' }
];

export async function runPipeline(projectPath: string, onProgress: ProgressCallback): Promise<PipelineResult> {
  const normalized = projectPath.replace(/[\\/]$/, '');
  if (normalized.endsWith('.tic-code')) {
    return {
      success: false, outputPath: '', totalFiles: 0, totalLines: 0, modulesGenerated: 0,
      quickContextTokens: 0, plsqlObjects: 0, frontendCalls: 0, dbCalls: 0,
      hotspots: 0, violations: 0, patterns: 0, impactedFiles: 0, inheritanceClasses: 0, dbTables: 0, cacheHits: 0,
      error: `Pasta inválida: "${projectPath}"\n\nSelecione a pasta RAIZ do projeto, não a pasta .tic-code.\nExemplo correto: C:\\Git\\meu-projeto`
    };
  }

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
    fs.mkdirSync(ticCodeDir, { recursive: true });
    fs.mkdirSync(modulesDir, { recursive: true });

    // ── CACHE ─────────────────────────────────────────────────────────────────────
    const previousCache = loadFileCache(ticCodeDir);

    // ── 1. SCAN ──────────────────────────────────────────────────────────────────
    report('scan', 5, 'Iniciando scan...');
    const files = scanFiles(projectPath, {
      onProgress: (count, current) => {
        if (count % 1000 === 0) report('scan', 5, `${count.toLocaleString()} arquivos — ${current}`);
      }
    });
    const totalLines = files.reduce((sum, f) => sum + f.lines, 0);
    const changedFiles = computeChangedFiles(files, previousCache);
    const isIncremental = previousCache !== null && changedFiles.size < files.length;
    markDone('scan');
    report('scan', 100, `${files.length.toLocaleString()} arquivos${isIncremental ? ` (${changedFiles.size} alterados)` : ''}, ${totalLines.toLocaleString()} linhas`);

    // ── 2. STACK ─────────────────────────────────────────────────────────────────
    report('stack', 10, 'Detectando linguagens e frameworks...');
    const stack = detectStack(projectPath, files);
    markDone('stack');
    report('stack', 100, `${stack.primaryLanguage} — ${stack.frameworks.join(', ') || 'sem frameworks'}`);

    // ── 3. GRAFO ─────────────────────────────────────────────────────────────────
    report('graph', 18, 'Construindo grafo de dependências...');
    const graph = buildDependencyGraph(files, projectPath);
    // Salva para o visualizador interativo
    fs.writeFileSync(path.join(ticCodeDir, 'dep-graph.json'), JSON.stringify({ nodes: graph.nodes.slice(0, 3000), edges: graph.edges.slice(0, 5000) }), 'utf8');
    markDone('graph');
    report('graph', 100, `${graph.nodes.length.toLocaleString()} nós, ${graph.edges.length.toLocaleString()} arestas`);

    // ── 4. RISCOS ────────────────────────────────────────────────────────────────
    report('risks', 26, 'Detectando riscos técnicos...');
    const risks = detectRisks(files);
    markDone('risks');
    report('risks', 100, `${risks.length} riscos detectados`);

    // ── 5. ENDPOINTS ─────────────────────────────────────────────────────────────
    report('endpoints', 34, 'Detectando endpoints REST...');
    const endpoints = detectEndpoints(files);
    markDone('endpoints');
    report('endpoints', 100, `${endpoints.length} endpoints detectados`);

    // ── 5b. FRONTEND CALLS ───────────────────────────────────────────────────────
    report('frontend-calls', 36, 'Detectando fetch/axios/HttpClient...');
    const frontendCallsData = detectFrontendCalls(files);
    markDone('frontend-calls');
    report('frontend-calls', 100, `${frontendCallsData.length} chamadas HTTP detectadas`);

    // ── 5c. PL/SQL ───────────────────────────────────────────────────────────────
    report('plsql', 38, 'Extraindo procedures, functions e packages PL/SQL...');
    const { objects: plsqlObjects, calls: plsqlCalls } = detectPlsqlObjects(files);
    markDone('plsql');
    report('plsql', 100, `${plsqlObjects.length} objetos PL/SQL, ${plsqlCalls.length} chamadas`);

    // ── 5d. BACKEND DB CALLS ─────────────────────────────────────────────────────
    report('db-calls', 40, 'Mapeando chamadas JDBC/oracledb/StoredProcedure...');
    const dbCallsData = detectBackendDbCalls(files);
    markDone('db-calls');
    report('db-calls', 100, `${dbCallsData.length} ligações backend→PL/SQL`);

    // ── 6. MÓDULOS ───────────────────────────────────────────────────────────────
    report('modules', 42, 'Detectando módulos por estrutura de diretório...');
    const modules = detectModules(files);
    markDone('modules');
    report('modules', 100, `${modules.length} módulos detectados`);

    const projectName = path.basename(projectPath);
    const generatedAt = new Date().toISOString();

    // ── 7. QUICK-CONTEXT ─────────────────────────────────────────────────────────
    report('context', 46, 'Gerando quick-context.md...');
    const quickContextContent = generateQuickContext({
      projectName, rootPath: projectPath, totalFiles: files.length,
      totalLines, stack, modules, risks, endpoints, graph, generatedAt
    });
    fs.writeFileSync(path.join(ticCodeDir, 'quick-context.md'), quickContextContent, 'utf8');
    const quickContextTokens = Math.ceil(quickContextContent.length / 4);
    markDone('context');
    report('context', 100, `~${quickContextTokens.toLocaleString()} tokens`);

    // ── 8. MÓDULOS CONTEXTO ──────────────────────────────────────────────────────
    report('module-context', 50, `Gerando contextos para ${modules.length} módulos...`);
    let modulesDone = 0;
    let moduleCacheHits = 0;
    for (const mod of modules) {
      const moduleDir = path.join(modulesDir, mod.name);
      const contextPath = path.join(moduleDir, 'context.md');
      const hasChange = mod.files.some((f) => changedFiles.has(f.relativePath));
      if (!hasChange && fs.existsSync(contextPath)) {
        moduleCacheHits++;
        modulesDone++;
        const pct = 50 + Math.floor((modulesDone / modules.length) * 8);
        report('module-context', pct, `${mod.name} ✓ cache (${modulesDone}/${modules.length})`);
        continue;
      }
      fs.mkdirSync(moduleDir, { recursive: true });
      const contextContent = generateModuleContext({ module: mod, risks, endpoints, graph, projectName });
      fs.writeFileSync(contextPath, contextContent, 'utf8');
      modulesDone++;
      const pct = 50 + Math.floor((modulesDone / modules.length) * 8);
      report('module-context', pct, `${mod.name} (${modulesDone}/${modules.length})`);
    }
    markDone('module-context');

    // ── 9. REGRAS DE NEGÓCIO ────────────────────────────────────────────────────
    report('business-rules', 58, 'Extraindo validações, enums, guards...');
    const rules = detectBusinessRules(files);
    for (const mod of modules) {
      const modRules = rules.filter((r) => mod.files.some((f) => f.relativePath === r.file));
      if (modRules.length === 0) continue;
      const moduleDir = path.join(modulesDir, mod.name);
      const lines = [
        `# Regras de Negócio — ${mod.name}`, '',
        '| Tipo | Marca | Descrição | Arquivo | Linha |',
        '| --- | --- | --- | --- | --- |',
        ...modRules.map((r) => `| ${r.type} | ${r.mark} | ${r.description.replace(/\|/g, '/')} | \`${r.file}\` | ${r.line} |`)
      ];
      fs.writeFileSync(path.join(moduleDir, 'business-rules.md'), lines.join('\n'), 'utf8');
    }
    markDone('business-rules');
    report('business-rules', 100, `${rules.length} regras extraídas`);

    // ── 10. PERMISSÕES ──────────────────────────────────────────────────────────
    report('permissions', 60, 'Mapeando guards e roles...');
    const permissions = detectPermissions(files, endpoints);
    if (permissions.length > 0) {
      const permLines = [
        '# Matriz de Permissões — TIC Analyzer', '',
        '> 🟢 = extraído diretamente de anotação/decorator no código', '',
        '| Rota | Método | Roles | Arquivo | Linha |',
        '| --- | --- | --- | --- | --- |',
        ...permissions.map((p) => `| \`${p.route}\` | ${p.method} | ${p.roles.join(', ')} | \`${p.file}\` | ${p.line} |`)
      ];
      fs.writeFileSync(path.join(ticCodeDir, 'permissions.md'), permLines.join('\n'), 'utf8');
    }
    markDone('permissions');
    report('permissions', 100, `${permissions.length} entradas de permissão mapeadas`);

    // ── 11. INDEX ────────────────────────────────────────────────────────────────
    report('index', 62, 'Gerando index.md...');
    const indexContent = generateMasterIndex({ projectName, totalFiles: files.length, totalLines, stack, modules, risks, generatedAt });
    fs.writeFileSync(path.join(ticCodeDir, 'index.md'), indexContent, 'utf8');
    markDone('index');

    // ── 12. DIAGRAMA MERMAID ────────────────────────────────────────────────────
    report('diagram', 64, 'Gerando diagrama de módulos...');
    generateMermaidDiagram(ticCodeDir, modules, graph);
    markDone('diagram');
    report('diagram', 100, 'diagram.md gerado');

    // ── 13. OPENAPI ─────────────────────────────────────────────────────────────
    report('openapi', 66, 'Convertendo endpoints para OpenAPI...');
    generateOpenApi(ticCodeDir, endpoints, stack);
    markDone('openapi');
    report('openapi', 100, `openapi.yaml com ${endpoints.length} endpoints`);

    // ── 14. GAPS ────────────────────────────────────────────────────────────────
    report('gaps', 68, 'Analisando lacunas...');
    generateGapsReport(ticCodeDir, modules, endpoints, graph, rules, files.length);
    markDone('gaps');
    report('gaps', 100, 'gaps.md gerado');

    // ── 15. MULTI-GRAFO ──────────────────────────────────────────────────────────
    report('multigraph', 70, 'Construindo grafo Frontend→Endpoint→Backend→PL/SQL...');
    const callGraph = buildCallGraph(frontendCallsData, endpoints, plsqlObjects, plsqlCalls, dbCallsData);
    generateMultiGraph(ticCodeDir, callGraph);
    // Salva JSON do call-graph para o visualizador interativo
    fs.writeFileSync(path.join(ticCodeDir, 'call-graph.json'), JSON.stringify(callGraph), 'utf8');
    markDone('multigraph');
    report('multigraph', 100, `${callGraph.nodes.length} nós, ${callGraph.edges.length} arestas`);

    // ── 16. IMPACTO ───────────────────────────────────────────────────────────────
    report('impact', 74, 'Construindo índice de impacto de mudanças...');
    const impactIndex = buildImpactIndex(graph);
    fs.writeFileSync(path.join(ticCodeDir, 'impact-index.json'), JSON.stringify(impactIndex), 'utf8');
    const impactedFiles = Object.keys(impactIndex).length;
    markDone('impact');
    report('impact', 100, `${impactedFiles} arquivos com dependentes mapeados`);

    // ── 17. MÉTRICAS ─────────────────────────────────────────────────────────────
    report('metrics', 78, 'Computando complexidade ciclomática e dívida técnica...');
    const metrics = computeMetrics(files, graph, modules);
    const violations = detectLayerViolations(files, graph);
    generateMetricsReport(ticCodeDir, metrics, violations);
    markDone('metrics');
    report('metrics', 100, `${metrics.hotspotCount} hotspots, ${violations.length} violações arquiteturais`);

    // ── 18. HERANÇA ───────────────────────────────────────────────────────────────
    report('inheritance', 84, 'Detectando hierarquia de classes...');
    const inheritanceTree = detectInheritance(files);
    if (inheritanceTree.classes.length > 0) {
      const inheritanceReport = formatInheritanceReport(inheritanceTree);
      fs.writeFileSync(path.join(ticCodeDir, 'inheritance.md'), inheritanceReport, 'utf8');
    }
    markDone('inheritance');
    report('inheritance', 100, `${inheritanceTree.classes.length} classes detectadas, profundidade máx ${inheritanceTree.maxDepth}`);

    // ── 19. PADRÕES ARQUITETURAIS ─────────────────────────────────────────────────
    report('patterns', 88, 'Identificando padrões arquiteturais...');
    const patternMatches = detectPatterns(files);
    const patternsReport = formatPatternsReport(patternMatches);
    if (patternsReport) {
      fs.writeFileSync(path.join(ticCodeDir, 'patterns.md'), patternsReport, 'utf8');
    }
    // Padrões por módulo
    for (const mod of modules) {
      const modPatterns = patternMatches.filter((m) => mod.files.some((f) => f.relativePath === m.file));
      if (modPatterns.length === 0) continue;
      const moduleDir = path.join(modulesDir, mod.name);
      const modReport = formatPatternsReport(modPatterns);
      if (modReport) fs.writeFileSync(path.join(moduleDir, 'patterns.md'), modReport, 'utf8');
    }
    markDone('patterns');
    report('patterns', 100, `${patternMatches.length} padrões detectados`);

    // ── 20. SCHEMA DE BANCO ───────────────────────────────────────────────────────
    report('db-schema', 90, 'Detectando tabelas, models, migrations...');
    const dbSchema = detectDbSchema(files);
    if (dbSchema.totalTables > 0) {
      fs.writeFileSync(path.join(ticCodeDir, 'db-schema.md'), formatDbSchemaReport(dbSchema), 'utf8');
      fs.writeFileSync(path.join(ticCodeDir, 'db-schema.json'), JSON.stringify(dbSchema), 'utf8');
      fs.writeFileSync(path.join(ticCodeDir, 'db-schema-summary.md'), formatDbSchemaSummary(dbSchema), 'utf8');
    }
    markDone('db-schema');
    report('db-schema', 100, `${dbSchema.totalTables} tabelas/models detectadas (${dbSchema.detectedVia.join(', ') || 'nenhuma'})`);

    // ── 21. EXPORT JSON ───────────────────────────────────────────────────────────
    report('export-json', 92, 'Exportando analysis.json estruturado...');
    exportAnalysis(ticCodeDir, {
      projectName, projectPath, files, totalLines, stack, modules, endpoints, graph, risks,
      metrics, fileMetrics: metrics.files, violations, patternMatches, inheritanceTree,
      dbSchema, impactIndex, quickContextTokens
    });
    markDone('export-json');
    report('export-json', 100, 'analysis.json exportado');

    // ── SALVA CACHE ───────────────────────────────────────────────────────────────
    saveFileCache(ticCodeDir, files);

    // ── 22. ARQUIVOS PARA IA ─────────────────────────────────────────────────────
    report('ai-files', 94, 'Gerando copilot-instructions.md e CLAUDE.md...');
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
      quickContextTokens,
      plsqlObjects: plsqlObjects.length,
      frontendCalls: frontendCallsData.length,
      dbCalls: dbCallsData.length,
      hotspots: metrics.hotspotCount,
      violations: violations.length,
      patterns: patternMatches.length,
      impactedFiles,
      inheritanceClasses: inheritanceTree.classes.length,
      dbTables: dbSchema.totalTables,
      cacheHits: moduleCacheHits
    };

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      success: false, outputPath: ticCodeDir, totalFiles: 0, totalLines: 0, modulesGenerated: 0,
      quickContextTokens: 0, plsqlObjects: 0, frontendCalls: 0, dbCalls: 0,
      hotspots: 0, violations: 0, patterns: 0, impactedFiles: 0, inheritanceClasses: 0, dbTables: 0, cacheHits: 0, error
    };
  }
}

function writeCopilotInstructions(projectPath: string, projectName: string, totalFiles: number, modules: ReturnType<typeof detectModules>): void {
  const githubDir = path.join(projectPath, '.github');
  fs.mkdirSync(githubDir, { recursive: true });
  const moduleList = modules.slice(0, 10).map((m) => `  - \`${m.name}\` (${m.fileCount} arquivos)`).join('\n');
  const content = `# ${projectName} — GitHub Copilot Instructions (TIC Analyzer)\n\n> Projeto com ${totalFiles.toLocaleString()} arquivos. Modo Large Project ativo.\n\n## Instruções Operacionais\n\nAntes de sugerir alterações:\n\n1. **Leia apenas** \`.tic-code/quick-context.md\` para contexto geral\n2. **Para módulo específico:** leia \`.tic-code/modules/{nome}/context.md\`\n3. **Para impacto de mudança:** leia \`.tic-code/impact-index.json\` (ou use MCP tool get_impact)\n4. **Para métricas:** leia \`.tic-code/metrics-summary.md\`\n\n## Módulos Disponíveis\n\n${moduleList}\n\n> Lista completa: \`.tic-code/index.md\`\n`;
  fs.writeFileSync(path.join(githubDir, 'copilot-instructions.md'), content, 'utf8');
}

function writeClaudeMd(projectPath: string, projectName: string, totalFiles: number, modules: ReturnType<typeof detectModules>): void {
  const moduleList = modules.slice(0, 10).map((m) => `- \`.tic-code/modules/${m.name}/context.md\` — ${m.fileCount} arquivos`).join('\n');
  const content = `# ${projectName} — Claude Code Context (TIC Analyzer)\n\n> ${totalFiles.toLocaleString()} arquivos. Large Project Mode.\n\n## Navegação\n\n1. Visão geral: \`.tic-code/quick-context.md\`\n2. Módulo específico: \`.tic-code/modules/{nome}/context.md\`\n3. Mapa completo: \`.tic-code/index.md\`\n4. Impacto de mudança: MCP tool \`get_impact(file)\` (~200 tokens)\n5. Métricas: \`.tic-code/metrics-summary.md\`\n6. Padrões: \`.tic-code/patterns.md\`\n7. Herança: \`.tic-code/inheritance.md\`\n\n## Módulos Principais\n\n${moduleList}\n\n## MCP Server\n\nSe TIC Analyzer rodando em \`localhost:7432\`:\n- \`list_modules()\`, \`get_module("nome")\`, \`get_quick_context()\`\n- \`get_impact("arquivo.ts")\` — quem depende deste arquivo\n- \`get_metrics("módulo")\` — complexidade e dívida técnica\n- \`get_hotspots()\` — arquivos críticos do projeto\n- \`get_patterns()\` — padrões arquiteturais detectados\n`;
  fs.writeFileSync(path.join(projectPath, 'CLAUDE.md'), content, 'utf8');
}
