import * as vscode from 'vscode';
import * as path from 'path';
import { importTracerInputs } from '../reversa-engine/tracer/importTracerInputs';
import { analyzeTracerInputs } from '../reversa-engine/tracer/analyzeTracerInputs';
import { generateDynamicAnalysis } from '../reversa-engine/tracer/generateDynamicAnalysis';
import { getWorkspaceRoot } from './analyzeProject';
import { updateAgentState } from './shared/updateAgentState';

export async function importTracerInputsCommand(): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) return;
  try {
    const picks = await vscode.window.showOpenDialog({ canSelectMany: true, filters: { 'Logs and traces': ['log', 'txt', 'json', 'ndjson'] } });
    if (!picks?.length) {
      await updateAgentState(root, 'tracer', { status: 'pending' });
      return;
    }
    const accepted = importTracerInputs(picks.map((p) => p.fsPath));
    const inputDir = vscode.Uri.joinPath(root.uri, '.tic-code', 'reversa', 'inputs', 'tracer');
    await vscode.workspace.fs.createDirectory(inputDir);
    const lines: string[] = [];
    for (const file of accepted) {
      const dest = vscode.Uri.joinPath(inputDir, path.basename(file));
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(file));
      await vscode.workspace.fs.writeFile(dest, bytes);
      lines.push(Buffer.from(bytes).toString('utf8'));
    }
    const analysis = analyzeTracerInputs(lines.join('\n').split(/\r?\n/));
    const output = generateDynamicAnalysis(analysis);
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(root.uri, '.tic-code', 'reverse-engineering', 'dynamic.md'), Buffer.from(output.dynamic, 'utf8'));
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root.uri, '.tic-code', 'reverse-engineering', 'traceability'));
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(root.uri, '.tic-code', 'reverse-engineering', 'traceability', 'runtime-evidence.md'), Buffer.from(output.runtimeEvidence, 'utf8'));
    await updateAgentState(root, 'tracer', { status: 'completed', receivedInputs: accepted.map((f) => path.basename(f)), generatedFiles: ['.tic-code/reverse-engineering/dynamic.md', '.tic-code/reverse-engineering/traceability/runtime-evidence.md'], warnings: [], errors: [] });
    vscode.window.showInformationMessage(`Tracer: ${accepted.length} arquivo(s) importado(s) e análise dinâmica gerada.`);
  } catch (error) {
    await updateAgentState(root, 'tracer', { status: 'failed', errors: [String(error)] });
    vscode.window.showErrorMessage('Tracer: falha ao importar/analisar logs-traces.');
  }
}
