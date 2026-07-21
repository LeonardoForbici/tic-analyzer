import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { execSync } from 'child_process';
import express, { Request, Response } from 'express';
import { runPipeline, type PipelineProgress, type PipelineResult } from '../analyzer/pipeline';
import { TicAnalyzerMcpServer } from '../mcp/server';
import { openIndexDb, INDEX_DB_FILE } from '../analyzer/store/indexDb';
import { queryImpactOf, queryBlastRadius } from '../analyzer/store/impactQueries';
import { buildAgentBrief, buildDiagnosis } from '../mcp/agentBrief';
import { loadTriage } from '../analyzer/store/triageStore';
import { queryMemory } from '../analyzer/store/memoryStore';
import { queryGraphLevel, queryUnifiedGraph } from '../analyzer/store/graphQueries';
import { querySearch, queryVectorSearch, embeddingsCount, fuseRRF } from '../mcp/queries';
import { getEmbedder } from '../analyzer/semantic/embeddings';
import { transitionTriageItem, createManualItem, type TriageState, type TriageCategory, type TriagePriority } from '../analyzer/store/triageStore';
import { renderArchReviewHtml, loadArchRules, rulesTemplate } from '../analyzer/checkArchRules';
import { loadActivity } from '../analyzer/store/activityLog';
import { dispatchAlerts } from '../analyzer/notify';
import { renderExecutiveHtml, buildExecReportData } from '../analyzer/generateExecutiveReport';
import { exportGraphFiles, type GraphExportFormat } from '../analyzer/exportGraph';
import { loadPortfolio, upsertProject, removeProject } from '../analyzer/store/portfolioStore';
import { rescaleRoi } from '../analyzer/computeRoi';
import { eventBus, type BusEvent } from '../analyzer/eventBus';
import { createRestGhClient } from '../analyzer/github/restGhClient';
import { matchesFromEvents, runAgentDispatch } from '../analyzer/agents/runAgentDispatch';
import { saveMeeting, loadMeetings, loadMeeting, ingestDecisions, type MeetingDecisionInput } from '../analyzer/store/meetingStore';

// ── SSE broadcast ────────────────────────────────────────────────────────────
//
// broadcast() publica no eventBus único do processo (analyzer/eventBus.ts) em
// vez de escrever direto nos clients locais — assim qualquer evento chega
// também ao SSE do MCP server (mcp/server.ts::emit), que assina o mesmo bus.

const sseClients = new Set<Response>();

function broadcast(event: string, data: unknown) {
  eventBus.publish({ source: 'server', type: event, payload: data });
}

eventBus.subscribe((busEvent: BusEvent) => {
  const payload = `event: ${busEvent.type}\ndata: ${JSON.stringify(busEvent.payload)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch { sseClients.delete(res); }
  }
});

// ── MCP Server state ─────────────────────────────────────────────────────────

let mcpServer: TicAnalyzerMcpServer | null = null;
let mcpPort = 7432;
let mcpProjectPath = '';

// ── Live mode state ──────────────────────────────────────────────────────────

let liveWatcher: fs.FSWatcher | null = null;
let liveTimer: NodeJS.Timeout | null = null;
let liveAnalyzing = false;

// ── Helpers ──────────────────────────────────────────────────────────────────

const ticDir = (projectPath: string) => path.join(projectPath, '.tic-code');

const readTicJson = (projectPath: string, file: string): unknown => {
  try { return JSON.parse(fs.readFileSync(path.join(ticDir(projectPath), file), 'utf8')); } catch { return null; }
};

const readTicFile = (projectPath: string, file: string): string | null => {
  try { return fs.readFileSync(path.join(ticDir(projectPath), file), 'utf8'); } catch { return null; }
};

async function runAndBroadcast(projectPath: string): Promise<PipelineResult> {
  const dir = ticDir(projectPath);
  const before = loadActivity(dir).length;
  const result = await runPipeline(projectPath, (progress: PipelineProgress) => {
    broadcast('analysis-progress', progress);
  });
  broadcast('analysis-done', result);
  if (result.success) upsertProject(projectPath);

  if (result.success) {
    const fresh = loadActivity(dir).slice(before);
    for (const e of fresh) broadcast('activity-event', e);
    const cfg = loadArchRules(projectPath);
    try {
      if (cfg?.alerts) await dispatchAlerts(fresh, cfg.alerts, path.basename(projectPath));
    } catch { /* best-effort */ }
    try {
      if (cfg?.agents?.enabled) {
        const matches = matchesFromEvents(fresh, cfg.agents.on);
        if (matches.length > 0) {
          const client = createRestGhClient({});
          const { records } = await runAgentDispatch(projectPath, dir, matches, cfg.agents, client);
          for (const r of records) broadcast('agent-dispatched', r);
        }
      }
    } catch { /* best-effort — falha de token/rede não derruba a análise */ }
  }
  return result;
}

function tokenizeForSearch(query: string): string[] {
  const raw = query.match(/[a-zA-Z]{3,}/g) ?? [];
  const tokens = new Set<string>();
  for (const word of raw) {
    word
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
      .replace(/([a-z\d])([A-Z])/g, '$1_$2')
      .split('_')
      .map((t) => t.toLowerCase())
      .filter((t) => t.length >= 3)
      .forEach((p) => tokens.add(p));
    tokens.add(word.toLowerCase());
  }
  return [...tokens];
}

const TIC_WORKFLOW = `name: TIC PR Review
on: pull_request
permissions:
  contents: read
  pull-requests: write
  issues: write
jobs:
  tic:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: LeonardoForbici/tic-coder-lite@main
        with:
          gate: new-high-risks,new-rule-violations,health-drop:5
`;

// ── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '10mb' }));

// SSE endpoint for push events
app.get('/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();
  res.write(': connected\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// select-folder: in web mode, the browser provides the path via POST body
app.post('/api/select-folder', (req: Request, res: Response) => {
  // Browser can't open a native dialog; the UI passes the path directly
  const { projectPath } = req.body as { projectPath?: string };
  if (!projectPath) return res.json(null);
  const clean = projectPath.replace(/[\\/]$/, '');
  res.json(clean.endsWith('.tic-code') ? path.dirname(clean) : clean);
});

app.post('/api/run-analysis', async (req: Request, res: Response) => {
  const { projectPath } = req.body as { projectPath: string };
  res.json({ started: true });
  runAndBroadcast(projectPath).catch(() => { /* errors broadcast via done event */ });
});

app.post('/api/start-mcp', async (req: Request, res: Response) => {
  const { projectPath, port } = req.body as { projectPath: string; port?: number };
  if (mcpServer?.isRunning()) await mcpServer.stop();
  mcpPort = port || 7432;
  mcpProjectPath = projectPath;
  mcpServer = new TicAnalyzerMcpServer({
    projectPath,
    port: mcpPort,
    onToolCall: (entry) => broadcast('mcp-token-update', entry),
  });
  await mcpServer.startHttp(mcpPort);
  res.json({ ok: true });
});

app.post('/api/stop-mcp', async (_req: Request, res: Response) => {
  if (mcpServer) { await mcpServer.stop(); mcpServer = null; }
  res.json({ ok: true });
});

app.get('/api/mcp-status', (_req: Request, res: Response) => {
  res.json({ running: mcpServer?.isRunning() ?? false, port: mcpPort, projectPath: mcpProjectPath });
});

app.get('/api/token-stats', (_req: Request, res: Response) => {
  res.json(mcpServer?.getTokenStats() ?? null);
});

app.post('/api/clear-token-stats', (_req: Request, res: Response) => {
  mcpServer?.clearTokenLog();
  res.json({ ok: true });
});

// open-folder: in web mode, just return the path (browser can show it to user)
app.post('/api/open-folder', (req: Request, res: Response) => {
  res.json({ ok: true, path: req.body.folderPath });
});

app.get('/api/read-file', (req: Request, res: Response) => {
  const filePath = req.query.filePath as string;
  if (!filePath || !fs.existsSync(filePath)) return res.json(null);
  try { res.json(fs.readFileSync(filePath, 'utf8')); } catch { res.json(null); }
});

app.get('/api/git-diff', (req: Request, res: Response) => {
  const { projectPath } = req.query as { projectPath: string };
  try {
    const run = (cmd: string) => {
      try { return execSync(cmd, { cwd: projectPath, encoding: 'utf8', timeout: 5000 }).trim(); }
      catch { return ''; }
    };
    const staged    = run('git diff --name-only --cached HEAD');
    const unstaged  = run('git diff --name-only HEAD');
    const untracked = run('git ls-files --others --exclude-standard');
    const files = [...new Set([
      ...staged.split('\n'),
      ...unstaged.split('\n'),
      ...untracked.split('\n'),
    ])].filter(Boolean);
    res.json({ files });
  } catch (err) {
    res.json({ files: [], error: String(err) });
  }
});

app.get('/api/impact-of', (req: Request, res: Response) => {
  const { projectPath, entity } = req.query as { projectPath: string; entity: string };
  const db = openIndexDb(path.join(projectPath, '.tic-code', INDEX_DB_FILE));
  if (!db) return res.json({ error: 'index.db não encontrado. Execute a análise novamente.' });
  try {
    const hasImpact = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='impact_edges'").get();
    if (!hasImpact) return res.json({ error: 'index.db antigo (sem grafo de impacto). Execute a análise novamente.' });
    const impact = queryImpactOf(db, entity);
    if (!impact) return res.json({ error: `Entidade "${entity}" não encontrada.` });
    const blast = queryBlastRadius(db, impact.entity);
    res.json({ impact, blast });
  } catch (err) {
    res.json({ error: String(err) });
  } finally {
    db.close();
  }
});

app.get('/api/graph-level', (req: Request, res: Response) => {
  const { projectPath } = req.query as { projectPath: string };
  const expanded: string[] = req.query.expanded
    ? (Array.isArray(req.query.expanded) ? req.query.expanded as string[] : [req.query.expanded as string])
    : [];
  const db = openIndexDb(path.join(projectPath, '.tic-code', INDEX_DB_FILE));
  if (!db) return res.json({ error: 'index.db não encontrado. Execute a análise novamente.' });
  try {
    const hasModules = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='modules'").get();
    const hasLayer   = hasModules && (db.prepare('PRAGMA table_info(files)').all() as any[]).some((c) => c.name === 'layer');
    if (!hasLayer) return res.json({ error: 'index.db antigo (sem agregação por módulo/camada). Execute a análise novamente.' });
    res.json(queryGraphLevel(db, { expanded }));
  } catch (err) {
    res.json({ error: String(err) });
  } finally {
    db.close();
  }
});

app.get('/api/unified-graph', (req: Request, res: Response) => {
  const { projectPath } = req.query as { projectPath: string };
  const expanded: string[] = req.query.expanded
    ? (Array.isArray(req.query.expanded) ? req.query.expanded as string[] : [req.query.expanded as string])
    : [];
  const db = openIndexDb(path.join(projectPath, '.tic-code', INDEX_DB_FILE));
  if (!db) return res.json({ error: 'index.db não encontrado. Execute a análise novamente.' });
  try {
    const hasImpact = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='impact_edges'").get();
    if (!hasImpact) return res.json({ error: 'index.db sem grafo de impacto. Execute a análise novamente.' });
    res.json(queryUnifiedGraph(db, { expanded }));
  } catch (err) {
    res.json({ error: String(err) });
  } finally {
    db.close();
  }
});

app.post('/api/export-graph', async (req: Request, res: Response) => {
  const { projectPath, format = 'html', expanded = [] } = req.body as {
    projectPath: string;
    format?: GraphExportFormat;
    expanded?: string[];
  };
  const dir = ticDir(projectPath);
  const db = openIndexDb(path.join(dir, INDEX_DB_FILE));
  if (!db) return res.json({ ok: false, error: 'index.db não encontrado — rode Analisar primeiro.' });
  try {
    const r = exportGraphFiles(db, dir, { format, expanded: Array.isArray(expanded) ? expanded : [] });
    res.json({ ok: true, path: r.path });
  } catch (err) {
    res.json({ ok: false, error: String(err) });
  } finally {
    db.close();
  }
});

app.get('/api/search-code', async (req: Request, res: Response) => {
  const { projectPath, query = '' } = req.query as { projectPath: string; query?: string };
  const q = query.trim();
  if (!q) return res.json({ hits: [], mode: 'empty' });
  const db = openIndexDb(path.join(projectPath, '.tic-code', INDEX_DB_FILE));
  if (!db) return res.json({ error: 'index.db não encontrado. Execute a análise novamente.' });
  try {
    const tokens = tokenizeForSearch(q);
    if (tokens.length === 0) return res.json({ hits: [], mode: 'short' });
    const ftsHits = querySearch(db, tokens, 20);
    if (embeddingsCount(db) > 0) {
      const embedder = await getEmbedder();
      if (embedder) {
        const [qvec] = await embedder([q]);
        const vecHits = queryVectorSearch(db, qvec, 20);
        return res.json({ hits: fuseRRF(ftsHits, vecHits, 60, 12), mode: 'rrf' });
      }
    }
    res.json({ hits: ftsHits.slice(0, 12).map((h) => ({ ...h, origin: 'fts' as const })), mode: 'fts' });
  } catch (err) {
    res.json({ error: String(err) });
  } finally {
    db.close();
  }
});

app.post('/api/update-triage', (req: Request, res: Response) => {
  const { projectPath, id, changes } = req.body as {
    projectPath: string;
    id: string;
    changes: { state?: TriageState; category?: TriageCategory; priority?: TriagePriority };
  };
  res.json(transitionTriageItem(ticDir(projectPath), id, changes));
});

app.post('/api/create-triage', (req: Request, res: Response) => {
  const { projectPath, input } = req.body as {
    projectPath: string;
    input: { title: string; category: TriageCategory; priority?: TriagePriority; entity?: string };
  };
  res.json(createManualItem(ticDir(projectPath), input));
});

app.post('/api/open-arch-report', (req: Request, res: Response) => {
  const { projectPath } = req.body as { projectPath: string };
  try {
    const raw = fs.readFileSync(path.join(projectPath, '.tic-code', 'arch-suggestions.json'), 'utf8');
    const candidates = JSON.parse(raw);
    const html = renderArchReviewHtml(candidates, path.basename(projectPath));
    // Return the HTML directly so the browser can display it
    res.json({ ok: true, html });
  } catch (err) {
    res.json({ ok: false, error: String(err) });
  }
});

app.post('/api/set-live-mode', (req: Request, res: Response) => {
  const { projectPath, on } = req.body as { projectPath: string; on: boolean };
  if (liveWatcher) { liveWatcher.close(); liveWatcher = null; }
  if (liveTimer) { clearTimeout(liveTimer); liveTimer = null; }
  if (!on) return res.json({ ok: true, live: false });

  const IGNORE = /(^|[\\/])(\.tic-code|\.git|node_modules|dist|build|target|out)([\\/]|$)/;
  const trigger = () => {
    if (liveTimer) clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      if (liveAnalyzing) { trigger(); return; }
      liveAnalyzing = true;
      broadcast('live-status', { analyzing: true });
      void runAndBroadcast(projectPath).finally(() => {
        liveAnalyzing = false;
        broadcast('live-status', { analyzing: false, lastRun: new Date().toISOString() });
      });
    }, 15_000);
  };
  try {
    liveWatcher = fs.watch(projectPath, { recursive: true }, (_e, filename) => {
      if (filename && !IGNORE.test(String(filename))) trigger();
    });
    broadcast('live-status', { watching: true });
    res.json({ ok: true, live: true });
  } catch (err) {
    res.json({ ok: false, live: false, error: String(err) });
  }
});

app.get('/api/activity', (req: Request, res: Response) => {
  const { projectPath, limit } = req.query as { projectPath: string; limit?: string };
  res.json(loadActivity(ticDir(projectPath), limit ? Number(limit) : undefined));
});

app.post('/api/export-executive-report', (req: Request, res: Response) => {
  const { projectPath } = req.body as { projectPath: string; format?: string };
  const dir = ticDir(projectPath);
  const read = (f: string) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } };
  if (!read('analysis.json')) return res.json({ ok: false, error: 'Análise não encontrada — rode Analisar primeiro.' });
  const html = renderExecutiveHtml(buildExecReportData(read));
  const out = path.join(dir, 'executive-report.html');
  fs.writeFileSync(out, html, 'utf8');
  res.json({ ok: true, path: out, html });
});

app.get('/api/portfolio', (_req: Request, res: Response) => {
  res.json(loadPortfolio());
});

app.post('/api/remove-portfolio-project', (req: Request, res: Response) => {
  removeProject(req.body.id as string);
  res.json(loadPortfolio());
});

app.post('/api/analyze-portfolio-project', async (req: Request, res: Response) => {
  const { projectPath } = req.body as { projectPath: string };
  res.json({ started: true });
  runAndBroadcast(projectPath)
    .then((r) => broadcast('portfolio-done', { ok: r.success, portfolio: loadPortfolio() }))
    .catch(() => {});
});

app.post('/api/set-roi-config', (req: Request, res: Response) => {
  const { projectPath, cfg } = req.body as { projectPath: string; cfg: { hourlyRate: number; currency: string } };
  try {
    const rulesPath = path.join(projectPath, '.tic-rules.json');
    let rules: any = {};
    try { rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8')); } catch { /* new */ }
    rules.roi = { ...(rules.roi ?? {}), hourlyRate: cfg.hourlyRate, currency: cfg.currency };
    fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2), 'utf8');

    const roiPath = path.join(ticDir(projectPath), 'roi.json');
    const roi = JSON.parse(fs.readFileSync(roiPath, 'utf8'));
    const updated = rescaleRoi(roi, cfg.hourlyRate, cfg.currency);
    fs.writeFileSync(roiPath, JSON.stringify(updated), 'utf8');
    res.json({ ok: true, roi: updated });
  } catch (err) {
    res.json({ ok: false, error: String(err) });
  }
});

app.get('/api/github-status', (req: Request, res: Response) => {
  const { projectPath } = req.query as { projectPath: string };
  const result = { installed: false, workflowFile: null as string | null, hasGit: false, yaml: TIC_WORKFLOW };
  result.hasGit = fs.existsSync(path.join(projectPath, '.git'));
  const wfDir = path.join(projectPath, '.github', 'workflows');
  try {
    for (const f of fs.readdirSync(wfDir)) {
      if (!/\.ya?ml$/.test(f)) continue;
      const content = fs.readFileSync(path.join(wfDir, f), 'utf8');
      if (/tic-coder-lite|tic-analyzer/i.test(content)) {
        result.installed = true;
        result.workflowFile = `.github/workflows/${f}`;
        break;
      }
    }
  } catch { /* no .github/workflows */ }
  res.json(result);
});

app.post('/api/install-github-workflow', (req: Request, res: Response) => {
  const { projectPath } = req.body as { projectPath: string };
  try {
    const wfDir = path.join(projectPath, '.github', 'workflows');
    const target = path.join(wfDir, 'tic-review.yml');
    if (fs.existsSync(target)) return res.json({ ok: true, existed: true, path: '.github/workflows/tic-review.yml' });
    fs.mkdirSync(wfDir, { recursive: true });
    fs.writeFileSync(target, TIC_WORKFLOW, 'utf8');
    res.json({ ok: true, existed: false, path: '.github/workflows/tic-review.yml' });
  } catch (err) {
    res.json({ ok: false, error: String(err) });
  }
});

app.post('/api/create-tic-rules', (req: Request, res: Response) => {
  const { projectPath } = req.body as { projectPath: string };
  try {
    const target = path.join(projectPath, '.tic-rules.json');
    if (fs.existsSync(target)) return res.json({ ok: true, existed: true, path: '.tic-rules.json' });
    fs.writeFileSync(target, JSON.stringify(rulesTemplate(), null, 2), 'utf8');
    res.json({ ok: true, existed: false, path: '.tic-rules.json' });
  } catch (err) {
    res.json({ ok: false, error: String(err) });
  }
});

app.post('/api/ingest-meeting', (req: Request, res: Response) => {
  const { projectPath, title, transcript, participants, decisions } = req.body as {
    projectPath: string; title: string; transcript?: string; participants?: string[]; decisions?: MeetingDecisionInput[];
  };
  try {
    if (!decisions || decisions.length === 0) {
      if (!transcript) return res.json({ ok: false, error: 'Nenhuma decisão nem transcript fornecido.' });
      const meeting = saveMeeting(ticDir(projectPath), { title, participants, sourceText: transcript, decisions: [] });
      return res.json({ ok: true, meetingId: meeting.id, memoryEntriesCreated: 0, pending: true });
    }
    const meeting = saveMeeting(ticDir(projectPath), { title, participants, sourceText: transcript, decisions });
    const result = ingestDecisions(ticDir(projectPath), meeting);
    res.json({ ok: true, meetingId: meeting.id, ...result });
  } catch (err) {
    res.json({ ok: false, error: String(err) });
  }
});

app.get('/api/meetings', (req: Request, res: Response) => {
  const { projectPath, limit } = req.query as { projectPath: string; limit?: string };
  try {
    res.json(loadMeetings(ticDir(projectPath), limit ? Number(limit) : 20));
  } catch (err) {
    res.json({ ok: false, error: String(err) });
  }
});

app.get('/api/meetings/:id', (req: Request, res: Response) => {
  const { projectPath } = req.query as { projectPath: string };
  try {
    const meeting = loadMeeting(ticDir(projectPath), req.params.id);
    if (!meeting) return res.status(404).json({ ok: false, error: 'not found' });
    res.json(meeting);
  } catch (err) {
    res.json({ ok: false, error: String(err) });
  }
});

app.get('/api/list-http-flows', (req: Request, res: Response) => {
  const { projectPath } = req.query as { projectPath: string };
  try {
    const db = openIndexDb(path.join(projectPath, '.tic-code', INDEX_DB_FILE));
    if (!db) return res.json({ flows: [], error: 'index.db não encontrado — rode a análise primeiro.' });
    try {
      const rows = (db.prepare(
        `SELECT from_id, to_id, label FROM cg_edges WHERE type = 'HTTP_CALL' LIMIT 500`
      ).all()) as Array<{ from_id: string; to_id: string; label: string | null }>;
      const flows = rows.map((r) => {
        let url: string | undefined; let method: string | undefined;
        try { const m = r.label ? JSON.parse(r.label) : {}; url = m.url; method = m.method; } catch {}
        return { from: r.from_id, to: r.to_id, url, method };
      });
      res.json({ flows });
    } finally { db.close(); }
  } catch (e) {
    res.json({ flows: [], error: String(e) });
  }
});

app.get('/api/agent-brief', (req: Request, res: Response) => {
  const { projectPath, entity } = req.query as { projectPath: string; entity: string };
  const dir = ticDir(projectPath);
  const db = openIndexDb(path.join(dir, INDEX_DB_FILE));
  if (!db) return res.json({ error: 'index.db não encontrado — rode a análise primeiro.' });
  try {
    const triage = loadTriage(dir).find((t) => t.id === entity);
    const target = triage?.entity ?? triage?.title ?? entity;
    const archData = readTicJson(projectPath, 'arch-violations.json') as { outOfScope?: unknown[] } | null;
    const brief = buildAgentBrief(db, dir, target, {
      category: triage?.category,
      summary: triage?.title,
      detail: triage?.detail,
      outOfScope: (archData?.outOfScope ?? []) as never,
    });
    if (!brief) return res.json({ error: `Entidade "${entity}" não encontrada no grafo de impacto.` });
    const memories = queryMemory(dir, target);
    if (memories.length === 0) return res.json({ markdown: brief, entity: target });
    const memLines = [`\n## Tentativas Anteriores`, `*${memories.length} entrada(s) na memória persistente*`, ''];
    for (const m of memories.slice(0, 5)) {
      const tag = m.result ? ` → **${m.result}**` : '';
      memLines.push(`- **[${m.kind}]** ${m.summary}${tag} *(${m.ts.slice(0, 10)})*`);
      if (m.detail) memLines.push(`  > ${m.detail}`);
    }
    res.json({ markdown: brief + memLines.join('\n'), entity: target });
  } catch (err) {
    res.json({ error: String(err) });
  } finally { db.close(); }
});

app.get('/api/diagnosis', (req: Request, res: Response) => {
  const { projectPath, from, to } = req.query as { projectPath: string; from: string; to?: string };
  const dir = ticDir(projectPath);
  const db = openIndexDb(path.join(dir, INDEX_DB_FILE));
  if (!db) return res.json({ error: 'index.db não encontrado — rode a análise primeiro.' });
  try {
    const diag = buildDiagnosis(db, dir, from, to);
    if (!diag) return res.json({ error: `Entidade "${from}" não encontrada no grafo.` });
    res.json({ markdown: diag });
  } catch (err) {
    res.json({ error: String(err) });
  } finally { db.close(); }
});

app.get('/api/zoom-out', (req: Request, res: Response) => {
  const { projectPath, entity } = req.query as { projectPath: string; entity?: string };
  if (!entity) {
    const md = readTicFile(projectPath, 'zoom-out.md');
    return res.json({ markdown: md ?? 'Visão macro indisponível — rode a análise para gerar zoom-out.md.' });
  }
  const dir = ticDir(projectPath);
  const db = openIndexDb(path.join(dir, INDEX_DB_FILE));
  if (!db) return res.json({ error: 'index.db não encontrado — rode a análise primeiro.' });
  try {
    const r = queryImpactOf(db, entity, { maxDepth: 3 });
    if (!r) return res.json({ error: `Entidade "${entity}" não encontrada.` });
    const file = r.entity.startsWith('file:') ? r.entity.slice(5) : null;
    const home = file ? (db.prepare('SELECT module, layer FROM files WHERE rel_path = ?').get(file) as { module?: string; layer?: string } | undefined) : null;
    const byModule = Object.entries(r.byModule).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const lines = [
      `# Zoom-out: \`${r.entity.slice(r.entity.indexOf(':') + 1)}\``,
      '',
      home ? `Pertence ao módulo **${home.module ?? '—'}** (camada ${home.layer ?? '—'}).` : `Entidade da camada de dados/banco.`,
      '',
      '## Quem depende desta parte (agregado por módulo)',
      ...(byModule.length > 0 ? byModule.map(([m, c]) => `- **${m}** — ${c} ponto(s) de dependência`) : ['- Ninguém depende diretamente (folha do grafo).']),
      '',
      `No total, ${r.totalVisited} entidade(s) em até 3 saltos (${Object.entries(r.byKind).map(([k, v]) => `${k}: ${v}`).join(', ')}).`,
    ];
    res.json({ markdown: lines.join('\n') });
  } catch (err) {
    res.json({ error: String(err) });
  } finally { db.close(); }
});

app.get('/api/skills-overview', (req: Request, res: Response) => {
  const { projectPath } = req.query as { projectPath: string };
  const archData = readTicJson(projectPath, 'arch-violations.json') as { outOfScope?: unknown[] } | null;
  const archSuggestions = readTicJson(projectPath, 'arch-suggestions.json') as unknown[] | null;
  const riskPrediction = readTicJson(projectPath, 'risk-prediction.json') as unknown[] | null;
  const triage = loadTriage(ticDir(projectPath));
  res.json({
    archSuggestions: Array.isArray(archSuggestions) ? archSuggestions : [],
    riskPrediction: Array.isArray(riskPrediction) ? riskPrediction : [],
    outOfScope: Array.isArray(archData?.outOfScope) ? archData!.outOfScope : [],
    triageCounts: {
      total: triage.length,
      readyForAgent: triage.filter((t) => t.state === 'ready-for-agent').length,
      needsTriage: triage.filter((t) => t.state === 'needs-triage').length,
    },
    hasZoomOut: !!readTicFile(projectPath, 'zoom-out.md'),
  });
});

// Serve Vite-built frontend in production
const distRenderer = path.join(__dirname, '..', '..', 'renderer');
if (fs.existsSync(distRenderer)) {
  app.use(express.static(distRenderer));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(distRenderer, 'index.html'));
  });
}

// ── Start ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`TIC Analyzer web server running on http://localhost:${PORT}`);
});
