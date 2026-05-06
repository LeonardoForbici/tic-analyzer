import * as vscode from 'vscode'; import { FrontendScreenMatch } from './impactTypes'; import { routeTokens } from './routeMatcher';
export async function detectFrontendScreen(_root: vscode.WorkspaceFolder, route: string): Promise<FrontendScreenMatch[]> {
 const files = await vscode.workspace.findFiles('**/*.{tsx,ts,jsx,js,html}', '**/{node_modules,dist,build,.git,.tic-code}/**', 8000);
 const tokens = routeTokens(route); const out: FrontendScreenMatch[] = [];
 for (const f of files) { const text = Buffer.from(await vscode.workspace.fs.readFile(f)).toString('utf8'); const rel=vscode.workspace.asRelativePath(f,false);
  if (text.includes(`path=\"${route}\"`) || text.includes(`path: '${route}'`) || text.includes(`path: \"${route}\"`)) out.push({route,file:rel,confidence:'🟢 CONFIRMADO',evidence:['Rota exata encontrada'],matchedBy:'exact-route'});
  else if (tokens.every((t)=>text.toLowerCase().includes(t.toLowerCase())) && /route|createBrowserRouter|pages|app\/|next/i.test(text+rel)) out.push({route,file:rel,confidence:'🟡 INFERIDO',evidence:['Tokens da rota encontrados'],matchedBy:'route-pattern'});
 }
 if (!out.length) out.push({route,file:'N/A',confidence:'🔴 LACUNA',evidence:['Tela não localizada com os padrões atuais'],matchedBy:'inferred'});
 return out.slice(0,20);
}
