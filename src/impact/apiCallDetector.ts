import * as vscode from 'vscode'; import { ApiCallMatch, FrontendScreenMatch } from './impactTypes';
export async function detectApiCalls(matches: FrontendScreenMatch[]): Promise<ApiCallMatch[]> { const out: ApiCallMatch[]=[];
 for (const m of matches.filter((x)=>x.file!=='N/A')) { const uri=vscode.Uri.file(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ? `${vscode.workspace.workspaceFolders[0].uri.fsPath}/${m.file}`:m.file);
  try { const text=Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'); const lines=text.split('\n');
   lines.forEach((line,i)=>{ const r=line.match(/(axios\.(get|post|put|delete|patch)|fetch|api\.(get|post|put|delete|patch)).*?['\"]([^'\"]+)['\"]/i); if(r){out.push({method:(r[2]||r[4]||'GET').toUpperCase(),path:r[5],file:m.file,line:i+1,caller:m.componentName||'unknown',confidence:'🟡 INFERIDO',evidence:['Chamada HTTP detectada por regex']});}});
  } catch {}
 }
 return out;
}
