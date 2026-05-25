import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import { runPipeline, type PipelineProgress, type PipelineResult } from '../src/analyzer/pipeline';
import { TicAnalyzerMcpServer } from '../src/mcp/server';

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let mcpServer: TicAnalyzerMcpServer | null = null;
let mcpPort = 7432;
let mcpProjectPath = '';

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 860,
    height: 640,
    minWidth: 720,
    minHeight: 540,
    title: 'TIC Analyzer',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png')
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC Handlers ────────────────────────────────────────────────────────────────

ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Selecione a pasta RAIZ do projeto (não a pasta .tic-code)'
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const selected = result.filePaths[0].replace(/[\\/]$/, '');
  return selected.endsWith('.tic-code') ? path.dirname(selected) : selected;
});

ipcMain.handle('run-analysis', async (_event, projectPath: string) => {
  if (!mainWindow) return;

  const result = await runPipeline(projectPath, (progress: PipelineProgress) => {
    mainWindow?.webContents.send('analysis-progress', progress);
  });

  mainWindow.webContents.send('analysis-done', result);
  return result;
});

ipcMain.handle('start-mcp', async (_event, projectPath: string, port: number) => {
  if (mcpServer?.isRunning()) {
    await mcpServer.stop();
  }

  mcpPort = port || 7432;
  mcpProjectPath = projectPath;
  mcpServer = new TicAnalyzerMcpServer({ projectPath, port: mcpPort });

  await mcpServer.startHttp(mcpPort);
});

ipcMain.handle('stop-mcp', async () => {
  if (mcpServer) {
    await mcpServer.stop();
    mcpServer = null;
  }
});

ipcMain.handle('get-mcp-status', () => ({
  running: mcpServer?.isRunning() ?? false,
  port: mcpPort,
  projectPath: mcpProjectPath
}));

ipcMain.handle('open-folder', async (_event, folderPath: string) => {
  await shell.openPath(folderPath);
});

// ── App lifecycle ────────────────────────────────────────────────────────────────

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', async () => {
  if (mcpServer?.isRunning()) {
    await mcpServer.stop();
  }
});
