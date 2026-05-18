import * as vscode from 'vscode';
import { getLastAnalysis } from './analyzeProject';
import { getWorkspaceRoot } from '../utils/workspace';
import { analyzeWhatIfImpact } from '../impact/whatIfAnalyzer';
import { generateWhatIfReport } from '../impact/generateWhatIfReport';

export async function analyzeWhatIfCommand(context: vscode.ExtensionContext): Promise<void> {
  const root = getWorkspaceRoot();
  if (!root) return;

  const summary = getLastAnalysis(context);
  if (!summary) {
    vscode.window.showWarningMessage('TIC Coder Lite: Execute "Analisar Workspace" primeiro para carregar o grafo.');
    return;
  }

  const hypothesis = await vscode.window.showInputBox({
    title: 'What-If Impact Analyzer',
    prompt: 'Descreva a mudança hipotética que deseja analisar',
    placeHolder: 'Ex: E se eu mudar o campo valor de Double para BigDecimal?',
    ignoreFocusOut: true
  });

  if (!hypothesis?.trim()) return;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'What-If: analisando impacto...',
      cancellable: false
    },
    async (progress) => {
      progress.report({ message: 'Percorrendo arquivos e grafo de dependências...' });

      const result = await analyzeWhatIfImpact(root, hypothesis, summary.graph);
      const report = generateWhatIfReport(result);

      // Salvar relatório
      const outDir = vscode.Uri.joinPath(root.uri, '.tic-code', 'what-if');
      await vscode.workspace.fs.createDirectory(outDir);

      const slug = hypothesis.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `${slug}-${timestamp}.md`;
      const outUri = vscode.Uri.joinPath(outDir, fileName);
      const jsonUri = vscode.Uri.joinPath(outDir, fileName.replace('.md', '.json'));

      await vscode.workspace.fs.writeFile(outUri, Buffer.from(report, 'utf8'));
      await vscode.workspace.fs.writeFile(jsonUri, Buffer.from(JSON.stringify(result, null, 2), 'utf8'));

      progress.report({ message: 'Abrindo relatório...' });

      const doc = await vscode.workspace.openTextDocument(outUri);
      await vscode.window.showTextDocument(doc, { preview: false });

      const riskMsg = result.overallRisk === 'CRITICAL' || result.overallRisk === 'HIGH'
        ? `⚠️ Risco ${result.overallRisk}: ${result.impactedNodes.length} arquivo(s) impactado(s). Revise antes de commitar.`
        : `✅ Risco ${result.overallRisk}: ${result.impactedNodes.length} arquivo(s) impactado(s).`;

      vscode.window.showInformationMessage(riskMsg, 'Ver relatório').then((action) => {
        if (action) vscode.window.showTextDocument(doc);
      });
    }
  );
}
