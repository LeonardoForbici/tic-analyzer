import * as fs from 'fs';
import * as path from 'path';
import { scanFiles, type ScannedFile } from './scanFiles';
import { detectStack } from './detectStack';
import { detectModules } from './detectModules';
import { detectRisks } from './detectRisks';
import { detectEndpoints } from './detectEndpoints';
import { buildDependencyGraph, type DependencyGraph } from './buildDependencyGraph';
import { detectOswLinks } from './detectOswLinks';
import { generateQuickContext } from './generateQuickContext';
import { generateModuleContext } from './generateModuleContext';
import { generateMasterIndex } from './generateMasterIndex';
import { detectBusinessRules } from './detectBusinessRules';
import { detectPermissions } from './detectPermissions';
import { generateMermaidDiagram } from './generateMermaidDiagram';
import { generateGapsReport } from './generateGapsReport';
import { generateOpenApi } from './generateOpenApi';
import { detectFrontendCalls } from './detectFrontendCalls';
import { detectPlsqlObjects, type PlsqlObject, type PlsqlCall } from './detectPlsqlObjects';
import { detectBackendDbCalls, type DbCall } from './detectBackendDbCalls';
import { detectTransactions, formatTransactionsReport } from './detectTransactions';
import { detectBatchJobs, formatBatchJobsReport } from './detectBatchJobs';
import { detectAngularModules, formatAngularModulesReport } from './detectAngularModules';
import { buildCallGraph } from './buildCallGraph';
import { detectOrmMappings } from './detectOrmMappings';
import { getEmbedder } from './semantic/embeddings';
import type { SearchIndexEntry } from './buildSearchIndex';
import { generateMultiGraph } from './generateMultiGraph';
import { buildImpactIndex } from './buildImpactIndex';
import { buildImpactGraph } from './buildImpactGraph';
import { computeMetrics } from './computeMetrics';
import { detectLayerViolations } from './detectLayerViolations';
import { generateMetricsReport } from './generateMetricsReport';
import { detectInheritance, formatInheritanceReport } from './detectInheritance';
import { detectPatterns, formatPatternsReport } from './detectPatterns';
import { detectDbSchema, formatDbSchemaReport, formatDbSchemaSummary } from './detectDbSchema';
import { exportAnalysis } from './exportAnalysis';
import { buildSearchIndex } from './buildSearchIndex';
import { writeIndexDb, INDEX_DB_FILE } from './store/indexDb';
import { loadFileCache, computeChangedFiles, saveFileCache } from './buildFileCache';
import { computeHealthScore } from './computeHealthScore';
import { appendSnapshot, loadSnapshots } from './store/snapshots';
import { loadArchRules, checkArchRules, buildFileInfoLookup, writeRulesExample, findDeepeningCandidates } from './checkArchRules';
import { collectChurn, predictRisk, type RiskPrediction } from './computeRiskPrediction';
import { collectAuthorship, computeOwnership } from './computeOwnership';
import { computeRoi } from './computeRoi';
import { appendEvents, makeEvent } from './store/activityLog';
import { computeSelfDelta, computePredictionFeedback, type PredictionAccuracy } from './computeDelta';
import { syncTriageItems, type TriageCandidate } from './store/triageStore';
import { generateZoomOut } from './generateZoomOut';

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
  transactions: number;
  batchJobs: number;
  angularModules: number;
  deadComponents: number;
  /** Arestas do grafo de impacto unificado (file/method/plsql/table/column). */
  impactEdges?: number;
  /** Health score do projeto (0–100) e grade (A–E). */
  healthScore?: number;
  healthGrade?: string;
  /** Governança: violações de regra (.tic-rules.json) e predição de risco. */
  archViolations?: number;
  riskPredictions?: number;
  roiDebtCost?: number;
  roiHoursSaved?: number;
  /** Arquivos que reusaram símbolos do cache AST na re-análise incremental. */
  astCacheHits?: number;
  triageItems?: number;
  activityEvents?: number;
  /** Duração (ms) por fase — para identificar gargalos em projetos grandes. */
  phaseTimings?: Record<string, number>;
  error?: string;
}

export type ProgressCallback = (progress: PipelineProgress) => void;

export interface PipelineOptions {
  /** Pula a geração de CLAUDE.md/copilot-instructions.md no projeto analisado (CI não deve sujar o checkout). */
  skipAiFiles?: boolean;
}

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
  { id: 'impact-graph', label: 'Consolidando grafo de impacto unificado', status: 'pending' },
  { id: 'metrics', label: 'Computando métricas de qualidade', status: 'pending' },
  { id: 'arch-rules', label: 'Validando regras de arquitetura (.tic-rules.json)', status: 'pending' },
  { id: 'predict', label: 'Predição de risco (churn × acoplamento)', status: 'pending' },
  { id: 'ownership', label: 'Mapeando ownership e bus-factor', status: 'pending' },
  { id: 'roi', label: 'Calculando ROI (tempo & custo)', status: 'pending' },
  { id: 'inheritance', label: 'Detectando hierarquia de classes', status: 'pending' },
  { id: 'patterns', label: 'Identificando padrões arquiteturais', status: 'pending' },
  { id: 'db-schema', label: 'Detectando schema de banco de dados', status: 'pending' },
  { id: 'transactions', label: 'Detectando @Transactional boundaries', status: 'pending' },
  { id: 'batch-jobs', label: 'Detectando @Scheduled, @Async e batch jobs', status: 'pending' },
  { id: 'angular-modules', label: 'Detectando módulos Angular e NgRx', status: 'pending' },
  { id: 'dead-components', label: 'Detectando componentes sem uso (dead code)', status: 'pending' },
  { id: 'health', label: 'Computando health score do projeto', status: 'pending' },
  { id: 'triage', label: 'Sincronizando fila de triagem', status: 'pending' },
  { id: 'zoom-out', label: 'Gerando visão executiva (zoom-out)', status: 'pending' },
  { id: 'activity', label: 'Registrando atividade (delta + predição)', status: 'pending' },
  { id: 'search-index', label: 'Construindo índice de busca por código', status: 'pending' },
  { id: 'persist-index', label: 'Gravando índice consultável (SQLite)', status: 'pending' },
  { id: 'export-json', label: 'Exportando analysis.json', status: 'pending' },
  { id: 'ai-files', label: 'Gerando arquivos para IA', status: 'pending' }
];

export async function runPipeline(projectPath: string, onProgress: ProgressCallback, opts: PipelineOptions = {}): Promise<PipelineResult> {
  const normalized = projectPath.replace(/[\\/]$/, '');
  if (normalized.endsWith('.tic-code')) {
    return {
      success: false, outputPath: '', totalFiles: 0, totalLines: 0, modulesGenerated: 0,
      quickContextTokens: 0, plsqlObjects: 0, frontendCalls: 0, dbCalls: 0,
      hotspots: 0, violations: 0, patterns: 0, impactedFiles: 0, inheritanceClasses: 0, dbTables: 0, cacheHits: 0,
      transactions: 0, batchJobs: 0, angularModules: 0, deadComponents: 0,
      error: `Pasta inválida: "${projectPath}"\n\nSelecione a pasta RAIZ do projeto, não a pasta .tic-code.\nExemplo correto: C:\\Git\\meu-projeto`
    };
  }

  const phases = PHASES.map((p) => ({ ...p }));
  const ticCodeDir = path.join(projectPath, '.tic-code');
  const modulesDir = path.join(ticCodeDir, 'modules');

  const phaseStart = new Map<string, number>();
  const phaseTimings: Record<string, number> = {};

  const report = (phaseId: string, percent: number, detail: string) => {
    if (!phaseStart.has(phaseId)) phaseStart.set(phaseId, Date.now());
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
    const start = phaseStart.get(phaseId);
    if (start !== undefined && !(phaseId in phaseTimings)) phaseTimings[phaseId] = Date.now() - start;
  };

  try {
    fs.mkdirSync(ticCodeDir, { recursive: true });
    fs.mkdirSync(modulesDir, { recursive: true });

    // ── CACHE ─────────────────────────────────────────────────────────────────────
    const previousCache = loadFileCache(ticCodeDir);

    // Estado ANTERIOR (lido antes de qualquer overwrite) — base do self-delta e
    // do loop de aprendizado preditivo na fase 'activity'.
    const readPrev = (file: string): any => {
      try { return JSON.parse(fs.readFileSync(path.join(ticCodeDir, file), 'utf8')); } catch { return null; }
    };
    const previousAnalysis = readPrev('analysis.json');
    const previousPrediction: RiskPrediction[] = Array.isArray(readPrev('risk-prediction.json')) ? readPrev('risk-prediction.json') : [];
    const previousSnapshots = loadSnapshots(ticCodeDir);
    const previousAccuracy = readPrev('prediction-accuracy.json');

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
    report('graph', 18, 'Construindo grafo de dependências (AST + símbolos)...');
    // Incremental: na re-análise, arquivos não alterados reusam os símbolos AST
    // cacheados (pula o tree-sitter, a fase mais cara). 1ª análise = completa.
    const graph = await buildDependencyGraph(files, projectPath, isIncremental ? { changedFiles } : {});

    // Telas .osw (JSON do frontend) → controller de código (kitAssembly.osw →
    // KitAssemblyController.tsx). Mescladas no grafo para fluírem ao impacto.
    const oswEdges = detectOswLinks(files);
    if (oswEdges.length > 0) {
      const nodeByPath = new Map(graph.nodes.map((n) => [n.path, n]));
      for (const e of oswEdges) {
        graph.edges.push(e);
        const from = nodeByPath.get(e.from);
        const to = nodeByPath.get(e.to);
        if (from) from.outDegree++;
        if (to) to.inDegree++;
      }
    }
    // Salva para o visualizador interativo
    fs.writeFileSync(path.join(ticCodeDir, 'dep-graph.json'), JSON.stringify({ nodes: graph.nodes.slice(0, 3000), edges: graph.edges.slice(0, 5000) }), 'utf8');
    markDone('graph');
    const resolvedEdges = graph.edges.filter((e) => e.confidence === 'resolved').length;
    const astNote = graph.astCacheHits ? ` · ${graph.astCacheHits.toLocaleString()} do cache AST` : '';
    report('graph', 100, `${graph.nodes.length.toLocaleString()} nós, ${graph.edges.length.toLocaleString()} arestas (${resolvedEdges.toLocaleString()} resolvidas)${astNote}`);

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
    fs.writeFileSync(path.join(ticCodeDir, 'plsql-objects.json'), JSON.stringify(plsqlObjects), 'utf8');
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

    // ── 12. DIAGRAMA MERMAID (base — será atualizado com HTTP edges na fase 15b) ──
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
    report('multigraph', 70, 'Construindo grafo Frontend→Endpoint→Backend→(PL/SQL + Tabelas)...');
    const orm = detectOrmMappings(files);
    const callGraph = buildCallGraph(frontendCallsData, endpoints, plsqlObjects, plsqlCalls, dbCallsData, orm.tableAccess);
    generateMultiGraph(ticCodeDir, callGraph);
    // Salva JSON do call-graph para o visualizador interativo
    fs.writeFileSync(path.join(ticCodeDir, 'call-graph.json'), JSON.stringify(callGraph), 'utf8');

    // Computa dead PL/SQL (procedures/functions não referenciadas por ninguém)
    const deadPlsql = computeDeadPlsql(plsqlObjects, plsqlCalls, dbCallsData);
    fs.writeFileSync(path.join(ticCodeDir, 'dead-plsql.json'), JSON.stringify(deadPlsql), 'utf8');

    markDone('multigraph');
    report('multigraph', 100, `${callGraph.nodes.length} nós, ${callGraph.edges.length} arestas`);

    // ── 15b. DIAGRAMA MERMAID (com arestas HTTP) ─────────────────────────────────
    generateMermaidDiagram(ticCodeDir, modules, graph, callGraph);

    // ── 16. IMPACTO ───────────────────────────────────────────────────────────────
    report('impact', 74, 'Construindo índice de impacto de mudanças...');
    const impactIndex = buildImpactIndex(graph);
    fs.writeFileSync(path.join(ticCodeDir, 'impact-index.json'), JSON.stringify(impactIndex), 'utf8');
    const impactedFiles = Object.keys(impactIndex).length;
    markDone('impact');
    report('impact', 100, `${impactedFiles} arquivos com dependentes mapeados`);

    // ── 16b. GRAFO DE IMPACTO UNIFICADO ──────────────────────────────────────────
    report('impact-graph', 76, 'Consolidando impacto cross-tier (arquivo/método/PL-SQL/tabela/coluna)...');
    const impactEdges = buildImpactGraph({
      graph, methodEdges: graph.methodEdges, callGraph,
      plsqlObjects, plsqlCalls, dbCalls: dbCallsData,
      tableAccess: orm.tableAccess, columnAccess: orm.columnAccess
    });
    markDone('impact-graph');
    report('impact-graph', 100, `${impactEdges.length.toLocaleString()} arestas de impacto unificadas`);

    // ── 17. MÉTRICAS ─────────────────────────────────────────────────────────────
    report('metrics', 78, 'Computando complexidade ciclomática e dívida técnica...');
    const metrics = computeMetrics(files, graph, modules);
    const violations = detectLayerViolations(files, graph);
    generateMetricsReport(ticCodeDir, metrics, violations);
    markDone('metrics');
    report('metrics', 100, `${metrics.hotspotCount} hotspots, ${violations.length} violações arquiteturais`);

    // ── 17b. REGRAS DE ARQUITETURA (.tic-rules.json) ─────────────────────────────
    report('arch-rules', 80, 'Validando regras de arquitetura do projeto...');
    const rulesConfig = loadArchRules(projectPath);
    const fileInfo = buildFileInfoLookup(files, modules);
    const archViolations = rulesConfig ? checkArchRules(rulesConfig.rules, graph.edges, fileInfo) : [];
    if (!rulesConfig) writeRulesExample(ticCodeDir);
    fs.writeFileSync(path.join(ticCodeDir, 'arch-violations.json'), JSON.stringify({
      rules: rulesConfig?.rules ?? [],
      outOfScope: rulesConfig?.outOfScope ?? [],
      violations: archViolations
    }), 'utf8');
    const archErrors = archViolations.filter((v) => v.severity === 'error').length;
    // Candidatos a deepening (skill improve-codebase-architecture)
    const deepening = findDeepeningCandidates({
      fileMetrics: metrics.files,
      circulars: violations.filter((v) => /circular/i.test(v.type)).map((v) => ({ from: v.from, to: v.to })),
      totalEdges: graph.edges.length,
      moduleOf: fileInfo.moduleOf
    });
    fs.writeFileSync(path.join(ticCodeDir, 'arch-suggestions.json'), JSON.stringify(deepening), 'utf8');
    markDone('arch-rules');
    report('arch-rules', 100, rulesConfig
      ? `${rulesConfig.rules.length} regra(s): ${archErrors} error, ${archViolations.length - archErrors} warn`
      : 'sem .tic-rules.json (exemplo gerado em .tic-code/tic-rules.example.json)');

    // ── 17c. PREDIÇÃO DE RISCO (churn × acoplamento) ─────────────────────────────
    report('predict', 81, 'Cruzando churn do git com complexidade e acoplamento...');
    const churn = collectChurn(projectPath);
    const riskPredictions = churn ? predictRisk(churn, metrics.files) : [];
    fs.writeFileSync(path.join(ticCodeDir, 'risk-prediction.json'), JSON.stringify(riskPredictions), 'utf8');
    markDone('predict');
    report('predict', 100, churn
      ? `${riskPredictions.length} arquivos com risco preditivo mapeado`
      : 'sem histórico git — predição pulada');

    // ── 17d. OWNERSHIP / BUS-FACTOR ──────────────────────────────────────────────
    report('ownership', 82, 'Mapeando autoria, bus-factor e onboarding...');
    const authorship = collectAuthorship(projectPath);
    const ownership = authorship
      ? computeOwnership(authorship, metrics.files, modules)
      : { modules: [], knowledgeRisk: [], startHere: [], fileOwner: {} };
    fs.writeFileSync(path.join(ticCodeDir, 'ownership.json'), JSON.stringify(ownership), 'utf8');
    markDone('ownership');
    report('ownership', 100, authorship
      ? `${ownership.modules.length} módulos, ${ownership.knowledgeRisk.length} arquivo(s) de conhecimento em risco`
      : 'sem histórico git — ownership pulado');

    // ── 17e. ROI (débito → tempo & dinheiro) ─────────────────────────────────────
    report('roi', 83, 'Convertendo débito técnico em tempo e custo...');
    const prHistory = (() => {
      try { return JSON.parse(fs.readFileSync(path.join(ticCodeDir, 'pr-history.json'), 'utf8')); } catch { return []; }
    })();
    const roi = computeRoi(metrics.files, modules, Array.isArray(prHistory) ? prHistory : [], rulesConfig?.roi);
    fs.writeFileSync(path.join(ticCodeDir, 'roi.json'), JSON.stringify(roi), 'utf8');
    markDone('roi');
    report('roi', 100, `dívida ≈ ${roi.devDays} dev-days (${roi.currency} ${roi.debtCost.toLocaleString()})`);

    // ── 18. HERANÇA ───────────────────────────────────────────────────────────────
    report('inheritance', 84, 'Detectando hierarquia de classes...');
    const inheritanceTree = detectInheritance(files, graph.semanticClasses);
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

    // ── 21. @TRANSACTIONAL ───────────────────────────────────────────────────────
    report('transactions', 91, 'Detectando @Transactional boundaries...');
    const transactionBoundaries = detectTransactions(files);
    if (transactionBoundaries.length > 0) {
      const txReport = formatTransactionsReport(transactionBoundaries);
      fs.writeFileSync(path.join(ticCodeDir, 'transactions.md'), txReport, 'utf8');
      fs.writeFileSync(path.join(ticCodeDir, 'transactions.json'), JSON.stringify(transactionBoundaries), 'utf8');
    }
    markDone('transactions');
    report('transactions', 100, `${transactionBoundaries.length} @Transactional encontradas`);

    // ── 22. BATCH JOBS ───────────────────────────────────────────────────────────
    report('batch-jobs', 92, 'Detectando @Scheduled, @Async, Quartz...');
    const batchJobs = detectBatchJobs(files);
    if (batchJobs.length > 0) {
      const batchReport = formatBatchJobsReport(batchJobs);
      fs.writeFileSync(path.join(ticCodeDir, 'batch-jobs.md'), batchReport, 'utf8');
      fs.writeFileSync(path.join(ticCodeDir, 'batch-jobs.json'), JSON.stringify(batchJobs), 'utf8');
    }
    markDone('batch-jobs');
    report('batch-jobs', 100, `${batchJobs.length} batch/async jobs detectados`);

    // ── 23. ANGULAR MODULES ──────────────────────────────────────────────────────
    report('angular-modules', 93, 'Detectando @NgModule, lazy routes, NgRx...');
    const { modules: angularModules, ngrx: ngrxItems } = detectAngularModules(files);
    if (angularModules.length > 0 || ngrxItems.length > 0) {
      const angularReport = formatAngularModulesReport(angularModules, ngrxItems);
      fs.writeFileSync(path.join(ticCodeDir, 'angular-modules.md'), angularReport, 'utf8');
      fs.writeFileSync(path.join(ticCodeDir, 'angular-modules.json'), JSON.stringify({ modules: angularModules, ngrx: ngrxItems }), 'utf8');
    }
    markDone('angular-modules');
    report('angular-modules', 100, `${angularModules.length} módulos Angular, ${ngrxItems.length} NgRx items`);

    // ── 24. DEAD COMPONENTS ──────────────────────────────────────────────────────
    report('dead-components', 94, 'Detectando componentes React/Angular sem uso...');
    const deadComponents = computeDeadComponents(files, graph);
    fs.writeFileSync(path.join(ticCodeDir, 'dead-components.json'), JSON.stringify(deadComponents), 'utf8');
    markDone('dead-components');
    report('dead-components', 100, `${deadComponents.length} componentes sem importadores detectados`);

    // ── 24a. HEALTH SCORE + SNAPSHOT ─────────────────────────────────────────────
    report('health', 94, 'Computando health score do projeto...');
    const health = computeHealthScore({
      totalFiles: files.length, totalLines, metrics, risks, violations, extraViolations: archErrors,
      deadComponents: deadComponents.length, deadPlsql: deadPlsql.length, edges: graph.edges
    });
    appendSnapshot(ticCodeDir, projectPath, {
      totalFiles: files.length,
      totalLines,
      score: health.score,
      grade: health.grade,
      breakdown: health.breakdown,
      counts: {
        risks: risks.length,
        violations: violations.length,
        hotspots: metrics.hotspotCount,
        deadComponents: deadComponents.length,
        deadPlsql: deadPlsql.length,
        resolvedEdges,
        totalEdges: graph.edges.length,
        endpoints: endpoints.length,
        modules: modules.length,
        impactEdges: impactEdges.length,
        remediationHours: roi.remediationHours,
        debtCost: roi.debtCost
      }
    });
    markDone('health');
    report('health', 100, `Health score: ${health.score}/100 (grade ${health.grade})`);

    // ── 24b. TRIAGEM (skill triage: itens automáticos preservando estado) ────────
    report('triage', 94, 'Sincronizando fila de triagem...');
    const triageCandidates: TriageCandidate[] = [];
    for (const r of risks.filter((r) => r.level === 'critical' || r.level === 'high')) {
      triageCandidates.push({
        id: `risk::${r.file}::${r.title}`,
        title: `${r.title} em ${r.file.split('/').pop()}`,
        category: 'bug',
        priority: r.level === 'critical' ? 'critical' : 'high',
        source: 'risk',
        entity: `file:${r.file}`,
        detail: r.detail
      });
    }
    for (const v of archViolations.filter((v) => v.severity === 'error')) {
      triageCandidates.push({
        id: `arch-rule::${v.ruleId}::${v.from}::${v.to}`,
        title: `Regra "${v.ruleId}" violada: ${v.from.split('/').pop()} → ${v.to.split('/').pop()}`,
        category: 'bug',
        priority: 'high',
        source: 'arch-rule',
        entity: `file:${v.from}`,
        detail: v.description
      });
    }
    const triageStats = syncTriageItems(ticCodeDir, triageCandidates);
    markDone('triage');
    report('triage', 100, `${triageStats.created} item(ns) novo(s), ${triageStats.total} na fila`);

    // ── 24c. ZOOM-OUT (visão executiva) ──────────────────────────────────────────
    report('zoom-out', 94, 'Gerando visão executiva por fronteiras de domínio...');
    generateZoomOut(ticCodeDir, projectName, modules, graph.edges, files);
    markDone('zoom-out');
    report('zoom-out', 100, 'zoom-out.md gerado');

    // ── 24d. ATIVIDADE (self-delta + loop preditivo) — o batimento do sistema ────
    report('activity', 94, 'Computando o que mudou desde a última análise...');
    const curDelta = {
      snapshot: { score: health.score, counts: { risks: risks.length, violations: violations.length, modules: modules.length, hotspots: metrics.hotspotCount } },
      analysis: {
        risks: { items: risks.map((r) => ({ level: r.level, title: r.title, file: r.file })) },
        archViolations: { items: archViolations.map((v) => ({ ruleId: v.ruleId, severity: v.severity, from: v.from, to: v.to })) },
        modules: modules.map((m) => ({ name: m.name }))
      }
    };
    const prevDelta = previousAnalysis && previousSnapshots.length > 0
      ? { snapshot: { score: previousSnapshots[previousSnapshots.length - 1].score, counts: { risks: 0, violations: 0, modules: 0, hotspots: 0 } }, analysis: previousAnalysis }
      : null;
    const deltaEvents = computeSelfDelta(prevDelta, curDelta);
    const newRiskFiles = new Set(deltaEvents.filter((e) => e.type === 'risk-new' && e.entity).map((e) => e.entity!.replace(/^file:/, '')));
    const { events: predEvents, accuracy } = computePredictionFeedback(previousPrediction, churn, newRiskFiles, previousAccuracy as PredictionAccuracy | null);
    fs.writeFileSync(path.join(ticCodeDir, 'prediction-accuracy.json'), JSON.stringify(accuracy), 'utf8');
    const summary = makeEvent('analysis', 'info',
      `Análise concluída — health ${health.score}/100 (${health.grade})`,
      `${files.length.toLocaleString()} arquivos · ${deltaEvents.length} mudança(s) detectada(s)`);
    const allEvents = [summary, ...deltaEvents, ...predEvents];
    appendEvents(ticCodeDir, allEvents);
    markDone('activity');
    report('activity', 100, `${deltaEvents.length} mudança(s), ${predEvents.length} predição(ões) confirmada(s)`);

    // ── 24b. SEARCH INDEX ─────────────────────────────────────────────────────────
    report('search-index', 95, 'Indexando termos de código para busca semântica...');
    const searchEntries = buildSearchIndex(files, ticCodeDir);
    markDone('search-index');
    const codeFileCount = files.filter((f) => ['.ts', '.tsx', '.js', '.jsx', '.java', '.py', '.cs', '.go', '.rs', '.php', '.rb', '.sql'].includes(f.extension)).length;
    report('search-index', 100, `${codeFileCount} arquivos indexados`);

    // ── 24c. ÍNDICE PERSISTENTE (SQLite) ──────────────────────────────────────────
    report('persist-index', 95, 'Gerando embeddings locais (busca semântica)...');
    const embeddings = await computeEmbeddings(searchEntries, (done, total) =>
      report('persist-index', 95, `Embeddings ${done}/${total}...`)
    );

    report('persist-index', 97, 'Gravando índice consultável (SQLite)...');
    const dbStats = writeIndexDb(path.join(ticCodeDir, INDEX_DB_FILE), { files, graph, callGraph, searchEntries, methodEdges: graph.methodEdges, columnAccess: orm.columnAccess, modules, impactEdges, embeddings });
    markDone('persist-index');
    const vecNote = embeddings ? `, ${embeddings.length} embeddings` : ' (embeddings off: modelo indisponível, FTS ativo)';
    report('persist-index', 100, `index.db: ${dbStats.nodes.toLocaleString()} nós, ${dbStats.edges.toLocaleString()} arestas (sem teto)${vecNote}`);

    // ── 25. EXPORT JSON ───────────────────────────────────────────────────────────
    report('export-json', 92, 'Exportando analysis.json estruturado...');
    exportAnalysis(ticCodeDir, {
      projectName, projectPath, files, totalLines, stack, modules, endpoints, graph, risks,
      metrics, fileMetrics: metrics.files, violations, patternMatches, inheritanceTree,
      dbSchema, impactIndex, quickContextTokens, health,
      archViolations: { items: archViolations, errorCount: archErrors, warnCount: archViolations.length - archErrors, ruleCount: rulesConfig?.rules.length ?? 0 },
      riskPrediction: riskPredictions.slice(0, 20),
      roi,
      ownership: { modules: ownership.modules, knowledgeRisk: ownership.knowledgeRisk, startHere: ownership.startHere },
      transactionBoundaries, batchJobs, angularModules, ngrxItems, deadComponents
    });
    markDone('export-json');
    report('export-json', 100, 'analysis.json exportado');

    // ── SALVA CACHE ───────────────────────────────────────────────────────────────
    saveFileCache(ticCodeDir, files);

    // ── 22. ARQUIVOS PARA IA ─────────────────────────────────────────────────────
    if (opts.skipAiFiles) {
      markDone('ai-files');
      report('ai-files', 100, 'Concluído! (arquivos de IA pulados — modo CI)');
    } else {
      report('ai-files', 94, 'Gerando copilot-instructions.md e CLAUDE.md...');
      writeCopilotInstructions(projectPath, projectName, files.length, modules);
      writeClaudeMd(projectPath, projectName, files.length, modules);
      markDone('ai-files');
      report('ai-files', 100, 'Concluído!');
    }

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
      cacheHits: moduleCacheHits,
      transactions: transactionBoundaries.length,
      batchJobs: batchJobs.length,
      angularModules: angularModules.length,
      deadComponents: deadComponents.length,
      impactEdges: impactEdges.length,
      healthScore: health.score,
      healthGrade: health.grade,
      archViolations: archViolations.length,
      riskPredictions: riskPredictions.length,
      roiDebtCost: roi.debtCost,
      roiHoursSaved: roi.hoursSaved,
      astCacheHits: graph.astCacheHits ?? 0,
      triageItems: triageStats.total,
      activityEvents: allEvents.length,
      phaseTimings
    };

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      success: false, outputPath: ticCodeDir, totalFiles: 0, totalLines: 0, modulesGenerated: 0,
      quickContextTokens: 0, plsqlObjects: 0, frontendCalls: 0, dbCalls: 0,
      hotspots: 0, violations: 0, patterns: 0, impactedFiles: 0, inheritanceClasses: 0, dbTables: 0, cacheHits: 0,
      transactions: 0, batchJobs: 0, angularModules: 0, deadComponents: 0, error
    };
  }
}

/**
 * Gera embeddings por arquivo para busca semântica (Fase 4). Retorna undefined
 * quando o modelo local não está disponível (ex.: host de modelos bloqueado) —
 * nesse caso a busca segue via FTS5, sem quebrar nada.
 */
async function computeEmbeddings(
  searchEntries: SearchIndexEntry[],
  onProgress: (done: number, total: number) => void
): Promise<Array<{ file: string; vector: Float32Array }> | undefined> {
  // Opt-in: a busca semântica baixa um modelo (~25MB) na 1ª vez. Só ativa com
  // TIC_EMBEDDINGS=1, para não surpreender com download/latência. Sem ela, FTS.
  if (!process.env.TIC_EMBEDDINGS) return undefined;
  const embedder = await getEmbedder();
  if (!embedder) return undefined;

  const texts = searchEntries.map((e) => `${e.file} ${e.snippet} ${e.terms.slice(0, 40).join(' ')}`.slice(0, 512));
  const out: Array<{ file: string; vector: Float32Array }> = [];
  const BATCH = 64;
  for (let i = 0; i < texts.length; i += BATCH) {
    const vecs = await embedder(texts.slice(i, i + BATCH));
    for (let j = 0; j < vecs.length; j++) out.push({ file: searchEntries[i + j].file, vector: vecs[j] });
    onProgress(Math.min(i + BATCH, texts.length), texts.length);
  }
  return out;
}

function computeDeadComponents(files: ScannedFile[], graph: DependencyGraph): Array<{ file: string; type: 'react' | 'angular' }> {
  // Entry points that are never "imported" but are still valid roots
  const ENTRY_NAMES = new Set(['main.tsx', 'main.ts', 'App.tsx', 'App.ts', 'index.tsx', 'index.ts', 'index.js']);

  const inDegreeMap = new Map<string, number>();
  for (const node of graph.nodes) inDegreeMap.set(node.path, node.inDegree);

  const dead: Array<{ file: string; type: 'react' | 'angular' }> = [];

  for (const file of files) {
    const fname = file.relativePath.split('/').pop() ?? '';
    if (ENTRY_NAMES.has(fname)) continue;
    if ((inDegreeMap.get(file.relativePath) ?? 0) > 0) continue;

    // React components: .tsx files (exclude pure type/utility files)
    if (file.extension === '.tsx') {
      dead.push({ file: file.relativePath, type: 'react' });
      continue;
    }

    // Angular components/directives/pipes
    if (
      file.relativePath.endsWith('.component.ts') ||
      file.relativePath.endsWith('.directive.ts') ||
      file.relativePath.endsWith('.pipe.ts')
    ) {
      dead.push({ file: file.relativePath, type: 'angular' });
    }
  }

  return dead;
}

function computeDeadPlsql(plsqlObjects: PlsqlObject[], plsqlCalls: PlsqlCall[], dbCalls: DbCall[]) {
  // Build set of all called/referenced object names and package names
  const called = new Set<string>();
  for (const c of plsqlCalls) {
    called.add(c.calledObject.toUpperCase());
    if (c.calledPackage) called.add(c.calledPackage.toUpperCase());
  }
  for (const c of dbCalls) {
    called.add(c.procedureName.toUpperCase());
    if (c.packageName) called.add(c.packageName.toUpperCase());
  }

  // A procedure/function is dead if:
  // - It's not called directly by name
  // - AND its package (if any) is not called
  // (if the package is called, we can't be sure the proc is unused — Oracle resolves at runtime)
  return plsqlObjects.filter((obj) => {
    if (obj.type !== 'PROCEDURE' && obj.type !== 'FUNCTION') return false;
    const directlyCalled = called.has(obj.name.toUpperCase());
    const packageCalled = obj.packageName ? called.has(obj.packageName.toUpperCase()) : false;
    return !directlyCalled && !packageCalled;
  });
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
  const content = `# ${projectName} — Claude Code Context (TIC Analyzer)\n\n> ${totalFiles.toLocaleString()} arquivos. Large Project Mode.\n\n## REGRA: MCP primeiro, arquivos depois\n\nANTES de ler arquivos do projeto, consulte o MCP (\`localhost:7432\`) — ele já tem a análise completa e gasta uma fração dos tokens:\n\n1. **Impacto de mudança** (arquivo, método, procedure PL/SQL, tabela ou coluna):\n   - \`get_blast_radius("PKG.PROC" | "TABELA" | "TABELA.COLUNA" | "Arquivo.java")\` — resumo ~200 tokens. Use PRIMEIRO.\n   - \`get_impact_of(entity)\` — detalhe por profundidade/módulo se o resumo não bastar\n   - \`get_table_impact(tabela[, coluna])\` — quem é afetado por mudar a tabela/coluna\n   - \`get_diff_impact()\` — impacto cross-tier de tudo que está no git diff\n2. **Localizar código**: \`search_code(query)\` (FTS) — só depois leia o arquivo certo\n3. **Entender fluxo**: \`trace_flow(entidade)\` — cadeia tela→endpoint→service→procedure→tabela\n4. **Contexto**: \`get_quick_context()\` (visão geral), \`get_module("nome")\` (módulo)\n5. **Qualidade**: \`get_metrics()\`, \`get_hotspots()\`, \`get_violations()\`\n\n## Navegação por arquivos (sem MCP)\n\n1. Visão geral: \`.tic-code/quick-context.md\`\n2. Módulo específico: \`.tic-code/modules/{nome}/context.md\`\n3. Mapa completo: \`.tic-code/index.md\`\n\n## Módulos Principais\n\n${moduleList}\n`;
  fs.writeFileSync(path.join(projectPath, 'CLAUDE.md'), content, 'utf8');
}
