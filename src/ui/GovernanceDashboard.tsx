import { useCallback, useEffect, useState } from 'react';
import { SvgLineChart } from './charts/SvgLineChart';
import { SvgBarChart } from './charts/SvgBarChart';

const C = {
  bg: '#e9edf5', surfaceContainer: '#ffffff', surfaceContainerLow: '#ffffff',
  surfaceContainerHigh: '#f2f5fb', surfaceContainerHighest: '#e6ebf3',
  primary: '#111827', primaryFixedDim: '#2563eb', primaryFixed: '#93c5fd',
  secondary: '#16a34a', error: '#dc2626', errorContainer: '#fee2e2',
  tertiaryFixedDim: '#d97706',
  onSurface: '#1e293b', onSurfaceVariant: '#64748b',
  outline: '#94a3b8', outlineVariant: '#e2e8f0',
};
const F = {
  headline: "'Geist', 'Inter', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  code: "'JetBrains Mono', monospace",
};

interface TriageItem {
  id: string; title: string; category: 'bug' | 'enhancement';
  state: string; priority: string; source: string; entity?: string; detail?: string;
}
interface ArchRule { id: string; severity: string; description?: string; }
interface ArchViolation { ruleId: string; severity: string; from: string; to: string; }
interface PrEntry { date: string; changedFiles: number; totalImpacted: number; newRisks: number; newViolations: number; newRuleViolations: number; healthDelta: number | null; gateFailed: boolean; }
interface Snapshot { score: number; grade: string; counts: { risks: number; modules: number; impactEdges: number }; }

const STATE_META: Record<string, { color: string; bg: string }> = {
  'needs-triage': { color: C.tertiaryFixedDim, bg: `${C.tertiaryFixedDim}18` },
  'needs-info': { color: C.primaryFixedDim, bg: `${C.primaryFixedDim}18` },
  'ready-for-agent': { color: C.secondary, bg: `${C.secondary}18` },
  'ready-for-human': { color: '#7c3aed', bg: '#7c3aed18' },
  'wontfix': { color: C.onSurfaceVariant, bg: `${C.surfaceContainerHighest}` },
  'done': { color: C.secondary, bg: `${C.secondary}18` },
};
const STATE_NEXT: Record<string, string[]> = {
  'needs-triage': ['needs-info', 'ready-for-agent', 'ready-for-human', 'wontfix'],
  'needs-info': ['needs-triage'],
  'ready-for-agent': ['needs-triage', 'done'],
  'ready-for-human': ['needs-triage', 'done'],
  'wontfix': ['needs-triage'],
  'done': [],
};
const PRIORITY_META: Record<string, { color: string; label: string }> = {
  critical: { color: C.error, label: 'CRITICAL' },
  high: { color: C.tertiaryFixedDim, label: 'HIGH' },
  medium: { color: '#7c3aed', label: 'MED' },
  low: { color: C.onSurfaceVariant, label: 'LOW' },
};

function Icon({ name, size = 20, color, fill = 0 }: { name: string; size?: number; color?: string; fill?: number }) {
  return (
    <span className="material-symbols-outlined" style={{
      fontSize: `${size}px`, color, lineHeight: 1, display: 'inline-flex', alignItems: 'center',
      fontVariationSettings: `'FILL' ${fill}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
    }}>{name}</span>
  );
}

function KpiCard({ label: rawLabel, value, sub, color, icon }: { label: string; value: string; sub?: string; color: string; icon: string }) {
  return (
    <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`,
      borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '16px 20px', flex: '1 1 160px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon name={icon} size={16} color={color} />
        <span style={{ fontSize: 10, fontFamily: F.code, letterSpacing: '0.08em', fontWeight: 700,
          color: C.onSurfaceVariant, textTransform: 'uppercase' as const }}>{rawLabel}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color, fontFamily: F.headline, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.onSurfaceVariant, fontFamily: F.body, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SectionCard({ title, icon, children, right }: { title: string; icon?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`,
      borderRadius: 12, padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, fontFamily: F.headline, color: C.onSurface, margin: 0,
          display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon && <Icon name={icon} size={16} color={C.onSurfaceVariant} />}
          {title}
        </h3>
        {right}
      </div>
      {children}
    </div>
  );
}

export function GovernanceDashboard({ ticCodeDir, projectPath }: { ticCodeDir: string; projectPath: string }) {
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [archData, setArchData] = useState<{ rules: ArchRule[]; violations: ArchViolation[] } | null>(null);
  const [triage, setTriage] = useState<TriageItem[]>([]);
  const [prHistory, setPrHistory] = useState<PrEntry[]>([]);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [triageFilter, setTriageFilter] = useState<string>('all');
  const [msg, setMsg] = useState('');
  const [gh, setGh] = useState<{ installed: boolean; workflowFile: string | null; hasGit: boolean; yaml: string } | null>(null);
  const [ghMsg, setGhMsg] = useState('');
  const [rulesMsg, setRulesMsg] = useState('');

  const loadAll = useCallback(() => {
    const readJson = async (file: string) => {
      const c = await window.ticAnalyzer.readFile(`${ticCodeDir}/${file}`);
      try { return c ? JSON.parse(c) : null; } catch { return null; }
    };
    readJson('analysis.json').then(setAnalysis);
    readJson('arch-violations.json').then((d) => d && setArchData({ rules: d.rules ?? [], violations: d.violations ?? [] }));
    readJson('triage.json').then((d) => Array.isArray(d) && setTriage(d));
    readJson('pr-history.json').then((d) => Array.isArray(d) && setPrHistory(d));
    readJson('snapshots.json').then((d) => Array.isArray(d) && setSnaps(d));
    window.ticAnalyzer.getGithubStatus?.(projectPath).then((s) => setGh(s as any));
  }, [ticCodeDir, projectPath]);

  const installWorkflow = useCallback(async () => {
    const r = (await window.ticAnalyzer.installGithubWorkflow(projectPath)) as { ok: boolean; existed?: boolean; path?: string; error?: string };
    setGhMsg(r.ok ? (r.existed ? `Já existia: ${r.path}` : `Workflow criado: ${r.path} — commit e push para ativar`) : `Erro: ${r.error}`);
    window.ticAnalyzer.getGithubStatus?.(projectPath).then((s) => setGh(s as any));
  }, [projectPath]);

  const createRules = useCallback(async () => {
    const r = (await window.ticAnalyzer.createTicRules?.(projectPath)) as { ok: boolean; existed?: boolean; path?: string; error?: string };
    setRulesMsg(r?.ok
      ? (r.existed ? `Já existe ${r.path} na raiz.` : `Criado ${r.path} na raiz — edite as regras e reanalise o projeto.`)
      : `Erro: ${r?.error}`);
  }, [projectPath]);

  useEffect(loadAll, [loadAll]);

  useEffect(() => {
    const off = window.ticAnalyzer.onActivity?.((e: { type?: string }) => {
      if (e?.type === 'analysis') loadAll();
    });
    return off;
  }, [loadAll]);

  const transition = useCallback(async (id: string, state: string) => {
    const r = (await window.ticAnalyzer.updateTriage(projectPath, id, { state })) as { ok: boolean; error?: string };
    setMsg(r.ok ? '' : r.error ?? 'erro');
    loadAll();
  }, [projectPath, loadAll]);

  const cur = snaps[snaps.length - 1];
  const prev = snaps.length > 1 ? snaps[snaps.length - 2] : null;
  const impactScore = cur?.counts.impactEdges ?? analysis?.impact?.indexedFiles ?? 0;
  const archErrors = archData?.violations.filter((v) => v.severity === 'error').length ?? 0;
  const archWarns = (archData?.violations.length ?? 0) - archErrors;
  const criticalOpen = triage.filter((t) => t.priority === 'critical' && t.state !== 'done' && t.state !== 'wontfix').length;
  const riskLevel = !cur ? '—'
    : criticalOpen > 0 || cur.score < 40 ? 'CRITICAL'
    : archErrors > 0 || cur.score < 60 ? 'HIGH'
    : cur.score < 80 ? 'MEDIUM' : 'LOW';
  const riskColor = riskLevel === 'CRITICAL' ? C.error : riskLevel === 'HIGH' ? C.tertiaryFixedDim : riskLevel === 'MEDIUM' ? '#7c3aed' : C.secondary;

  const moduleBars = ((analysis?.metrics?.topHotspots ?? []) as Array<{ file: string; debtScore: number }>)
    .slice(0, 8).map((h) => ({ label: h.file.split('/').pop() ?? h.file, value: h.debtScore }));

  const filteredTriage = triage
    .filter((t) => triageFilter === 'all' || t.state === triageFilter)
    .sort((a, b) => ['critical', 'high', 'medium', 'low'].indexOf(a.priority) - ['critical', 'high', 'medium', 'low'].indexOf(b.priority));

  return (
    <div style={{ fontFamily: F.body, color: C.onSurface }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: F.headline, color: C.onSurface, margin: 0, lineHeight: 1.2 }}>
            Governança de Engenharia
          </h2>
          <p style={{ fontSize: 13, color: C.onSurfaceVariant, margin: '4px 0 0' }}>
            Regras de arquitetura · triagem · risco preditivo · histórico de PRs
          </p>
        </div>
        <button onClick={() => window.ticAnalyzer.openArchReport(projectPath)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}`,
            borderRadius: 8, color: C.onSurface, cursor: 'pointer', fontFamily: F.code, fontSize: 12, fontWeight: 600 }}>
          <Icon name="architecture" size={15} color={C.primaryFixedDim} />
          Relatório de Arquitetura
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard label="Impact Score" value={impactScore.toLocaleString()} sub="arestas de impacto cross-tier" color={C.primaryFixedDim} icon="hub" />
        <KpiCard label="Risk Level" value={riskLevel} sub={criticalOpen > 0 ? `${criticalOpen} crítico(s) na triagem` : `health ${cur?.score ?? '—'}/100`} color={riskColor} icon="warning" />
        <KpiCard label="Modules Analyzed" value={String(cur?.counts.modules ?? analysis?.modules?.length ?? 0)} sub={prev ? `${(cur!.counts.modules - prev.counts.modules) >= 0 ? '+' : ''}${cur!.counts.modules - prev.counts.modules} vs anterior` : undefined} color={C.secondary} icon="category" />
        <KpiCard label="Architecture Drift" value={String(archData?.violations.length ?? 0)} sub={`${archErrors} error · ${archWarns} warn`} color={archErrors > 0 ? C.error : C.secondary} icon="difference" />
      </div>

      {/* Impact Analysis */}
      <SectionCard title="Impact Analysis" icon="analytics">
        {prHistory.length >= 2 ? (
          <>
            <div style={{ fontSize: 12, color: C.onSurfaceVariant, marginBottom: 8 }}>Entidades impactadas por PR analisado</div>
            <SvgLineChart
              points={prHistory.map((p, i) => ({ x: i, y: p.totalImpacted, label: `${new Date(p.date).toLocaleDateString('pt-BR')} · ${p.changedFiles} arquivos · ${p.gateFailed ? '❌ gate' : '✅'}` }))}
              color={C.primaryFixedDim} height={150}
            />
          </>
        ) : (
          <div style={{ fontSize: 12, color: C.onSurfaceVariant, marginBottom: 10, padding: '8px 0' }}>
            Tendência aparece após 2+ execuções de <code style={{ fontFamily: F.code, color: C.primaryFixedDim }}>tic-analyzer pr-review</code> (CI self-hosted ou local).
          </div>
        )}
        {moduleBars.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: C.onSurfaceVariant, marginBottom: 8 }}>Dívida técnica — maiores focos</div>
            <SvgBarChart items={moduleBars} color={C.tertiaryFixedDim} />
          </div>
        )}
      </SectionCard>

      {/* Triage Queue */}
      <SectionCard
        title={`Triage Queue — ${triage.length} item(ns)`}
        icon="inbox"
        right={
          <select value={triageFilter} onChange={(e) => setTriageFilter(e.target.value)}
            style={{ padding: '5px 10px', background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}`,
              borderRadius: 6, color: C.onSurface, fontSize: 11, fontFamily: F.code, cursor: 'pointer' }}>
            <option value="all">todos os estados</option>
            {Object.keys(STATE_META).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        }>
        {msg && <div style={{ color: C.error, fontSize: 12, marginBottom: 8, fontFamily: F.code }}>{msg}</div>}
        {filteredTriage.length === 0 ? (
          <div style={{ fontSize: 13, color: C.onSurfaceVariant, padding: '16px 0', textAlign: 'center' as const }}>
            <Icon name="check_circle" size={24} color={C.secondary} />
            <div style={{ marginTop: 8 }}>Fila vazia — riscos critical/high e violações entram aqui automaticamente.</div>
          </div>
        ) : (
          <div>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '24px 80px 100px 1fr 110px',
              gap: 8, padding: '6px 8px', fontSize: 10, fontFamily: F.code, letterSpacing: '0.06em',
              color: C.onSurfaceVariant, borderBottom: `1px solid ${C.outlineVariant}` }}>
              <span></span><span>TIPO</span><span>ESTADO</span><span>TÍTULO</span><span>AÇÃO</span>
            </div>
            {filteredTriage.slice(0, 15).map((t) => {
              const pMeta = PRIORITY_META[t.priority] ?? { color: C.onSurfaceVariant, label: t.priority };
              const sMeta = STATE_META[t.state] ?? { color: C.onSurfaceVariant, bg: C.surfaceContainerHighest };
              return (
                <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '24px 80px 100px 1fr 110px',
                  gap: 8, alignItems: 'center', padding: '10px 8px',
                  borderBottom: `1px solid ${C.outlineVariant}40`, fontSize: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: pMeta.color,
                    display: 'inline-block' }} title={t.priority} />
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontFamily: F.code, fontWeight: 700,
                    background: t.category === 'bug' ? `${C.error}20` : `${C.primaryFixedDim}20`,
                    color: t.category === 'bug' ? C.error : C.primaryFixedDim,
                    border: `1px solid ${t.category === 'bug' ? C.error : C.primaryFixedDim}40` }}>
                    {t.category.toUpperCase()}
                  </span>
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontFamily: F.code, fontWeight: 700,
                    background: sMeta.bg, color: sMeta.color, border: `1px solid ${sMeta.color}40` }}>
                    {t.state.toUpperCase().replace(/-/g, '_')}
                  </span>
                  <span style={{ color: C.onSurface, overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap', fontFamily: F.body }} title={t.detail ?? t.title}>{t.title}</span>
                  <select value="" onChange={(e) => e.target.value && transition(t.id, e.target.value)}
                    style={{ padding: '4px 8px', background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}`,
                      borderRadius: 6, color: C.onSurface, fontSize: 10, fontFamily: F.code, cursor: 'pointer' }}>
                    <option value="">mover para…</option>
                    {(STATE_NEXT[t.state] ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              );
            })}
            <div style={{ fontSize: 11, color: C.onSurfaceVariant, fontFamily: F.code, marginTop: 10, padding: '8px 0' }}>
              Skill <code style={{ color: C.primaryFixedDim }}>triage</code> — brief via MCP: <code style={{ color: C.primaryFixedDim }}>get_agent_brief(id)</code>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Architecture Governance */}
      <SectionCard title="Architecture Governance" icon="account_balance">
        {!archData || archData.rules.length === 0 ? (
          <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: C.onSurfaceVariant }}>
              Sem <code style={{ fontFamily: F.code, color: C.primaryFixedDim }}>.tic-rules.json</code> na raiz do projeto.
              Defina regras de arquitetura (ex: "frontend não acessa o banco") para o TIC validar a cada análise.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={createRules} style={{ display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontFamily: F.code, color: C.onPrimaryFixed ?? '#fff', background: C.primaryFixedDim,
                border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>
                <Icon name="add" size={16} color={C.onPrimaryFixed ?? '#fff'} />
                Criar .tic-rules.json
              </button>
              {rulesMsg && <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>{rulesMsg}</span>}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {archData.rules.map((r) => {
              const v = archData.violations.filter((x) => x.ruleId === r.id);
              const ok = v.length === 0;
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}40`, borderRadius: 8,
                  borderLeft: `2px solid ${ok ? C.secondary : r.severity === 'error' ? C.error : C.tertiaryFixedDim}` }}>
                  <Icon name={ok ? 'check_circle' : 'cancel'} size={16} color={ok ? C.secondary : C.error} fill={1} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontFamily: F.code, color: C.primaryFixedDim,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.id}</div>
                    {r.description && <div style={{ fontSize: 11, color: C.onSurfaceVariant, marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</div>}
                  </div>
                  <span style={{ fontSize: 11, fontFamily: F.code, fontWeight: 700, flexShrink: 0,
                    color: ok ? C.secondary : C.error }}>
                    {ok ? 'compliant' : `${v.length} violação(ões)`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* GitHub / CI */}
      <SectionCard title="GitHub / CI" icon="merge">
        {!gh ? (
          <div style={{ fontSize: 13, color: C.onSurfaceVariant }}>Verificando…</div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13,
                color: gh.installed ? C.secondary : C.tertiaryFixedDim }}>
                <Icon name={gh.installed ? 'check_circle' : 'warning'} size={16} color={gh.installed ? C.secondary : C.tertiaryFixedDim} fill={1} />
                {gh.installed ? 'Action configurada' : 'Action não detectada'}
              </span>
              {gh.installed && gh.workflowFile && (
                <code style={{ fontSize: 11, color: C.onSurfaceVariant, fontFamily: F.code }}>{gh.workflowFile}</code>
              )}
              {!gh.installed && (
                <button onClick={installWorkflow}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                    background: C.primaryFixedDim, border: 'none', borderRadius: 6,
                    color: '#00363a', cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: F.code }}>
                  <Icon name="download" size={14} color="#00363a" />
                  Instalar workflow
                </button>
              )}
            </div>
            {!gh.hasGit && <div style={{ fontSize: 12, color: C.tertiaryFixedDim, marginBottom: 6, fontFamily: F.body }}>Este projeto não é um repositório git.</div>}
            {ghMsg && <div style={{ fontSize: 12, marginBottom: 6, color: ghMsg.startsWith('Erro') ? C.error : C.secondary, fontFamily: F.body }}>{ghMsg}</div>}
            <div style={{ fontSize: 12, color: C.onSurfaceVariant, fontFamily: F.body }}>
              {gh.installed
                ? 'A cada PR, a Action analisa as mudanças e comenta impacto/riscos/health.'
                : 'Instale o workflow, faça commit/push, e abra um PR — a primeira revisão aparecerá abaixo.'}
            </div>
          </div>
        )}
      </SectionCard>

      {/* PR History */}
      <SectionCard title={`PRs Analisados pela Action — ${prHistory.length} PR(s)`} icon="rate_review">
        {prHistory.length === 0 ? (
          <div style={{ fontSize: 13, color: C.onSurfaceVariant, padding: '16px 0', textAlign: 'center' as const }}>
            <Icon name="hourglass_empty" size={24} color={C.outline} />
            <div style={{ marginTop: 8 }}>Nenhum PR analisado ainda. Use <code style={{ fontFamily: F.code, color: C.primaryFixedDim }}>tic-analyzer pr-review</code> ou a Action no CI.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' as const }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', fontFamily: F.body }}>
              <thead>
                <tr style={{ color: C.onSurfaceVariant, textAlign: 'left' as const, fontSize: 10,
                  fontFamily: F.code, letterSpacing: '0.06em', borderBottom: `1px solid ${C.outlineVariant}` }}>
                  <th style={{ padding: '6px 8px' }}>DATA</th>
                  <th style={{ padding: '6px 8px' }}>ARQUIVOS</th>
                  <th style={{ padding: '6px 8px' }}>BLAST RADIUS</th>
                  <th style={{ padding: '6px 8px' }}>RISCOS NOVOS</th>
                  <th style={{ padding: '6px 8px' }}>DRIFT NOVO</th>
                  <th style={{ padding: '6px 8px' }}>Δ HEALTH</th>
                  <th style={{ padding: '6px 8px' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {[...prHistory].reverse().slice(0, 10).map((p, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.outlineVariant}40` }}>
                    <td style={{ padding: '10px 8px', color: C.onSurfaceVariant, fontFamily: F.code, fontSize: 11 }}>
                      {new Date(p.date).toLocaleString('pt-BR')}
                    </td>
                    <td style={{ padding: '10px 8px' }}>{p.changedFiles}</td>
                    <td style={{ padding: '10px 8px', color: C.primaryFixedDim, fontWeight: 600, fontFamily: F.code }}>{p.totalImpacted}</td>
                    <td style={{ padding: '10px 8px', color: p.newRisks > 0 ? C.error : C.onSurfaceVariant }}>{p.newRisks}</td>
                    <td style={{ padding: '10px 8px', color: p.newRuleViolations > 0 ? C.error : C.onSurfaceVariant }}>{p.newRuleViolations}</td>
                    <td style={{ padding: '10px 8px', color: (p.healthDelta ?? 0) < 0 ? C.error : C.secondary, fontFamily: F.code }}>
                      {p.healthDelta !== null ? `${p.healthDelta >= 0 ? '+' : ''}${p.healthDelta}` : '—'}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: F.code,
                        fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        background: p.gateFailed ? `${C.error}20` : `${C.secondary}20`,
                        color: p.gateFailed ? C.error : C.secondary,
                        border: `1px solid ${p.gateFailed ? C.error : C.secondary}40` }}>
                        <Icon name={p.gateFailed ? 'cancel' : 'check_circle'} size={12} color={p.gateFailed ? C.error : C.secondary} fill={1} />
                        {p.gateFailed ? 'GATE FAILED' : 'OK'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
