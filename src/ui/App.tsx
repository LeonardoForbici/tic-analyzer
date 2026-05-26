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
  const [section, setSection] = useState<'inicio' | 'mcp' | 'abas' | 'ferramentas' | 'arquivos' | 'cli'>('inicio');

  const NAV = [
    { id: 'inicio',      label: 'Primeiros Passos' },
    { id: 'mcp',         label: 'Configurar MCP' },
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
                O progresso aparece em tempo real com 23 fases. Para projetos grandes (10k–200k arquivos) o processo leva de 30 segundos a alguns minutos.
              </Step>
              <Step n={3} title="Explore os resultados">
                Após a análise, as abas <Tag>Impacto</Tag>, <Tag>Métricas</Tag>, <Tag>Multi-Grafo</Tag> e <Tag>Módulos</Tag> ficam disponíveis.
                Uma pasta <Tag>.tic-code/</Tag> é criada dentro do projeto com todos os artefatos.
              </Step>
              <Step n={4} title="(Opcional) Inicie o MCP Server">
                Na aba <Tag>Visão Geral</Tag>, clique em <strong>Iniciar MCP</strong> para expor as 17 ferramentas de análise para o Claude Code via protocolo MCP.
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

        {/* ── Configurar MCP ── */}
        {section === 'mcp' && (
          <div>
            <Section title="O que é o MCP Server?">
              <p style={{ fontSize: '13px', color: '#b0b0c0', lineHeight: 1.8, margin: '0 0 12px 0' }}>
                MCP (Model Context Protocol) é o protocolo que permite ao Claude Code chamar ferramentas externas.
                O TIC Analyzer expõe 17 ferramentas via MCP para que o Claude possa consultar a análise do projeto
                de forma eficiente — pedindo apenas o que precisa, sem carregar tudo no contexto.
              </p>
            </Section>

            <Section title="Passo a passo para configurar">
              <Step n={1} title="Analise o projeto e inicie o MCP Server">
                Na aba <Tag>Visão Geral</Tag>, após a análise, clique em <strong>Iniciar MCP</strong>. O servidor sobe em <Tag>localhost:7432</Tag>.
              </Step>
              <Step n={2} title="Crie o arquivo de configuração no projeto analisado">
                Dentro da pasta raiz do projeto que você analisou, crie a pasta <Tag>.claude/</Tag> (se não existir) e o arquivo <Tag>settings.json</Tag>:
                <Code>{`# Linux / macOS
mkdir -p /seu/projeto/.claude
nano /seu/projeto/.claude/settings.json

# Windows
mkdir C:\\seu\\projeto\\.claude
notepad C:\\seu\\projeto\\.claude\\settings.json`}</Code>
              </Step>
              <Step n={3} title="Cole a configuração abaixo no settings.json">
                <Code>{`{
  "mcpServers": {
    "tic-analyzer": {
      "url": "http://localhost:7432/mcp"
    }
  }
}`}</Code>
              </Step>
              <Step n={4} title="Abra o projeto no Claude Code">
                Com o Claude Code aberto na pasta do projeto, o MCP já estará disponível. Você pode testar digitando:
                <Code>{`# No Claude Code, use diretamente:
/mcp
# Deve aparecer "tic-analyzer" na lista de servidores`}</Code>
              </Step>
              <Step n={5} title="Fluxo recomendado de uso">
                Diga ao Claude para começar pela visão geral antes de qualquer tarefa:
                <Code>{`"Leia o get_quick_context() para entender o projeto e
depois me ajude a implementar X"`}</Code>
                O Claude vai chamar <Tag>get_quick_context()</Tag> automaticamente e trabalhar com contexto real do seu projeto.
              </Step>
            </Section>

            <Section title="Mantendo o MCP sempre ativo">
              <p style={{ fontSize: '13px', color: '#b0b0c0', lineHeight: 1.8, margin: '0 0 8px 0' }}>
                O servidor fica ativo enquanto o TIC Analyzer estiver aberto. Se você fechar e reabrir o app, clique em <strong>Iniciar MCP</strong> novamente.
              </p>
              <p style={{ fontSize: '13px', color: '#b0b0c0', lineHeight: 1.8, margin: 0 }}>
                A análise não precisa rodar novamente — os arquivos <Tag>.tic-code/</Tag> já estão no projeto e o MCP Server apenas os lê.
                Você só precisa re-analisar quando o projeto mudar significativamente.
              </p>
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
              Com o MCP Server ativo, o Claude Code pode chamar estas 17 ferramentas. Cada uma retorna apenas o necessário — de ~200 a ~75k tokens dependendo do escopo.
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
