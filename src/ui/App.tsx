import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { HierGraphViewer } from './HierGraphViewer';
import { HealthDashboard } from './HealthDashboard';
import { ActivityFeed, type ActivityEvent } from './ActivityFeed';
import { ValueDashboard } from './ValueDashboard';
import { PortfolioDashboard } from './PortfolioDashboard';
import { GovernanceDashboard } from './GovernanceDashboard';
import { MemoryViewer } from './MemoryViewer';
import { SearchCodeViewer } from './SearchCodeViewer';
import { HttpFlowsViewer } from './HttpFlowsViewer';

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
      getImpactOf: (projectPath: string, entity: string) => Promise<ImpactOfResponse>;
      getGraphLevel: (projectPath: string, expanded: string[]) => Promise<unknown>;
      searchCode: (projectPath: string, query: string) => Promise<SearchCodeResponse>;
      updateTriage: (projectPath: string, id: string, changes: unknown) => Promise<unknown>;
      createTriage: (projectPath: string, input: unknown) => Promise<unknown>;
      openArchReport: (projectPath: string) => Promise<unknown>;
      setLiveMode: (projectPath: string, on: boolean) => Promise<{ ok: boolean; live: boolean; error?: string }>;
      getActivity: (projectPath: string, limit?: number) => Promise<ActivityEvent[]>;
      onActivity: (cb: (e: ActivityEvent) => void) => () => void;
      exportExecutiveReport: (projectPath: string, format: 'pdf' | 'html') => Promise<{ ok: boolean; path?: string; error?: string }>;
      getPortfolio: () => Promise<unknown>;
      removePortfolioProject: (id: string) => Promise<unknown>;
      analyzePortfolioProject: (projectPath: string) => Promise<unknown>;
      setRoiConfig: (projectPath: string, cfg: { hourlyRate: number; currency: string }) => Promise<unknown>;
      getGithubStatus: (projectPath: string) => Promise<unknown>;
      installGithubWorkflow: (projectPath: string) => Promise<unknown>;
      onLiveStatus: (cb: (s: { watching?: boolean; analyzing?: boolean; lastRun?: string }) => void) => () => void;
      getTokenStats: () => Promise<TokenStats | null>;
      clearTokenStats: () => Promise<void>;
      onTokenUpdate: (cb: (entry: TokenEntry) => void) => () => void;
      onProgress: (cb: (p: Progress) => void) => () => void;
      onAnalysisDone: (cb: (r: AnalysisResult) => void) => void;
      listHttpFlows: (projectPath: string) => Promise<unknown>;
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
  transactions: number; batchJobs: number; angularModules: number; deadComponents: number;
  impactEdges?: number; healthScore?: number; healthGrade?: string;
  error?: string;
}
interface ImpactedNode { id: string; kind: string; depth: number; confidence: string; module?: string; }
interface ImpactOfResponse {
  error?: string;
  impact?: { entity: string; affected: ImpactedNode[]; byKind: Record<string, number>; byModule: Record<string, number>; totalVisited: number; truncated: boolean; candidates?: string[] };
  blast?: { entity: string; totalAffected: number; truncated: boolean; byKind: Record<string, number>; byModule: Record<string, number>; top: Array<{ id: string; kind: string; depth: number; dependents: number; confidence: string }> };
}
export interface SearchHitUI { file: string; snippet: string; score: number; origin: 'fts' | 'vec' | 'both' }
export interface SearchCodeResponse { hits?: SearchHitUI[]; mode?: string; error?: string }
type AppState = 'idle' | 'analyzing' | 'done' | 'error';
type Tab = 'overview' | 'health' | 'value' | 'governance' | 'activity' | 'explorer' | 'search' | 'memory' | 'impact' | 'metrics' | 'files' | 'portfolio' | 'docs' | 'http';

// ── Design System ─────────────────────────────────────────────────────────────
const C = {
  bg: '#0b1326',
  surface: '#0b1326',
  surfaceContainer: '#171f33',
  surfaceContainerLow: '#131b2e',
  surfaceContainerHigh: '#222a3d',
  surfaceContainerHighest: '#2d3449',
  surfaceVariant: '#2d3449',
  surfaceBright: '#31394d',
  surfaceDim: '#0b1326',
  surfaceContainerLowest: '#060e20',
  primary: '#dbfcff',
  primaryFixedDim: '#00dbe9',
  primaryFixed: '#7df4ff',
  secondary: '#4edea3',
  secondaryFixedDim: '#4edea3',
  error: '#ffb4ab',
  errorContainer: '#93000a',
  tertiary: '#fff3ea',
  tertiaryFixedDim: '#ffb95f',
  tertiaryFixed: '#ffddb8',
  onSurface: '#dae2fd',
  onSurfaceVariant: '#b9cacb',
  outline: '#849495',
  outlineVariant: '#3b494b',
  onPrimary: '#00363a',
  onSecondary: '#003824',
  onError: '#690005',
};

const F = {
  headline: "'Geist', 'Inter', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  code: "'JetBrains Mono', monospace",
};

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

// ── Icon helper ───────────────────────────────────────────────────────────────
function Icon({ name, size = 20, color, fill = 0 }: { name: string; size?: number; color?: string; fill?: number }) {
  return (
    <span
      className="material-symbols-outlined"
      style={{
        fontSize: `${size}px`,
        color: color,
        fontVariationSettings: `'FILL' ${fill}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {name}
    </span>
  );
}

// ── TokenMonitor ─────────────────────────────────────────────────────────────
function TokenMonitor({ stats, onClear }: { stats: TokenStats | null; onClear: () => void }) {
  const [expanded, setExpanded] = useState(false);

  if (!stats || stats.totalCalls === 0) {
    return (
      <div style={{ padding: '10px 0', fontSize: '12px', color: C.outline, display: 'flex', alignItems: 'center', gap: '8px', fontFamily: F.code }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: C.outlineVariant, display: 'inline-block' }} />
        Aguardando chamadas do Claude Code...
      </div>
    );
  }

  const sessionMinutes = Math.floor((Date.now() - stats.sessionStart) / 60000);
  const sortedTools = Object.entries(stats.byTool).sort((a, b) => b[1].tokens - a[1].tokens);
  const maxTokens = sortedTools[0]?.[1].tokens ?? 1;

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' as const }}>
        <div style={{ display: 'flex', gap: '24px', flex: 1 }}>
          {[
            { val: stats.totalTokens.toLocaleString(), label: 'tokens totais', color: C.primaryFixedDim },
            { val: stats.totalCalls, label: 'chamadas MCP', color: C.secondary },
            { val: stats.totalCalls > 0 ? Math.round(stats.totalTokens / stats.totalCalls).toLocaleString() : 0, label: 'média/chamada', color: C.tertiaryFixedDim },
            { val: `${sessionMinutes}m`, label: 'sessão ativa', color: C.onSurfaceVariant },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: 'center' as const }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: s.color, fontFamily: F.headline, lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: '10px', color: C.outline, marginTop: '3px', fontFamily: F.code, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button style={{ padding: '6px 12px', background: 'transparent', border: `1px solid ${C.outlineVariant}`, borderRadius: '4px', color: C.onSurface, cursor: 'pointer', fontFamily: F.code, fontSize: '12px' }} onClick={() => setExpanded((e) => !e)}>{expanded ? 'Fechar' : 'Detalhes'}</button>
          <button style={{ padding: '6px 12px', background: 'transparent', border: `1px solid ${C.outlineVariant}`, borderRadius: '4px', color: C.onSurfaceVariant, cursor: 'pointer', fontFamily: F.code, fontSize: '12px' }} onClick={onClear}>Resetar</button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '14px' }}>
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '10px', color: C.outline, marginBottom: '8px', fontWeight: 600, fontFamily: F.code, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>GASTO POR FERRAMENTA</div>
            {sortedTools.map(([tool, data]) => (
              <div key={tool} style={{ marginBottom: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ fontFamily: F.code, fontSize: '12px', color: C.primaryFixedDim }}>{tool}</span>
                  <span style={{ fontSize: '12px', color: C.outline, fontFamily: F.code }}>
                    <strong style={{ color: C.onSurface }}>{data.tokens.toLocaleString()}</strong>t · {data.calls}x
                    <span style={{ color: C.outlineVariant, marginLeft: '6px' }}>({Math.round((data.tokens / stats.totalTokens) * 100)}%)</span>
                  </span>
                </div>
                <div style={{ height: '4px', background: C.outlineVariant, borderRadius: '2px', overflow: 'hidden' as const }}>
                  <div style={{ width: `${(data.tokens / maxTokens) * 100}%`, height: '100%', background: C.primaryFixedDim, borderRadius: '2px', transition: 'width 0.3s' }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', padding: '10px', background: C.surfaceContainerLowest, borderRadius: '6px', fontSize: '12px', fontFamily: F.code }}>
            <div><span style={{ color: C.outline }}>Entrada: </span><strong style={{ color: C.secondary }}>{stats.totalInputTokens.toLocaleString()}</strong></div>
            <div><span style={{ color: C.outline }}>Saída: </span><strong style={{ color: C.tertiaryFixedDim }}>{stats.totalOutputTokens.toLocaleString()}</strong></div>
          </div>
          {stats.log.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', color: C.outline, marginBottom: '6px', fontWeight: 600, fontFamily: F.code, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>ÚLTIMAS CHAMADAS</div>
              {[...stats.log].reverse().slice(0, 8).map((entry, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', padding: '4px 0', borderBottom: `1px solid ${C.outlineVariant}`, fontSize: '11px', fontFamily: F.code }}>
                  <span style={{ color: C.outline, width: '56px', flexShrink: 0 }}>{new Date(entry.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  <span style={{ color: C.primaryFixedDim, flex: 1 }}>{entry.tool}</span>
                  <span style={{ color: C.onSurface, width: '80px', textAlign: 'right' as const }}>{entry.totalTokens.toLocaleString()}t</span>
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
  const [activeMode, setActiveMode] = useState<'crosstier' | 'manual' | 'git'>('crosstier');
  const [crossResult, setCrossResult] = useState<ImpactOfResponse | null>(null);

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

  const searchCrossTier = useCallback(async () => {
    if (!query.trim()) { setCrossResult(null); return; }
    setLoading(true);
    setCrossResult(null);
    const r = await window.ticAnalyzer.getImpactOf(projectPath, query.trim());
    setCrossResult(r);
    setLoading(false);
  }, [projectPath, query]);

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
    const lines: string[] = [`Git Diff — ${files.length} arquivo(s) modificado(s)`, '═'.repeat(50), ''];
    for (const file of files) {
      const entry = lookupEntry(file);
      lines.push(buildImpactText(file, entry));
      entry?.direct.forEach((f) => directImpact.add(f));
      entry?.transitive.forEach((f) => transitiveImpact.add(f));
    }
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

  const modeBtn = (id: 'crosstier' | 'manual' | 'git', label: string) => (
    <button
      onClick={() => setActiveMode(id)}
      style={{
        padding: '6px 14px',
        background: activeMode === id ? `${C.primaryFixedDim}18` : 'transparent',
        border: `1px solid ${activeMode === id ? C.primaryFixedDim : C.outlineVariant}`,
        borderRadius: '4px',
        color: activeMode === id ? C.primaryFixedDim : C.onSurfaceVariant,
        cursor: 'pointer',
        fontFamily: F.code,
        fontSize: '12px',
        fontWeight: activeMode === id ? 600 : 400,
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' as const, gap: '12px' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '20px', marginBottom: '4px', fontFamily: F.headline, color: C.onSurface }}>Análise de Impacto</div>
          <div style={{ fontSize: '13px', color: C.onSurfaceVariant }}>Descubra quais arquivos são afetados antes de fazer uma mudança</div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {modeBtn('crosstier', 'Cross-tier')}
          {modeBtn('manual', 'Arquivo')}
          {modeBtn('git', 'Git Diff')}
        </div>
      </div>

      {activeMode === 'crosstier' && (
        <div>
          <div style={{ fontSize: '12px', color: C.onSurfaceVariant, marginBottom: '12px', padding: '12px', background: C.surfaceContainerLowest, borderRadius: '6px', border: `1px solid ${C.outlineVariant}`, fontFamily: F.code, lineHeight: 1.6 }}>
            Impacto de QUALQUER entidade — arquivo, procedure PL/SQL (<code style={{ color: C.primaryFixedDim }}>PKG.PROC</code>), tabela (<code style={{ color: C.primaryFixedDim }}>CLIENTES</code>) ou coluna (<code style={{ color: C.primaryFixedDim }}>CLIENTES.CPF</code>) — atravessando React → Java → PL/SQL → banco.
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchCrossTier()}
              placeholder="PKG_CLIENTE.SALVAR · CLIENTES · CLIENTES.CPF · UserService.java"
              style={{ flex: 1, background: C.surfaceContainerLowest, border: `1px solid ${C.outlineVariant}`, borderRadius: '6px', padding: '10px 14px', color: C.onSurface, fontSize: '13px', fontFamily: F.code, outline: 'none' }} />
            <button style={{ padding: '10px 20px', background: C.primaryFixedDim, border: 'none', borderRadius: '6px', color: C.onPrimary, cursor: 'pointer', fontWeight: 600, fontSize: '13px', fontFamily: F.code }} onClick={searchCrossTier} disabled={loading}>{loading ? '...' : 'Analisar'}</button>
          </div>
          {crossResult?.error && <div style={{ color: C.error, fontSize: '13px', padding: '12px', background: `${C.errorContainer}44`, borderRadius: '6px', fontFamily: F.code }}>{crossResult.error}</div>}
          {crossResult?.impact && <CrossTierImpactView impact={crossResult.impact} blast={crossResult.blast} onSelect={(e) => { setQuery(e); }} />}
        </div>
      )}

      {activeMode === 'manual' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="src/api/user.ts ou user.service"
            style={{ flex: 1, background: C.surfaceContainerLowest, border: `1px solid ${C.outlineVariant}`, borderRadius: '6px', padding: '10px 14px', color: C.onSurface, fontSize: '13px', fontFamily: F.code, outline: 'none' }} />
          <button style={{ padding: '10px 20px', background: C.primaryFixedDim, border: 'none', borderRadius: '6px', color: C.onPrimary, cursor: 'pointer', fontWeight: 600, fontSize: '13px', fontFamily: F.code }} onClick={search} disabled={loading}>{loading ? '...' : 'Analisar'}</button>
        </div>
      )}

      {activeMode === 'git' && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', color: C.onSurfaceVariant, marginBottom: '12px', padding: '12px', background: C.surfaceContainerLowest, borderRadius: '6px', border: `1px solid ${C.outlineVariant}`, fontFamily: F.code, lineHeight: 1.6 }}>
            Lê <code style={{ color: C.primaryFixedDim }}>git diff HEAD</code> + <code style={{ color: C.primaryFixedDim }}>git diff --cached</code> no projeto analisado e calcula o impacto de todos os arquivos modificados de uma vez.
          </div>
          <button style={{ padding: '10px 20px', background: C.secondary, border: 'none', borderRadius: '6px', color: C.onSecondary, cursor: 'pointer', fontWeight: 600, fontSize: '13px', fontFamily: F.code }} onClick={analyzeGitDiff} disabled={diffLoading}>
            {diffLoading ? 'Lendo git diff...' : 'Analisar Mudanças Atuais (git diff)'}
          </button>
        </div>
      )}

      {result && (
        <div style={{ background: C.surfaceContainerLowest, borderRadius: '8px', padding: '16px', marginBottom: '16px', fontFamily: F.code, fontSize: '12px', color: C.onSurfaceVariant, whiteSpace: 'pre-wrap', maxHeight: '380px', overflowY: 'auto', lineHeight: 1.7, border: `1px solid ${C.outlineVariant}` }}>
          {result}
        </div>
      )}

      {activeMode === 'manual' && total > 0 && (
        <div>
          <div style={{ fontSize: '10px', color: C.outline, marginBottom: '12px', fontFamily: F.code, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>{total} arquivos com dependentes mapeados</div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: C.onSurfaceVariant, marginBottom: '8px', fontFamily: F.code }}>MAIOR IMPACTO TRANSITIVO</div>
          {topImpact.map(([file, entry]) => (
            <div key={file} onClick={() => { setQuery(file); setActiveMode('manual'); }}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: `1px solid ${C.outlineVariant}`, cursor: 'pointer' }}>
              <div style={{ flex: 1, fontFamily: F.code, fontSize: '12px', color: C.primaryFixedDim }}>{file}</div>
              <div style={{ fontSize: '12px', color: C.outline, fontFamily: F.code }}>
                direto: <strong style={{ color: C.secondary }}>{entry.directCount}</strong> &nbsp;|&nbsp;
                transitivo: <strong style={{ color: C.tertiaryFixedDim }}>{entry.transitiveCount}</strong>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CrossTierImpactView ────────────────────────────────────────────────────────
const KIND_COLORS: Record<string, string> = { file: C.primaryFixedDim, method: '#9d8cff', plsql: C.tertiaryFixedDim, table: C.secondary, column: '#4ecdc4' };
const KIND_LABELS: Record<string, string> = { file: 'arquivo', method: 'método', plsql: 'PL/SQL', table: 'tabela', column: 'coluna' };

function shortImpactId(id: string): string {
  const i = id.indexOf(':');
  return i >= 0 ? id.slice(i + 1) : id;
}

function CrossTierImpactView({ impact, blast, onSelect }: {
  impact: NonNullable<ImpactOfResponse['impact']>;
  blast?: ImpactOfResponse['blast'];
  onSelect: (entity: string) => void;
}) {
  const maxDepthShown = 6;
  const byDepth = useMemo(() => {
    const m = new Map<number, ImpactedNode[]>();
    for (const n of impact.affected) {
      const arr = m.get(n.depth) ?? [];
      arr.push(n);
      m.set(n.depth, arr);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [impact]);

  return (
    <div>
      <div style={{ display: 'flex', gap: '14px', alignItems: 'baseline', flexWrap: 'wrap' as const, marginBottom: '12px', padding: '12px', background: C.surfaceContainerLow, borderRadius: '8px', border: `1px solid ${C.outlineVariant}` }}>
        <span style={{ fontFamily: F.code, fontSize: '13px', color: C.primaryFixedDim }}>{impact.entity}</span>
        <strong style={{ color: C.onSurface, fontFamily: F.code, fontSize: '13px' }}>{impact.totalVisited} entidades afetadas{impact.truncated ? ' (truncado em 2000)' : ''}</strong>
        {Object.entries(impact.byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
          <span key={k} style={{ fontSize: '11px', color: KIND_COLORS[k] ?? C.outline, fontFamily: F.code }}>● {KIND_LABELS[k] ?? k}: {v}</span>
        ))}
      </div>
      {Object.keys(impact.byModule).length > 0 && (
        <div style={{ fontSize: '12px', color: C.outline, marginBottom: '12px', fontFamily: F.code }}>
          Módulos: {Object.entries(impact.byModule).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([m, c]) => `${m} (${c})`).join(' · ')}
        </div>
      )}
      {blast && blast.top.length > 0 && (
        <div style={{ marginBottom: '16px', background: C.surfaceContainerLow, borderRadius: '8px', border: `1px solid ${C.outlineVariant}`, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.outlineVariant}`, fontSize: '10px', color: C.outline, fontFamily: F.code, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>MAIS CRÍTICOS (por nº de dependentes)</div>
          {blast.top.slice(0, 8).map((t) => (
            <div key={t.id} onClick={() => onSelect(t.id)} style={{ display: 'flex', gap: '10px', padding: '8px 14px', borderBottom: `1px solid ${C.outlineVariant}`, fontSize: '12px', cursor: 'pointer' }}>
              <span style={{ color: KIND_COLORS[t.kind] ?? C.outline, width: '58px', flexShrink: 0, fontFamily: F.code }}>{KIND_LABELS[t.kind] ?? t.kind}</span>
              <span style={{ fontFamily: F.code, color: C.onSurface, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{shortImpactId(t.id)}</span>
              <span style={{ color: C.tertiaryFixedDim, width: '110px', textAlign: 'right' as const, fontFamily: F.code }}>{t.dependents} dep.</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ maxHeight: '320px', overflowY: 'auto' as const }}>
        {byDepth.slice(0, maxDepthShown).map(([depth, nodes]) => (
          <div key={depth} style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: C.outline, marginBottom: '6px', fontFamily: F.code, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>{depth} SALTO(S)</div>
            {nodes.slice(0, 25).map((n) => (
              <div key={n.id} onClick={() => onSelect(n.id)} style={{ display: 'flex', gap: '8px', padding: '4px 0', fontSize: '12px', cursor: 'pointer' }}>
                <span title={n.confidence === 'inferred' ? 'heurístico' : 'resolvido por AST/SQL'}>{n.confidence === 'inferred' ? '🟡' : '🟢'}</span>
                <span style={{ color: KIND_COLORS[n.kind] ?? C.outline, width: '58px', flexShrink: 0, fontFamily: F.code }}>{KIND_LABELS[n.kind] ?? n.kind}</span>
                <span style={{ fontFamily: F.code, color: C.onSurface, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{shortImpactId(n.id)}</span>
                {n.module && <span style={{ color: C.outline, fontFamily: F.code }}>{n.module}</span>}
              </div>
            ))}
            {nodes.length > 25 && <div style={{ fontSize: '11px', color: C.outline, fontFamily: F.code }}>... e mais {nodes.length - 25} nesta profundidade</div>}
          </div>
        ))}
      </div>
      {impact.candidates && impact.candidates.length > 0 && (
        <div style={{ fontSize: '11px', color: C.outline, marginTop: '8px', fontFamily: F.code }}>
          Outras entidades com esse nome: {impact.candidates.map((c) => (
            <span key={c} onClick={() => onSelect(c)} style={{ color: C.primaryFixedDim, cursor: 'pointer', marginRight: '8px' }}>{shortImpactId(c)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── MetricsTab ─────────────────────────────────────────────────────────────────
function MetricsTab({ ticCodeDir }: { ticCodeDir: string }) {
  const [content, setContent] = useState('');

  useEffect(() => {
    window.ticAnalyzer.readFile(`${ticCodeDir}/metrics-summary.md`).then((c) => {
      setContent(c ?? 'Métricas não encontradas. Execute a análise novamente.');
    });
  }, [ticCodeDir]);

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontWeight: 600, fontSize: '20px', marginBottom: '4px', fontFamily: F.headline, color: C.onSurface }}>Métricas de Qualidade</div>
        <div style={{ fontSize: '13px', color: C.onSurfaceVariant }}>Complexidade Ciclomática · Dívida Técnica · Hotspots · Violações</div>
      </div>
      <div style={{ background: C.surfaceContainerLowest, borderRadius: '8px', padding: '16px', maxHeight: '600px', overflowY: 'auto', fontFamily: F.code, fontSize: '12px', color: C.onSurfaceVariant, whiteSpace: 'pre-wrap', lineHeight: 1.7, border: `1px solid ${C.outlineVariant}` }}>
        {content}
      </div>
    </div>
  );
}

// ── DocsTab ───────────────────────────────────────────────────────────────────
function CodeBlock({ children }: { children: string }) {
  return (
    <pre style={{ background: C.surfaceContainerLowest, border: `1px solid ${C.outlineVariant}`, borderRadius: '6px', padding: '12px 16px', fontSize: '12px', color: C.onSurface, overflowX: 'auto', margin: '8px 0', fontFamily: F.code, lineHeight: 1.6 }}>
      {children}
    </pre>
  );
}

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{ fontSize: '16px', fontWeight: 600, color: C.primaryFixedDim, borderBottom: `1px solid ${C.outlineVariant}`, paddingBottom: '8px', marginBottom: '14px', fontFamily: F.headline }}>{title}</div>
      {children}
    </div>
  );
}

function DocStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '14px', marginBottom: '14px' }}>
      <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: C.primaryFixedDim, color: C.onPrimary, fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px', fontFamily: F.headline }}>{n}</div>
      <div>
        <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', fontFamily: F.headline, color: C.onSurface }}>{title}</div>
        <div style={{ fontSize: '13px', color: C.onSurfaceVariant, lineHeight: 1.7 }}>{children}</div>
      </div>
    </div>
  );
}

function DocTag({ color = C.primaryFixedDim, children }: { color?: string; children: string }) {
  return <span style={{ display: 'inline-block', padding: '2px 8px', background: color + '22', border: `1px solid ${color}55`, borderRadius: '4px', fontSize: '11px', color, fontFamily: F.code, marginRight: '4px' }}>{children}</span>;
}

function DocsTab() {
  const [section, setSection] = useState<'inicio' | 'claude' | 'copilot' | 'abas' | 'ferramentas' | 'arquivos' | 'cli'>('inicio');

  const NAV = [
    { id: 'inicio', label: 'Primeiros Passos', icon: 'rocket_launch' },
    { id: 'claude', label: 'Claude Code', icon: 'smart_toy' },
    { id: 'copilot', label: 'VS Code / Copilot', icon: 'code' },
    { id: 'abas', label: 'Abas do App', icon: 'dashboard' },
    { id: 'ferramentas', label: 'Ferramentas MCP', icon: 'build' },
    { id: 'arquivos', label: 'Arquivos Gerados', icon: 'folder' },
    { id: 'cli', label: 'CLI / CI-CD', icon: 'terminal' },
  ] as const;

  return (
    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
      <div style={{ width: '180px', flexShrink: 0, position: 'sticky', top: '0' }}>
        {NAV.map((n) => (
          <button key={n.id} onClick={() => setSection(n.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: '2px', background: section === n.id ? `${C.primaryFixedDim}18` : 'transparent', border: `1px solid ${section === n.id ? C.primaryFixedDim : C.outlineVariant}`, borderRadius: '6px', color: section === n.id ? C.primaryFixedDim : C.onSurfaceVariant, cursor: 'pointer', fontSize: '13px', fontWeight: section === n.id ? 600 : 400, fontFamily: F.body, transition: 'all 0.15s' }}>
            <Icon name={n.icon} size={16} color={section === n.id ? C.primaryFixedDim : C.outline} />
            {n.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {section === 'inicio' && (
          <div>
            <DocSection title="O que é o TIC Analyzer?">
              <p style={{ fontSize: '14px', color: C.onSurfaceVariant, lineHeight: 1.8, margin: '0 0 12px 0' }}>
                Motor de engenharia reversa local para projetos grandes. Escaneia código, mapeia dependências, endpoints, chamadas de banco, métricas de qualidade e muito mais — tudo <strong style={{ color: C.secondary }}>sem enviar nenhuma linha de código para a internet</strong> e sem gastar nenhum token de IA.
              </p>
            </DocSection>
            <DocSection title="Como analisar um projeto">
              <DocStep n={1} title="Selecione a pasta raiz do projeto">Clique em <strong>Selecionar</strong> e escolha a pasta raiz. <span style={{ color: C.error }}>Não selecione a pasta <DocTag color={C.error}>.tic-code</DocTag> — sempre a pasta pai.</span></DocStep>
              <DocStep n={2} title="Clique em Analisar">O progresso aparece em tempo real com 25 fases. A partir da segunda análise, o cache incremental acelera os módulos não alterados.</DocStep>
              <DocStep n={3} title="Explore os resultados">Após a análise, todas as abas ficam disponíveis. Uma pasta <DocTag>.tic-code/</DocTag> é criada com todos os artefatos.</DocStep>
              <DocStep n={4} title="(Opcional) Configure a IA">Para Claude Code: ative o MCP Server e configure <DocTag>.claude/settings.json</DocTag>. Para GitHub Copilot: o <DocTag>copilot-instructions.md</DocTag> já foi gerado.</DocStep>
            </DocSection>
            <DocSection title="Linguagens suportadas">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {['TypeScript','JavaScript','Java','Kotlin','Python','Go','Rust','C#','PHP','Ruby','PL/SQL','SQL','HTML','CSS','SCSS'].map((l) => (
                  <DocTag key={l} color={C.secondary}>{l}</DocTag>
                ))}
              </div>
            </DocSection>
          </div>
        )}

        {section === 'claude' && (
          <div>
            <DocSection title="Como funciona com o Claude Code">
              <p style={{ fontSize: '14px', color: C.onSurfaceVariant, lineHeight: 1.8, margin: '0 0 8px 0' }}>
                O Claude Code usa MCP para chamar as ferramentas do TIC Analyzer sob demanda. Ele lê o <DocTag>CLAUDE.md</DocTag> gerado e já consulta <DocTag>get_quick_context()</DocTag> sozinho antes de responder qualquer pergunta sobre o projeto.
              </p>
            </DocSection>
            <DocSection title="Configuração">
              <DocStep n={1} title="Rode a análise">Clique em <strong>Analisar</strong>. O arquivo <DocTag>CLAUDE.md</DocTag> é gerado automaticamente.</DocStep>
              <DocStep n={2} title="Inicie o MCP Server">Na aba <DocTag>Visão Geral</DocTag>, clique em <strong>Iniciar MCP</strong>. Sobe em <DocTag>localhost:7432</DocTag>.</DocStep>
              <DocStep n={3} title="Crie .claude/settings.json">
                <CodeBlock>{`{\n  "mcpServers": {\n    "tic-analyzer": {\n      "url": "http://localhost:7432/mcp"\n    }\n  }\n}`}</CodeBlock>
              </DocStep>
              <DocStep n={4} title="Teste no Claude Code">
                <CodeBlock>{`claude\n/mcp\n# → tic-analyzer  connected  19 tools`}</CodeBlock>
              </DocStep>
            </DocSection>
          </div>
        )}

        {section === 'copilot' && (
          <div>
            <DocSection title="Dois modos">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
                <div style={{ padding: '14px', background: C.surfaceContainerLow, borderRadius: '8px', border: `1px solid ${C.secondary}44` }}>
                  <div style={{ fontWeight: 700, color: C.secondary, marginBottom: '6px', fontSize: '14px', fontFamily: F.headline }}>Modo Básico</div>
                  <div style={{ fontSize: '13px', color: C.onSurfaceVariant, lineHeight: 1.8 }}>Qualquer versão do VS Code.<br />Copilot lê <DocTag color={C.secondary}>copilot-instructions.md</DocTag> automaticamente.</div>
                </div>
                <div style={{ padding: '14px', background: C.surfaceContainerLow, borderRadius: '8px', border: `1px solid ${C.primaryFixedDim}44` }}>
                  <div style={{ fontWeight: 700, color: C.primaryFixedDim, marginBottom: '6px', fontSize: '14px', fontFamily: F.headline }}>Modo MCP (VS Code 1.99+)</div>
                  <div style={{ fontSize: '13px', color: C.onSurfaceVariant, lineHeight: 1.8 }}>Acesso às 19 ferramentas.<br />Requer configurar <DocTag>.vscode/mcp.json</DocTag>.</div>
                </div>
              </div>
            </DocSection>
            <DocSection title="Configuração MCP">
              <CodeBlock>{`// .vscode/mcp.json\n{\n  "servers": {\n    "tic-analyzer": {\n      "type": "sse",\n      "url": "http://localhost:7432/mcp"\n    }\n  }\n}`}</CodeBlock>
            </DocSection>
          </div>
        )}

        {section === 'abas' && (
          <div>
            {[
              { name: 'Visão Geral', desc: 'Resumo dos resultados: total de arquivos, linhas, módulos, hotspots, violações arquiteturais. Também é onde você inicia e para o MCP Server.', dica: 'O contador de Hotspots e Violações em vermelho indica onde focar a atenção.' },
              { name: 'Saúde', desc: 'Health score 0–100 (grade A–E) com gauge, penalidades por dimensão e gráfico de tendência entre análises.', dica: 'Rode análises periódicas — a linha de tendência mostra se o projeto está melhorando ou piorando.' },
              { name: 'Governança', desc: 'KPIs de engenharia, fila de triagem com máquina de estados, compliance das regras .tic-rules.json e histórico de PRs.', dica: 'Riscos critical/high viram itens de triagem automaticamente — use get_agent_brief(id) via MCP.' },
              { name: 'Valor', desc: 'Custo da dívida técnica em dinheiro, dev-days, ownership/bus-factor e risco de conhecimento.', dica: 'Bus-factor 1 ⚠️ = se a pessoa sair, o conhecimento vai junto.' },
              { name: 'Atividade', desc: 'Linha do tempo do que mudou a cada análise: health, riscos, regras, módulos, predições. Atualiza ao vivo.', dica: 'Ligue "Ao Vivo" no topo: o app re-analisa sozinho ao salvar um arquivo.' },
              { name: 'Explorador', desc: 'Drill-down hierárquico: aplicação → camadas → módulos → arquivos → símbolos. Duplo-clique expande.', dica: 'Verde = dependência resolvida por AST; âmbar = heurística.' },
              { name: 'Impacto', desc: 'Cross-tier (qualquer entidade), Arquivo (dependentes por imports) e Git Diff (impacto de tudo que mudou).', dica: 'Use Git Diff antes de commitar.' },
              { name: 'Métricas', desc: 'Complexidade ciclomática, debt score, hotspots e violações arquiteturais.', dica: 'Arquivos com complexidade > 30 🔴 merecem refatoração.' },
            ].map((tab) => (
              <div key={tab.name} style={{ marginBottom: '12px', padding: '16px', background: C.surfaceContainerLow, borderRadius: '8px', border: `1px solid ${C.outlineVariant}` }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: C.primaryFixedDim, marginBottom: '6px', fontFamily: F.headline }}>{tab.name}</div>
                <div style={{ fontSize: '13px', color: C.onSurfaceVariant, lineHeight: 1.7, marginBottom: '8px' }}>{tab.desc}</div>
                <div style={{ fontSize: '12px', color: C.secondary, fontFamily: F.code }}>Dica: {tab.dica}</div>
              </div>
            ))}
          </div>
        )}

        {section === 'ferramentas' && (
          <div>
            <p style={{ fontSize: '14px', color: C.onSurfaceVariant, lineHeight: 1.8, margin: '0 0 16px 0' }}>
              Com o MCP Server ativo, o Claude Code pode chamar estas ferramentas. Cada uma retorna apenas o necessário — de ~200 a ~75k tokens dependendo do escopo.
            </p>
            {[
              { tool: 'get_quick_context()', tokens: '~12k', desc: 'Visão geral compacta: stack, módulos, riscos, top endpoints. Use como ponto de partida.' },
              { tool: 'get_blast_radius("entidade")', tokens: '~200', desc: 'Resumo ULTRA-COMPACTO do impacto de qualquer entidade. Use PRIMEIRO, antes de tudo.' },
              { tool: 'get_impact_of("entidade")', tokens: '~600', desc: 'Impacto cross-tier detalhado, agrupado por profundidade e módulo.' },
              { tool: 'get_table_impact("TABELA")', tokens: '~300', desc: 'Quem é afetado por mudar uma tabela ou coluna do banco.' },
              { tool: 'get_diff_impact()', tokens: '~300', desc: 'Lê git diff e retorna o impacto consolidado de todas as mudanças. Use antes de commitar.' },
              { tool: 'get_health()', tokens: '~200', desc: 'Health score atual com breakdown por dimensão e delta vs análise anterior.' },
              { tool: 'get_roi()', tokens: '~250', desc: 'Custo da dívida em tempo e dinheiro, horas economizadas, top módulos por custo.' },
              { tool: 'get_agent_brief("entidade")', tokens: '~600', desc: 'AGENT-BRIEF completo — Category, Summary, Behavior, Interfaces, Criteria, Scope.' },
              { tool: 'get_risk_prediction()', tokens: '~300', desc: 'Onde o próximo bug tende a nascer (churn × complexidade × acoplamento).' },
              { tool: 'list_modules()', tokens: '~2k', desc: 'Lista todos os módulos detectados com contagem de arquivos.' },
              { tool: 'get_module("nome")', tokens: '~75k', desc: 'Contexto completo de um módulo: arquivos, código, dependências, riscos, endpoints.' },
              { tool: 'get_arch_rules()', tokens: '~300', desc: 'Regras do .tic-rules.json com status de compliance e violações.' },
              { tool: 'list_triage(state)', tokens: '~300', desc: 'Fila de triagem com estado (needs-triage, ready-for-agent...) e prioridade.' },
              { tool: 'update_triage(id, state)', tokens: '~50', desc: 'Transiciona um item da fila de triagem.' },
              { tool: 'trace_flow("entidade")', tokens: '~1.5k', desc: 'Cadeia ininterrupta: tela → endpoint → service → procedure → tabela.' },
              { tool: 'search_code("query")', tokens: '~500', desc: 'Busca semântica no índice de código.' },
              { tool: 'get_metrics("módulo")', tokens: '~500', desc: 'Complexidade ciclomática, debt score e hotspots de um módulo.' },
              { tool: 'get_hotspots()', tokens: '~1k', desc: 'Top arquivos com maior dívida técnica (alta complexidade + alto acoplamento).' },
              { tool: 'get_violations()', tokens: '~1k', desc: 'Violações arquiteturais: dependências circulares, UI acessando BD direto.' },
            ].map((t) => (
              <div key={t.tool} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: `1px solid ${C.outlineVariant}` }}>
                <div style={{ minWidth: '230px', flexShrink: 0 }}>
                  <DocTag>{t.tool}</DocTag>
                  <span style={{ fontSize: '10px', color: C.outline, marginLeft: '4px', fontFamily: F.code }}>{t.tokens}</span>
                </div>
                <div style={{ fontSize: '13px', color: C.onSurfaceVariant, lineHeight: 1.6 }}>{t.desc}</div>
              </div>
            ))}
          </div>
        )}

        {section === 'arquivos' && (
          <div>
            <p style={{ fontSize: '14px', color: C.onSurfaceVariant, lineHeight: 1.8, margin: '0 0 16px 0' }}>
              Após a análise, a pasta <DocTag color={C.secondary}>.tic-code/</DocTag> é criada dentro do projeto com os seguintes artefatos.
            </p>
            {[
              { file: 'quick-context.md', tokens: '~12k', desc: 'Resumo geral do projeto. Ponto de partida para qualquer IA.' },
              { file: 'index.md', tokens: '~2k', desc: 'Mapa de navegação com links para todos os módulos.' },
              { file: 'impact-index.json', tokens: 'JSON', desc: 'Índice de impacto por arquivo (direto + transitivo).' },
              { file: 'index.db', tokens: 'SQLite', desc: 'Fonte de verdade: grafo completo, símbolos, impacto cross-tier, FTS5.' },
              { file: 'snapshots.json', tokens: 'JSON', desc: 'Histórico de health score entre análises.' },
              { file: 'triage.json', tokens: 'JSON', desc: 'Fila de triagem com máquina de estados.' },
              { file: 'arch-violations.json', tokens: 'JSON', desc: 'Regras + violações + decisões out-of-scope.' },
              { file: 'risk-prediction.json', tokens: 'JSON', desc: 'Predição de risco por arquivo (churn × complexidade × acoplamento).' },
              { file: 'pr-history.json', tokens: 'JSON', desc: 'Histórico de PR reviews (blast radius, riscos, gates).' },
              { file: 'roi.json', tokens: 'JSON', desc: 'Custo da dívida em tempo/dinheiro e horas economizadas.' },
              { file: 'ownership.json', tokens: 'JSON', desc: 'Ownership por módulo, bus-factor e dificuldade de onboarding.' },
              { file: 'activity.json', tokens: 'JSON', desc: 'Linha do tempo de atividade (sistema vivo).' },
              { file: 'metrics-summary.md', tokens: '~2k', desc: 'Top hotspots, complexidade por módulo, debt score e violações.' },
              { file: 'modules/{nome}/context.md', tokens: '~75k', desc: 'Contexto completo de cada módulo.' },
              { file: 'analysis.json', tokens: 'JSON', desc: 'Exportação estruturada completa para CI/CD e ferramentas externas.' },
              { file: 'file-cache.json', tokens: 'JSON', desc: 'Cache de mtimes para análise incremental.' },
            ].map((f) => (
              <div key={f.file} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: `1px solid ${C.outlineVariant}` }}>
                <div style={{ minWidth: '240px', flexShrink: 0 }}>
                  <DocTag color={C.secondary}>{f.file}</DocTag>
                  <span style={{ fontSize: '10px', color: C.outline, display: 'block', marginTop: '3px', paddingLeft: '4px', fontFamily: F.code }}>{f.tokens}</span>
                </div>
                <div style={{ fontSize: '13px', color: C.onSurfaceVariant, lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        )}

        {section === 'cli' && (
          <div>
            <DocSection title="Usar sem interface gráfica">
              <CodeBlock>{`# Roda a pipeline completa no projeto\nnode dist/cli.js /caminho/do/projeto\n\n# Com ts-node (dev)\nnpx ts-node src/cli.ts /caminho/do/projeto`}</CodeBlock>
            </DocSection>
            <DocSection title="GitHub Actions">
              <CodeBlock>{`# .github/workflows/tic-analyze.yml\nname: TIC Analyzer\non:\n  push:\n    branches: [main]\njobs:\n  analyze:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '20'\n      - run: |\n          git clone https://github.com/LeonardoForbici/tic-coder-lite tic\n          cd tic && npm install\n          node dist/cli.js $GITHUB_WORKSPACE`}</CodeBlock>
            </DocSection>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SideNav ───────────────────────────────────────────────────────────────────
const NAV_ITEMS: Array<{ id: Tab; label: string; icon: string; requiresDone?: boolean }> = [
  { id: 'overview',    label: 'Visão Geral',  icon: 'dashboard' },
  { id: 'health',      label: 'Saúde',        icon: 'health_metrics',    requiresDone: true },
  { id: 'value',       label: 'Valor',        icon: 'payments',          requiresDone: true },
  { id: 'governance',  label: 'Governança',   icon: 'account_balance',   requiresDone: true },
  { id: 'activity',    label: 'Atividade',    icon: 'history',           requiresDone: true },
  { id: 'explorer',    label: 'Explorador',   icon: 'explore',           requiresDone: true },
  { id: 'search',      label: 'Busca',        icon: 'search',            requiresDone: true },
  { id: 'memory',      label: 'Memória',      icon: 'neurology',         requiresDone: true },
  { id: 'impact',      label: 'Impacto',      icon: 'emergency_home',    requiresDone: true },
  { id: 'metrics',     label: 'Métricas',     icon: 'analytics',         requiresDone: true },
  { id: 'files',       label: 'Arquivos',     icon: 'folder',            requiresDone: true },
  { id: 'portfolio',   label: 'Portfólio',    icon: 'inventory_2' },
  { id: 'docs',        label: 'Docs',         icon: 'help' },
  { id: 'http',        label: 'HTTP',         icon: 'http',              requiresDone: true },
];

function SideNav({ activeTab, onTabChange, isDone }: {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
  isDone: boolean;
}) {
  return (
    <nav style={{
      position: 'fixed',
      left: 0,
      top: 0,
      width: '256px',
      height: '100vh',
      background: C.bg,
      borderRight: `1px solid ${C.outlineVariant}`,
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 0',
      zIndex: 50,
      overflowY: 'auto',
    }}>
      {/* Logo */}
      <div style={{ padding: '8px 24px 24px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: C.surfaceContainerHigh, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.outlineVariant}` }}>
            <Icon name="architecture" size={18} color={C.primaryFixedDim} fill={1} />
          </div>
          <span style={{ fontFamily: F.headline, fontSize: '18px', fontWeight: 700, color: C.primary }}>TIC Analyzer</span>
        </div>
        <span style={{ fontFamily: F.code, fontSize: '11px', color: C.onSurfaceVariant, paddingLeft: '42px' }}>V2.4.0-Stable</span>
      </div>

      {/* Nav Items */}
      <div style={{ flex: 1, padding: '0 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          const isDisabled = item.requiresDone && !isDone;
          return (
            <button
              key={item.id}
              onClick={() => !isDisabled && onTabChange(item.id)}
              disabled={isDisabled}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 16px',
                borderRadius: '6px',
                background: isActive ? `${C.primaryFixedDim}18` : 'transparent',
                border: isActive ? `1px solid ${C.primaryFixedDim}40` : '1px solid transparent',
                borderRight: isActive ? `2px solid ${C.primaryFixedDim}` : '2px solid transparent',
                color: isActive ? C.primaryFixedDim : isDisabled ? C.outlineVariant : C.onSurfaceVariant,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                fontFamily: F.body,
                fontSize: '14px',
                fontWeight: isActive ? 600 : 400,
                textAlign: 'left',
                transition: 'all 0.15s',
                opacity: isDisabled ? 0.4 : 1,
              }}
            >
              <Icon
                name={item.icon}
                size={20}
                color={isActive ? C.primaryFixedDim : isDisabled ? C.outlineVariant : C.onSurfaceVariant}
                fill={isActive ? 1 : 0}
              />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Bottom user area */}
      <div style={{ padding: '16px 24px', borderTop: `1px solid ${C.outlineVariant}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="person" size={16} color={C.onSurfaceVariant} />
        </div>
        <div>
          <div style={{ fontFamily: F.code, fontSize: '12px', color: C.onSurface, fontWeight: 500 }}>Admin</div>
          <div style={{ fontFamily: F.code, fontSize: '10px', color: C.outline }}>Local Engine</div>
        </div>
      </div>
    </nav>
  );
}

// ── TopBar ────────────────────────────────────────────────────────────────────
function TopBar({ projectPath, mcpRunning, liveMode, liveStatus, onToggleLive, onToggleMcp, isDone }: {
  projectPath: string;
  mcpRunning: boolean;
  liveMode: boolean;
  liveStatus: { analyzing: boolean; lastRun?: string; runs: number };
  onToggleLive: () => void;
  onToggleMcp: () => void;
  isDone: boolean;
}) {
  const projectName = projectPath ? projectPath.split(/[\\/]/).filter(Boolean).pop() ?? projectPath : null;

  return (
    <header style={{
      position: 'fixed',
      top: 0,
      right: 0,
      left: '256px',
      height: '64px',
      background: `${C.bg}cc`,
      backdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${C.outlineVariant}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      zIndex: 40,
    }}>
      {/* Left: project context */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {projectName && (
          <>
            <span style={{ fontFamily: F.headline, fontSize: '20px', fontWeight: 700, color: C.primary }}>{projectName}</span>
            {isDone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.secondary, animation: liveMode ? 'pulse 1.5s infinite' : 'none' }} />
                <span style={{ fontFamily: F.code, fontSize: '11px', color: C.onSurfaceVariant, letterSpacing: '0.04em' }}>
                  {liveMode ? (liveStatus.analyzing ? 'Analisando...' : 'Ao Vivo') : 'MCP Online'}
                </span>
              </div>
            )}
          </>
        )}
        {!projectName && (
          <span style={{ fontFamily: F.headline, fontSize: '18px', fontWeight: 600, color: C.onSurfaceVariant }}>Selecione um projeto</span>
        )}
      </div>

      {/* Right: actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {isDone && (
          <button
            onClick={onToggleLive}
            title="Re-analisa sozinho ~15s depois que você salva um arquivo"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              background: liveMode ? `${C.secondary}22` : 'transparent',
              border: `1px solid ${liveMode ? C.secondary : C.outlineVariant}`,
              borderRadius: '6px',
              color: liveMode ? C.secondary : C.onSurfaceVariant,
              cursor: 'pointer',
              fontFamily: F.code,
              fontSize: '12px',
              fontWeight: liveMode ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: liveMode ? C.secondary : C.outline, animation: liveMode ? 'pulse 1.5s infinite' : 'none', flexShrink: 0 }} />
            Ao Vivo
          </button>
        )}
        {[
          { icon: 'sensors', title: 'MCP Status', onClick: onToggleMcp, active: mcpRunning },
          { icon: 'settings', title: 'Configurações', onClick: () => {}, active: false },
        ].map((btn) => (
          <button
            key={btn.icon}
            onClick={btn.onClick}
            title={btn.title}
            style={{
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: btn.active ? `${C.primaryFixedDim}18` : 'transparent',
              border: `1px solid ${btn.active ? C.primaryFixedDim : 'transparent'}`,
              borderRadius: '6px',
              cursor: 'pointer',
              color: btn.active ? C.primaryFixedDim : C.onSurfaceVariant,
              transition: 'all 0.15s',
            }}
          >
            <Icon name={btn.icon} size={20} color={btn.active ? C.primaryFixedDim : C.onSurfaceVariant} />
          </button>
        ))}
      </div>
    </header>
  );
}

// ── KPI card helper ───────────────────────────────────────────────────────────
function KpiCard({ label, value, color, icon, sub }: { label: string; value: string | number; color: string; icon: string; sub?: string }) {
  return (
    <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: '8px', padding: '16px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '3px', height: '100%', background: color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', paddingLeft: '8px' }}>
        <span style={{ fontFamily: F.code, fontSize: '10px', color: C.onSurfaceVariant, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{label}</span>
        <Icon name={icon} size={16} color={color} />
      </div>
      <div style={{ paddingLeft: '8px' }}>
        <div style={{ fontFamily: F.headline, fontSize: '28px', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontFamily: F.code, fontSize: '11px', color: C.outline, marginTop: '4px' }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Spider Chart (6-axis radar) ───────────────────────────────────────────────
function SpiderChart({ dims }: { dims: Array<{ label: string; value: number; color: string }> }) {
  const cx = 50, cy = 50, r = 38;
  const n = dims.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, frac: number) => ({
    x: cx + r * frac * Math.cos(angle(i)),
    y: cy + r * frac * Math.sin(angle(i)),
  });
  const gridLevels = [0.25, 0.5, 0.75, 1];
  const dataPoints = dims.map((d, i) => pt(i, Math.max(0.05, d.value / 100)));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z';

  return (
    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
      {/* Grid */}
      {gridLevels.map((lvl) => {
        const pts = dims.map((_, i) => pt(i, lvl));
        return <polygon key={lvl} points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke={C.outlineVariant} strokeWidth={0.4} opacity={0.6} />;
      })}
      {/* Axes */}
      {dims.map((_, i) => {
        const end = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke={C.outlineVariant} strokeWidth={0.4} opacity={0.5} />;
      })}
      {/* Data fill */}
      <path d={dataPath} fill={C.secondary} fillOpacity={0.12} stroke={C.secondary} strokeWidth={1.2} />
      {/* Points */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={1.8} fill={dims[i].color} />
      ))}
      {/* Labels */}
      {dims.map((d, i) => {
        const lp = pt(i, 1.28);
        return (
          <text key={i} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle"
            fontSize={5.5} fill={C.outline} fontFamily="'JetBrains Mono', monospace"
            letterSpacing="0.04em">{d.label.toUpperCase()}</text>
        );
      })}
    </svg>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ result, mcpRunning, mcpPort, tokenStats, onToggleMcp, onOpenFolder, prHistory, liveEvents }: {
  result: AnalysisResult;
  mcpRunning: boolean;
  mcpPort: number;
  tokenStats: TokenStats | null;
  onToggleMcp: () => void;
  onOpenFolder: () => void;
  prHistory: Array<{ date: string; changedFiles: number; totalImpacted: number; newRisks: number; newRuleViolations: number; healthDelta: number | null; gateFailed: boolean }>;
  liveEvents: ActivityEvent[];
}) {
  const score = result.healthScore ?? 0;
  const grade = result.healthGrade ?? '—';
  const scoreColor = score >= 75 ? C.secondary : score >= 60 ? C.tertiaryFixedDim : C.error;

  const spiderDims = [
    { label: 'Debt', value: Math.max(0, 100 - result.hotspots * 2), color: C.tertiaryFixedDim },
    { label: 'Risk', value: Math.max(0, 100 - (result.violations ?? 0) * 5), color: C.primaryFixedDim },
    { label: 'Drift', value: Math.max(0, 100 - (result.violations ?? 0) * 3), color: C.secondary },
    { label: 'Dead Code', value: Math.max(0, 100 - (result.deadComponents ?? 0) * 10), color: C.primaryFixed },
    { label: 'Coupling', value: Math.max(0, 100 - result.hotspots), color: C.tertiaryFixedDim },
    { label: 'Heuristics', value: Math.min(100, (result.patterns ?? 0) * 5 + 60), color: C.secondary },
  ];

  const sideStats = [
    { label: 'Architecture Drifts', value: String(result.violations ?? 0), color: C.tertiaryFixed, icon: 'route', borderColor: `${C.tertiaryFixed}50` },
    { label: 'Critical Risks', value: String(result.hotspots), color: C.error, icon: 'warning', borderColor: `${C.error}80`, bg: `${C.error}08` },
    { label: 'Impact Edges', value: (result.impactEdges ?? 0).toLocaleString(), color: C.primaryFixedDim, icon: 'hub', borderColor: `${C.primaryFixedDim}30` },
  ];

  const recentEvents = [...liveEvents].reverse().slice(0, 8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Context header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.secondary, display: 'inline-block', animation: 'pulse 2s infinite' }} />
          <span style={{ fontFamily: F.code, fontSize: 11, color: C.onSurfaceVariant, letterSpacing: '0.04em' }}>
            {mcpRunning ? `MCP Online — localhost:${mcpPort}` : 'MCP Parado'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h2 style={{ fontSize: 32, fontWeight: 700, fontFamily: F.headline, color: C.primary, margin: 0, lineHeight: 1 }}>
              {result.totalFiles.toLocaleString()} arquivos
            </h2>
            <span style={{ fontFamily: F.code, fontSize: 13, color: C.outline }}>
              {result.totalLines.toLocaleString()} linhas · {result.modulesGenerated} módulos
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onToggleMcp}
              style={{ padding: '8px 16px', border: `1px solid ${mcpRunning ? C.error : C.primaryFixedDim}`,
                background: 'transparent', borderRadius: 6, color: mcpRunning ? C.error : C.primaryFixedDim,
                cursor: 'pointer', fontFamily: F.code, fontSize: 12, fontWeight: 600 }}>
              {mcpRunning ? 'Parar MCP' : 'Iniciar MCP'}
            </button>
            <button onClick={onOpenFolder}
              style={{ padding: '8px 16px', border: `1px solid ${C.outlineVariant}`, background: 'transparent',
                borderRadius: 6, color: C.onSurface, cursor: 'pointer', fontFamily: F.code, fontSize: 12 }}>
              Abrir .tic-code
            </button>
          </div>
        </div>
      </div>

      {/* Bento grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        {/* Hero widget: grade + spider chart */}
        <div style={{ background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}`, borderRadius: 8,
          padding: 24, position: 'relative', overflow: 'hidden', display: 'flex', gap: 24, alignItems: 'center' }}>
          {/* Hex-grid ambient bg */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.03, backgroundImage:
            'repeating-linear-gradient(60deg, transparent, transparent 20px, #dae2fd 20px, #dae2fd 21px)',
            pointerEvents: 'none' }} />
          <div style={{ flex: 1, zIndex: 1 }}>
            <span style={{ fontFamily: F.code, fontSize: 10, color: C.outline, letterSpacing: '0.1em',
              textTransform: 'uppercase' as const, display: 'block', marginBottom: 8 }}>System Health Index</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 80, lineHeight: 1, fontWeight: 700, fontFamily: F.headline, color: scoreColor,
                filter: `drop-shadow(0 0 15px ${scoreColor}50)` }}>{grade}</span>
              <span style={{ fontFamily: F.headline, fontSize: 20, color: C.onSurfaceVariant }}>{score}/100</span>
            </div>
            <p style={{ fontFamily: F.body, fontSize: 13, color: C.onSurfaceVariant, maxWidth: 280, lineHeight: 1.5, margin: 0 }}>
              {score >= 75
                ? 'Integridade estrutural estável. Mantenha o monitoramento regular.'
                : score >= 60
                  ? 'Drift de arquitetura em limites de domínio requer atenção nos próximos sprints.'
                  : 'Estado crítico. Priorize remediação de riscos e violações.'}
            </p>
          </div>
          <div style={{ width: 220, height: 220, flexShrink: 0, position: 'relative', zIndex: 1 }}>
            <SpiderChart dims={spiderDims} />
          </div>
        </div>

        {/* Key stats sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sideStats.map((s) => (
            <div key={s.label} style={{ background: s.bg ?? C.surfaceContainer, border: `1px solid ${s.borderColor}`,
              borderRadius: 8, padding: '14px 16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: 1,
              cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.surfaceContainerHigh)}
              onMouseLeave={(e) => (e.currentTarget.style.background = s.bg ?? C.surfaceContainer)}>
              <div>
                <span style={{ fontFamily: F.code, fontSize: 10, color: s.color, letterSpacing: '0.08em',
                  textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>{s.label}</span>
                <span style={{ fontFamily: F.headline, fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</span>
              </div>
              <div style={{ width: 40, height: 40, borderRadius: 8, border: `1px solid ${s.color}40`,
                background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={s.icon} size={20} color={s.color} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom row: PR gates + live telemetry */}
      <div style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: 16 }}>
        {/* Recent Analysis Gates */}
        <div style={{ background: C.surface, border: `1px solid ${C.outlineVariant}`, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.outlineVariant}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: F.code, fontSize: 13, color: C.onSurface }}>Recent Analysis Gates</span>
          </div>
          {prHistory.length === 0 ? (
            <div style={{ padding: '24px 16px', fontFamily: F.body, fontSize: 13, color: C.onSurfaceVariant, textAlign: 'center' as const }}>
              Nenhum PR analisado ainda. Use <code style={{ fontFamily: F.code, color: C.primaryFixedDim }}>tic-analyzer pr-review</code>.
            </div>
          ) : (
            prHistory.slice(0, 4).map((p, i) => {
              const status = p.gateFailed ? 'REJECTED' : (p.newRisks > 0 || p.newRuleViolations > 0) ? 'WARNING' : 'PASSED';
              const statusColor = status === 'REJECTED' ? C.error : status === 'WARNING' ? C.tertiaryFixed : C.secondary;
              const impactBars = Math.min(4, Math.ceil(p.totalImpacted / 5));
              return (
                <div key={i} style={{ padding: '12px 16px', borderBottom: `1px solid ${C.outlineVariant}50`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: i % 2 === 1 ? C.surfaceContainerLow : 'transparent',
                  transition: 'background 0.1s', cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = C.surfaceContainerLowest)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 1 ? C.surfaceContainerLow : 'transparent')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontFamily: F.code, fontSize: 10, letterSpacing: '0.06em', fontWeight: 700,
                      padding: '2px 8px', borderRadius: 2, border: `1px solid ${statusColor}`,
                      color: statusColor }}>{status}</span>
                    <div>
                      <div style={{ fontFamily: F.code, fontSize: 13, color: C.onSurface }}>
                        {new Date(p.date).toLocaleDateString('pt-BR')} · {p.changedFiles} arquivos
                      </div>
                      <div style={{ fontFamily: F.body, fontSize: 12, color: C.onSurfaceVariant, marginTop: 1 }}>
                        {p.newRisks > 0 ? `+${p.newRisks} riscos · ` : ''}{p.totalImpacted} entidades impactadas
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ fontFamily: F.code, fontSize: 10, color: C.outline, letterSpacing: '0.06em' }}>BLAST RADIUS</span>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {[0,1,2,3].map((j) => (
                        <div key={j} style={{ width: 14, height: 14, background: j < impactBars ? statusColor : C.surfaceVariant, borderRadius: 2 }} />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Live Telemetry */}
        <div style={{ background: C.surfaceContainerLowest, border: `1px solid ${C.outlineVariant}`,
          borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: 300 }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.outlineVariant}`,
            background: C.surface, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: F.code, fontSize: 13, color: C.onSurface }}>Live Telemetry</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: F.code, fontSize: 11,
              color: C.secondary }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.secondary,
                display: 'inline-block', animation: 'pulse 2s infinite' }} />
              {mcpRunning ? 'Connected' : 'Offline'}
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentEvents.length === 0 ? (
              <div style={{ display: 'flex', gap: 16, fontFamily: F.code, fontSize: 11, color: C.outline }}>
                <span>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <span style={{ color: C.outline }}>[IDLE]</span>
                <span>Aguardando próximo evento do sistema…</span>
              </div>
            ) : recentEvents.map((e, i) => {
              const typeColor = e.type === 'analysis' ? C.primaryFixedDim : e.severity === 'critical' ? C.error : e.severity === 'warn' ? C.tertiaryFixedDim : C.secondary;
              const tag = e.type === 'analysis' ? '[SCAN]' : e.type === 'risk-new' ? '[WARN]' : e.type === 'health-up' ? '[OK]' : e.type === 'alert-sent' ? '[MCP]' : '[SYS]';
              return (
                <div key={i} style={{ display: 'flex', gap: 16, fontFamily: F.code, fontSize: 11, color: C.onSurfaceVariant }}>
                  <span style={{ color: C.outline, flexShrink: 0 }}>{new Date(e.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  <span style={{ color: typeColor, flexShrink: 0, fontWeight: 700 }}>{tag}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{e.title}</span>
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 16, fontFamily: F.code, fontSize: 11, color: C.outline, opacity: 0.5 }}>
              <span>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              <span>[IDLE]</span>
              <span>Awaiting next file system event...</span>
            </div>
          </div>
        </div>
      </div>

      {/* MCP config (when running) */}
      {mcpRunning && (
        <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 8, padding: 20 }}>
          <div style={{ fontFamily: F.code, fontSize: 10, color: C.outline, fontWeight: 600, marginBottom: 12,
            letterSpacing: '0.08em', textTransform: 'uppercase' as const, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="sensors" size={13} color={C.secondary} fill={1} />
            MCP Server — 50 Ferramentas
          </div>
          <div style={{ fontFamily: F.code, fontSize: 12, color: C.onSurfaceVariant, background: C.surfaceContainerLowest,
            padding: '10px 14px', borderRadius: 6, marginBottom: 14, border: `1px solid ${C.outlineVariant}` }}>
            {`{"mcpServers":{"tic-analyzer":{"url":"http://localhost:${mcpPort}/mcp"}}}`}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16 }}>
            {['get_blast_radius','get_impact_of','get_health','get_graph_level','get_diff_impact','get_arch_rules','get_risk_prediction','get_agent_brief','list_triage','update_triage','get_quick_context','search_code','trace_flow','get_zoom_out','get_roi','get_ownership'].map((tool) => (
              <span key={tool} style={{ padding: '2px 8px', background: C.surfaceContainerLowest,
                border: `1px solid ${C.outlineVariant}`, borderRadius: 3, fontSize: 10,
                color: C.primaryFixedDim, fontFamily: F.code }}>{tool}</span>
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${C.outlineVariant}`, paddingTop: 16 }}>
            <div style={{ fontFamily: F.code, fontSize: 10, color: C.outline, fontWeight: 600, marginBottom: 12,
              letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Monitor de Tokens em Tempo Real</div>
            <TokenMonitor stats={tokenStats} onClear={() => {}} />
          </div>
        </div>
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
  const [liveMode, setLiveMode] = useState(false);
  const [liveStatus, setLiveStatus] = useState<{ analyzing: boolean; lastRun?: string; runs: number }>({ analyzing: false, runs: 0 });
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null);
  const [prHistory, setPrHistory] = useState<any[]>([]);
  const [liveEvents, setLiveEvents] = useState<ActivityEvent[]>([]);

  useEffect(() => { window.ticAnalyzer?.getMcpStatus().then((s) => setMcpRunning(s.running)); }, []);

  useEffect(() => {
    if (!mcpRunning) return;
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

  const handleSelectFolder = useCallback(async () => {
    const folder = await window.ticAnalyzer.selectFolder();
    if (folder) setProjectPath(folder);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!projectPath) return;
    setState('analyzing'); setProgress(null); setResult(null);
    setActiveTab('overview');
    const cleanup = window.ticAnalyzer.onProgress((p) => setProgress(p));
    window.ticAnalyzer.onAnalysisDone((r) => {
      cleanup();
      setResult(r as AnalysisResult);
      setState((r as AnalysisResult).success ? 'done' : 'error');
      if ((r as AnalysisResult).success && (r as AnalysisResult).outputPath) {
        const op = (r as AnalysisResult).outputPath;
        window.ticAnalyzer.readFile(`${op}/pr-history.json`).then((c) => {
          try { if (c) setPrHistory(JSON.parse(c)); } catch { /* ok */ }
        });
        window.ticAnalyzer.getActivity(projectPath, 50).then((e) => {
          if (Array.isArray(e)) setLiveEvents(e);
        });
      }
    });
    await window.ticAnalyzer.runAnalysis(projectPath);
  }, [projectPath]);

  const toggleLive = useCallback(async () => {
    const next = !liveMode;
    const r = await window.ticAnalyzer.setLiveMode(projectPath, next);
    setLiveMode(r.ok && r.live);
    if (!(r.ok && r.live)) setLiveStatus({ analyzing: false, runs: 0 });
  }, [liveMode, projectPath]);

  useEffect(() => {
    const off = window.ticAnalyzer.onLiveStatus?.((s) => {
      setLiveStatus((prev) => ({
        analyzing: s.analyzing ?? prev.analyzing,
        lastRun: s.lastRun ?? prev.lastRun,
        runs: s.analyzing === false ? prev.runs + 1 : prev.runs
      }));
    });
    return off;
  }, []);

  useEffect(() => {
    const off = window.ticAnalyzer.onActivity((e) => {
      setLiveEvents((prev) => [...prev.slice(-49), e]);
      if (e.type === 'analysis' && result?.outputPath) {
        window.ticAnalyzer.readFile(`${result.outputPath}/pr-history.json`).then((c) => {
          try { if (c) setPrHistory(JSON.parse(c)); } catch { /* ok */ }
        });
      }
    });
    return off;
  }, [projectPath, result?.outputPath]);

  const handleToggleMcp = useCallback(async () => {
    if (mcpRunning) { await window.ticAnalyzer.stopMcp(); setMcpRunning(false); }
    else { await window.ticAnalyzer.startMcp(projectPath || '', mcpPort); setMcpRunning(true); }
  }, [mcpRunning, projectPath, mcpPort]);

  const isTicCodePath = projectPath.replace(/[\\/]$/, '').endsWith('.tic-code');
  const parentPath = isTicCodePath ? projectPath.replace(/[\\/]?\.tic-code[\\/]?$/, '') : '';
  const overallPct = progress ? Math.round(progress.phases.filter((p) => p.status === 'done').length / progress.phases.length * 100) : 0;
  const isDone = state === 'done' && !!result;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.onSurface, fontFamily: F.body }}>
      <SideNav activeTab={activeTab} onTabChange={setActiveTab} isDone={isDone} />
      <TopBar
        projectPath={projectPath}
        mcpRunning={mcpRunning}
        liveMode={liveMode}
        liveStatus={liveStatus}
        onToggleLive={toggleLive}
        onToggleMcp={handleToggleMcp}
        isDone={isDone}
      />

      {/* Main content */}
      <main style={{ marginLeft: '256px', paddingTop: '64px', minHeight: '100vh' }}>
        <div style={{ padding: '24px', maxWidth: '1400px' }}>

          {/* Project picker — always visible */}
          <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
            <div style={{ fontFamily: F.code, fontSize: '10px', color: C.outline, marginBottom: '12px', letterSpacing: '0.08em', textTransform: 'uppercase' as const, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon name="folder_open" size={14} color={C.outline} />
              Projeto
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                style={{ flex: 1, background: C.surfaceContainerLowest, border: `1px solid ${C.outlineVariant}`, borderRadius: '6px', padding: '10px 14px', color: C.onSurface, fontSize: '13px', fontFamily: F.code, outline: 'none' }}
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/caminho/do/projeto ou C:\empresa\projeto"
                readOnly={state === 'analyzing'}
              />
              <button
                style={{ padding: '10px 18px', background: 'transparent', border: `1px solid ${C.outlineVariant}`, borderRadius: '6px', color: C.onSurface, cursor: 'pointer', fontFamily: F.code, fontSize: '13px', whiteSpace: 'nowrap' as const }}
                onClick={handleSelectFolder}
                disabled={state === 'analyzing'}
              >
                Selecionar
              </button>
              <button
                style={{ padding: '10px 18px', background: (!projectPath || state === 'analyzing') ? C.surfaceContainerHighest : C.primaryFixedDim, border: 'none', borderRadius: '6px', color: (!projectPath || state === 'analyzing') ? C.outline : C.onPrimary, cursor: (!projectPath || state === 'analyzing') ? 'not-allowed' : 'pointer', fontFamily: F.code, fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap' as const }}
                onClick={handleAnalyze}
                disabled={state === 'analyzing' || !projectPath}
              >
                {state === 'analyzing' ? 'Analisando...' : 'Analisar'}
              </button>
            </div>
            {isTicCodePath && (
              <div style={{ marginTop: '12px', padding: '10px 14px', background: `${C.tertiaryFixedDim}18`, borderRadius: '6px', border: `1px solid ${C.tertiaryFixedDim}44`, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon name="warning" size={16} color={C.tertiaryFixedDim} />
                <span style={{ fontSize: '13px', color: C.tertiaryFixedDim, flex: 1, fontFamily: F.code }}>Pasta de saída selecionada. Use a pasta pai: <code>{parentPath}</code></span>
                <button style={{ padding: '6px 12px', background: 'transparent', border: `1px solid ${C.tertiaryFixedDim}`, borderRadius: '4px', color: C.tertiaryFixedDim, cursor: 'pointer', fontFamily: F.code, fontSize: '12px' }} onClick={() => setProjectPath(parentPath)}>Usar pasta pai</button>
              </div>
            )}
          </div>

          {/* Progress */}
          {state === 'analyzing' && progress && (
            <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontFamily: F.headline, fontWeight: 600, fontSize: '16px', color: C.onSurface }}>Analisando...</span>
                <span style={{ fontFamily: F.code, fontSize: '14px', color: C.primaryFixedDim, fontWeight: 600 }}>{overallPct}%</span>
              </div>
              <div style={{ height: '4px', borderRadius: '2px', background: C.outlineVariant, overflow: 'hidden', margin: '8px 0 12px' }}>
                <div style={{ height: '100%', width: `${overallPct}%`, background: `linear-gradient(90deg, ${C.primaryFixedDim}, ${C.secondary})`, borderRadius: '2px', transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ fontSize: '12px', color: C.onSurfaceVariant, marginBottom: '16px', fontFamily: F.code }}>{progress.detail}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                {progress.phases.map((phase) => {
                  const statusColor = phase.status === 'done' ? C.secondary : phase.status === 'running' ? C.primaryFixedDim : phase.status === 'error' ? C.error : C.outlineVariant;
                  return (
                    <div key={phase.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', opacity: phase.status === 'pending' ? 0.4 : 1, fontSize: '12px', fontFamily: F.code }}>
                      <span style={{ padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 600, background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44`, fontFamily: F.code }}>
                        {phase.status === 'done' ? '✓' : phase.status === 'running' ? '◈' : phase.status === 'error' ? '✗' : '○'}
                      </span>
                      <span style={{ color: C.onSurfaceVariant }}>{phase.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Error */}
          {state === 'error' && result?.error && (
            <div style={{ background: `${C.errorContainer}44`, border: `1px solid ${C.error}44`, borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
              <div style={{ color: C.error, fontWeight: 600, marginBottom: '8px', fontFamily: F.headline, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon name="error" size={18} color={C.error} />
                Erro na análise
              </div>
              <code style={{ fontSize: '12px', color: C.error, whiteSpace: 'pre-wrap' as const, fontFamily: F.code }}>{result.error}</code>
            </div>
          )}

          {/* Tab content */}
          {activeTab === 'docs' && <DocsTab />}

          {activeTab === 'portfolio' && (
            <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: '8px', padding: '20px' }}>
              <PortfolioDashboard />
            </div>
          )}

          {isDone && activeTab !== 'docs' && activeTab !== 'portfolio' && (
            <>
              {activeTab === 'overview' && (
                <OverviewTab
                  result={result!}
                  mcpRunning={mcpRunning}
                  mcpPort={mcpPort}
                  tokenStats={tokenStats}
                  onToggleMcp={handleToggleMcp}
                  onOpenFolder={() => window.ticAnalyzer.openFolder(result!.outputPath)}
                  prHistory={prHistory}
                  liveEvents={liveEvents}
                />
              )}

              {activeTab === 'health' && (
                <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: '8px', padding: '24px' }}>
                  <HealthDashboard ticCodeDir={result!.outputPath} />
                </div>
              )}

              {activeTab === 'value' && (
                <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: '8px', padding: '24px' }}>
                  <ValueDashboard ticCodeDir={result!.outputPath} projectPath={projectPath} />
                </div>
              )}

              {activeTab === 'governance' && (
                <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: '8px', padding: '24px' }}>
                  <GovernanceDashboard ticCodeDir={result!.outputPath} projectPath={projectPath} />
                </div>
              )}

              {activeTab === 'activity' && (
                <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: '8px', padding: '24px' }}>
                  <ActivityFeed ticCodeDir={result!.outputPath} projectPath={projectPath} />
                </div>
              )}

              {activeTab === 'explorer' && (
                <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: '8px', padding: '24px' }}>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontFamily: F.headline, fontWeight: 600, fontSize: '20px', marginBottom: '4px', color: C.onSurface }}>Explorador Hierárquico</div>
                    <div style={{ fontSize: '13px', color: C.onSurfaceVariant }}>Aplicação → Camadas → Módulos → Arquivos → Símbolos · peso da aresta = nº de dependências agregadas</div>
                  </div>
                  <HierGraphViewer projectPath={projectPath} />
                </div>
              )}

              {activeTab === 'search' && (
                <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: '8px', padding: '24px' }}>
                  <SearchCodeViewer projectPath={projectPath} />
                </div>
              )}

              {activeTab === 'memory' && (
                <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: '8px', padding: '24px' }}>
                  <MemoryViewer ticCodeDir={result!.outputPath} />
                </div>
              )}

              {activeTab === 'http' && (
                <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: '8px', padding: '24px' }}>
                  <HttpFlowsViewer projectPath={projectPath} />
                </div>
              )}

              {activeTab === 'impact' && (
                <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: '8px', padding: '24px' }}>
                  <ImpactTab ticCodeDir={result!.outputPath} projectPath={projectPath} />
                </div>
              )}

              {activeTab === 'metrics' && (
                <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: '8px', padding: '24px' }}>
                  <MetricsTab ticCodeDir={result!.outputPath} />
                </div>
              )}

              {activeTab === 'files' && (
                <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: '8px', padding: '24px' }}>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontFamily: F.headline, fontWeight: 600, fontSize: '20px', color: C.onSurface }}>Artefatos Gerados</div>
                    <div style={{ fontSize: '13px', color: C.onSurfaceVariant, marginTop: '4px' }}>Pasta <code style={{ fontFamily: F.code, color: C.primaryFixedDim }}>.tic-code/</code> com todos os arquivos gerados pela análise</div>
                  </div>
                  <div style={{ fontFamily: F.code, fontSize: '12px', color: C.onSurfaceVariant, lineHeight: '2.2', background: C.surfaceContainerLowest, borderRadius: '8px', padding: '16px', border: `1px solid ${C.outlineVariant}` }}>
                    {[
                      { path: `${result!.outputPath}/`, color: C.outline, indent: 0 },
                      { path: 'quick-context.md', note: `(~${result!.quickContextTokens.toLocaleString()} tokens)`, color: C.secondary, indent: 1 },
                      { path: 'metrics-summary.md', note: 'complexidade + hotspots + violacoes', color: C.tertiaryFixedDim, indent: 1 },
                      { path: 'impact-index.json', note: 'índice de impacto de mudança', color: C.primaryFixedDim, indent: 1 },
                      { path: 'patterns.md + inheritance.md', note: 'padrões e hierarquia', color: C.primaryFixedDim, indent: 1 },
                      { path: 'multigraph.md + diagram.md', note: 'diagramas Mermaid', color: C.outline, indent: 1 },
                      { path: 'openapi.yaml', note: 'endpoints OpenAPI 3.0', color: C.outline, indent: 1 },
                      { path: `modules/ x${result!.modulesGenerated}`, note: 'context + business-rules + metrics + patterns', color: C.outline, indent: 1 },
                      ...(result!.dbTables > 0 ? [{ path: 'db-schema.md + db-schema-summary.md', note: `${result!.dbTables} tabelas detectadas`, color: C.tertiaryFixedDim, indent: 1 }] : []),
                      { path: 'roi.json + ownership.json + activity.json', note: 'valor e atividade', color: C.outline, indent: 1 },
                      { path: 'snapshots.json + triage.json', note: 'histórico e triagem', color: C.outline, indent: 1 },
                      { path: 'analysis.json', note: 'export estruturado completo', color: '#7c83fd', indent: 1 },
                      { path: 'file-cache.json', note: `cache incremental${result!.cacheHits > 0 ? ` (${result!.cacheHits} módulos reutilizados)` : ''}`, color: C.secondary, indent: 1 },
                      { path: 'CLAUDE.md + .github/copilot-instructions.md', note: '', color: '#7c83fd', indent: 0 },
                    ].map((row, i) => (
                      <div key={i} style={{ paddingLeft: `${row.indent * 16}px` }}>
                        <span style={{ color: row.color }}>{row.path}</span>
                        {row.note && <span style={{ color: C.outline }}> — {row.note}</span>}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '16px' }}>
                    <button
                      style={{ padding: '10px 18px', background: `${C.primaryFixedDim}18`, border: `1px solid ${C.primaryFixedDim}`, borderRadius: '6px', color: C.primaryFixedDim, cursor: 'pointer', fontFamily: F.code, fontSize: '13px', fontWeight: 600 }}
                      onClick={() => window.ticAnalyzer.openFolder(result!.outputPath)}
                    >
                      Abrir pasta .tic-code
                    </button>
                  </div>
                </div>
              )}
              {activeTab === 'http' && projectPath && (
                <HttpFlowsViewer projectPath={projectPath} />
              )}
            </>
          )}

          {/* Empty state for tabs that require done analysis */}
          {!isDone && activeTab !== 'docs' && activeTab !== 'portfolio' && activeTab !== 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', gap: '16px' }}>
              <Icon name="analytics" size={48} color={C.outlineVariant} />
              <div style={{ fontFamily: F.headline, fontSize: '20px', color: C.onSurfaceVariant, fontWeight: 500 }}>Análise necessária</div>
              <div style={{ fontSize: '14px', color: C.outline, textAlign: 'center', maxWidth: '400px' }}>Selecione um projeto e clique em <strong style={{ color: C.primaryFixedDim }}>Analisar</strong> para ver os dados desta aba.</div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
