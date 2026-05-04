/**
 * Orquestrador da camada de Programação Reversa / SDD
 *
 * Coordena todos os geradores para produzir artefatos em:
 * - .tic-code/reverse-engineering/  (global)
 * - .tic-code/projects/{id}/reverse-engineering/ (por projeto)
 *
 * Inspiração metodológica: Reversa by Sandeco (MIT License)
 * Créditos: https://github.com/sandeco/reversa
 *
 * TIC Coder Lite é uma extensão VS Code separada que grava contexto em .tic-code.
 * Tudo funciona local-first, sem IA obrigatória, banco, Docker ou servidor.
 */

import * as vscode from 'vscode';
import type { ProjectSummary, DetectedProject } from '../../types';
import type { ReverseEngineeringInput } from './reverseEngineeringTypes';
import type { ScannedFile } from '../../scanner/scanFiles';
import type { RiskFinding } from '../../scanner/detectRisks';

import { generateInventory, renderInventoryMd } from './generateInventory';
import { generateDependencies, renderDependenciesMd } from './generateDependencies';
import { generateCodeAnalysis, renderCodeAnalysisMd } from './generateCodeAnalysis';
import { generateDomain, renderDomainMd } from './generateDomain';
import { generateBusinessRules, renderBusinessRulesMd } from './generateBusinessRules';
import { generateStateMachines, renderStateMachinesMd } from './generateStateMachines';
import { generatePermissions, renderPermissionsMd } from './generatePermissions';
import { renderArchitectureMd } from './generateArchitecture';
import { generateApiContracts, renderApiContractsMd } from './generateApiContracts';
import { generateDataDictionary, renderDataDictionaryMd } from './generateDataDictionary';
import { renderDatabaseAnalysisMd } from './generateDatabaseAnalysis';
import { renderPlSqlAnalysisMd } from './generatePlSqlAnalysis';
import { renderConfidenceReportMd } from './generateConfidenceReport';
import { generateGaps, renderGapsMd } from './generateGaps';
import { generateQuestions, renderQuestionsMd } from './generateQuestions';
import { generateTraceability, renderCodeSpecMatrixMd, renderRiskImpactMatrixMd } from './generateTraceability';
import { generateOperationalContracts, renderOperationalContractsMd } from './generateOperationalContracts';

/** Gera todos os artefatos de programação reversa globais e por projeto */
export async function writeReverseEngineering(
  root: vscode.WorkspaceFolder,
  summary: ProjectSummary
): Promise<void> {
  const revDir = vscode.Uri.joinPath(root.uri, '.tic-code', 'reverse-engineering');
  const input = buildInput(summary);

  await writeReverseEngineeringDir(revDir, input, summary.workspaceName);

  // Por projeto
  for (const project of summary.detectedProjects ?? []) {
    const projectRevDir = vscode.Uri.joinPath(
      root.uri,
      '.tic-code',
      'projects',
      project.id,
      'reverse-engineering'
    );
    const projectInput = buildProjectInput(summary, project);
    await writeReverseEngineeringDir(projectRevDir, projectInput, project.name);
  }
}

async function writeReverseEngineeringDir(
  dir: vscode.Uri,
  input: ReverseEngineeringInput,
  projectName: string
): Promise<void> {
  await vscode.workspace.fs.createDirectory(dir);
  const traceDir = vscode.Uri.joinPath(dir, 'traceability');
  await vscode.workspace.fs.createDirectory(traceDir);

  // Gerar dados
  const inventoryData = generateInventory(input);
  const deps = generateDependencies(input);
  const codeModules = generateCodeAnalysis(input);
  const domains = generateDomain(input);
  const businessRules = generateBusinessRules(input);
  const stateMachines = generateStateMachines(input);
  const permissions = generatePermissions(input);
  const apiContracts = generateApiContracts(input);
  const dataDictionary = generateDataDictionary(input);
  const gaps = generateGaps(input);
  const questions = generateQuestions(input, gaps);
  const { codeSpecMatrix, riskImpactMatrix } = generateTraceability(input, businessRules);
  const operationalContracts = generateOperationalContracts(input, businessRules);

  // Renderizar markdowns
  await writeText(vscode.Uri.joinPath(dir, 'inventory.md'), renderInventoryMd(inventoryData, projectName));
  await writeText(vscode.Uri.joinPath(dir, 'dependencies.md'), renderDependenciesMd(deps, projectName));
  await writeText(vscode.Uri.joinPath(dir, 'code-analysis.md'), renderCodeAnalysisMd(codeModules, input, projectName));
  await writeText(vscode.Uri.joinPath(dir, 'domain.md'), renderDomainMd(domains, projectName));
  await writeText(vscode.Uri.joinPath(dir, 'business-rules.md'), renderBusinessRulesMd(businessRules, projectName));
  await writeText(vscode.Uri.joinPath(dir, 'state-machines.md'), renderStateMachinesMd(stateMachines, projectName));
  await writeText(vscode.Uri.joinPath(dir, 'permissions.md'), renderPermissionsMd(permissions, projectName));
  await writeText(vscode.Uri.joinPath(dir, 'architecture.md'), renderArchitectureMd(input, projectName));
  await writeText(vscode.Uri.joinPath(dir, 'api-contracts.md'), renderApiContractsMd(apiContracts, projectName));
  await writeText(vscode.Uri.joinPath(dir, 'data-dictionary.md'), renderDataDictionaryMd(dataDictionary, projectName, input.plsql.tableReferences.length));
  await writeText(vscode.Uri.joinPath(dir, 'database-analysis.md'), renderDatabaseAnalysisMd(input, projectName));
  await writeText(vscode.Uri.joinPath(dir, 'confidence-report.md'), renderConfidenceReportMd(input, businessRules, projectName));
  await writeText(vscode.Uri.joinPath(dir, 'gaps.md'), renderGapsMd(gaps, projectName));
  await writeText(vscode.Uri.joinPath(dir, 'questions.md'), renderQuestionsMd(questions, projectName));
  await writeText(vscode.Uri.joinPath(dir, 'operational-contracts.md'), renderOperationalContractsMd(operationalContracts, projectName));

  if (input.plsql.detected) {
    await writeText(vscode.Uri.joinPath(dir, 'plsql-analysis.md'), renderPlSqlAnalysisMd(input, projectName));
  }

  await writeText(vscode.Uri.joinPath(traceDir, 'code-spec-matrix.md'), renderCodeSpecMatrixMd(codeSpecMatrix, projectName));
  await writeText(vscode.Uri.joinPath(traceDir, 'risk-impact-matrix.md'), renderRiskImpactMatrixMd(riskImpactMatrix, projectName));
}

/** Constrói ReverseEngineeringInput a partir do summary global */
function buildInput(summary: ProjectSummary): ReverseEngineeringInput {
  return {
    scan: summary.scan,
    inventory: summary.inventory,
    graph: summary.graph,
    risks: summary.risks.risks,
    plsql: summary.inventory.plsql,
    projectName: summary.workspaceName,
    files: summary.scan.files
  };
}

/** Constrói ReverseEngineeringInput filtrado para um projeto específico */
function buildProjectInput(summary: ProjectSummary, project: DetectedProject): ReverseEngineeringInput {
  const projectFiles = filterFilesForProject(summary.scan.files, project);
  const projectFileSet = new Set(projectFiles.map((f) => f.relativePath));
  const projectRisks: RiskFinding[] = summary.risks.risks.filter(
    (r) => projectFileSet.has(r.file) || (project.kind === 'database' && r.category === 'plsql')
  );

  return {
    scan: {
      ...summary.scan,
      files: projectFiles,
      totals: {
        files: projectFiles.length,
        lines: projectFiles.reduce((total, f) => total + f.lines, 0),
        size: projectFiles.reduce((total, f) => total + f.size, 0)
      }
    },
    inventory: summary.inventory,
    graph: summary.graph,
    risks: projectRisks,
    plsql: project.kind === 'database' ? summary.inventory.plsql : { ...summary.inventory.plsql, detected: false },
    projectName: project.name,
    projectKind: project.kind,
    files: projectFiles
  };
}

function filterFilesForProject(files: ScannedFile[], project: DetectedProject): ScannedFile[] {
  const relativePath = project.relativePath.replace(/\\/g, '/');

  if (project.kind === 'database') {
    return files.filter((f) => {
      const ext = f.extension.toLowerCase();
      return ['.sql', '.pks', '.pkb', '.prc', '.fnc', '.pkg', '.trg', '.pls', '.plsql'].includes(ext);
    });
  }

  return files.filter((f) => {
    const fp = f.relativePath.replace(/\\/g, '/');
    return fp.startsWith(relativePath + '/') || fp.startsWith(relativePath);
  });
}

async function writeText(uri: vscode.Uri, content: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
}
