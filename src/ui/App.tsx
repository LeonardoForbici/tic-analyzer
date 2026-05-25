import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });

declare global {
  interface Window {
    ticAnalyzer: {
      selectFolder: () => Promise<string | null>;
      runAnalysis: (path: string) => Promise<void>;
      startMcp: (path: string, port: number) => Promise<void>;
      stopMcp: () => Promise<void>;
      getMcpStatus: () => Promise<{ running: boolean; port: number; projectPath: string }>;
      openFolder: (path: string) => Promise<void>;
      readFile: (path: string) => Promise<string | null>;
      onProgress: (cb: (p: Progress) => void) => () => void;
      onAnalysisDone: (cb: (r: AnalysisResult) => void) => void;
    };
  }
}

interface Phase { id: string; label: string; status: 'pending' | 'running' | 'done' | 'error'; detail?: string; }
interface Progress { phase: string; percent: number; detail: string; phases: Phase[]; }
interface AnalysisResult {
  success: boolean; outputPath: string; totalFiles: number; totalLines: number;
  modulesGenerated: number; quickContextTokens: number;
  plsqlObjects: number; frontendCalls: number; dbCalls: number; error?: string;
}
type AppState = 'idle' | 'analyzing' | 'done' | 'error';
type Tab = 'overview' | 'multigraph' | 'modules' | 'files';

// ── Styles ────────────────────────────────────────────────────────────────────
const C = { bg: '#0f0f1a', card: '#16213e', border: '#2a2a4e', accent: '#7c83fd', green: '#56cfad', red: '#ff6b6b', text: '#e0e0e0', muted: '#888' };

const S = {
  app: { minHeight: '100vh', display: 'flex', flexDirection: 'column' as const, fontFamily: "'Segoe UI', system-ui, sans-serif", background: C.bg, color: C.text },
  header: { padding: '16px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '12px', background: '#0d1117' },
  body: { flex: 1, padding: '20px', maxWidth: '1100px', width: '100%', margin: '0 auto', boxSizing: 'border-box' as const },
  card: { background: C.card, borderRadius: '12px', padding: '20px', marginBottom: '16px', border: `1px solid ${C.border}` },
  folderRow: { display: 'flex', gap: '10px', alignItems: 'center' },
  folderInput: { flex: 1, background: '#0d1b2a', border: `1px solid ${C.border}`, borderRadius: '8px', padding: '10px 14px', color: C.text, fontSize: '13px', fontFamily: 'monospace' },
  btn: (color = C.accent) => ({ padding: '9px 18px', background: color, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap' as const }),
  btnDisabled: { padding: '9px 18px', background: '#222', border: 'none', borderRadius: '8px', color: '#555', cursor: 'not-allowed', fontWeight: 600, fontSize: '13px' },
  tab: (active: boolean) => ({ padding: '8px 18px', background: active ? C.accent : 'transparent', border: `1px solid ${active ? C.accent : C.border}`, borderRadius: '8px', color: active ? '#fff' : C.muted, cursor: 'pointer', fontWeight: active ? 600 : 400, fontSize: '13px' }),
  stat: (color = C.accent) => ({ textAlign: 'center' as const, flex: 1, minWidth: '100px' }),
  statNum: (color = C.accent) => ({ fontSize: '22px', fontWeight: 700, color }),
  statLabel: { fontSize: '11px', color: C.muted, marginTop: '2px' },
  progressBar: { height: '6px', borderRadius: '3px', background: C.border, overflow: 'hidden' as const, margin: '10px 0' },
  progressFill: (pct: number) => ({ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${C.accent}, ${C.green})`, borderRadius: '3px', transition: 'width 0.3s ease' }),
  phaseRow: (status: string) => ({ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0', opacity: status === 'pending' ? 0.4 : 1, fontSize: '13px' }),
  badge: (s: string) => ({ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: s === 'done' ? '#1a4a1a' : s === 'running' ? '#1a1a4a' : s === 'error' ? '#4a1a1a' : '#222', color: s === 'done' ? C.green : s === 'running' ? C.accent : s === 'error' ? C.red : '#555' }),
  dot: (on: boolean) => ({ width: '8px', height: '8px', borderRadius: '50%', background: on ? C.green : '#555', flexShrink: 0 }),
  miniBar: (pct: number, color = C.accent) => ({ height: '4px', borderRadius: '2px', background: C.border, overflow: 'hidden' as const, marginTop: '4px', position: 'relative' as const }),
};

// ── MermaidDiagram component ──────────────────────────────────────────────────
let mermaidCounter = 0;

function MermaidDiagram({ code, id }: { code: string; id: string }) {
  const [svg, setSvg] = useState('');
  const renderKey = useRef(0);
  const uniqueId = useMemo(() => `mg-${id}-${++mermaidCounter}`, [id]);

  useEffect(() => {
    if (!code.trim()) { setSvg(''); return; }
    const key = ++renderKey.current;
    mermaid.render(uniqueId, code)
      .then(({ svg: rendered }) => {
        if (key === renderKey.current) setSvg(rendered);
      })
      .catch(() => {
        if (key === renderKey.current)
          setSvg(`<pre style="color:#888;font-size:11px;overflow:auto;white-space:pre-wrap">${code}</pre>`);
      });
  }, [code, uniqueId]);

  return (
    <div
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{ overflow: 'auto', background: '#0d1117', borderRadius: '8px', padding: '16px', minHeight: '80px' }}
    />
  );
}

// ── Extracts first mermaid block from markdown ──────────────────────────────
function extractMermaid(md: string): string {
  const match = md.match(/```mermaid\n([\s\S]*?)```/);
  return match ? match[1].trim() : '';
}

// ── App ───────────────────────────────────────────────────────────────────────
export function App() {
  const [projectPath, setProjectPath] = useState('');
  const [state, setState] = useState<AppState>('idle');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [mcpRunning, setMcpRunning] = useState(false);
  const [mcpPort] = useState(7432);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [multigraphCode, setMultigraphCode] = useState('');
  const [diagramCode, setDiagramCode] = useState('');

  useEffect(() => {
    window.ticAnalyzer?.getMcpStatus().then((s) => setMcpRunning(s.running));
  }, []);

  // Load diagram files after analysis
  useEffect(() => {
    if (state !== 'done' || !result) return;
    const ticDir = result.outputPath;
    window.ticAnalyzer.readFile(`${ticDir}/multigraph.md`).then((content) => {
      if (content) setMultigraphCode(extractMermaid(content));
    });
    window.ticAnalyzer.readFile(`${ticDir}/diagram.md`).then((content) => {
      if (content) setDiagramCode(extractMermaid(content));
    });
  }, [state, result]);

  const handleSelectFolder = useCallback(async () => {
    const folder = await window.ticAnalyzer.selectFolder();
    if (folder) setProjectPath(folder);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!projectPath) return;
    setState('analyzing');
    setProgress(null);
    setResult(null);
    setMultigraphCode('');
    setDiagramCode('');
    setActiveTab('overview');

    const cleanup = window.ticAnalyzer.onProgress((p) => setProgress(p));
    window.ticAnalyzer.onAnalysisDone((r) => {
      cleanup();
      setResult(r as AnalysisResult);
      setState((r as AnalysisResult).success ? 'done' : 'error');
    });

    await window.ticAnalyzer.runAnalysis(projectPath);
  }, [projectPath]);

  const handleToggleMcp = useCallback(async () => {
    if (mcpRunning) {
      await window.ticAnalyzer.stopMcp();
      setMcpRunning(false);
    } else {
      await window.ticAnalyzer.startMcp(projectPath || '', mcpPort);
      setMcpRunning(true);
    }
  }, [mcpRunning, projectPath, mcpPort]);

  const isTicCodePath = projectPath.replace(/[\\/]$/, '').endsWith('.tic-code');
  const parentPath = isTicCodePath ? projectPath.replace(/[\\/]?\.tic-code[\\/]?$/, '') : '';
  const overallPct = progress ? Math.round(progress.phases.filter((p) => p.status === 'done').length / progress.phases.length * 100) : 0;

  return (
    <div style={S.app}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: C.accent }}>⚡ TIC Analyzer</div>
          <div style={{ fontSize: '11px', color: C.muted }}>Motor local de análise — zero tokens de IA</div>
        </div>
        {state === 'done' && result && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            {(['overview', 'multigraph', 'modules', 'files'] as Tab[]).map((t) => (
              <button key={t} style={S.tab(activeTab === t)} onClick={() => setActiveTab(t)}>
                {t === 'overview' ? '📊 Visão Geral' : t === 'multigraph' ? '🕸️ Multi-Grafo' : t === 'modules' ? '📦 Módulos' : '📁 Arquivos'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={S.body}>
        {/* Folder picker */}
        <div style={S.card}>
          <div style={{ marginBottom: '10px', fontWeight: 600, fontSize: '13px', color: C.muted }}>PROJETO</div>
          <div style={S.folderRow}>
            <input style={S.folderInput} value={projectPath} onChange={(e) => setProjectPath(e.target.value)}
              placeholder="C:\empresa\projeto ou /home/user/projeto" readOnly={state === 'analyzing'} />
            <button style={S.btn()} onClick={handleSelectFolder} disabled={state === 'analyzing'}>Selecionar</button>
            <button style={state === 'analyzing' || !projectPath ? S.btnDisabled : S.btn(C.green)}
              onClick={handleAnalyze} disabled={state === 'analyzing' || !projectPath}>
              {state === 'analyzing' ? '⏳ Analisando...' : '▶ Analisar'}
            </button>
          </div>
          {isTicCodePath && (
            <div style={{ marginTop: '10px', padding: '10px', background: '#1a1500', borderRadius: '8px', border: '1px solid #7a6000', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>⚠️</span>
              <span style={{ color: '#f0c000', fontSize: '12px', flex: 1 }}>Pasta de saída selecionada. Use a pasta pai: <code style={{ color: '#f0c000' }}>{parentPath}</code></span>
              <button style={S.btn('#7a6000')} onClick={() => setProjectPath(parentPath)}>Usar pasta pai</button>
            </div>
          )}
        </div>

        {/* Progress */}
        {state === 'analyzing' && progress && (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontWeight: 600, fontSize: '14px' }}>
              <span>Analisando...</span><span style={{ color: C.accent }}>{overallPct}%</span>
            </div>
            <div style={S.progressBar}><div style={S.progressFill(overallPct)} /></div>
            <div style={{ fontSize: '12px', color: C.muted, marginBottom: '14px' }}>{progress.detail}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px' }}>
              {progress.phases.map((phase) => (
                <div key={phase.id} style={S.phaseRow(phase.status)}>
                  <span style={S.badge(phase.status)}>
                    {phase.status === 'done' ? '✓' : phase.status === 'running' ? '◈' : phase.status === 'error' ? '✗' : '○'}
                  </span>
                  <span style={{ fontSize: '12px' }}>{phase.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {state === 'error' && result?.error && (
          <div style={{ ...S.card, border: `1px solid ${C.red}`, background: '#1a0d0d' }}>
            <div style={{ color: C.red, fontWeight: 600, marginBottom: '8px' }}>❌ Erro na análise</div>
            <code style={{ fontSize: '12px', color: '#ffaaaa', whiteSpace: 'pre-wrap' as const }}>{result.error}</code>
          </div>
        )}

        {/* Results */}
        {state === 'done' && result && (
          <>
            {/* ── Tab: Overview ────────────────────────────────────────── */}
            {activeTab === 'overview' && (
              <>
                {/* Stats grid */}
                <div style={S.card}>
                  <div style={{ marginBottom: '16px', fontWeight: 600, fontSize: '14px', color: C.green }}>✅ Análise concluída</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '16px' }}>
                    {[
                      { num: result.totalFiles.toLocaleString(), label: 'Arquivos', color: C.accent },
                      { num: result.totalLines.toLocaleString(), label: 'Linhas de código', color: C.accent },
                      { num: result.modulesGenerated.toString(), label: 'Módulos', color: C.accent },
                      { num: `~${result.quickContextTokens.toLocaleString()}`, label: 'Tokens Copilot', color: C.green },
                      ...(result.plsqlObjects > 0 ? [{ num: result.plsqlObjects.toString(), label: 'Objetos PL/SQL', color: '#f0c000' }] : []),
                      ...(result.frontendCalls > 0 ? [{ num: result.frontendCalls.toString(), label: 'Chamadas HTTP', color: C.accent }] : []),
                      ...(result.dbCalls > 0 ? [{ num: result.dbCalls.toString(), label: 'Backend→BD', color: '#f0c000' }] : []),
                    ].map((s) => (
                      <div key={s.label} style={S.stat(s.color)}>
                        <div style={S.statNum(s.color)}>{s.num}</div>
                        <div style={S.statLabel}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* MCP Server */}
                <div style={S.card}>
                  <div style={{ marginBottom: '12px', fontWeight: 600, fontSize: '13px', color: C.muted }}>MCP SERVER (CLAUDE CODE)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={S.dot(mcpRunning)} />
                    <span style={{ fontSize: '13px', color: mcpRunning ? C.green : C.muted, flex: 1 }}>
                      {mcpRunning ? `Rodando em localhost:${mcpPort}/mcp` : 'Parado'}
                    </span>
                    <button style={S.btn(mcpRunning ? C.red : C.accent)} onClick={handleToggleMcp}>
                      {mcpRunning ? 'Parar MCP' : 'Iniciar MCP'}
                    </button>
                    <button style={S.btn('#333')} onClick={() => window.ticAnalyzer.openFolder(result.outputPath)}>
                      Abrir .tic-code
                    </button>
                  </div>
                  {mcpRunning && (
                    <div style={{ marginTop: '10px', fontSize: '12px', color: C.muted, fontFamily: 'monospace', background: '#0d1117', padding: '10px', borderRadius: '6px' }}>
                      {`{"mcpServers":{"tic-analyzer":{"url":"http://localhost:${mcpPort}/mcp"}}}`}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Tab: Multi-Grafo ─────────────────────────────────────── */}
            {activeTab === 'multigraph' && (
              <div style={S.card}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>🕸️ Multi-Grafo de Chamadas</div>
                  <div style={{ fontSize: '12px', color: C.muted }}>Frontend → Endpoint REST → Backend → PL/SQL &nbsp;|&nbsp; 🟢 detectado direto &nbsp;🟡 inferido</div>
                </div>
                {multigraphCode ? (
                  <MermaidDiagram code={multigraphCode} id="multigraph" />
                ) : (
                  <div style={{ color: C.muted, fontSize: '13px', padding: '40px', textAlign: 'center' as const }}>
                    Nenhuma conexão frontend↔backend detectada neste projeto.<br/>
                    <span style={{ fontSize: '11px' }}>O projeto pode não ter chamadas HTTP explícitas ou endpoints REST reconhecíveis.</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Módulos ─────────────────────────────────────────── */}
            {activeTab === 'modules' && (
              <div style={S.card}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>📦 Diagrama de Módulos</div>
                  <div style={{ fontSize: '12px', color: C.muted }}>Dependências entre módulos detectadas por análise de imports</div>
                </div>
                {diagramCode ? (
                  <MermaidDiagram code={diagramCode} id="diagram" />
                ) : (
                  <div style={{ color: C.muted, fontSize: '13px', padding: '40px', textAlign: 'center' as const }}>
                    Diagrama não gerado — menos de 2 módulos detectados.
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Arquivos ─────────────────────────────────────────── */}
            {activeTab === 'files' && (
              <div style={S.card}>
                <div style={{ marginBottom: '12px', fontWeight: 600, fontSize: '13px', color: C.muted }}>ARTEFATOS GERADOS</div>
                <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#aaa', lineHeight: '2' }}>
                  {[
                    { icon: '📁', path: `${result.outputPath}/`, color: C.muted, indent: 0 },
                    { icon: '📄', path: 'quick-context.md', note: `← Copilot lê só isso (~${result.quickContextTokens.toLocaleString()} tokens)`, color: C.green, indent: 1 },
                    { icon: '📄', path: 'multigraph.md', note: '← Multi-grafo Frontend→Endpoint→Backend→PL/SQL', color: C.accent, indent: 1 },
                    { icon: '📄', path: 'diagram.md', note: '← Diagrama de módulos (Mermaid)', color: C.muted, indent: 1 },
                    { icon: '📄', path: 'index.md', note: '← Mapa de navegação', color: C.muted, indent: 1 },
                    { icon: '📄', path: 'openapi.yaml', note: '← Endpoints OpenAPI 3.0', color: C.muted, indent: 1 },
                    { icon: '📄', path: 'gaps.md', note: '← Lacunas 🔴 detectadas', color: C.red, indent: 1 },
                    { icon: '📄', path: 'permissions.md', note: '← Matriz roles × rotas', color: C.muted, indent: 1 },
                    { icon: '📁', path: `modules/  ×${result.modulesGenerated}`, note: '', color: C.muted, indent: 1 },
                    { icon: '📄', path: '[módulo]/context.md + business-rules.md', note: '', color: C.muted, indent: 2 },
                    { icon: '📄', path: 'CLAUDE.md', note: '← Claude Code lê isso', color: '#7c83fd', indent: 0 },
                    { icon: '📄', path: '.github/copilot-instructions.md', note: '', color: C.muted, indent: 0 },
                  ].map((row, i) => (
                    <div key={i} style={{ paddingLeft: `${row.indent * 16}px` }}>
                      {row.icon} <span style={{ color: row.color }}>{row.path}</span>
                      {row.note && <span style={{ color: row.color === C.muted ? '#666' : row.color }}>&nbsp; {row.note}</span>}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '14px' }}>
                  <button style={S.btn()} onClick={() => window.ticAnalyzer.openFolder(result.outputPath)}>Abrir pasta .tic-code</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
