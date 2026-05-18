import * as path from 'path';
import * as vscode from 'vscode';
import { analyzeVisorScreenshots } from '../reversa-engine/visor/analyzeVisorScreenshots';
import { generateUiDocs } from '../reversa-engine/visor/generateUiDocs';
import { importVisorScreenshots } from '../reversa-engine/visor/importVisorScreenshots';
import { analyzeScreenshotWithLocalVision } from '../reversa-engine/visor/localVision';
import { getWorkspaceRoot } from './analyzeProject';
import { updateAgentState } from './shared/updateAgentState';

export async function importVisorScreenshotsCommand(): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) return;
  try {
    const picks = await vscode.window.showOpenDialog({
      canSelectMany: true,
      filters: { Images: ['png', 'jpg', 'jpeg', 'webp'] },
      title: 'Visor: importar screenshots para reconhecimento visual'
    });
    if (!picks?.length) {
      await updateAgentState(root, 'visor', { status: 'pending' });
      return;
    }

    const accepted = importVisorScreenshots(picks.map((item) => item.fsPath));
    const inputDir = vscode.Uri.joinPath(root.uri, '.tic-code', 'reversa', 'inputs', 'visor');
    await vscode.workspace.fs.createDirectory(inputDir);

    const copied: string[] = [];
    for (const file of accepted) {
      const dest = vscode.Uri.joinPath(inputDir, path.basename(file));
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(file));
      await vscode.workspace.fs.writeFile(dest, bytes);
      copied.push(dest.fsPath);
    }

    const analysis = analyzeVisorScreenshots(copied);
    for (const shot of analysis) {
      shot.localVision = await analyzeScreenshotWithLocalVision(shot.sourcePath, {
        fileName: shot.fileName,
        metadata: {
          filePath: shot.sourcePath,
          fileName: shot.fileName,
          format: shot.format as 'png' | 'jpeg' | 'webp' | 'unknown',
          width: shot.width,
          height: shot.height,
          sizeBytes: shot.sizeBytes,
          orientation: shot.orientation as 'portrait' | 'landscape' | 'square' | 'unknown',
          viewport: shot.viewport as 'mobile' | 'tablet' | 'desktop' | 'wide' | 'unknown',
          visualSignature: shot.visualSignature
        },
        probableScreen: shot.probableScreen,
        screenType: shot.screenType,
        uiState: shot.uiState,
        flowStage: shot.flowStage,
        confidence: shot.confidence,
        recognitionScore: shot.recognitionScore,
        description: shot.description,
        candidateTerms: shot.candidateTerms,
        routeCandidates: shot.routeCandidates,
        componentCandidates: shot.componentCandidates,
        signals: shot.signals,
        warnings: shot.warnings,
        primaryAction: shot.primaryAction
      });
    }

    const workspaceName = root.name || path.basename(root.uri.fsPath);
    const docs = generateUiDocs(analysis, workspaceName);
    const uiDir = vscode.Uri.joinPath(root.uri, '.tic-code', 'reverse-engineering', 'ui');
    await vscode.workspace.fs.createDirectory(uiDir);
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(uiDir, 'screenshots-index.md'), Buffer.from(docs.index, 'utf8'));
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(uiDir, 'ui-analysis.md'), Buffer.from(docs.analysis, 'utf8'));
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(uiDir, 'user-flows.md'), Buffer.from(docs.flows, 'utf8'));
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(uiDir, 'vision-prompt.md'), Buffer.from(docs.visionPrompt, 'utf8'));
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(uiDir, 'screenshots-analysis.json'), Buffer.from(JSON.stringify(analysis, null, 2), 'utf8'));

    const warnings = [...new Set(analysis.flatMap((shot) => shot.warnings))];
    await updateAgentState(root, 'visor', {
      status: 'completed',
      receivedInputs: accepted.map((file) => path.basename(file)),
      generatedFiles: [
        '.tic-code/reverse-engineering/ui/screenshots-index.md',
        '.tic-code/reverse-engineering/ui/ui-analysis.md',
        '.tic-code/reverse-engineering/ui/user-flows.md',
        '.tic-code/reverse-engineering/ui/vision-prompt.md',
        '.tic-code/reverse-engineering/ui/screenshots-analysis.json'
      ],
      confidenceSummary: {
        confirmed: analysis.filter((shot) => shot.confidence === 'CONFIRMED').length,
        inferred: analysis.filter((shot) => shot.confidence === 'INFERRED').length,
        gaps: analysis.filter((shot) => shot.confidence === 'GAP').length
      },
      warnings,
      errors: []
    });

    const action = await vscode.window.showInformationMessage(
      `Visor: ${accepted.length} screenshot(s) importado(s). Para análise visual com IA paga (Claude/Gemini/GPT), use o vision-prompt.md gerado.`,
      'Abrir Vision Prompt',
      'Abrir UI Analysis'
    );
    if (action === 'Abrir Vision Prompt') {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(uiDir, 'vision-prompt.md'));
      await vscode.window.showTextDocument(doc);
    } else if (action === 'Abrir UI Analysis') {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(uiDir, 'ui-analysis.md'));
      await vscode.window.showTextDocument(doc);
    }
  } catch (error) {
    await updateAgentState(root, 'visor', { status: 'failed', errors: [String(error)] });
    vscode.window.showErrorMessage('Visor: falha ao importar/analisar screenshots.');
  }
}
