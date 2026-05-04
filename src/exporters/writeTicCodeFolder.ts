import * as vscode from 'vscode';
import { renderArchitectureMarkdown } from '../scanner/buildGraph';
import type { GraphEdge, GraphNode, LightweightGraph } from '../scanner/buildGraph';
import { detectProjects } from '../scanner/detectProjects';
import { renderInventoryMarkdown } from '../scanner/detectStack';
import { renderRisksMarkdown } from '../scanner/detectRisks';
import type { RiskReport } from '../scanner/detectRisks';
import type { ProjectSummary, DetectedProject } from '../types';
import { generateAgentContextMd } from './generateAgentContextMd';
import { generateConfidenceReportMd } from './generateConfidenceReportMd';
import { generateQuestionsMd } from './generateQuestionsMd';
import { writeReverseEngineering } from './reverseEngineering/generateReverseEngineering';
import { buildDatabaseLargeModeData } from '../scanner/databaseLargeMode';
import { getTicCoderLiteConfig } from '../utils/config';
import { runReversaLikePipeline } from '../reversa-engine/runReversaLikePipeline';

export interface TicCodeArtifacts {
  scanJson: vscode.Uri;
  modulesJson: vscode.Uri;
  inventoryMd: vscode.Uri;
  graphJson: vscode.Uri;
  architectureMd: vscode.Uri;
  risksJson: vscode.Uri;
  risksMd: vscode.Uri;
  agentContextMd: vscode.Uri;
  confidenceReportMd: vscode.Uri;
  questionsMd: vscode.Uri;
}

export async function writeTicCodeFolder(root: vscode.WorkspaceFolder, summary: ProjectSummary, extensionUri?: vscode.Uri): Promise<TicCodeArtifacts> {
  const ticCodeDir = vscode.Uri.joinPath(root.uri, '.tic-code');
  const artifacts: TicCodeArtifacts = {
    scanJson: vscode.Uri.joinPath(ticCodeDir, 'scan.json'),
    modulesJson: vscode.Uri.joinPath(ticCodeDir, 'modules.json'),
    inventoryMd: vscode.Uri.joinPath(ticCodeDir, 'inventory.md'),
    graphJson: vscode.Uri.joinPath(ticCodeDir, 'graph.json'),
    architectureMd: vscode.Uri.joinPath(ticCodeDir, 'architecture.md'),
    risksJson: vscode.Uri.joinPath(ticCodeDir, 'risks.json'),
    risksMd: vscode.Uri.joinPath(ticCodeDir, 'risks.md'),
    agentContextMd: vscode.Uri.joinPath(ticCodeDir, 'agent-context.md'),
    confidenceReportMd: vscode.Uri.joinPath(ticCodeDir, 'confidence-report.md'),
    questionsMd: vscode.Uri.joinPath(ticCodeDir, 'questions.md')
  };

  await vscode.workspace.fs.createDirectory(ticCodeDir);
  await writeText(artifacts.scanJson, `${JSON.stringify(summary.scan, null, 2)}\n`);
  await writeText(artifacts.modulesJson, `${JSON.stringify(summary.inventory, null, 2)}\n`);
  await writeText(artifacts.inventoryMd, renderInventoryMarkdown(summary.inventory, summary.scan));
  await writeText(artifacts.graphJson, `${JSON.stringify(summary.graph, null, 2)}\n`);
  await writeText(artifacts.architectureMd, renderArchitectureMarkdown(summary.graph, summary.inventory));
  await writeText(artifacts.risksJson, `${JSON.stringify(summary.risks, null, 2)}\n`);
  await writeText(artifacts.risksMd, renderRisksMarkdown(summary.risks));
  await writeText(artifacts.agentContextMd, generateAgentContextMd(summary));
  await writeText(artifacts.confidenceReportMd, generateConfidenceReportMd(summary));
  await writeText(artifacts.questionsMd, generateQuestionsMd(summary));
  // Resumo de dependências externas para ferramentas e programação reversa
  const externalDepsJson = vscode.Uri.joinPath(ticCodeDir, 'external-dependencies.json');
  await writeText(externalDepsJson, `${JSON.stringify(summary.graph.stats.externalDependencies, null, 2)}\n`);
  await writeProjectArtifacts(root, summary);
  await writeReverseEngineering(root, summary);
  // Motor Reversa — gera .tic-code/reversa/ e expande .tic-code/reverse-engineering/
  await runReversaLikePipeline(root, summary, extensionUri);

  return artifacts;
}

async function writeProjectArtifacts(root: vscode.WorkspaceFolder, summary: ProjectSummary): Promise<void> {
  const projects = detectProjects(summary.scan, summary.risks);
  
  for (const project of projects) {
    const projectDir = vscode.Uri.joinPath(root.uri, '.tic-code', 'projects', project.id);
    await vscode.workspace.fs.createDirectory(projectDir);

    // Filtrar arquivos, nós e arestas para o projeto
    const projectFiles = filterProjectFiles(summary, project);
    const projectNodeIds = new Set(getProjectNodeIds(summary, project, projectFiles));

    // Criar grafo filtrado
    const graph: LightweightGraph = {
      ...summary.graph,
      projectName: project.name,
      nodes: summary.graph.nodes.filter((node) => projectNodeIds.has(node.id)),
      edges: summary.graph.edges.filter((edge) => projectNodeIds.has(edge.from) && projectNodeIds.has(edge.to)),
      stats: buildGraphStats(
        summary.graph.nodes.filter((node) => projectNodeIds.has(node.id)),
        summary.graph.edges.filter((edge) => projectNodeIds.has(edge.from) && projectNodeIds.has(edge.to))
      )
    };

    // Criar riscos filtrados
    const risks: RiskReport = {
      ...summary.risks,
      risks: summary.risks.risks.filter((risk) => isRiskInProject(risk, project, projectFiles)),
      summary: summarizeRisks(summary.risks.risks.filter((risk) => isRiskInProject(risk, project, projectFiles)))
    };

    // Criar scan filtrado
    const scan = {
      ...summary.scan,
      files: projectFiles,
      totals: {
        files: projectFiles.length,
        lines: projectFiles.reduce((total, file) => total + file.lines, 0),
        size: projectFiles.reduce((total, file) => total + file.size, 0)
      }
    };

    // Escrever artefatos do projeto
    await writeText(vscode.Uri.joinPath(projectDir, 'scan.json'), `${JSON.stringify(scan, null, 2)}\n`);
    await writeText(vscode.Uri.joinPath(projectDir, 'graph.json'), `${JSON.stringify(graph, null, 2)}\n`);
    await writeText(vscode.Uri.joinPath(projectDir, 'risks.json'), `${JSON.stringify(risks, null, 2)}\n`);

    // Gerar markdown de contexto específico por tipo
    const contextMd = generateProjectContextMd(summary, project, scan, risks, graph);
    await writeText(vscode.Uri.joinPath(projectDir, 'agent-context.md'), contextMd);

    // Para projetos de banco de dados: escrever índices (PLSQL Enterprise Mode)
    if (project.kind === 'database' && summary.inventory.plsql.detected) {
      await writeDatabaseIndexArtifacts(root, projectDir, summary);
    }
  }
}

function filterProjectFiles(summary: ProjectSummary, project: DetectedProject) {
  const fileSet = new Set<string>();
  
  switch (project.kind) {
    case 'backend':
      for (const file of summary.scan.files) {
        if (isBackendFile(file.relativePath)) {
          fileSet.add(file.relativePath);
        }
      }
      break;
    case 'frontend':
      for (const file of summary.scan.files) {
        if (isFrontendFile(file.relativePath)) {
          fileSet.add(file.relativePath);
        }
      }
      break;
    case 'mobile':
      for (const file of summary.scan.files) {
        if (isMobileFile(file.relativePath)) {
          fileSet.add(file.relativePath);
        }
      }
      break;
    case 'infra':
      for (const file of summary.scan.files) {
        if (isInfraFile(file.relativePath)) {
          fileSet.add(file.relativePath);
        }
      }
      break;
    case 'shared':
      for (const file of summary.scan.files) {
        if (isSharedFile(file.relativePath)) {
          fileSet.add(file.relativePath);
        }
      }
      break;
    case 'database':
      for (const file of summary.scan.files) {
        if (isDatabaseFile(file.relativePath, file.extension)) {
          fileSet.add(file.relativePath);
        }
      }
      break;
  }

  return summary.scan.files.filter((file) => fileSet.has(file.relativePath));
}

function getProjectNodeIds(summary: ProjectSummary, project: DetectedProject, projectFiles: typeof summary.scan.files): string[] {
  const projectFileSet = new Set(projectFiles.map((f) => f.relativePath));
  
  if (project.kind === 'database') {
    const plsql = summary.inventory.plsql;
    const databaseFileSet = new Set(plsql.files);
    return summary.graph.nodes
      .filter((node) => 
        node.module === 'database' || 
        databaseFileSet.has(node.path) || 
        node.type.startsWith('plsql_')
      )
      .map((node) => node.id);
  }
  
  return summary.graph.nodes
    .filter((node) => projectFileSet.has(node.path) || node.module === project.id)
    .map((node) => node.id);
}

function isRiskInProject(risk: any, project: DetectedProject, projectFiles: ReturnType<typeof filterProjectFiles>): boolean {
  const projectFileSet = new Set(projectFiles.map((f) => f.relativePath));
  
  if (project.kind === 'database' && risk.category === 'plsql') {
    return true;
  }
  
  return projectFileSet.has(risk.file);
}

function isBackendFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes('backend') ||
    lower.includes('src/main/java') ||
    lower.includes('src/main/kotlin') ||
    lower.includes('api') ||
    lower.includes('server')
  );
}

function isFrontendFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes('frontend') ||
    lower.includes('/src/') ||
    lower.includes('public') ||
    lower.includes('components') ||
    lower.includes('pages')
  );
}

function isMobileFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes('mobile') ||
    lower.includes('android') ||
    lower.includes('ios') ||
    lower.includes('/lib/') ||
    lower.includes('react-native')
  );
}

function isInfraFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes('docker') ||
    lower.includes('k8s') ||
    lower.includes('helm') ||
    lower.includes('terraform') ||
    lower.includes('.github/workflows') ||
    lower.includes('infra')
  );
}

function isSharedFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.includes('shared') || lower.includes('libs') || lower.includes('packages');
}

function isDatabaseFile(path: string, extension: string): boolean {
  const PLSQL_EXTENSIONS = new Set(['.sql', '.pks', '.pkb', '.prc', '.fnc', '.pkg', '.trg', '.pls', '.plsql']);
  const DATABASE_DIRS = new Set(['db', 'database', 'sql', 'oracle', 'plsql', 'migrations']);
  const first = path.split('/')[0]?.toLowerCase();
  return PLSQL_EXTENSIONS.has(extension.toLowerCase()) || DATABASE_DIRS.has(first);
}

function generateProjectContextMd(
  summary: ProjectSummary,
  project: DetectedProject,
  scan: any,
  risks: RiskReport,
  graph: LightweightGraph
): string {
  const header = `# Contexto: ${project.name}

**Workspace:** ${summary.workspaceName}  
**Projeto:** ${project.name}  
**Tipo:** ${project.kind}  
**Stack:** ${project.stack.join(', ')}  
**Arquivos:** ${scan.totals.files}  
**Linhas:** ${scan.totals.lines}  
**Riscos:** ${risks.summary.total}  

`;

  if (project.kind === 'database') {
    return header + generateDatabaseContextDetails(summary);
  }

  // Contexto genérico para outros projetos
  const modules = Object.entries(graph.stats.modules || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => `- ${name}: ${count} nó(s)`)
    .join('\n');

  const risksByLevel = `
- Críticos: ${risks.summary.critical}
- Altos: ${risks.summary.high}
- Médios: ${risks.summary.medium}
- Baixos: ${risks.summary.low}
`;

  const topRisks = risks.risks.slice(0, 20).map((r) => `- **${r.level.toUpperCase()}**: ${r.title} (${r.file})`).join('\n');

  const centralFiles = graph.stats.centralFiles
    .slice(0, 10)
    .map((f) => `- ${f.path}: ${f.degree} conexão(ões)`)
    .join('\n');

  return (
    header +
    `## Estrutura de Módulos

${modules || '- Nenhum módulo detectado.'}

## Riscos por Severidade

${risksByLevel}

## Top 20 Riscos

${topRisks || '- Nenhum risco detectado.'}

## Arquivos Centrais (Hub)

${centralFiles || '- Nenhum arquivo central detectado.'}

## Recomendações

1. Revise os riscos críticos e altos primeiro
2. Considere o impacto ao refatorar arquivos centrais
3. Mantenha a coesão dentro dos módulos
4. Documente regras de negócio críticas
`
  );
}

function generateDatabaseContextDetails(summary: ProjectSummary): string {
  const plsql = summary.inventory.plsql;
  const packages = plsql.entities.filter((entity) => entity.kind === 'package' || entity.kind === 'package_body').slice(0, 30);
  const routines = plsql.entities.filter((entity) => entity.kind === 'procedure' || entity.kind === 'function').slice(0, 30);
  const triggers = plsql.entities.filter((entity) => entity.kind === 'trigger').slice(0, 30);

  return `
## Packages Detectados

${packages.map((entity) => `- ${entity.name} (${entity.kind}) em ${entity.file}:${entity.line}`).join('\n') || '- Nenhum package detectado.'}

## Procedures e Functions Críticas

${routines.map((entity) => `- ${entity.name} em ${entity.file}:${entity.line}`).join('\n') || '- Nenhuma procedure/function detectada.'}

## Triggers

${triggers.map((entity) => `- ${entity.name}${entity.targetTable ? ` ON ${entity.targetTable}` : ''} em ${entity.file}:${entity.line}`).join('\n') || '- Nenhum trigger detectado.'}

## Tabelas Mais Referenciadas

${plsql.tableReferences.slice(0, 20).map((table) => `- ${table.name}: ${table.reads} leitura(s), ${table.writes} escrita(s)`).join('\n') || '- Nenhuma tabela referenciada.'}

## Aviso para IA

- Regras críticas podem estar escondidas no banco, especialmente em packages, triggers e procedures.
- Não assuma que a aplicação é a única fonte de regra de negócio.
- Não altere transações, COMMIT, ROLLBACK, triggers ou SQL dinâmico sem validação humana.
- Leia primeiro packages, triggers, tabelas mais referenciadas e riscos transacionais.
`;
}

function buildGraphStats(nodes: GraphNode[], edges: GraphEdge[]): LightweightGraph['stats'] {
  const modules: Record<string, number> = {};
  const degree = new Map<string, number>();
  for (const node of nodes) {
    modules[node.module] = (modules[node.module] ?? 0) + 1;
  }
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  const incomingEdgeCount = new Map<string, number>();
  for (const edge of edges) {
    incomingEdgeCount.set(edge.to, (incomingEdgeCount.get(edge.to) ?? 0) + 1);
  }
  const externalDependencies = nodes
    .filter((node) => node.origin !== 'internal')
    .map((node) => ({
      specifier: node.label,
      label: node.label,
      origin: node.origin as 'external' | 'framework',
      frameworkName: node.frameworkName,
      count: incomingEdgeCount.get(node.id) ?? 0
    }))
    .sort((a, b) => b.count - a.count);
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    internalEdges: edges.filter((edge) => edge.type === 'IMPORTS').length,
    externalEdges: edges.filter((edge) => edge.type !== 'IMPORTS').length,
    modules,
    centralFiles: [...degree.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([filePath, value]) => ({ path: filePath, degree: value })),
    externalDependencies
  };
}

function summarizeRisks(risks: RiskReport['risks']): RiskReport['summary'] {
  return {
    total: risks.length,
    low: risks.filter((risk) => risk.level === 'low').length,
    medium: risks.filter((risk) => risk.level === 'medium').length,
    high: risks.filter((risk) => risk.level === 'high').length,
    critical: risks.filter((risk) => risk.level === 'critical').length
  };
}

async function writeText(uri: vscode.Uri, content: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
}

async function writeDatabaseIndexArtifacts(
  _root: vscode.WorkspaceFolder,
  projectDir: vscode.Uri,
  summary: ProjectSummary
): Promise<void> {
  const config = getTicCoderLiteConfig();
  if (!config.database.enableTableIndex) {
    return;
  }

  const { index, summary: dbSummary, graphSummary } = buildDatabaseLargeModeData(
    summary.inventory.plsql,
    config.database
  );

  const indexDir = vscode.Uri.joinPath(projectDir, 'index');
  await vscode.workspace.fs.createDirectory(indexDir);

  await writeText(vscode.Uri.joinPath(indexDir, 'tables.json'), `${JSON.stringify(index.tables, null, 2)}\n`);
  await writeText(vscode.Uri.joinPath(indexDir, 'views.json'), `${JSON.stringify(index.views, null, 2)}\n`);
  await writeText(vscode.Uri.joinPath(indexDir, 'packages.json'), `${JSON.stringify(index.packages, null, 2)}\n`);
  await writeText(vscode.Uri.joinPath(indexDir, 'procedures.json'), `${JSON.stringify(index.procedures, null, 2)}\n`);
  await writeText(vscode.Uri.joinPath(indexDir, 'functions.json'), `${JSON.stringify(index.functions, null, 2)}\n`);
  await writeText(vscode.Uri.joinPath(indexDir, 'triggers.json'), `${JSON.stringify(index.triggers, null, 2)}\n`);

  await writeText(vscode.Uri.joinPath(projectDir, 'summary.json'), `${JSON.stringify(dbSummary, null, 2)}\n`);
  await writeText(vscode.Uri.joinPath(projectDir, 'graph.summary.json'), `${JSON.stringify(graphSummary, null, 2)}\n`);
  await writeText(vscode.Uri.joinPath(projectDir, 'critical-objects.json'), `${JSON.stringify(index.criticalObjects, null, 2)}\n`);
}
