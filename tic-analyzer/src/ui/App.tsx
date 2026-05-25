import { useState, useEffect, useCallback } from 'react';

declare global {
  interface Window {
    ticAnalyzer: {
      selectFolder: () => Promise<string | null>;
      runAnalysis: (path: string) => Promise<void>;
      startMcp: (path: string, port: number) => Promise<void>;
      stopMcp: () => Promise<void>;
      getMcpStatus: () => Promise<{ running: boolean; port: number; projectPath: string }>;
      openFolder: (path: string) => Promise<void>;
      onProgress: (cb: (p: Progress) => void) => () => void;
      onAnalysisDone: (cb: (r: AnalysisResult) => void) => void;
    };
  }
}

interface Phase {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
}

interface Progress {
  phase: string;
  percent: number;
  detail: string;
  phases: Phase[];
}

interface AnalysisResult {
  success: boolean;
  outputPath: string;
  totalFiles: number;
  totalLines: number;
  modulesGenerated: number;
  quickContextTokens: number;
  error?: string;
}

type AppState = 'idle' | 'analyzing' | 'done' | 'error';

const S = {
  app: { minHeight: '100vh', display: 'flex', flexDirection: 'column' as const, fontFamily: "'Segoe UI', system-ui, sans-serif", background: '#1a1a2e', color: '#e0e0e0' },
  header: { padding: '20px 24px', borderBottom: '1px solid #2a2a4e', display: 'flex', alignItems: 'center', gap: '12px' },
  title: { margin: 0, fontSize: '20px', fontWeight: 700, color: '#7c83fd' },
  subtitle: { margin: 0, fontSize: '12px', color: '#888', marginTop: '2px' },
  body: { flex: 1, padding: '24px', maxWidth: '800px', width: '100%', margin: '0 auto', boxSizing: 'border-box' as const },
  card: { background: '#16213e', borderRadius: '12px', padding: '20px', marginBottom: '16px', border: '1px solid #2a2a4e' },
  folderRow: { display: 'flex', gap: '10px', alignItems: 'center' },
  folderInput: { flex: 1, background: '#0d1b2a', border: '1px solid #2a2a4e', borderRadius: '8px', padding: '10px 14px', color: '#e0e0e0', fontSize: '13px', fontFamily: 'monospace' },
  btn: (color = '#7c83fd', hover = false) => ({ padding: '10px 20px', background: color, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap' as const }),
  btnDisabled: { padding: '10px 20px', background: '#333', border: 'none', borderRadius: '8px', color: '#666', cursor: 'not-allowed', fontWeight: 600, fontSize: '13px' },
  progressBar: (pct: number) => ({ height: '6px', borderRadius: '3px', background: '#2a2a4e', overflow: 'hidden' as const, margin: '12px 0' }),
  progressFill: (pct: number) => ({ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #7c83fd, #56cfad)', borderRadius: '3px', transition: 'width 0.3s ease' }),
  phaseRow: (status: string) => ({ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', opacity: status === 'pending' ? 0.4 : 1, fontSize: '13px' }),
  badge: (level: string) => ({ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: level === 'done' ? '#1a4a1a' : level === 'running' ? '#2a2a4e' : level === 'error' ? '#4a1a1a' : '#2a2a4e', color: level === 'done' ? '#56cfad' : level === 'running' ? '#7c83fd' : level === 'error' ? '#ff6b6b' : '#555' }),
  stat: { textAlign: 'center' as const, flex: 1 },
  statNum: { fontSize: '24px', fontWeight: 700, color: '#7c83fd' },
  statLabel: { fontSize: '11px', color: '#888', marginTop: '2px' },
  mcpRow: { display: 'flex', alignItems: 'center', gap: '12px' },
  dot: (on: boolean) => ({ width: '8px', height: '8px', borderRadius: '50%', background: on ? '#56cfad' : '#555', flexShrink: 0 })
};

export function App() {
  const [projectPath, setProjectPath] = useState('');
  const [state, setState] = useState<AppState>('idle');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [mcpRunning, setMcpRunning] = useState(false);
  const [mcpPort] = useState(7432);

  useEffect(() => {
    window.ticAnalyzer?.getMcpStatus().then((s) => setMcpRunning(s.running));
  }, []);

  const handleSelectFolder = useCallback(async () => {
    const folder = await window.ticAnalyzer.selectFolder();
    if (folder) setProjectPath(folder);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!projectPath) return;
    setState('analyzing');
    setProgress(null);
    setResult(null);

    const cleanup = window.ticAnalyzer.onProgress((p) => setProgress(p));
    window.ticAnalyzer.onAnalysisDone((r) => {
      cleanup();
      setResult(r as AnalysisResult);
      setState(r.success ? 'done' : 'error');
    });

    await window.ticAnalyzer.runAnalysis(projectPath);
  }, [projectPath]);

  const handleToggleMcp = useCallback(async () => {
    if (mcpRunning) {
      await window.ticAnalyzer.stopMcp();
      setMcpRunning(false);
    } else {
      await window.ticAnalyzer.startMcp(projectPath || result?.outputPath?.replace('/.tic-code', '') || '', mcpPort);
      setMcpRunning(true);
    }
  }, [mcpRunning, projectPath, result, mcpPort]);

  const overallPct = progress
    ? Math.round(progress.phases.filter((p) => p.status === 'done').length / progress.phases.length * 100)
    : 0;

  return (
    <div style={S.app}>
      <div style={S.header}>
        <div>
          <h1 style={S.title}>⚡ TIC Analyzer</h1>
          <p style={S.subtitle}>Motor local de análise — zero tokens de IA</p>
        </div>
      </div>

      <div style={S.body}>
        {/* Seletor de pasta */}
        <div style={S.card}>
          <div style={{ marginBottom: '12px', fontWeight: 600, fontSize: '14px' }}>Projeto para analisar</div>
          <div style={S.folderRow}>
            <input
              style={S.folderInput}
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              placeholder="C:\empresa\projeto ou /home/user/projeto"
              readOnly={state === 'analyzing'}
            />
            <button style={S.btn()} onClick={handleSelectFolder} disabled={state === 'analyzing'}>
              Selecionar
            </button>
            <button
              style={state === 'analyzing' || !projectPath ? S.btnDisabled : S.btn('#56cfad')}
              onClick={handleAnalyze}
              disabled={state === 'analyzing' || !projectPath}
            >
              {state === 'analyzing' ? 'Analisando...' : '▶ Analisar'}
            </button>
          </div>
        </div>

        {/* Progresso */}
        {state === 'analyzing' && progress && (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Progresso</span>
              <span style={{ color: '#7c83fd', fontWeight: 600 }}>{overallPct}%</span>
            </div>
            <div style={S.progressBar(overallPct)}>
              <div style={S.progressFill(overallPct)} />
            </div>
            <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '16px' }}>{progress.detail}</div>

            <div style={{ display: 'grid', gap: '2px' }}>
              {progress.phases.map((phase) => (
                <div key={phase.id} style={S.phaseRow(phase.status)}>
                  <span style={S.badge(phase.status)}>
                    {phase.status === 'done' ? '✓' : phase.status === 'running' ? '◈' : phase.status === 'error' ? '✗' : '○'}
                  </span>
                  <span>{phase.label}</span>
                  {phase.detail && <span style={{ color: '#888', fontSize: '11px', marginLeft: 'auto' }}>{phase.detail}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resultado */}
        {state === 'done' && result && (
          <>
            <div style={S.card}>
              <div style={{ marginBottom: '16px', fontWeight: 600, fontSize: '14px', color: '#56cfad' }}>
                ✅ Análise concluída
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                {[
                  { num: result.totalFiles.toLocaleString(), label: 'Arquivos' },
                  { num: result.totalLines.toLocaleString(), label: 'Linhas' },
                  { num: result.modulesGenerated.toString(), label: 'Módulos' },
                  { num: `~${result.quickContextTokens.toLocaleString()}`, label: 'Tokens (quick-context)' }
                ].map((s) => (
                  <div key={s.label} style={S.stat}>
                    <div style={S.statNum}>{s.num}</div>
                    <div style={S.statLabel}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={S.card}>
              <div style={{ marginBottom: '12px', fontWeight: 600, fontSize: '14px' }}>Arquivos gerados</div>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#aaa', lineHeight: '1.8' }}>
                <div>📁 {result.outputPath}/</div>
                <div>&nbsp;&nbsp;📄 quick-context.md &nbsp;<span style={{ color: '#56cfad' }}>← Copilot lê isso</span></div>
                <div>&nbsp;&nbsp;📄 index.md &nbsp;<span style={{ color: '#888' }}>← Mapa de módulos</span></div>
                <div>&nbsp;&nbsp;📁 modules/</div>
                <div>&nbsp;&nbsp;&nbsp;&nbsp;📁 [módulo]/context.md &nbsp;<span style={{ color: '#888' }}>× {result.modulesGenerated}</span></div>
                <div>📄 CLAUDE.md &nbsp;<span style={{ color: '#7c83fd' }}>← Claude Code lê isso</span></div>
                <div>📄 .github/copilot-instructions.md</div>
              </div>
              <div style={{ marginTop: '12px' }}>
                <button style={S.btn()} onClick={() => window.ticAnalyzer.openFolder(result.outputPath)}>
                  Abrir pasta .tic-code
                </button>
              </div>
            </div>
          </>
        )}

        {state === 'error' && result?.error && (
          <div style={{ ...S.card, border: '1px solid #4a1a1a', background: '#1a0d0d' }}>
            <div style={{ color: '#ff6b6b', fontWeight: 600, marginBottom: '8px' }}>❌ Erro na análise</div>
            <code style={{ fontSize: '12px', color: '#ffaaaa' }}>{result.error}</code>
          </div>
        )}

        {/* MCP Server */}
        <div style={S.card}>
          <div style={{ marginBottom: '12px', fontWeight: 600, fontSize: '14px' }}>MCP Server (Claude Code)</div>
          <div style={S.mcpRow}>
            <div style={S.dot(mcpRunning)} />
            <span style={{ fontSize: '13px', color: mcpRunning ? '#56cfad' : '#888' }}>
              {mcpRunning ? `Rodando em localhost:${mcpPort}/mcp` : 'Parado'}
            </span>
            <button
              style={mcpRunning ? S.btn('#ff6b6b') : S.btn('#7c83fd')}
              onClick={handleToggleMcp}
              disabled={!projectPath && !result}
            >
              {mcpRunning ? 'Parar MCP' : 'Iniciar MCP'}
            </button>
          </div>
          {mcpRunning && (
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#888', fontFamily: 'monospace' }}>
              Configure em .claude/settings.json:<br />
              <code style={{ color: '#7c83fd' }}>
                {'{"mcpServers":{"tic-analyzer":{"url":"http://localhost:'}
                {mcpPort}
                {'/mcp"}}}'}
              </code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
