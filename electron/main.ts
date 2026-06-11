import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import { execSync } from 'child_process';
import { runPipeline, type PipelineProgress, type PipelineResult } from '../src/analyzer/pipeline';
import { TicAnalyzerMcpServer } from '../src/mcp/server';
import { openIndexDb, INDEX_DB_FILE } from '../src/analyzer/store/indexDb';
import { queryImpactOf, queryBlastRadius } from '../src/analyzer/store/impactQueries';
import { queryGraphLevel } from '../src/analyzer/store/graphQueries';

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
  mcpServer = new TicAnalyzerMcpServer({
    projectPath,
    port: mcpPort,
    onToolCall: (entry) => {
      mainWindow?.webContents.send('mcp-token-update', entry);
    }
  });

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

ipcMain.handle('get-token-stats', () => mcpServer?.getTokenStats() ?? null);

ipcMain.handle('clear-token-stats', () => { mcpServer?.clearTokenLog(); });

ipcMain.handle('open-folder', async (_event, folderPath: string) => {
  await shell.openPath(folderPath);
});

ipcMain.handle('read-file', async (_event, filePath: string): Promise<string | null> => {
  try {
    const fs = await import('fs');
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch { return null; }
});

ipcMain.handle('get-git-diff', async (_event, projectPath: string): Promise<{ files: string[]; error?: string }> => {
  try {
    const run = (cmd: string) => {
      try { return execSync(cmd, { cwd: projectPath, encoding: 'utf8', timeout: 5000 }).trim(); }
      catch { return ''; }
    };

    const staged   = run('git diff --name-only --cached HEAD');
    const unstaged = run('git diff --name-only HEAD');
    const untracked = run('git ls-files --others --exclude-standard');

    const files = [...new Set([
      ...staged.split('\n'),
      ...unstaged.split('\n'),
      ...untracked.split('\n')
    ])].filter(Boolean);

    return { files };
  } catch (err) {
    return { files: [], error: String(err) };
  }
});

ipcMain.handle('get-impact-of', async (_event, projectPath: string, entity: string) => {
  const db = openIndexDb(path.join(projectPath, '.tic-code', INDEX_DB_FILE));
  if (!db) return { error: 'index.db não encontrado. Execute a análise novamente.' };
  try {
    const hasImpact = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='impact_edges'").get();
    if (!hasImpact) return { error: 'index.db antigo (sem grafo de impacto). Execute a análise novamente.' };
    const impact = queryImpactOf(db, entity);
    if (!impact) return { error: `Entidade "${entity}" não encontrada.` };
    const blast = queryBlastRadius(db, impact.entity);
    return { impact, blast };
  } catch (err) {
    return { error: String(err) };
  } finally {
    db.close();
  }
});

ipcMain.handle('get-graph-level', async (_event, projectPath: string, expanded: string[]) => {
  const db = openIndexDb(path.join(projectPath, '.tic-code', INDEX_DB_FILE));
  if (!db) return { error: 'index.db não encontrado. Execute a análise novamente.' };
  try {
    const hasModules = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='modules'").get();
    if (!hasModules) return { error: 'index.db antigo (sem agregação por módulo). Execute a análise novamente.' };
    return queryGraphLevel(db, { expanded: Array.isArray(expanded) ? expanded : [] });
  } catch (err) {
    return { error: String(err) };
  } finally {
    db.close();
  }
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
