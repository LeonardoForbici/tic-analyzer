import { app, BrowserWindow, ipcMain, dialog, shell, Notification } from 'electron';
import * as path from 'path';
import { execSync } from 'child_process';
import { runPipeline, type PipelineProgress, type PipelineResult } from '../src/analyzer/pipeline';
import { TicAnalyzerMcpServer } from '../src/mcp/server';
import { openIndexDb, INDEX_DB_FILE } from '../src/analyzer/store/indexDb';
import { queryImpactOf, queryBlastRadius } from '../src/analyzer/store/impactQueries';
import { queryGraphLevel } from '../src/analyzer/store/graphQueries';
import { transitionTriageItem, createManualItem, type TriageState, type TriageCategory, type TriagePriority } from '../src/analyzer/store/triageStore';
import { renderArchReviewHtml, loadArchRules } from '../src/analyzer/checkArchRules';
import { loadActivity } from '../src/analyzer/store/activityLog';
import { dispatchAlerts } from '../src/analyzer/notify';
import { renderExecutiveHtml, buildExecReportData } from '../src/analyzer/generateExecutiveReport';
import { loadPortfolio, upsertProject, removeProject } from '../src/analyzer/store/portfolioStore';

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

async function runAndBroadcast(projectPath: string): Promise<PipelineResult> {
  const ticCodeDir = path.join(projectPath, '.tic-code');
  const before = loadActivity(ticCodeDir).length;
  const result = await runPipeline(projectPath, (progress: PipelineProgress) => {
    mainWindow?.webContents.send('analysis-progress', progress);
  });
  mainWindow?.webContents.send('analysis-done', result);
  if (result.success) upsertProject(projectPath); // registra/atualiza no portfólio global

  // Sistema vivo: empurra eventos novos ao renderer, notificação nativa p/
  // críticos e alertas outbound (mesma config .tic-rules.json do servidor).
  if (result.success) {
    const fresh = loadActivity(ticCodeDir).slice(before);
    for (const e of fresh) mainWindow?.webContents.send('activity-event', e);
    const critical = fresh.filter((e) => e.severity === 'critical');
    if (critical.length > 0 && Notification.isSupported()) {
      new Notification({
        title: `TIC Analyzer — ${path.basename(projectPath)}`,
        body: critical.map((e) => e.title).slice(0, 3).join('\n')
      }).show();
    }
    try {
      const cfg = loadArchRules(projectPath);
      if (cfg?.alerts) await dispatchAlerts(fresh, cfg.alerts, path.basename(projectPath));
    } catch { /* best-effort */ }
  }
  return result;
}

ipcMain.handle('run-analysis', async (_event, projectPath: string) => {
  if (!mainWindow) return;
  return runAndBroadcast(projectPath);
});

// ── Modo Ao Vivo: file-watch debounced no projeto aberto ─────────────────────
let liveWatcher: import('fs').FSWatcher | null = null;
let liveTimer: NodeJS.Timeout | null = null;
let liveAnalyzing = false;
ipcMain.handle('set-live-mode', async (_event, projectPath: string, on: boolean) => {
  if (liveWatcher) { liveWatcher.close(); liveWatcher = null; }
  if (liveTimer) { clearTimeout(liveTimer); liveTimer = null; }
  if (!on) return { ok: true, live: false };
  const fs = await import('fs');
  const IGNORE = /(^|[\\/])(\.tic-code|\.git|node_modules|dist|build|target|out)([\\/]|$)/;
  const trigger = () => {
    if (liveTimer) clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      if (liveAnalyzing) { trigger(); return; }
      liveAnalyzing = true;
      void runAndBroadcast(projectPath).finally(() => { liveAnalyzing = false; });
    }, 15_000);
  };
  try {
    liveWatcher = fs.watch(projectPath, { recursive: true }, (_e, filename) => {
      if (filename && !IGNORE.test(String(filename))) trigger();
    });
    return { ok: true, live: true };
  } catch (err) {
    return { ok: false, live: false, error: String(err) };
  }
});

ipcMain.handle('get-activity', async (_event, projectPath: string, limit?: number) => {
  return loadActivity(path.join(projectPath, '.tic-code'), limit);
});

// ── Portfólio multi-projeto ──────────────────────────────────────────────────
ipcMain.handle('get-portfolio', async () => loadPortfolio());
ipcMain.handle('remove-portfolio-project', async (_event, id: string) => { removeProject(id); return loadPortfolio(); });
ipcMain.handle('analyze-portfolio-project', async (_event, projectPath: string) => {
  const r = await runAndBroadcast(projectPath);
  return { ok: r.success, portfolio: loadPortfolio() };
});

// Relatório executivo: HTML → PDF via printToPDF (Electron nativo) ou HTML standalone
ipcMain.handle('export-executive-report', async (_event, projectPath: string, format: 'pdf' | 'html' = 'pdf') => {
  const fs = await import('fs');
  const ticCodeDir = path.join(projectPath, '.tic-code');
  const read = (f: string) => { try { return JSON.parse(fs.readFileSync(path.join(ticCodeDir, f), 'utf8')); } catch { return null; } };
  if (!read('analysis.json')) return { ok: false, error: 'Análise não encontrada — rode Analisar primeiro.' };
  const html = renderExecutiveHtml(buildExecReportData(read));

  if (format === 'html') {
    const out = path.join(ticCodeDir, 'executive-report.html');
    fs.writeFileSync(out, html, 'utf8');
    await shell.openPath(out);
    return { ok: true, path: out };
  }

  // PDF: renderiza num BrowserWindow oculto e usa webContents.printToPDF
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise((r) => setTimeout(r, 600)); // deixa o Tailwind CDN aplicar
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
    const out = path.join(ticCodeDir, 'executive-report.pdf');
    fs.writeFileSync(out, pdf);
    await shell.openPath(out);
    return { ok: true, path: out };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    win.destroy();
  }
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
    const hasLayer = hasModules && (db.prepare('PRAGMA table_info(files)').all() as any[]).some((c) => c.name === 'layer');
    if (!hasLayer) return { error: 'index.db antigo (sem agregação por módulo/camada). Execute a análise novamente.' };
    return queryGraphLevel(db, { expanded: Array.isArray(expanded) ? expanded : [] });
  } catch (err) {
    return { error: String(err) };
  } finally {
    db.close();
  }
});

ipcMain.handle('update-triage', async (_event, projectPath: string, id: string, changes: { state?: TriageState; category?: TriageCategory; priority?: TriagePriority }) => {
  return transitionTriageItem(path.join(projectPath, '.tic-code'), id, changes);
});

ipcMain.handle('create-triage', async (_event, projectPath: string, input: { title: string; category: TriageCategory; priority?: TriagePriority; entity?: string }) => {
  return createManualItem(path.join(projectPath, '.tic-code'), input);
});

ipcMain.handle('open-arch-report', async (_event, projectPath: string) => {
  const fs = await import('fs');
  const os = await import('os');
  try {
    const raw = fs.readFileSync(path.join(projectPath, '.tic-code', 'arch-suggestions.json'), 'utf8');
    const candidates = JSON.parse(raw);
    const html = renderArchReviewHtml(candidates, path.basename(projectPath));
    const out = path.join(os.tmpdir(), `architecture-review-${Date.now()}.html`);
    fs.writeFileSync(out, html, 'utf8');
    await shell.openPath(out);
    return { ok: true, path: out };
  } catch (err) {
    return { ok: false, error: String(err) };
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
