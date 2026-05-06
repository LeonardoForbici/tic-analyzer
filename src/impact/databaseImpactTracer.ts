import * as vscode from 'vscode'; import { BackendFlowNode, DatabaseImpact } from './impactTypes';
export async function traceDatabaseImpact(flow: BackendFlowNode[]): Promise<DatabaseImpact> { const sqlFiles=[...new Set(flow.filter((n)=>n.type==='sql-resource').map((n)=>n.symbol||'').filter(Boolean))] as string[];
 const impact: DatabaseImpact={sqlFiles,tables:[],views:[],functions:[],procedures:[],packages:[],triggers:[],readOperations:[],writeOperations:[],confidence:'INFERRED',evidence:[]};
 const files = await vscode.workspace.findFiles('**/*.{sql,pks,pkb,prc,fnc,trg}', '**/{node_modules,.git,dist,build}/**', 5000);
 for(const f of files){ const text=Buffer.from(await vscode.workspace.fs.readFile(f)).toString('utf8');
  [...text.matchAll(/\b(?:from|join)\s+([a-zA-Z0-9_\.]+)/gi)].forEach((m)=>impact.readOperations.push(m[1]));
  [...text.matchAll(/\b(?:insert\s+into|update|delete\s+from|merge\s+into)\s+([a-zA-Z0-9_\.]+)/gi)].forEach((m)=>impact.writeOperations.push(m[1]));
  [...text.matchAll(/\b(?:call|execute)\s+([a-zA-Z0-9_\.]+)/gi)].forEach((m)=>impact.procedures.push(m[1]));
 }
 impact.tables=[...new Set([...impact.readOperations,...impact.writeOperations])];
 return impact;
}
