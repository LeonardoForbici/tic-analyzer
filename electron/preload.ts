import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ticAnalyzer', {
  selectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('select-folder'),

  runAnalysis: (projectPath: string): Promise<void> =>
    ipcRenderer.invoke('run-analysis', projectPath),

  startMcp: (projectPath: string, port: number): Promise<void> =>
    ipcRenderer.invoke('start-mcp', projectPath, port),

  stopMcp: (): Promise<void> =>
    ipcRenderer.invoke('stop-mcp'),

  getMcpStatus: (): Promise<{ running: boolean; port: number; projectPath: string }> =>
    ipcRenderer.invoke('get-mcp-status'),

  openFolder: (folderPath: string): Promise<void> =>
    ipcRenderer.invoke('open-folder', folderPath),

  onProgress: (callback: (progress: unknown) => void) => {
    ipcRenderer.on('analysis-progress', (_event, progress) => callback(progress));
    return () => ipcRenderer.removeAllListeners('analysis-progress');
  },

  onAnalysisDone: (callback: (result: unknown) => void) => {
    ipcRenderer.once('analysis-done', (_event, result) => callback(result));
  },

  readFile: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('read-file', filePath),

  getGitDiff: (projectPath: string): Promise<{ files: string[]; error?: string }> =>
    ipcRenderer.invoke('get-git-diff', projectPath),

  getImpactOf: (projectPath: string, entity: string): Promise<unknown> =>
    ipcRenderer.invoke('get-impact-of', projectPath, entity),

  getGraphLevel: (projectPath: string, expanded: string[]): Promise<unknown> =>
    ipcRenderer.invoke('get-graph-level', projectPath, expanded),

  getTokenStats: (): Promise<unknown> =>
    ipcRenderer.invoke('get-token-stats'),

  clearTokenStats: (): Promise<void> =>
    ipcRenderer.invoke('clear-token-stats'),

  onTokenUpdate: (callback: (entry: unknown) => void) => {
    const handler = (_event: unknown, entry: unknown) => callback(entry);
    ipcRenderer.on('mcp-token-update', handler);
    return () => ipcRenderer.removeListener('mcp-token-update', handler);
  }
});
