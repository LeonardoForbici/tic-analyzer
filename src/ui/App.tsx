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
      getGitDiff: (projectPath: string) => Promise<{ files: string[]; error?: string }>;
      getTokenStats: () => Promise<TokenStats | null>;
      clearTokenStats: () => Promise<void>;
      onTokenUpdate: (cb: (entry: TokenEntry) => void) => () => void;
      onProgress: (cb: (p: Progress) => void) => () => void;
      onAnalysisDone: (cb: (r: AnalysisResult) => void) => void;
    };
  }
}

interface TokenEntry { timestamp: number; tool: string; inputTokens: number; outputTokens: number; totalTokens: number; }
interface TokenStats {
  totalCalls: number; totalTokens: number; totalInputTokens: number; totalOutputTokens: number;
  byTool: Record<string, { calls: number; tokens: number; inputTokens: number; outputTokens: number }>;
  log: TokenEntry[];
  sessionStart: number;
}
interface Phase { id: string; label: string; status: 'pending' | 'running' | 'done' | 'error'; detail?: string; }
interface Progress { phase: string; percent: number; detail: string; phases: Phase[]; }
interface AnalysisResult {
  success: boolean; outputPath: string; totalFiles: number; totalLines: number;
  modulesGenerated: number; quickContextTokens: number;
  plsqlObjects: number; frontendCalls: number; dbCalls: number;
  hotspots: number; violations: number; patterns: number;
  impactedFiles: number; inheritanceClasses: number;
  dbTables: number; cacheHits: number;
  error?: string;
}
type AppState = 'idle' | 'analyzing' | 'done' | 'error';
type Tab = 'overview' | 'multigraph' | 'modules' | 'impact' | 'metrics' | 'files' | 'docs';

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

type ImpactEntry = { directCount: number; transitiveCount: number; direct: string[]; transitive: string[] };

function buildImpactText(file: string, entry: ImpactEntry | undefined): string {
  if (!entry) return `  ${file}\n  └─ sem dependentes (não importado por outros)\n`;
  return [
    `  ${file}`,
    `  └─ direto: ${entry.directCount}  |  transitivo: ${entry.transitiveCount}`,
    ...entry.direct.slice(0, 6).map((f) => `     • ${f}`),
    entry.directCount > 6 ? `     ... +${entry.directCount - 6} diretos` : '',
  ].filter(Boolean).join('\n') + '\n';
}

// ── TokenMonitor ─────────────────────────────────────────────────────────────
function TokenMonitor({ stats, onClear }: { stats: TokenStats | null; onClear: () => void }) {
  const [expanded, setExpanded] = useState(false);

  if (!stats || stats.totalCalls === 0) {
    return (
      <div style={{ padding: '10px 0', fontSize: '12px', color: C.muted, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#555', display: 'inline-block' }} />
        Aguardando chamadas do Claude Code...
      </div>
    );
  }

  const sessionMinutes = Math.floor((Date.now() - stats.sessionStart) / 60000);
  const sortedTools = Object.entries(stats.byTool).sort((a, b) => b[1].tokens - a[1].tokens);
  const maxTokens = sortedTools[0]?.[1].tokens ?? 1;

  return (
    <div>
      {/* Summary row */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' as const }}>
        <div style={{ display: 'flex', gap: '20px', flex: 1 }}>
          <div style={{ textAlign: 'center' as const }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: C.accent, lineHeight: 1 }}>{stats.totalTokens.toLocaleString()}</div>
            <div style={{ fontSize: '10px', color: C.muted, marginTop: '2px' }}>tokens totais</div>
          </div>
          <div style={{ textAlign: 'center' as const }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: C.green, lineHeight: 1 }}>{stats.totalCalls}</div>
            <div style={{ fontSize: '10px', color: C.muted, marginTop: '2px' }}>chamadas MCP</div>
          </div>
          <div style={{ textAlign: 'center' as const }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: C.orange, lineHeight: 1 }}>{stats.totalCalls > 0 ? Math.round(stats.totalTokens / stats.totalCalls).toLocaleString() : 0}</div>
            <div style={{ fontSize: '10px', color: C.muted, marginTop: '2px' }}>média/chamada</div>
          </div>
          <div style={{ textAlign: 'center' as const }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#a0a0ff', lineHeight: 1 }}>{sessionMinutes}m</div>
            <div style={{ fontSize: '10px', color: C.muted, marginTop: '2px' }}>sessão ativa</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button style={S.tab(expanded)} onClick={() => setExpanded((e) => !e)}>{expanded ? 'Fechar' : 'Detalhes'}</button>
          <button style={{ ...S.btn('#333'), fontSize: '11px', padding: '5px 10px' }} onClick={onClear}>Resetar</button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '14px' }}>
          {/* Per-tool breakdown */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', color: C.muted, marginBottom: '8px', fontWeight: 600 }}>GASTO POR FERRAMENTA</div>
            {sortedTools.map(([tool, data]) => (
              <div key={tool} style={{ marginBottom: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '11px', color: C.accent }}>{tool}</span>
                  <span style={{ fontSize: '11px', color: C.muted }}>
                    <strong style={{ color: C.text }}>{data.tokens.toLocaleString()}</strong>t · {data.calls}x
                    <span style={{ color: '#666', marginLeft: '6px' }}>({Math.round((data.tokens / stats.totalTokens) * 100)}%)</span>
                  </span>
                </div>
                <div style={{ height: '5px', background: C.border, borderRadius: '3px', overflow: 'hidden' as const }}>
                  <div style={{ width: `${(data.tokens / maxTokens) * 100}%`, height: '100%', background: C.accent, borderRadius: '3px', transition: 'width 0.3s' }} />
                </div>
              </div>
            ))}
          </div>

          {/* Input vs output breakdown */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', padding: '10px', background: '#0d1117', borderRadius: '8px', fontSize: '12px' }}>
            <div><span style={{ color: C.muted }}>Entrada (args): </span><strong style={{ color: C.green }}>{stats.totalInputTokens.toLocaleString()}</strong></div>
            <div><span style={{ color: C.muted }}>Saída (respostas): </span><strong style={{ color: C.orange }}>{stats.totalOutputTokens.toLocaleString()}</strong></div>
          </div>

          {/* Recent calls log */}
          {stats.log.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', color: C.muted, marginBottom: '6px', fontWeight: 600 }}>ÚLTIMAS CHAMADAS</div>
              {[...stats.log].reverse().slice(0, 8).map((entry, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', padding: '4px 0', borderBottom: `1px solid ${C.border}`, fontSize: '11px' }}>
                  <span style={{ color: '#555', width: '56px', flexShrink: 0 }}>{new Date(entry.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  <span style={{ color: C.accent, fontFamily: 'monospace', flex: 1 }}>{entry.tool}</span>
                  <span style={{ color: C.text, width: '80px', textAlign: 'right' as const }}>{entry.totalTokens.toLocaleString()}t</span>
                  <span style={{ color: '#666', width: '90px', textAlign: 'right' as const }}>{entry.inputTokens}↑ · {entry.outputTokens}↓</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ImpactTab ──────────────────────────────────────────────────────────────────
function ImpactTab({ ticCodeDir, projectPath }: { ticCodeDir: string; projectPath: string }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [index, setIndex] = useState<Record<string, ImpactEntry> | null>(null);
  const [activeMode, setActiveMode] = useState<'manual' | 'git'>('manual');

  useEffect(() => {
    window.ticAnalyzer.readFile(`${ticCodeDir}/impact-index.json`).then((content) => {
      if (content) setIndex(JSON.parse(content));
    });
  }, [ticCodeDir]);

  const lookupEntry = useCallback((q: string): ImpactEntry | undefined => {
    if (!index) return undefined;
    let entry = index[q];
    if (!entry) {
      const fuzzy = Object.keys(index).find((k) => k.includes(q) || k.endsWith('/' + q) || q.endsWith(k.split('/').pop() ?? ''));
      if (fuzzy) entry = index[fuzzy];
    }
    return entry;
  }, [index]);

  const search = useCallback(() => {
    if (!index || !query.trim()) { setResult(''); return; }
    setLoading(true);
    const q = query.trim();
    const entry = lookupEntry(q);
    if (!entry) { setResult(`Nenhum dependente encontrado para "${q}".\nEste arquivo nao e importado por outros arquivos.`); setLoading(false); return; }
    const lines = [
      `Arquivo: ${q}`, '',
      `Dependentes diretos:   ${entry.directCount}`,
      `Impacto transitivo:    ${entry.transitiveCount} arquivos`,
      '',
      '── Dependentes Diretos ──',
      ...entry.direct.map((f) => `  • ${f}`),
      entry.transitive.length > 0 ? '\n── Impacto Transitivo (amostra) ──' : '',
      ...entry.transitive.slice(0, 15).map((f) => `  ○ ${f}`),
      entry.transitiveCount > 15 ? `  ... e mais ${entry.transitiveCount - 15} arquivos` : ''
    ].filter(Boolean);
    setResult(lines.join('\n'));
    setLoading(false);
  }, [index, query, lookupEntry]);

  const analyzeGitDiff = useCallback(async () => {
    if (!index) return;
    setDiffLoading(true);
    setResult('');

    const { files, error } = await window.ticAnalyzer.getGitDiff(projectPath);

    if (error || files.length === 0) {
      setResult(error ? `Erro ao ler git diff: ${error}` : 'Nenhuma mudanca detectada no git (working tree limpa).');
      setDiffLoading(false);
      return;
    }

    const directImpact = new Set<string>();
    const transitiveImpact = new Set<string>();

    const lines: string[] = [
      `Git Diff — ${files.length} arquivo(s) modificado(s)`,
      '═'.repeat(50),
      ''
    ];

    for (const file of files) {
      const entry = lookupEntry(file);
      lines.push(buildImpactText(file, entry));
      entry?.direct.forEach((f) => directImpact.add(f));
      entry?.transitive.forEach((f) => transitiveImpact.add(f));
    }

    // Remove os próprios arquivos modificados do conjunto de afetados
    files.forEach((f) => { directImpact.delete(f); transitiveImpact.delete(f); });

    lines.push('═'.repeat(50));
    lines.push(`Impacto consolidado desta mudanca:`);
    lines.push(`  Arquivos diretamente afetados: ${directImpact.size}`);
    lines.push(`  Arquivos transitivamente afetados: ${transitiveImpact.size}`);

    if (transitiveImpact.size > 0) {
      lines.push('');
      lines.push('Top afetados transitivos:');
      [...transitiveImpact].slice(0, 10).forEach((f) => lines.push(`  ○ ${f}`));
      if (transitiveImpact.size > 10) lines.push(`  ... e mais ${transitiveImpact.size - 10}`);
    }

    setResult(lines.join('\n'));
    setDiffLoading(false);
  }, [index, projectPath, lookupEntry]);

  const total = index ? Object.keys(index).length : 0;
  const topImpact = index
    ? Object.entries(index).sort((a, b) => b[1].transitiveCount - a[1].transitiveCount).slice(0, 5)
    : [];

  return (
    <div>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>Analise de Impacto de Mudanca</div>
          <div style={{ fontSize: '12px', color: C.muted }}>Descubra quais arquivos sao afetados antes de fazer uma mudanca</div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button style={S.tab(activeMode === 'manual')} onClick={() => setActiveMode('manual')}>Manual</button>
          <button style={S.tab(activeMode === 'git')} onClick={() => setActiveMode('git')}>Git Diff</button>
        </div>
      </div>

      {activeMode === 'manual' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="src/api/user.ts ou user.service"
            style={{ flex: 1, background: '#0d1b2a', border: `1px solid ${C.border}`, borderRadius: '8px', padding: '10px 14px', color: C.text, fontSize: '13px', fontFamily: 'monospace' }} />
          <button style={S.btn(C.accent)} onClick={search} disabled={loading}>
            {loading ? '...' : 'Analisar'}
          </button>
        </div>
      )}

      {activeMode === 'git' && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', color: C.muted, marginBottom: '10px', padding: '10px', background: '#0d1b2a', borderRadius: '8px', border: `1px solid ${C.border}` }}>
            Le <code style={{ color: C.accent }}>git diff HEAD</code> + <code style={{ color: C.accent }}>git diff --cached</code> no projeto analisado e calcula o impacto de todos os arquivos modificados de uma vez.
          </div>
          <button style={S.btn(C.green)} onClick={analyzeGitDiff} disabled={diffLoading}>
            {diffLoading ? 'Lendo git diff...' : 'Analisar Mudancas Atuais (git diff)'}
          </button>
        </div>
      )}

      {result && (
        <div style={{ background: '#0d1117', borderRadius: '8px', padding: '16px', marginBottom: '16px', fontFamily: 'monospace', fontSize: '12px', color: '#ccc', whiteSpace: 'pre-wrap', maxHeight: '380px', overflowY: 'auto', lineHeight: 1.7 }}>
          {result}
        </div>
      )}

      {activeMode === 'manual' && total > 0 && (
        <div>
          <div style={{ fontSize: '12px', color: C.muted, marginBottom: '10px' }}>{total} arquivos com dependentes mapeados</div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: C.muted, marginBottom: '8px' }}>Maior Impacto Transitivo</div>
          {topImpact.map(([file, entry]) => (
            <div key={file} onClick={() => { setQuery(file); setActiveMode('manual'); }}
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

// ── DocsTab ───────────────────────────────────────────────────────────────────
function Code({ children }: { children: string }) {
  return (
    <pre style={{ background: '#0d1117', border: `1px solid ${C.border}`, borderRadius: '8px', padding: '12px 16px', fontSize: '12px', color: '#e0e0e0', overflowX: 'auto', margin: '8px 0', fontFamily: 'monospace', lineHeight: 1.6 }}>
      {children}
    </pre>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{ fontSize: '15px', fontWeight: 700, color: C.accent, borderBottom: `1px solid ${C.border}`, paddingBottom: '8px', marginBottom: '14px' }}>{title}</div>
      {children}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '14px', marginBottom: '14px' }}>
      <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: C.accent, color: '#fff', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>{n}</div>
      <div>
        <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '12px', color: '#b0b0c0', lineHeight: 1.7 }}>{children}</div>
      </div>
    </div>
  );
}

function Tag({ color = C.accent, children }: { color?: string; children: string }) {
  return <span style={{ display: 'inline-block', padding: '2px 8px', background: color + '22', border: `1px solid ${color}55`, borderRadius: '4px', fontSize: '11px', color, fontFamily: 'monospace', marginRight: '4px' }}>{children}</span>;
}

function DocsTab() {
  const [section, setSection] = useState<'inicio' | 'claude' | 'copilot' | 'abas' | 'ferramentas' | 'arquivos' | 'cli'>('inicio');

  const NAV = [
    { id: 'inicio',      label: 'Primeiros Passos' },
    { id: 'claude',      label: 'Claude Code' },
    { id: 'copilot',     label: 'VS Code / Copilot' },
    { id: 'abas',        label: 'Abas do App' },
    { id: 'ferramentas', label: 'Ferramentas MCP' },
    { id: 'arquivos',    label: 'Arquivos Gerados' },
    { id: 'cli',         label: 'CLI / CI-CD' },
  ] as const;

  return (
    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
      {/* Sidebar nav */}
      <div style={{ width: '160px', flexShrink: 0, position: 'sticky', top: '0' }}>
        {NAV.map((n) => (
          <button key={n.id} onClick={() => setSection(n.id)}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', marginBottom: '4px', background: section === n.id ? C.accent + '22' : 'transparent', border: `1px solid ${section === n.id ? C.accent : C.border}`, borderRadius: '8px', color: section === n.id ? C.accent : C.muted, cursor: 'pointer', fontSize: '12px', fontWeight: section === n.id ? 600 : 400 }}>
            {n.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* ── Primeiros Passos ── */}
        {section === 'inicio' && (
          <div>
            <Section title="O que é o TIC Analyzer?">
              <p style={{ fontSize: '13px', color: '#b0b0c0', lineHeight: 1.8, margin: '0 0 12px 0' }}>
                O TIC Analyzer é um motor de engenharia reversa local para projetos grandes. Ele escaneia seu código,
                mapeia dependências, endpoints, chamadas de banco, regras de negócio, métricas de qualidade e muito mais —
                tudo <strong style={{ color: C.green }}>sem enviar nenhuma linha de código para a internet</strong> e
                sem gastar nenhum token de IA na análise.
              </p>
              <p style={{ fontSize: '13px', color: '#b0b0c0', lineHeight: 1.8, margin: '0 0 12px 0' }}>
                O resultado é uma pasta <Tag>.tic-code/</Tag> dentro do seu projeto, com arquivos Markdown compactos
                que o Claude Code (ou qualquer IA) pode ler de forma cirúrgica — sem precisar carregar o projeto inteiro no contexto.
              </p>
            </Section>

            <Section title="Como analisar um projeto">
              <Step n={1} title="Selecione a pasta raiz do projeto">
                Clique em <strong>Selecionar</strong> e escolha a pasta raiz do projeto — a mesma onde ficam <Tag>package.json</Tag>, <Tag>pom.xml</Tag> ou <Tag>build.gradle</Tag>.
                <br /><br />
                <span style={{ color: C.red }}>Não selecione a pasta <Tag>.tic-code</Tag> — sempre a pasta pai.</span>
              </Step>
              <Step n={2} title="Clique em Analisar">
                O progresso aparece em tempo real com 25 fases. Para projetos grandes (10k–200k arquivos) o processo leva de 30 segundos a alguns minutos. A partir da segunda análise, o cache incremental acelera significativamente os módulos não alterados.
              </Step>
              <Step n={3} title="Explore os resultados">
                Após a análise, as abas <Tag>Impacto</Tag>, <Tag>Métricas</Tag>, <Tag>Multi-Grafo</Tag> e <Tag>Módulos</Tag> ficam disponíveis.
                Uma pasta <Tag>.tic-code/</Tag> é criada dentro do projeto com todos os artefatos.
              </Step>
              <Step n={4} title="(Opcional) Configure a IA de sua escolha">
                Para o <strong>Claude Code</strong>: ative o MCP Server e configure <Tag>.claude/settings.json</Tag> — veja a aba <em>Claude Code</em>.<br />
                Para o <strong>GitHub Copilot</strong>: o <Tag>copilot-instructions.md</Tag> já foi gerado. Para as 19 ferramentas, veja a aba <em>VS Code / Copilot</em>.
              </Step>
            </Section>

            <Section title="Linguagens suportadas">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {['TypeScript','JavaScript','Java','Kotlin','Python','Go','Rust','C#','PHP','Ruby','PL/SQL','SQL','HTML','CSS','SCSS'].map((l) => (
                  <Tag key={l} color={C.green}>{l}</Tag>
                ))}
              </div>
              <p style={{ fontSize: '12px', color: C.muted, marginTop: '10px' }}>Frameworks detectados automaticamente: React, Vue, Angular, Next.js, Express, NestJS, Spring, Django, FastAPI, Flask e outros.</p>
            </Section>
          </div>
        )}

        {/* ── Claude Code ── */}
        {section === 'claude' && (
          <div>
            <Section title="Como funciona com o Claude Code">
              <p style={{ fontSize: '13px', color: '#b0b0c0', lineHeight: 1.8, margin: '0 0 8px 0' }}>
                O Claude Code usa MCP (Model Context Protocol) para chamar as ferramentas do TIC Analyzer sob demanda —
                sem você precisar pedir. Ele lê o <Tag>CLAUDE.md</Tag> gerado pela análise, entende que há um servidor MCP
                disponível, e já consulta <Tag>get_quick_context()</Tag> sozinho antes de responder qualquer pergunta sobre o projeto.
              </p>
              <p style={{ fontSize: '13px', color: '#b0b0c0', lineHeight: 1.8, margin: 0 }}>
                Cada ferramenta retorna apenas o necessário: <Tag>get_impact()</Tag> custa ~200 tokens, <Tag>get_metrics()</Tag> ~500 tokens.
                O Claude nunca carrega o projeto inteiro — apenas o que precisa, quando precisa.
              </p>
            </Section>

            <Section title="Configuração passo a passo">
              <Step n={1} title="Rode a análise">
                Clique em <strong>Analisar</strong>. Quando terminar, o arquivo <Tag>CLAUDE.md</Tag> é gerado automaticamente na raiz do projeto com as instruções de navegação para o Claude.
              </Step>
              <Step n={2} title="Inicie o MCP Server">
                Na aba <Tag>Visão Geral</Tag>, clique em <strong>Iniciar MCP</strong>. O servidor sobe em <Tag>localhost:7432</Tag> e fica ativo enquanto o app estiver aberto.
              </Step>
              <Step n={3} title="Crie .claude/settings.json no projeto analisado">
                Dentro da pasta raiz do projeto (a mesma que você analisou), crie:
                <Code>{`# Linux / macOS
mkdir -p /seu/projeto/.claude

# Windows PowerShell
New-Item -ItemType Directory -Force -Path C:\seu\projeto\.claude`}</Code>
                Conteúdo do arquivo <Tag>.claude/settings.json</Tag>:
                <Code>{`{
  "mcpServers": {
    "tic-analyzer": {
      "url": "http://localhost:7432/mcp"
    }
  }
}`}</Code>
              </Step>
              <Step n={4} title="Abra o projeto no Claude Code e teste">
                No terminal, dentro do projeto:
                <Code>{`claude

# Verifique se o MCP está conectado:
/mcp
# → Deve mostrar: tic-analyzer  connected  19 tools`}</Code>
              </Step>
              <Step n={5} title="Use normalmente — o Claude sabe o que fazer">
                Basta conversar. O Claude vai consultar as ferramentas automaticamente:
                <Code>{`"Quero refatorar o módulo de pagamentos. Por onde começo?"
→ Claude chama: get_quick_context() + get_module("pagamentos")
   + get_metrics("pagamentos") + get_hotspots()

"Quais arquivos vou afetar se renomear UserService?"
→ Claude chama: get_impact("src/services/user.service.ts")

"Como está a dívida técnica do projeto?"
→ Claude chama: get_hotspots() + get_violations()`}</Code>
              </Step>
            </Section>

            <Section title="Dicas de uso">
              {[
                { tip: 'Não peça para carregar tudo', desc: 'Nunca diga "leia todos os arquivos do projeto". O Claude vai consultar o MCP de forma cirúrgica — deixe ele decidir o que buscar.' },
                { tip: 'Antes de commitar, use get_diff_impact', desc: 'Diga: "antes de fazer o commit, analise o impacto das mudanças atuais". O Claude chama get_diff_impact() automaticamente.' },
                { tip: 'Re-analise quando o projeto mudar', desc: 'O .tic-code/ é um snapshot. Após adicionar muitos arquivos ou fazer uma refatoração grande, rode a análise novamente. O cache incremental faz isso em segundos para módulos não alterados.' },
                { tip: 'O MCP Server precisa estar aberto', desc: 'O servidor só funciona enquanto o TIC Analyzer estiver rodando. Se fechar o app, reinicie o MCP Server antes de abrir o Claude Code.' },
              ].map((item) => (
                <div key={item.tip} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ color: C.accent, fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>→</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '3px' }}>{item.tip}</div>
                    <div style={{ fontSize: '12px', color: '#b0b0c0', lineHeight: 1.6 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </Section>
          </div>
        )}

        {/* ── VS Code / Copilot ── */}
        {section === 'copilot' && (
          <div>
            <Section title="Dois modos de integração com o Copilot">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
                <div style={{ padding: '14px', background: '#0d1b2a', borderRadius: '10px', border: `1px solid ${C.green}44` }}>
                  <div style={{ fontWeight: 700, color: C.green, marginBottom: '6px', fontSize: '13px' }}>Modo Básico</div>
                  <div style={{ fontSize: '12px', color: '#b0b0c0', lineHeight: 1.8 }}>
                    Qualquer versão do VS Code.<br />
                    Funciona imediatamente após a análise.<br />
                    O Copilot lê <Tag color={C.green}>copilot-instructions.md</Tag> automaticamente.<br />
                    Você referencia arquivos com <Tag color={C.green}>#file:</Tag>
                  </div>
                </div>
                <div style={{ padding: '14px', background: '#0d1b2a', borderRadius: '10px', border: `1px solid ${C.accent}44` }}>
                  <div style={{ fontWeight: 700, color: C.accent, marginBottom: '6px', fontSize: '13px' }}>Modo MCP (VS Code 1.99+)</div>
                  <div style={{ fontSize: '12px', color: '#b0b0c0', lineHeight: 1.8 }}>
                    Acesso às 19 ferramentas do TIC Analyzer.<br />
                    Requer configurar <Tag>.vscode/mcp.json</Tag>.<br />
                    Ferramentas ativadas manualmente no Copilot Chat.<br />
                    Monitor de tokens em tempo real.
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Modo Básico — zero configuração">
              <Step n={1} title="Rode a análise">
                Clique em <strong>Analisar</strong>. O arquivo <Tag>.github/copilot-instructions.md</Tag> é gerado automaticamente com o mapa do projeto: stack, módulos, onde estão os contextos, como navegar o <Tag>.tic-code/</Tag>.
              </Step>
              <Step n={2} title="Abra o projeto no VS Code — pronto">
                O Copilot lê o <Tag>copilot-instructions.md</Tag> automaticamente em toda conversa no Copilot Chat. Sem nenhuma configuração extra, ele já sabe a estrutura do projeto.
              </Step>
              <Step n={3} title="Referencie arquivos específicos quando precisar de profundidade">
                No Copilot Chat, use <Tag>#file:</Tag> para carregar contextos específicos:
                <Code>{`# Contexto geral do projeto (recomendado para começar)
#file:.tic-code/quick-context.md me ajude a implementar X

# Contexto completo de um módulo específico
#file:.tic-code/modules/pagamentos/context.md
refatore o service de pagamentos

# Ver métricas antes de refatorar
#file:.tic-code/metrics-summary.md
quais arquivos têm maior dívida técnica?

# Schema do banco para queries/migrations
#file:.tic-code/db-schema-summary.md
crie uma migration para adicionar coluna X

# Impacto de uma mudança (leitura manual)
#file:.tic-code/impact-index.json
qual é o impacto de mudar UserRepository?`}</Code>
              </Step>
            </Section>

            <Section title="Modo MCP — VS Code 1.99+">
              <Step n={1} title="Verifique a versão do VS Code">
                Menu <strong>Help → About</strong>. Precisa ser <strong>1.99.0 ou superior</strong>.
                <Code>{`# Ou verifique pelo terminal:
code --version
# → 1.99.x ou maior`}</Code>
              </Step>
              <Step n={2} title="Inicie o MCP Server no TIC Analyzer">
                Na aba <Tag>Visão Geral</Tag>, após a análise, clique em <strong>Iniciar MCP</strong>. Mantenha o TIC Analyzer aberto.
              </Step>
              <Step n={3} title="Crie .vscode/mcp.json no projeto analisado">
                Dentro da pasta raiz do projeto:
                <Code>{`# Linux / macOS
mkdir -p /seu/projeto/.vscode

# Windows PowerShell
New-Item -ItemType Directory -Force -Path C:\seu\projeto\.vscode`}</Code>
                Conteúdo do arquivo <Tag>.vscode/mcp.json</Tag>:
                <Code>{`{
  "servers": {
    "tic-analyzer": {
      "type": "sse",
      "url": "http://localhost:7432/mcp"
    }
  }
}`}</Code>
              </Step>
              <Step n={4} title="Ative MCP nas configurações do VS Code">
                Abra as configurações (<Tag>Ctrl+,</Tag> / <Tag>Cmd+,</Tag>), busque por <strong>copilot mcp</strong> e ative a opção <em>Github Copilot Chat: Mcp Enabled</em>. Ou adicione ao seu <Tag>settings.json</Tag>:
                <Code>{`{
  "github.copilot.chat.mcp.enabled": true
}`}</Code>
              </Step>
              <Step n={5} title="Use o modo Agent no Copilot Chat">
                Abra o Copilot Chat (<Tag>Ctrl+Shift+I</Tag>), mude para o modo <strong>Agent</strong> (ícone de ferramenta). Depois peça as ferramentas explicitamente:
                <Code>{`Use tic-analyzer to get the quick context of this project

Use tic-analyzer get_impact to check src/services/user.service.ts

Use tic-analyzer get_metrics for the payments module

Use tic-analyzer get_diff_impact to review my current changes`}</Code>
                <div style={{ marginTop: '8px', padding: '10px', background: '#1a1500', borderRadius: '8px', border: '1px solid #7a600044' }}>
                  <span style={{ fontSize: '11px', color: '#f0c000' }}>Diferença do Claude Code: o Copilot não chama ferramentas automaticamente. Você precisa pedir explicitamente usando "Use tic-analyzer" no início da mensagem.</span>
                </div>
              </Step>
            </Section>

            <Section title="Comparação rápida">
              <div style={{ overflowX: 'auto' as const }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                      <th style={{ textAlign: 'left' as const, padding: '8px 10px', color: C.muted, fontWeight: 600 }}>Capacidade</th>
                      <th style={{ textAlign: 'center' as const, padding: '8px 10px', color: C.green, fontWeight: 600 }}>Copilot<br/>Básico</th>
                      <th style={{ textAlign: 'center' as const, padding: '8px 10px', color: C.accent, fontWeight: 600 }}>Copilot<br/>+ MCP</th>
                      <th style={{ textAlign: 'center' as const, padding: '8px 10px', color: '#a0a0ff', fontWeight: 600 }}>Claude<br/>Code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['copilot-instructions.md automático', '✓', '✓', '—'],
                      ['CLAUDE.md automático', '—', '—', '✓'],
                      ['Contexto via #file: (manual)', '✓', '✓', '✓'],
                      ['19 ferramentas MCP disponíveis', '—', '✓', '✓'],
                      ['Ferramentas ativadas automaticamente', '—', '—', '✓'],
                      ['get_impact() ~200 tokens', '—', '✓ (manual)', '✓ (auto)'],
                      ['get_diff_impact() antes do commit', '—', '✓ (manual)', '✓ (auto)'],
                      ['Monitor de tokens em tempo real', '—', '✓', '✓'],
                      ['Funciona sem instalar nada extra', '✓', '—', '—'],
                    ].map(([cap, basic, mcp, claude]) => (
                      <tr key={cap} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '7px 10px', color: '#b0b0c0' }}>{cap}</td>
                        <td style={{ textAlign: 'center' as const, padding: '7px 10px', color: basic === '✓' ? C.green : basic === '—' ? '#444' : C.muted }}>{basic}</td>
                        <td style={{ textAlign: 'center' as const, padding: '7px 10px', color: mcp === '✓' || mcp.includes('manual') ? C.accent : '#444' }}>{mcp}</td>
                        <td style={{ textAlign: 'center' as const, padding: '7px 10px', color: claude === '✓' || claude.includes('auto') ? '#a0a0ff' : '#444' }}>{claude}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        )}

        {/* ── Abas do App ── */}
        {section === 'abas' && (
          <div>
            {[
              {
                name: 'Visão Geral',
                desc: 'Resumo dos resultados: total de arquivos, linhas, módulos, hotspots, violações arquiteturais e padrões detectados. Também é onde você inicia e para o MCP Server.',
                dica: 'O contador de Hotspots e Violações em vermelho indica onde focar a atenção antes de mexer no código.'
              },
              {
                name: 'Impacto',
                desc: 'Análise de impacto de mudança. Tem dois modos: Manual (busca um arquivo específico) e Git Diff (lê automaticamente git diff HEAD + staged + untracked e mostra o impacto consolidado de todas as mudanças pendentes).',
                dica: 'Use o modo Git Diff antes de fazer commit para saber quantos arquivos sua mudança vai afetar.'
              },
              {
                name: 'Métricas',
                desc: 'Complexidade ciclomática por arquivo, debt score por módulo, hotspots (alta complexidade + alto acoplamento) e violações arquiteturais (dependências circulares, frontend importando backend diretamente, etc).',
                dica: 'Arquivos com complexidade > 30 (🔴) merecem refatoração antes de novos features.'
              },
              {
                name: 'Multi-Grafo',
                desc: 'Grafo interativo que mostra o fluxo completo: Frontend → Endpoint REST → Backend → PL/SQL. Clique em um nó para ver o arquivo de origem. Use filtro por camada e busca por nome.',
                dica: '🟢 = conexão detectada diretamente no código. 🟡 = inferida por heurística de nomes.'
              },
              {
                name: 'Módulos',
                desc: 'Diagrama Mermaid com as dependências entre módulos do projeto, gerado por análise de imports.',
                dica: 'Módulos com muitas setas entrando são os mais críticos — mudanças neles têm alto impacto.'
              },
              {
                name: 'Arquivos',
                desc: 'Lista de todos os artefatos gerados na pasta .tic-code/ com uma descrição do que cada um contém.',
                dica: 'Você pode abrir a pasta diretamente pelo botão "Abrir .tic-code" para ver os Markdown no editor.'
              },
            ].map((tab) => (
              <div key={tab.name} style={{ marginBottom: '16px', padding: '14px', background: '#0d1b2a', borderRadius: '10px', border: `1px solid ${C.border}` }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: C.accent, marginBottom: '6px' }}>{tab.name}</div>
                <div style={{ fontSize: '12px', color: '#b0b0c0', lineHeight: 1.7, marginBottom: '8px' }}>{tab.desc}</div>
                <div style={{ fontSize: '11px', color: C.green }}>Dica: {tab.dica}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Ferramentas MCP ── */}
        {section === 'ferramentas' && (
          <div>
            <p style={{ fontSize: '13px', color: '#b0b0c0', lineHeight: 1.8, margin: '0 0 16px 0' }}>
              Com o MCP Server ativo, o Claude Code (e o Copilot em modo Agent) pode chamar estas 19 ferramentas. Cada uma retorna apenas o necessário — de ~200 a ~75k tokens dependendo do escopo.
            </p>
            {[
              { tool: 'get_quick_context()', tokens: '~12k', desc: 'Visão geral compacta do projeto: stack, módulos, riscos, top endpoints. Use como ponto de partida em qualquer conversa.' },
              { tool: 'list_modules()', tokens: '~2k', desc: 'Lista todos os módulos detectados com contagem de arquivos e linguagens. Use para escolher qual módulo explorar.' },
              { tool: 'get_module("nome")', tokens: '~75k', desc: 'Contexto completo de um módulo específico: arquivos, código dos principais, dependências, riscos e endpoints do módulo.' },
              { tool: 'search_module("query")', tokens: '~75k', desc: 'Busca o módulo mais relevante para um termo. Use quando não sabe o nome exato do módulo.' },
              { tool: 'get_impact("arquivo.ts")', tokens: '~200', desc: 'Retorna quantos arquivos dependem do arquivo informado (direto + transitivo). Use antes de alterar um arquivo.' },
              { tool: 'get_diff_impact()', tokens: '~300', desc: 'Lê git diff + staged + untracked e retorna o impacto consolidado de TODAS as mudanças pendentes. Use antes de commitar.' },
              { tool: 'get_metrics("módulo")', tokens: '~500', desc: 'Complexidade ciclomática, debt score e hotspots de um módulo. Sem parâmetro, retorna o resumo do projeto inteiro.' },
              { tool: 'get_hotspots()', tokens: '~1k', desc: 'Top arquivos com maior dívida técnica do projeto (alta complexidade + alto acoplamento).' },
              { tool: 'get_violations()', tokens: '~1k', desc: 'Lista violações arquiteturais: dependências circulares, frontend importando backend, controller acessando BD direto.' },
              { tool: 'get_patterns("módulo")', tokens: '~500', desc: 'Padrões arquiteturais detectados: Repository, Service, Controller, Factory, DTO, Entity, Mapper, UseCase, etc.' },
              { tool: 'get_inheritance()', tokens: '~2k', desc: 'Hierarquia de herança de classes (extends/implements) para Java, TypeScript e Python.' },
              { tool: 'get_multigraph()', tokens: '~3k', desc: 'Multi-grafo Frontend→Endpoint→Backend→PL/SQL em Mermaid. Mostra o fluxo de chamadas entre camadas.' },
              { tool: 'get_diagram()', tokens: '~1k', desc: 'Diagrama Mermaid com dependências entre módulos do projeto.' },
              { tool: 'get_openapi()', tokens: '~2k', desc: 'Especificação OpenAPI 3.0 com todos os endpoints detectados (Spring, NestJS, Express, FastAPI).' },
              { tool: 'get_business_rules("módulo")', tokens: '~500', desc: 'Validações, enums, guards e constantes de negócio de um módulo (@NotNull, .required(), enum Status, etc).' },
              { tool: 'get_permissions()', tokens: '~1k', desc: 'Matriz de permissões: rota × método × roles (@PreAuthorize, @Roles, @Secured, requireRole, etc).' },
              { tool: 'get_db_schema("tabela")', tokens: '~200–500', desc: 'Schema de banco detectado: tabelas de SQL migrations, Prisma, TypeORM, JPA/Hibernate, Django, Sequelize. Sem parâmetro retorna resumo; com nome de tabela retorna colunas detalhadas.' },
              { tool: 'get_analysis_json()', tokens: '~500', desc: 'Metadados estruturados da análise em JSON compacto. Útil para scripts, CI/CD e ferramentas externas que não usam MCP.' },
              { tool: 'get_gaps()', tokens: '~1k', desc: 'Relatório de lacunas: módulos sem endpoints, arquivos isolados, dependências não analisadas.' },
            ].map((t) => (
              <div key={t.tool} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ minWidth: '220px', flexShrink: 0 }}>
                  <Tag>{t.tool}</Tag>
                  <span style={{ fontSize: '10px', color: C.muted, marginLeft: '4px' }}>{t.tokens}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#b0b0c0', lineHeight: 1.6 }}>{t.desc}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Arquivos Gerados ── */}
        {section === 'arquivos' && (
          <div>
            <p style={{ fontSize: '13px', color: '#b0b0c0', lineHeight: 1.8, margin: '0 0 16px 0' }}>
              Após a análise, a pasta <Tag>.tic-code/</Tag> é criada dentro do projeto com os seguintes artefatos. Eles são lidos pelo MCP Server e também diretamente pelo Claude Code via CLAUDE.md.
            </p>
            {[
              { file: 'quick-context.md', tokens: '~12k', desc: 'Resumo geral do projeto. Ponto de partida para qualquer IA. Contém stack, módulos, top riscos, top endpoints e instruções de navegação.' },
              { file: 'index.md', tokens: '~2k', desc: 'Mapa de navegação com links para todos os módulos, contagem de arquivos e linguagens por módulo.' },
              { file: 'impact-index.json', tokens: 'JSON', desc: 'Índice de impacto de mudança. Para cada arquivo, lista quem depende dele (direto + transitivo). Consultado pontualmente via MCP.' },
              { file: 'metrics-summary.md', tokens: '~2k', desc: 'Resumo de qualidade: top hotspots, complexidade por módulo, debt score e violações arquiteturais.' },
              { file: 'patterns.md', tokens: '~1k', desc: 'Padrões arquiteturais detectados em todo o projeto (Repository, Service, Controller, Factory, DTO...).' },
              { file: 'inheritance.md', tokens: '~1k', desc: 'Hierarquia de classes: extends/implements, profundidade máxima de herança.' },
              { file: 'multigraph.md', tokens: '~3k', desc: 'Diagrama Mermaid do fluxo de chamadas: Frontend → Endpoint → Backend → PL/SQL.' },
              { file: 'call-graph.json', tokens: 'JSON', desc: 'Dados brutos do call graph para o visualizador interativo na aba Multi-Grafo.' },
              { file: 'dep-graph.json', tokens: 'JSON', desc: 'Dados brutos do grafo de dependências para o visualizador na aba Métricas.' },
              { file: 'diagram.md', tokens: '~1k', desc: 'Diagrama Mermaid das dependências entre módulos.' },
              { file: 'openapi.yaml', tokens: '~2k', desc: 'Especificação OpenAPI 3.0 dos endpoints detectados.' },
              { file: 'permissions.md', tokens: '~1k', desc: 'Matriz de permissões: rota × método × roles extraídos de decorators/annotations.' },
              { file: 'gaps.md', tokens: '~500', desc: 'Lacunas: módulos sem endpoints, arquivos isolados, dependências externas não analisadas.' },
              { file: 'modules/{nome}/context.md', tokens: '~75k', desc: 'Contexto completo de cada módulo: arquivos, código dos mais importantes, riscos, endpoints e dependências.' },
              { file: 'modules/{nome}/business-rules.md', tokens: '~500', desc: 'Validações, enums, guards e constantes extraídos dos arquivos do módulo.' },
              { file: 'modules/{nome}/metrics.md', tokens: '~300', desc: 'Complexidade ciclomática, debt score e hotspots específicos do módulo.' },
              { file: 'modules/{nome}/patterns.md', tokens: '~300', desc: 'Padrões arquiteturais detectados nos arquivos do módulo.' },
              { file: 'db-schema.md', tokens: '~2k', desc: 'Schema de banco completo: tabelas, colunas, tipos, PKs e FKs detectados de migrations SQL, Prisma, TypeORM, JPA, Django ou Sequelize.' },
              { file: 'db-schema-summary.md', tokens: '~200', desc: 'Resumo compacto do schema: só nome das tabelas e contagem de colunas. Usado pelo MCP get_db_schema() sem parâmetro.' },
              { file: 'analysis.json', tokens: 'JSON', desc: 'Exportação estruturada de toda a análise: stack, módulos, endpoints, métricas, violações, padrões, schema de banco. Para integração com CI/CD e ferramentas externas.' },
              { file: 'file-cache.json', tokens: 'JSON', desc: 'Cache de mtimes para análise incremental. Na próxima análise, módulos sem mudanças são reutilizados do cache e não são re-processados.' },
            ].map((f) => (
              <div key={f.file} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ minWidth: '260px', flexShrink: 0 }}>
                  <Tag color={C.green}>{f.file}</Tag>
                  <span style={{ fontSize: '10px', color: C.muted, display: 'block', marginTop: '3px', paddingLeft: '4px' }}>{f.tokens}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#b0b0c0', lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── CLI ── */}
        {section === 'cli' && (
          <div>
            <Section title="Usar sem interface gráfica (CLI)">
              <p style={{ fontSize: '13px', color: '#b0b0c0', lineHeight: 1.8, margin: '0 0 12px 0' }}>
                O TIC Analyzer pode rodar em modo CLI para integrar com pipelines de CI/CD — sem precisar abrir o aplicativo desktop.
              </p>
              <Code>{`# Roda a pipeline completa no projeto informado
node dist/cli.js /caminho/do/projeto

# Ou com ts-node (ambiente de desenvolvimento)
npx ts-node src/cli.ts /caminho/do/projeto`}</Code>
              <p style={{ fontSize: '12px', color: '#b0b0c0', lineHeight: 1.7, margin: '12px 0 0 0' }}>
                O CLI gera todos os mesmos artefatos que o app gráfico — a pasta <Tag>.tic-code/</Tag> e o <Tag>CLAUDE.md</Tag> — e imprime o progresso no terminal.
              </p>
            </Section>

            <Section title="Integração com GitHub Actions">
              <p style={{ fontSize: '13px', color: '#b0b0c0', lineHeight: 1.8, margin: '0 0 12px 0' }}>
                Exemplo de workflow para re-analisar o projeto automaticamente a cada push:
              </p>
              <Code>{`# .github/workflows/tic-analyze.yml
name: TIC Analyzer
on:
  push:
    branches: [main, develop]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install TIC Analyzer
        run: |
          git clone https://github.com/LeonardoForbici/tic-coder-lite tic-analyzer
          cd tic-analyzer && npm install
      - name: Analyze project
        run: node tic-analyzer/dist/cli.js .
      - name: Commit .tic-code artifacts
        run: |
          git config user.name "TIC Analyzer Bot"
          git config user.email "bot@empresa.com"
          git add .tic-code/ CLAUDE.md
          git commit -m "chore: update TIC analysis" || true
          git push`}</Code>
            </Section>

            <Section title="Dicas de uso com o Claude Code">
              {[
                { tip: 'Comece sempre pelo quick context', desc: 'Peça ao Claude para chamar get_quick_context() antes de qualquer tarefa. Isso dá ao Claude o mapa do território sem gastar tokens carregando código bruto.' },
                { tip: 'Use get_impact antes de refatorar', desc: 'Antes de mover, renomear ou alterar a assinatura de qualquer arquivo importante, chame get_impact("arquivo") para saber o raio de explosão.' },
                { tip: 'Git Diff antes do commit', desc: 'Após fazer suas alterações, chame get_diff_impact() para ver o impacto consolidado de tudo que mudou — ideal para revisar antes de abrir um PR.' },
                { tip: 'Módulos são a unidade de trabalho', desc: 'Nunca peça ao Claude para carregar todos os módulos de uma vez. Identifique o módulo relevante com search_module() e carregue só ele com get_module().' },
                { tip: 'Re-analise após mudanças grandes', desc: 'O .tic-code/ é um snapshot. Após refatorações grandes ou adição de muitos arquivos, rode a análise novamente para manter o contexto atualizado.' },
              ].map((item) => (
                <div key={item.tip} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ color: C.green, fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>✓</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '3px' }}>{item.tip}</div>
                    <div style={{ fontSize: '12px', color: '#b0b0c0', lineHeight: 1.6 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </Section>
          </div>
        )}

      </div>
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
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null);

  useEffect(() => { window.ticAnalyzer?.getMcpStatus().then((s) => setMcpRunning(s.running)); }, []);

  useEffect(() => {
    if (!mcpRunning) return;
    // Load existing stats and subscribe to live updates
    window.ticAnalyzer?.getTokenStats().then((s) => setTokenStats(s as TokenStats | null));
    const cleanup = window.ticAnalyzer?.onTokenUpdate((entry) => {
      setTokenStats((prev) => {
        const e = entry as TokenEntry;
        if (!prev) return { totalCalls: 1, totalTokens: e.totalTokens, totalInputTokens: e.inputTokens, totalOutputTokens: e.outputTokens, byTool: { [e.tool]: { calls: 1, tokens: e.totalTokens, inputTokens: e.inputTokens, outputTokens: e.outputTokens } }, log: [e], sessionStart: Date.now() };
        const byTool = { ...prev.byTool };
        if (!byTool[e.tool]) byTool[e.tool] = { calls: 0, tokens: 0, inputTokens: 0, outputTokens: 0 };
        byTool[e.tool] = { calls: byTool[e.tool].calls + 1, tokens: byTool[e.tool].tokens + e.totalTokens, inputTokens: byTool[e.tool].inputTokens + e.inputTokens, outputTokens: byTool[e.tool].outputTokens + e.outputTokens };
        return { ...prev, totalCalls: prev.totalCalls + 1, totalTokens: prev.totalTokens + e.totalTokens, totalInputTokens: prev.totalInputTokens + e.inputTokens, totalOutputTokens: prev.totalOutputTokens + e.outputTokens, byTool, log: [...prev.log.slice(-99), e] };
      });
    });
    return () => { cleanup?.(); };
  }, [mcpRunning]);

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
    { id: 'docs', label: 'Docs' },
  ];

  return (
    <div style={S.app}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: C.accent }}>TIC Analyzer</div>
          <div style={{ fontSize: '11px', color: C.muted }}>Motor local de análise — zero tokens de IA</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {state === 'done' && result && TABS.filter((t) => t.id !== 'docs').map((t) => (
            <button key={t.id} style={S.tab(activeTab === t.id)} onClick={() => setActiveTab(t.id)}>{t.label}</button>
          ))}
          <button style={S.tab(activeTab === 'docs')} onClick={() => setActiveTab('docs')}>Docs</button>
        </div>
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

        {/* Docs — always visible, regardless of analysis state */}
        {activeTab === 'docs' && (
          <div style={S.card}><DocsTab /></div>
        )}

        {/* Results */}
        {state === 'done' && result && activeTab !== 'docs' && (
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
                      ...(result.dbTables > 0 ? [{ num: result.dbTables.toString(), label: 'Tabelas BD', color: '#f0c000' }] : []),
                      ...(result.inheritanceClasses > 0 ? [{ num: result.inheritanceClasses.toString(), label: 'Heranca', color: '#a0a0ff' }] : []),
                      ...(result.cacheHits > 0 ? [{ num: result.cacheHits.toString(), label: 'Cache Hits', color: C.green }] : []),
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
                  <div style={{ marginBottom: '12px', fontWeight: 600, fontSize: '13px', color: C.muted }}>MCP SERVER — 19 FERRAMENTAS</div>
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
                        {['list_modules','get_module','get_quick_context','search_module','get_impact','get_diff_impact','get_metrics','get_hotspots','get_patterns','get_violations','get_inheritance','get_db_schema','get_analysis_json','get_multigraph','get_diagram','get_openapi','get_gaps','get_permissions','get_business_rules'].map((tool) => (
                          <span key={tool} style={{ padding: '2px 8px', background: '#0d1b2a', border: `1px solid ${C.border}`, borderRadius: '4px', fontSize: '11px', color: C.accent, fontFamily: 'monospace' }}>{tool}</span>
                        ))}
                      </div>
                      <div style={{ marginTop: '14px', borderTop: `1px solid ${C.border}`, paddingTop: '14px' }}>
                        <div style={{ fontSize: '11px', color: C.muted, fontWeight: 600, marginBottom: '8px', letterSpacing: '0.05em' }}>MONITOR DE TOKENS EM TEMPO REAL</div>
                        <TokenMonitor
                          stats={tokenStats}
                          onClear={() => { window.ticAnalyzer.clearTokenStats(); setTokenStats(null); }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {activeTab === 'impact' && (
              <div style={S.card}><ImpactTab ticCodeDir={result.outputPath} projectPath={projectPath} /></div>
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
                    ...(result.dbTables > 0 ? [{ path: `db-schema.md + db-schema-summary.md`, note: `${result.dbTables} tabelas detectadas`, color: '#f0c000', indent: 1 }] : []),
                    { path: 'analysis.json', note: 'export estruturado completo', color: '#7c83fd', indent: 1 },
                    { path: 'file-cache.json', note: `cache incremental${result.cacheHits > 0 ? ` (${result.cacheHits} módulos reutilizados)` : ''}`, color: C.green, indent: 1 },
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
