import { useState, useEffect, useCallback, useRef, useMemo, MouseEvent as RMouseEvent } from 'react';
import mermaid from 'mermaid';
import { GraphViewer } from './GraphViewer';

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
  plsqlObjects: number; frontendCalls: number; dbCalls: number;
  hotspots: number; violations: number; patterns: number;
  impactedFiles: number; inheritanceClasses: number;
  error?: string;
}
type AppState = 'idle' | 'analyzing' | 'done' | 'error';
type Tab = 'overview' | 'multigraph' | 'modules' | 'impact' | 'metrics' | 'files';

const C = { bg: '#0f0f1a', card: '#16213e', border: '#2a2a4e', accent: '#7c83fd', green: '#56cfad', red: '#ff6b6b', orange: '#f0a500', text: '#e0e0e0', muted: '#888' };

const S = {
  app: { minHeight: '100vh', display: 'flex', flexDirection: 'column' as const, fontFamily: "'Segoe UI', system-ui, sans-serif", background: C.bg, color: C.text },
  header: { padding: '16px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '12px', background: '#0d1117' },
  body: { flex: 1, padding: '20px', maxWidth: '1100px', width: '100%', margin: '0 auto', boxSizing: 'border-box' as const },
  card: { background: C.card, borderRadius: '12px', padding: '20px', marginBottom: '16px', border: `1px solid ${C.border}` },
  folderRow: { display: 'flex', gap: '10px', alignItems: 'center' },
  folderInput: { flex: 1, background: '#0d1b2a', border: `1px solid ${C.border}`, borderRadius: '8px', padding: '10px 14px', color: C.text, fontSize: '13px', fontFamily: 'monospace' },
  btn: (color = C.accent) => ({ padding: '9px 18px', background: color, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap' as const }),
  btnDisabled: { padding: '9px 18px', background: '#222', border: 'none', borderRadius: '8px', color: '#555', cursor: 'not-allowed', fontWeight: 600, fontSize: '13px' },
  tab: (active: boolean) => ({ padding: '7px 14px', background: active ? C.accent : 'transparent', border: `1px solid ${active ? C.accent : C.border}`, borderRadius: '8px', color: active ? '#fff' : C.muted, cursor: 'pointer', fontWeight: active ? 600 : 400, fontSize: '12px' }),
  stat: (color = C.accent) => ({ textAlign: 'center' as const, flex: 1, minWidth: '100px' }),
  statNum: (color = C.accent) => ({ fontSize: '22px', fontWeight: 700, color }),
  statLabel: { fontSize: '11px', color: C.muted, marginTop: '2px' },
  progressBar: { height: '6px', borderRadius: '3px', background: C.border, overflow: 'hidden' as const, margin: '10px 0' },
  progressFill: (pct: number) => ({ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${C.accent}, ${C.green})`, borderRadius: '3px', transition: 'width 0.3s ease' }),
  phaseRow: (status: string) => ({ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0', opacity: status === 'pending' ? 0.4 : 1, fontSize: '13px' }),
  badge: (s: string) => ({ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: s === 'done' ? '#1a4a1a' : s === 'running' ? '#1a1a4a' : s === 'error' ? '#4a1a1a' : '#222', color: s === 'done' ? C.green : s === 'running' ? C.accent : s === 'error' ? C.red : '#555' }),
  dot: (on: boolean) => ({ width: '8px', height: '8px', borderRadius: '50%', background: on ? C.green : '#555', flexShrink: 0 }),
};

// ── MermaidDiagram ────────────────────────────────────────────────────────────
let mermaidCounter = 0;
function MermaidDiagram({ code, id }: { code: string; id: string }) {
  const [svg, setSvg] = useState('');
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });
  const renderKey = useRef(0);
  const uniqueId = useMemo(() => `mg-${id}-${++mermaidCounter}`, [id]);

  useEffect(() => {
    if (!code.trim()) { setSvg(''); return; }
    const key = ++renderKey.current;
    mermaid.render(uniqueId, code)
      .then(({ svg: rendered }) => { if (key === renderKey.current) setSvg(rendered); })
      .catch(() => { if (key === renderKey.current) setSvg(`<pre style="color:#888;font-size:11px;overflow:auto;white-space:pre-wrap">${code}</pre>`); });
  }, [code, uniqueId]);

  useEffect(() => { setScale(1); setPos({ x: 0, y: 0 }); }, [svg]);

  const onWheel = useCallback((e: React.WheelEvent) => { e.preventDefault(); setScale((s) => Math.min(4, Math.max(0.3, s - e.deltaY * 0.001))); }, []);
  const onMouseDown = useCallback((e: RMouseEvent) => { drag.current = { active: true, startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y }; }, [pos]);
  const onMouseMove = useCallback((e: RMouseEvent) => { if (!drag.current.active) return; setPos({ x: drag.current.originX + e.clientX - drag.current.startX, y: drag.current.originY + e.clientY - drag.current.startY }); }, []);
  const stopDrag = useCallback(() => { drag.current.active = false; }, []);
  const reset = useCallback(() => { setScale(1); setPos({ x: 0, y: 0 }); }, []);

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
        <button style={{ padding: '4px 10px', background: '#1a1a3a', border: '1px solid #2a2a4e', borderRadius: '6px', color: '#aaa', cursor: 'pointer', fontSize: '16px' }} onClick={() => setScale((s) => Math.min(4, s + 0.2))}>+</button>
        <button style={{ padding: '4px 10px', background: '#1a1a3a', border: '1px solid #2a2a4e', borderRadius: '6px', color: '#aaa', cursor: 'pointer', fontSize: '16px' }} onClick={() => setScale((s) => Math.max(0.3, s - 0.2))}>−</button>
        <button style={{ padding: '4px 10px', background: '#1a1a3a', border: '1px solid #2a2a4e', borderRadius: '6px', color: '#aaa', cursor: 'pointer', fontSize: '12px' }} onClick={reset}>⟳ Reset</button>
        <span style={{ fontSize: '11px', color: '#666' }}>{Math.round(scale * 100)}% | scroll=zoom | drag=mover</span>
      </div>
      <div style={{ overflow: 'hidden', background: '#0d1117', borderRadius: '8px', height: '440px', cursor: drag.current.active ? 'grabbing' : 'grab', userSelect: 'none' }}
        onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={stopDrag} onMouseLeave={stopDrag}>
        <div dangerouslySetInnerHTML={{ __html: svg }}
          style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, transformOrigin: '0 0', padding: '16px', display: 'inline-block', minWidth: '100%' }} />
      </div>
    </div>
  );
}

function extractMermaid(md: string): string {
  const match = md.match(/```mermaid\n([\s\S]*?)```/);
  return match ? match[1].trim() : '';
}

// ── ImpactTab ──────────────────────────────────────────────────────────────────
function ImpactTab({ ticCodeDir }: { ticCodeDir: string }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState<Record<string, { directCount: number; transitiveCount: number; direct: string[]; transitive: string[] }> | null>(null);

  useEffect(() => {
    window.ticAnalyzer.readFile(`${ticCodeDir}/impact-index.json`).then((content) => {
      if (content) setIndex(JSON.parse(content));
    });
  }, [ticCodeDir]);

  const search = useCallback(() => {
    if (!index || !query.trim()) { setResult(''); return; }
    setLoading(true);
    const q = query.trim();
    let entry = index[q];
    if (!entry) {
      const fuzzy = Object.keys(index).find((k) => k.includes(q) || k.endsWith('/' + q) || q.endsWith(k.split('/').pop() ?? ''));
      if (fuzzy) entry = index[fuzzy];
    }
    if (!entry) { setResult(`Nenhum dependente encontrado para "${q}".\nEste arquivo não é importado por outros arquivos do projeto.`); setLoading(false); return; }
    const lines = [
      `Arquivo: ${q}`, '',
      `Dependentes diretos: ${entry.directCount}`,
      `Impacto transitivo: ${entry.transitiveCount} arquivos`,
      '',
      '── Dependentes Diretos ──',
      ...entry.direct.map((f) => `  • ${f}`),
      entry.transitive.length > 0 ? '\n── Impacto Transitivo (amostra) ──' : '',
      ...entry.transitive.slice(0, 15).map((f) => `  ○ ${f}`),
      entry.transitiveCount > 15 ? `  ... e mais ${entry.transitiveCount - 15} arquivos` : ''
    ].filter(Boolean);
    setResult(lines.join('\n'));
    setLoading(false);
  }, [index, query]);

  const total = index ? Object.keys(index).length : 0;
  const topImpact = index
    ? Object.entries(index).sort((a, b) => b[1].transitiveCount - a[1].transitiveCount).slice(0, 5)
    : [];

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>💥 Análise de Impacto de Mudança</div>
        <div style={{ fontSize: '12px', color: C.muted }}>Descubra quais arquivos são afetados quando você altera um arquivo específico</div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="src/api/user.ts ou user.service"
          style={{ flex: 1, background: '#0d1b2a', border: `1px solid ${C.border}`, borderRadius: '8px', padding: '10px 14px', color: C.text, fontSize: '13px', fontFamily: 'monospace' }} />
        <button style={S.btn(C.accent)} onClick={search} disabled={loading}>
          {loading ? '...' : 'Analisar Impacto'}
        </button>
      </div>

      {result && (
        <div style={{ background: '#0d1117', borderRadius: '8px', padding: '16px', marginBottom: '16px', fontFamily: 'monospace', fontSize: '12px', color: '#ccc', whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto' }}>
          {result}
        </div>
      )}

      {total > 0 && (
        <div>
          <div style={{ fontSize: '12px', color: C.muted, marginBottom: '10px' }}>{total} arquivos com dependentes mapeados</div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: C.muted, marginBottom: '8px' }}>Arquivos com Maior Impacto Transitivo</div>
          {topImpact.map(([file, entry]) => (
            <div key={file} onClick={() => setQuery(file)}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
              <div style={{ flex: 1, fontFamily: 'monospace', fontSize: '12px', color: C.accent }}>{file}</div>
              <div style={{ fontSize: '12px', color: C.muted }}>
                direto: <strong style={{ color: C.green }}>{entry.directCount}</strong> &nbsp;|&nbsp;
                transitivo: <strong style={{ color: C.orange }}>{entry.transitiveCount}</strong>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── MetricsTab ─────────────────────────────────────────────────────────────────
function MetricsTab({ ticCodeDir }: { ticCodeDir: string }) {
  const [content, setContent] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'summary' | 'graph'>('summary');

  useEffect(() => {
    window.ticAnalyzer.readFile(`${ticCodeDir}/metrics-summary.md`).then((c) => {
      setContent(c ?? 'Métricas não encontradas. Execute a análise novamente.');
    });
  }, [ticCodeDir]);

  return (
    <div>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>Métricas de Qualidade</div>
          <div style={{ fontSize: '12px', color: C.muted }}>Complexidade Ciclomática · Dívida Técnica · Hotspots · Violações</div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button style={S.tab(activeSubTab === 'summary')} onClick={() => setActiveSubTab('summary')}>Relatório</button>
          <button style={S.tab(activeSubTab === 'graph')} onClick={() => setActiveSubTab('graph')}>Grafo de Deps</button>
        </div>
      </div>

      {activeSubTab === 'summary' && (
        <div style={{ background: '#0d1117', borderRadius: '8px', padding: '16px', maxHeight: '500px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '12px', color: '#ccc', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {content}
        </div>
      )}

      {activeSubTab === 'graph' && (
        <GraphViewer ticCodeDir={ticCodeDir} mode="deps" />
      )}
    </div>
  );
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

  useEffect(() => { window.ticAnalyzer?.getMcpStatus().then((s) => setMcpRunning(s.running)); }, []);

  useEffect(() => {
    if (state !== 'done' || !result) return;
    const ticDir = result.outputPath;
    window.ticAnalyzer.readFile(`${ticDir}/multigraph.md`).then((c) => { if (c) setMultigraphCode(extractMermaid(c)); });
    window.ticAnalyzer.readFile(`${ticDir}/diagram.md`).then((c) => { if (c) setDiagramCode(extractMermaid(c)); });
  }, [state, result]);

  const handleSelectFolder = useCallback(async () => {
    const folder = await window.ticAnalyzer.selectFolder();
    if (folder) setProjectPath(folder);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!projectPath) return;
    setState('analyzing'); setProgress(null); setResult(null);
    setMultigraphCode(''); setDiagramCode(''); setActiveTab('overview');
    const cleanup = window.ticAnalyzer.onProgress((p) => setProgress(p));
    window.ticAnalyzer.onAnalysisDone((r) => {
      cleanup();
      setResult(r as AnalysisResult);
      setState((r as AnalysisResult).success ? 'done' : 'error');
    });
    await window.ticAnalyzer.runAnalysis(projectPath);
  }, [projectPath]);

  const handleToggleMcp = useCallback(async () => {
    if (mcpRunning) { await window.ticAnalyzer.stopMcp(); setMcpRunning(false); }
    else { await window.ticAnalyzer.startMcp(projectPath || '', mcpPort); setMcpRunning(true); }
  }, [mcpRunning, projectPath, mcpPort]);

  const isTicCodePath = projectPath.replace(/[\\/]$/, '').endsWith('.tic-code');
  const parentPath = isTicCodePath ? projectPath.replace(/[\\/]?\.tic-code[\\/]?$/, '') : '';
  const overallPct = progress ? Math.round(progress.phases.filter((p) => p.status === 'done').length / progress.phases.length * 100) : 0;

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Visão Geral' },
    { id: 'impact', label: 'Impacto' },
    { id: 'metrics', label: 'Métricas' },
    { id: 'multigraph', label: 'Multi-Grafo' },
    { id: 'modules', label: 'Módulos' },
    { id: 'files', label: 'Arquivos' },
  ];

  return (
    <div style={S.app}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: C.accent }}>TIC Analyzer</div>
          <div style={{ fontSize: '11px', color: C.muted }}>Motor local de análise — zero tokens de IA</div>
        </div>
        {state === 'done' && result && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {TABS.map((t) => (
              <button key={t.id} style={S.tab(activeTab === t.id)} onClick={() => setActiveTab(t.id)}>{t.label}</button>
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
              {state === 'analyzing' ? 'Analisando...' : 'Analisar'}
            </button>
          </div>
          {isTicCodePath && (
            <div style={{ marginTop: '10px', padding: '10px', background: '#1a1500', borderRadius: '8px', border: '1px solid #7a6000', display: 'flex', alignItems: 'center', gap: '10px' }}>
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
            <div style={{ color: C.red, fontWeight: 600, marginBottom: '8px' }}>Erro na análise</div>
            <code style={{ fontSize: '12px', color: '#ffaaaa', whiteSpace: 'pre-wrap' as const }}>{result.error}</code>
          </div>
        )}

        {/* Results */}
        {state === 'done' && result && (
          <>
            {activeTab === 'overview' && (
              <>
                <div style={S.card}>
                  <div style={{ marginBottom: '16px', fontWeight: 600, fontSize: '14px', color: C.green }}>Analise concluida</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '16px' }}>
                    {[
                      { num: result.totalFiles.toLocaleString(), label: 'Arquivos', color: C.accent },
                      { num: result.totalLines.toLocaleString(), label: 'Linhas', color: C.accent },
                      { num: result.modulesGenerated.toString(), label: 'Modulos', color: C.accent },
                      { num: `~${result.quickContextTokens.toLocaleString()}`, label: 'Tokens Copilot', color: C.green },
                      { num: result.hotspots.toString(), label: 'Hotspots', color: result.hotspots > 0 ? C.orange : C.green },
                      { num: result.violations.toString(), label: 'Violacoes Arq.', color: result.violations > 0 ? C.red : C.green },
                      { num: result.patterns.toString(), label: 'Padroes', color: C.accent },
                      { num: result.impactedFiles.toString(), label: 'Impacto Mapeado', color: C.accent },
                      ...(result.inheritanceClasses > 0 ? [{ num: result.inheritanceClasses.toString(), label: 'Heranca', color: '#a0a0ff' }] : []),
                      ...(result.plsqlObjects > 0 ? [{ num: result.plsqlObjects.toString(), label: 'PL/SQL', color: '#f0c000' }] : []),
                      ...(result.frontendCalls > 0 ? [{ num: result.frontendCalls.toString(), label: 'HTTP calls', color: C.accent }] : []),
                      ...(result.dbCalls > 0 ? [{ num: result.dbCalls.toString(), label: 'Backend->BD', color: '#f0c000' }] : []),
                    ].map((s) => (
                      <div key={s.label} style={S.stat(s.color)}>
                        <div style={S.statNum(s.color)}>{s.num}</div>
                        <div style={S.statLabel}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={S.card}>
                  <div style={{ marginBottom: '12px', fontWeight: 600, fontSize: '13px', color: C.muted }}>MCP SERVER — 16 FERRAMENTAS</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={S.dot(mcpRunning)} />
                    <span style={{ fontSize: '13px', color: mcpRunning ? C.green : C.muted, flex: 1 }}>
                      {mcpRunning ? `localhost:${mcpPort}/mcp` : 'Parado'}
                    </span>
                    <button style={S.btn(mcpRunning ? C.red : C.accent)} onClick={handleToggleMcp}>{mcpRunning ? 'Parar MCP' : 'Iniciar MCP'}</button>
                    <button style={S.btn('#333')} onClick={() => window.ticAnalyzer.openFolder(result.outputPath)}>Abrir .tic-code</button>
                  </div>
                  {mcpRunning && (
                    <>
                      <div style={{ marginTop: '10px', fontSize: '12px', color: C.muted, fontFamily: 'monospace', background: '#0d1117', padding: '10px', borderRadius: '6px' }}>
                        {`{"mcpServers":{"tic-analyzer":{"url":"http://localhost:${mcpPort}/mcp"}}}`}
                      </div>
                      <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {['list_modules','get_module','get_quick_context','search_module','get_impact','get_metrics','get_hotspots','get_patterns','get_violations','get_inheritance','get_multigraph','get_diagram','get_openapi','get_gaps','get_permissions','get_business_rules'].map((tool) => (
                          <span key={tool} style={{ padding: '2px 8px', background: '#0d1b2a', border: `1px solid ${C.border}`, borderRadius: '4px', fontSize: '11px', color: C.accent, fontFamily: 'monospace' }}>{tool}</span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {activeTab === 'impact' && (
              <div style={S.card}><ImpactTab ticCodeDir={result.outputPath} /></div>
            )}

            {activeTab === 'metrics' && (
              <div style={S.card}><MetricsTab ticCodeDir={result.outputPath} /></div>
            )}

            {activeTab === 'multigraph' && (
              <div style={S.card}>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>Multi-Grafo de Chamadas</div>
                  <div style={{ fontSize: '12px', color: C.muted }}>Frontend → Endpoint REST → Backend → PL/SQL</div>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: C.muted, marginBottom: '8px' }}>Grafo Interativo</div>
                <GraphViewer ticCodeDir={result.outputPath} mode="call" />
                {multigraphCode && (
                  <div style={{ marginTop: '20px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: C.muted, marginBottom: '8px' }}>Diagrama Estatico (Mermaid)</div>
                    <MermaidDiagram code={multigraphCode} id="multigraph" />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'modules' && (
              <div style={S.card}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>Diagrama de Modulos</div>
                  <div style={{ fontSize: '12px', color: C.muted }}>Dependencias entre modulos detectadas por analise de imports</div>
                </div>
                {diagramCode ? <MermaidDiagram code={diagramCode} id="diagram" /> : (
                  <div style={{ color: C.muted, fontSize: '13px', padding: '40px', textAlign: 'center' as const }}>Diagrama nao gerado — menos de 2 modulos detectados.</div>
                )}
              </div>
            )}

            {activeTab === 'files' && (
              <div style={S.card}>
                <div style={{ marginBottom: '12px', fontWeight: 600, fontSize: '13px', color: C.muted }}>ARTEFATOS GERADOS</div>
                <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#aaa', lineHeight: '2' }}>
                  {[
                    { path: `${result.outputPath}/`, color: C.muted, indent: 0 },
                    { path: 'quick-context.md', note: `(~${result.quickContextTokens.toLocaleString()} tokens)`, color: C.green, indent: 1 },
                    { path: 'metrics-summary.md', note: 'complexidade + hotspots + violacoes', color: C.orange, indent: 1 },
                    { path: 'impact-index.json', note: 'indice de impacto de mudanca', color: C.accent, indent: 1 },
                    { path: 'patterns.md', note: 'padroes arquiteturais', color: C.accent, indent: 1 },
                    { path: 'inheritance.md', note: 'hierarquia de classes', color: '#a0a0ff', indent: 1 },
                    { path: 'call-graph.json + dep-graph.json', note: 'grafos interativos', color: C.muted, indent: 1 },
                    { path: 'multigraph.md + diagram.md', note: 'diagramas Mermaid', color: C.muted, indent: 1 },
                    { path: 'openapi.yaml', note: 'endpoints OpenAPI 3.0', color: C.muted, indent: 1 },
                    { path: 'gaps.md + permissions.md + index.md', note: '', color: C.muted, indent: 1 },
                    { path: `modules/ x${result.modulesGenerated}`, note: 'context + business-rules + metrics + patterns', color: C.muted, indent: 1 },
                    { path: 'CLAUDE.md + .github/copilot-instructions.md', note: '', color: '#7c83fd', indent: 0 },
                  ].map((row, i) => (
                    <div key={i} style={{ paddingLeft: `${row.indent * 16}px` }}>
                      <span style={{ color: row.color }}>{row.path}</span>
                      {row.note && <span style={{ color: '#666' }}> — {row.note}</span>}
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
