import * as vscode from 'vscode'; import { BackendEndpointMatch, BackendFlowNode } from './impactTypes';
export async function traceBackendFlow(endpoints: BackendEndpointMatch[]): Promise<BackendFlowNode[]> { const out: BackendFlowNode[]=[];
 for(const ep of endpoints.filter((e)=>e.controllerFile!=='N/A')){ const controllerUri=vscode.Uri.file(`${vscode.workspace.workspaceFolders?.[0].uri.fsPath}/${ep.controllerFile}`);
  const text=Buffer.from(await vscode.workspace.fs.readFile(controllerUri)).toString('utf8'); out.push({type:'controller',file:ep.controllerFile,symbol:ep.controllerMethod,confidence:ep.confidence,evidence:ep.evidence});
  const hits=[...text.matchAll(/(\w+Service|\w+BO|\w+Dao|\w+Repository)\.(\w+)\(/g)]; hits.forEach((h)=> out.push({type:/Repository/i.test(h[1])?'repository':/Dao/i.test(h[1])?'dao':/BO/i.test(h[1])?'bo':'service',file:ep.controllerFile,symbol:h[1],confidence:'🟡 INFERIDO',evidence:[`Chamada ${h[1]}.${h[2]} detectada`]}));
  [...text.matchAll(/(?:sql\/[^"']+\.sql|getResourceAsStream\(["']([^"']+)["']\))/g)].forEach((s)=> out.push({type:'sql-resource',file:ep.controllerFile,symbol:s[1]||s[0],confidence:'🟡 INFERIDO',evidence:['Recurso SQL referenciado']}));
 }
 return out;
}
