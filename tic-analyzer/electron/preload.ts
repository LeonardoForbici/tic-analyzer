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
  }
});
