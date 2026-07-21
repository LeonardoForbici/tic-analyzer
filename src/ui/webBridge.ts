/// <reference types="vite/client" />
// Web bridge: implements window.ticAnalyzer via fetch + SSE
// Replaces the Electron preload/contextBridge with HTTP calls to the local Express server.

const BASE = import.meta.env.DEV ? 'http://localhost:3000' : '';

async function api<T>(method: 'GET' | 'POST', endpoint: string, body?: unknown, params?: Record<string, string | string[] | undefined>): Promise<T> {
  let url = `${BASE}${endpoint}`;
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) { for (const item of v) qs.append(k, item); }
      else qs.set(k, v);
    }
    const str = qs.toString();
    if (str) url += '?' + str;
  }
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<T>;
}

const get  = <T>(ep: string, params?: Record<string, string | string[] | undefined>) => api<T>('GET', ep, undefined, params);
const post = <T>(ep: string, body?: unknown) => api<T>('POST', ep, body);

// ── SSE event bus ─────────────────────────────────────────────────────────────

type Listener = (data: unknown) => void;
const listeners: Record<string, Set<Listener>> = {};

function on(event: string, cb: Listener): () => void {
  (listeners[event] ??= new Set()).add(cb);
  return () => listeners[event]?.delete(cb);
}

function once(event: string, cb: Listener): void {
  const off = on(event, (data) => { off(); cb(data); });
}

let sse: EventSource | null = null;
function ensureSSE() {
  if (sse) return;
  sse = new EventSource(`${BASE}/events`);
  const events = ['analysis-progress', 'analysis-done', 'live-status', 'activity-event', 'mcp-token-update', 'portfolio-done'];
  for (const ev of events) {
    sse.addEventListener(ev, (e: MessageEvent) => {
      let data: unknown;
      try { data = JSON.parse(e.data); } catch { data = e.data; }
      for (const cb of listeners[ev] ?? []) cb(data);
    });
  }
}
ensureSSE();

// ── window.ticAnalyzer implementation ─────────────────────────────────────────

const ticAnalyzer = {
  selectFolder: async (): Promise<string | null> => {
    const input = window.prompt('Caminho absoluto da pasta do projeto:');
    if (!input?.trim()) return null;
    return post<string | null>('/api/select-folder', { projectPath: input.trim() });
  },

  runAnalysis: async (projectPath: string): Promise<void> => {
    await post('/api/run-analysis', { projectPath });
  },

  startMcp: async (projectPath: string, port: number): Promise<void> => {
    await post('/api/start-mcp', { projectPath, port });
  },

  stopMcp: async (): Promise<void> => {
    await post('/api/stop-mcp');
  },

  getMcpStatus: () => get<{ running: boolean; port: number; projectPath: string }>('/api/mcp-status'),

  openFolder: async (folderPath: string): Promise<void> => {
    await post('/api/open-folder', { folderPath });
  },

  onProgress: (callback: (progress: unknown) => void) => on('analysis-progress', callback),

  onAnalysisDone: (callback: (result: unknown) => void) => once('analysis-done', callback),

  readFile: (filePath: string) => get<string | null>('/api/read-file', { filePath }),

  getGitDiff: (projectPath: string) =>
    get<{ files: string[]; error?: string }>('/api/git-diff', { projectPath }),

  getImpactOf: (projectPath: string, entity: string) =>
    get<unknown>('/api/impact-of', { projectPath, entity }),

  getGraphLevel: (projectPath: string, expanded: string[]) =>
    get<unknown>('/api/graph-level', { projectPath, expanded }),

  getUnifiedGraph: (projectPath: string, expanded: string[]) =>
    get<unknown>('/api/unified-graph', { projectPath, expanded }),

  exportGraph: (projectPath: string, format: string, expanded: string[]) =>
    post<{ ok: boolean; path?: string; error?: string }>('/api/export-graph', { projectPath, format, expanded }),

  searchCode: (projectPath: string, query: string) =>
    get<unknown>('/api/search-code', { projectPath, query }),

  updateTriage: (projectPath: string, id: string, changes: unknown) =>
    post<unknown>('/api/update-triage', { projectPath, id, changes }),

  createTriage: (projectPath: string, input: unknown) =>
    post<unknown>('/api/create-triage', { projectPath, input }),

  openArchReport: async (projectPath: string): Promise<unknown> => {
    const r = await post<{ ok: boolean; html?: string; error?: string }>('/api/open-arch-report', { projectPath });
    if (r.ok && r.html) {
      const w = window.open('', '_blank');
      if (w) { w.document.write(r.html); w.document.close(); }
    }
    return r;
  },

  setLiveMode: (projectPath: string, on: boolean) =>
    post<unknown>('/api/set-live-mode', { projectPath, on }),

  getActivity: (projectPath: string, limit?: number) =>
    get<unknown>('/api/activity', { projectPath, ...(limit !== undefined ? { limit: String(limit) } : {}) }),

  exportExecutiveReport: async (projectPath: string, _format: 'pdf' | 'html'): Promise<{ ok: boolean; path?: string; error?: string }> => {
    const r = await post<{ ok: boolean; path?: string; html?: string; error?: string }>('/api/export-executive-report', { projectPath });
    if (r.ok && r.html) {
      const w = window.open('', '_blank');
      if (w) { w.document.write(r.html); w.document.close(); }
    }
    return { ok: r.ok, path: r.path, error: r.error };
  },

  getPortfolio: () => get<unknown>('/api/portfolio'),

  removePortfolioProject: (id: string) => post<unknown>('/api/remove-portfolio-project', { id }),

  analyzePortfolioProject: async (projectPath: string): Promise<unknown> => {
    await post('/api/analyze-portfolio-project', { projectPath });
    return new Promise((resolve) => once('portfolio-done', resolve));
  },

  setRoiConfig: (projectPath: string, cfg: { hourlyRate: number; currency: string }) =>
    post<unknown>('/api/set-roi-config', { projectPath, cfg }),

  getGithubStatus: (projectPath: string) =>
    get<unknown>('/api/github-status', { projectPath }),

  installGithubWorkflow: (projectPath: string) =>
    post<unknown>('/api/install-github-workflow', { projectPath }),

  createTicRules: (projectPath: string) =>
    post<unknown>('/api/create-tic-rules', { projectPath }),

  onLiveStatus: (callback: (s: unknown) => void) => on('live-status', callback),

  onActivity: (callback: (event: unknown) => void) => on('activity-event', callback),

  getTokenStats: () => get<unknown>('/api/token-stats'),

  clearTokenStats: () => post<void>('/api/clear-token-stats'),

  onTokenUpdate: (callback: (entry: unknown) => void) => on('mcp-token-update', callback),

  listHttpFlows: (projectPath: string) => get<unknown>('/api/list-http-flows', { projectPath }),

  ingestMeeting: (projectPath: string, body: { title: string; transcript?: string; participants?: string[]; decisions?: unknown[] }) =>
    post<{ ok: boolean; meetingId?: string; memoryEntriesCreated?: number; pending?: boolean; error?: string }>('/api/ingest-meeting', { projectPath, ...body }),

  listMeetings: (projectPath: string) => get<Array<{ id: string; ts: string; title: string; decisionCount: number }>>('/api/meetings', { projectPath }),

  getMeeting: (projectPath: string, id: string) => get<unknown>(`/api/meetings/${id}`, { projectPath }),

  getAgentBrief: (projectPath: string, entity: string) =>
    get<{ markdown?: string; entity?: string; error?: string }>('/api/agent-brief', { projectPath, entity }),

  getDiagnosis: (projectPath: string, from: string, to?: string) =>
    get<{ markdown?: string; error?: string }>('/api/diagnosis', { projectPath, from, ...(to ? { to } : {}) }),

  getZoomOut: (projectPath: string, entity?: string) =>
    get<{ markdown?: string; error?: string }>('/api/zoom-out', { projectPath, ...(entity ? { entity } : {}) }),

  getSkillsOverview: (projectPath: string) => get<unknown>('/api/skills-overview', { projectPath }),
};

(window as any).ticAnalyzer = ticAnalyzer;

export type TicAnalyzer = typeof ticAnalyzer;
