import * as vscode from 'vscode'; import { ApiCallMatch, BackendEndpointMatch } from './impactTypes';
export async function matchBackendEndpoints(apiCalls: ApiCallMatch[]): Promise<BackendEndpointMatch[]> {
 const javaFiles = await vscode.workspace.findFiles('**/*.java', '**/{node_modules,.git,dist,build,.tic-code}/**', 5000); const out: BackendEndpointMatch[]=[];
 for (const call of apiCalls) for (const f of javaFiles){ const text=Buffer.from(await vscode.workspace.fs.readFile(f)).toString('utf8');
  const base=(text.match(/@RequestMapping\((?:value\s*=\s*)?["']([^"']+)["']/)?.[1])||'';
  const mm=[...text.matchAll(/@(Get|Post|Put|Delete|Patch)Mapping\((?:value\s*=\s*)?["']?([^"')}]*)["']?\)/g)];
  for(const m of mm){ const method=m[1].toUpperCase(); const p=(base+'/'+(m[2]||'')).replace(/\/+/g,'/'); if((call.path&&p.includes(call.path))||call.path.includes(p)){ out.push({method,path:p,controllerFile:vscode.workspace.asRelativePath(f,false),serviceCandidates:[],confidence:'🟢 CONFIRMADO',evidence:['Mapeamento Spring encontrado']}); }}
 }
 return out.length?out:[{method:'UNKNOWN',path:apiCalls[0]?.path||'N/A',controllerFile:'N/A',serviceCandidates:[],confidence:'🔴 LACUNA',evidence:['Endpoint backend não encontrado']}];
}
