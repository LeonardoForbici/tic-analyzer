import * as vscode from 'vscode';
import { normalizeRoute } from './routeMatcher'; import { detectFrontendScreen } from './frontendScreenDetector'; import { detectApiCalls } from './apiCallDetector'; import { matchBackendEndpoints } from './backendEndpointMatcher'; import { traceBackendFlow } from './backendFlowTracer'; import { traceDatabaseImpact } from './databaseImpactTracer'; import { estimateImpact } from './impactEstimator'; import { generateImpactReport } from './generateImpactReport'; import { ScreenImpactInput, ScreenImpactResult } from './impactTypes'; import { writeScreenInput } from './screenInputStore'; import { updateAgentState } from '../commands/shared/updateAgentState';

export async function importScreenForImpactCommand(): Promise<string|undefined> { const root=vscode.workspace.workspaceFolders?.[0]; if(!root) return;
 const pick=await vscode.window.showOpenDialog({canSelectMany:false,filters:{Images:['png','jpg','jpeg','webp']}}); if(!pick?.length) return;
 const dir=vscode.Uri.joinPath(root.uri,'.tic-code','impact','screenshots'); await vscode.workspace.fs.createDirectory(dir); const dest=vscode.Uri.joinPath(dir,pick[0].path.split('/').pop()||'screen.png');
 await vscode.workspace.fs.writeFile(dest,await vscode.workspace.fs.readFile(pick[0])); return dest.fsPath; }

export async function analyzeImpactByScreenCommand(): Promise<void> { const root=vscode.workspace.workspaceFolders?.[0]; if(!root) return;
 const url = await vscode.window.showInputBox({prompt:'URL da tela'}); if(!url) return; const changeDescription=await vscode.window.showInputBox({prompt:'Descrição da mudança desejada'}); if(!changeDescription) return;
 const importShot = await vscode.window.showQuickPick(['Não','Sim'], {placeHolder:'Deseja importar screenshot?'}); const screenshotPath = importShot==='Sim' ? await importScreenForImpactCommand() : undefined;
 const input: ScreenImpactInput={id:`impact-${Date.now()}`,url,normalizedRoute:normalizeRoute(url),screenshotPath,changeDescription,createdAt:new Date().toISOString()}; await writeScreenInput(root,input);
 const frontendMatches=await detectFrontendScreen(root,input.normalizedRoute); const apiCalls=await detectApiCalls(frontendMatches); const backendEndpoints=await matchBackendEndpoints(apiCalls); const backendFlow=await traceBackendFlow(backendEndpoints); const databaseImpact=await traceDatabaseImpact(backendFlow);
 const gaps:string[]=[]; if(frontendMatches.some((m)=>m.confidence==='🔴 LACUNA')) gaps.push('Tela não localizada com confiança.'); if(backendEndpoints.some((e)=>e.confidence==='🔴 LACUNA')) gaps.push('Endpoint backend não confirmado.');
 const questions=['Qual endpoint oficial dessa tela deve ser alterado?','Há regra de permissão/perfil envolvida?','Existe impacto esperado em escrita de banco?'];
 const impactEstimate=estimateImpact({frontendMatches,apiCalls,backendEndpoints,backendFlow,databaseImpact,input,gaps,questions});
 const result: ScreenImpactResult={input,frontendMatches,apiCalls,backendEndpoints,backendFlow,databaseImpact,impactEstimate,gaps,questions,generatedFiles:[]};
 const dir=vscode.Uri.joinPath(root.uri,'.tic-code','impact'); await vscode.workspace.fs.createDirectory(dir);
 const files=[['screen-impact.json',JSON.stringify(result,null,2)],['screen-impact.md',generateImpactReport(result)],['frontend-trace.json',JSON.stringify(frontendMatches,null,2)],['backend-trace.json',JSON.stringify({backendEndpoints,backendFlow},null,2)],['database-trace.json',JSON.stringify(databaseImpact,null,2)]] as const;
 for (const [name,data] of files) { await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir,name),Buffer.from(data,'utf8')); result.generatedFiles.push(`.tic-code/impact/${name}`); }
 const traceUri=vscode.Uri.joinPath(root.uri,'.tic-code','reverse-engineering','traceability'); await vscode.workspace.fs.createDirectory(traceUri);
 await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(traceUri,'screen-impact.md'),Buffer.from(`# Screen Impact\n\n- Relatório: [.tic-code/impact/screen-impact.md](../../impact/screen-impact.md)\n- Score: ${impactEstimate.score}\n- Nível: ${impactEstimate.level}\n`,'utf8'));
 await updateAgentState(root,'visor',{status:'completed',warnings:[],errors:[],generatedFiles:['.tic-code/impact/screen-input.json'],receivedInputs:screenshotPath?[screenshotPath]:[]});
 await updateAgentState(root,'detective',{warnings:gaps}); await updateAgentState(root,'architect',{warnings:[`Impacto ${impactEstimate.level}`]}); await updateAgentState(root,'dataMaster',{warnings:databaseImpact.writeOperations.length?['Possível impacto de escrita em banco']:[]}); await updateAgentState(root,'writer',{generatedFiles:['.tic-code/impact/screen-impact.md']}); await updateAgentState(root,'reviewer',{warnings:gaps,receivedInputs:questions});
 await vscode.commands.executeCommand('ticCoderLite.openOverview'); vscode.window.showInformationMessage(`Impacto por Tela concluído: ${impactEstimate.level} (${impactEstimate.score})`);
}
