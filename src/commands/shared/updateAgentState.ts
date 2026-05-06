import * as vscode from 'vscode';

type AgentPatch = Record<string, unknown>;

export async function updateAgentState(root: vscode.WorkspaceFolder, agentKey: string, patch: AgentPatch): Promise<void> {
  const stateUri = vscode.Uri.joinPath(root.uri, '.tic-code', 'reversa', 'state.json');
  try {
    const raw = Buffer.from(await vscode.workspace.fs.readFile(stateUri)).toString('utf8');
    const state = JSON.parse(raw);
    const now = new Date().toISOString();
    if (state?.agents?.[agentKey]) {
      state.agents[agentKey] = { ...state.agents[agentKey], ...patch, lastRunAt: now, finishedAt: now };
      state.updatedAt = now;
      await vscode.workspace.fs.writeFile(stateUri, Buffer.from(JSON.stringify(state, null, 2), 'utf8'));
    }
  } catch {}
}
