/**
 * Dashboard de Governança de Engenharia:
 *   🎯 KPIs (Impact Score, Risk Level, Modules Analyzed, Architecture Drift)
 *   📊 Impact Analysis (tendência de PRs + distribuição de saúde por módulo)
 *   🔍 Triage Queue (skill triage: bug/enhancement × máquina de estados)
 *   🏗️ Architecture Governance (regras .tic-rules.json com compliance)
 *   📈 Recent PRs (histórico de pr-review com blast radius e gates)
 */
import { useCallback, useEffect, useState } from 'react';
import { SvgLineChart } from './charts/SvgLineChart';
import { SvgBarChart } from './charts/SvgBarChart';

const C = { card: '#16213e', border: '#2a2a4e', accent: '#7c83fd', green: '#56cfad', red: '#ff6b6b', orange: '#f0a500', text: '#e0e0e0', muted: '#888' };

interface TriageItem {
  id: string; title: string; category: 'bug' | 'enhancement';
  state: string; priority: string; source: string; entity?: string; detail?: string;
}
interface ArchRule { id: string; severity: string; description?: string; }
interface ArchViolation { ruleId: string; severity: string; from: string; to: string; }
interface PrEntry { date: string; changedFiles: number; totalImpacted: number; newRisks: number; newViolations: number; newRuleViolations: number; healthDelta: number | null; gateFailed: boolean; }
interface Snapshot { score: number; grade: string; counts: { risks: number; modules: number; impactEdges: number }; }

const STATE_COLORS: Record<string, string> = {
  'needs-triage': '#f0a500', 'needs-info': '#4a9eff', 'ready-for-agent': '#56cfad',
  'ready-for-human': '#9d8cff', 'wontfix': '#666', 'done': '#3a3'
};
const STATE_NEXT: Record<string, string[]> = {
  'needs-triage': ['needs-info', 'ready-for-agent', 'ready-for-human', 'wontfix'],
  'needs-info': ['needs-triage'],
  'ready-for-agent': ['needs-triage', 'done'],
  'ready-for-human': ['needs-triage', 'done'],
  'wontfix': ['needs-triage'],
  'done': []
};
const PRIORITY_COLORS: Record<string, string> = { critical: '#ff6b6b', high: '#f0a500', medium: '#7c83fd', low: '#888' };

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px', flex: '1 1 160px' }}>
      <div style={{ fontSize: '11px', color: C.muted, fontWeight: 600, marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '26px', fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

function SectionCard({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px', marginTop: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700 }}>{title}</div>
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
  }, [ticCodeDir]);

  useEffect(loadAll, [loadAll]);

  const transition = useCallback(async (id: string, state: string) => {
    const r = (await window.ticAnalyzer.updateTriage(projectPath, id, { state })) as { ok: boolean; error?: string };
    setMsg(r.ok ? '' : r.error ?? 'erro');
    loadAll();
  }, [projectPath, loadAll]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
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
  const riskColor = riskLevel === 'CRITICAL' ? C.red : riskLevel === 'HIGH' ? '#ff9f43' : riskLevel === 'MEDIUM' ? C.orange : C.green;

  // ── Distribuição por módulo (debt) ────────────────────────────────────────
  const moduleBars = ((analysis?.metrics?.topHotspots ?? []) as Array<{ file: string; debtScore: number }>)
    .slice(0, 8).map((h) => ({ label: h.file.split('/').pop() ?? h.file, value: h.debtScore }));

  const filteredTriage = triage
    .filter((t) => triageFilter === 'all' || t.state === triageFilter)
    .sort((a, b) => ['critical', 'high', 'medium', 'low'].indexOf(a.priority) - ['critical', 'high', 'medium', 'low'].indexOf(b.priority));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px' }}>Governança de Engenharia</div>
          <div style={{ fontSize: '12px', color: C.muted }}>Regras de arquitetura · triagem · risco preditivo · histórico de PRs</div>
        </div>
        <button onClick={() => window.ticAnalyzer.openArchReport(projectPath)}
          style={{ padding: '7px 14px', background: C.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}>
          📐 Relatório de arquitetura (HTML)
        </button>
      </div>

      {/* 🎯 KPIs */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Kpi label="🎯 IMPACT SCORE" value={impactScore.toLocaleString()} sub="arestas de impacto cross-tier" color={C.accent} />
        <Kpi label="⚠️ RISK LEVEL" value={riskLevel} sub={criticalOpen > 0 ? `${criticalOpen} crítico(s) na triagem` : `health ${cur?.score ?? '—'}/100`} color={riskColor} />
        <Kpi label="📦 MODULES ANALYZED" value={String(cur?.counts.modules ?? analysis?.modules?.length ?? 0)} sub={prev ? `${(cur!.counts.modules - prev.counts.modules) >= 0 ? '+' : ''}${cur!.counts.modules - prev.counts.modules} vs anterior` : undefined} color={C.green} />
        <Kpi label="🏗️ ARCHITECTURE DRIFT" value={String(archData?.violations.length ?? 0)} sub={`${archErrors} error · ${archWarns} warn`} color={archErrors > 0 ? C.red : C.green} />
      </div>

      {/* 📊 Impact Analysis */}
      <SectionCard title="📊 IMPACT ANALYSIS — tendência de PRs e distribuição de dívida">
        {prHistory.length >= 2 ? (
          <>
            <div style={{ fontSize: '11px', color: C.muted, marginBottom: '4px' }}>Entidades impactadas por PR analisado</div>
            <SvgLineChart
              points={prHistory.map((p, i) => ({ x: i, y: p.totalImpacted, label: `${new Date(p.date).toLocaleDateString('pt-BR')} · ${p.changedFiles} arquivos · ${p.gateFailed ? '❌ gate' : '✅'}` }))}
              color={C.accent} height={150}
            />
          </>
        ) : (
          <div style={{ fontSize: '12px', color: C.muted, marginBottom: '10px' }}>
            Tendência aparece após 2+ execuções de <code>tic-analyzer pr-review</code> (CI self-hosted ou local).
          </div>
        )}
        {moduleBars.length > 0 && (
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '11px', color: C.muted, marginBottom: '4px' }}>Dívida técnica — maiores focos</div>
            <SvgBarChart items={moduleBars} color={C.orange} />
          </div>
        )}
      </SectionCard>

      {/* 🔍 Triage Queue */}
      <SectionCard
        title={`🔍 TRIAGE QUEUE — ${triage.length} item(ns)`}
        right={
          <select value={triageFilter} onChange={(e) => setTriageFilter(e.target.value)}
            style={{ padding: '4px 8px', background: '#1a1a3a', border: `1px solid ${C.border}`, borderRadius: '6px', color: '#ccc', fontSize: '11px' }}>
            <option value="all">todos os estados</option>
            {Object.keys(STATE_COLORS).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        }>
        {msg && <div style={{ color: C.red, fontSize: '11px', marginBottom: '8px' }}>{msg}</div>}
        {filteredTriage.length === 0 ? (
          <div style={{ fontSize: '12px', color: C.muted }}>Fila vazia — riscos critical/high e violações de regra entram aqui automaticamente a cada análise.</div>
        ) : filteredTriage.slice(0, 15).map((t) => (
          <div key={t.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: '12px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: PRIORITY_COLORS[t.priority] ?? C.muted, flexShrink: 0 }} title={`prioridade ${t.priority}`} />
            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', background: t.category === 'bug' ? '#3a1a1a' : '#1a2a3a', color: t.category === 'bug' ? '#ff9a9a' : '#9ad0ff' }}>{t.category}</span>
            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', background: '#0d1117', color: STATE_COLORS[t.state] ?? C.muted, border: `1px solid ${STATE_COLORS[t.state] ?? C.border}` }}>{t.state}</span>
            <span style={{ flex: 1, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.detail ?? t.title}>{t.title}</span>
            <select value="" onChange={(e) => e.target.value && transition(t.id, e.target.value)}
              style={{ padding: '3px 6px', background: '#1a1a3a', border: `1px solid ${C.border}`, borderRadius: '6px', color: '#ccc', fontSize: '10px' }}>
              <option value="">mover para…</option>
              {(STATE_NEXT[t.state] ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        ))}
        <div style={{ fontSize: '10px', color: '#555', marginTop: '8px' }}>
          Máquina de estados da skill <code>triage</code> (mattpocock/skills) — brief de qualquer item via MCP: <code>get_agent_brief(id)</code>
        </div>
      </SectionCard>

      {/* 🏗️ Architecture Governance */}
      <SectionCard title="🏗️ ARCHITECTURE GOVERNANCE — compliance por regra">
        {!archData || archData.rules.length === 0 ? (
          <div style={{ fontSize: '12px', color: C.muted }}>
            Sem <code>.tic-rules.json</code> na raiz do projeto. Exemplo gerado em <code>.tic-code/tic-rules.example.json</code> — copie, ajuste e re-analise.
          </div>
        ) : archData.rules.map((r) => {
          const v = archData.violations.filter((x) => x.ruleId === r.id);
          return (
            <div key={r.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${C.border}`, fontSize: '12px' }}>
              <span style={{ fontSize: '14px' }}>{v.length === 0 ? '✅' : '❌'}</span>
              <code style={{ color: C.accent, width: '160px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.id}</code>
              <span style={{ color: r.severity === 'error' ? C.red : C.orange, width: '44px', fontSize: '10px' }}>{r.severity}</span>
              <span style={{ flex: 1, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description ?? ''}</span>
              <span style={{ color: v.length > 0 ? C.red : C.green, fontWeight: 600 }}>{v.length === 0 ? 'compliant' : `${v.length} violação(ões)`}</span>
            </div>
          );
        })}
      </SectionCard>

      {/* 📈 Recent PRs */}
      <SectionCard title="📈 RECENT PRs — blast radius e status de risco">
        {prHistory.length === 0 ? (
          <div style={{ fontSize: '12px', color: C.muted }}>
            Sem histórico ainda — cada execução de <code>tic-analyzer pr-review</code> registra aqui (persiste em runner self-hosted e uso local).
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: C.muted, textAlign: 'left' }}>
                <th style={{ padding: '4px' }}>Data</th><th>Arquivos</th><th>Blast radius</th><th>Riscos novos</th><th>Drift novo</th><th>Δ Health</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[...prHistory].reverse().slice(0, 10).map((p, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: '6px 4px', color: C.muted }}>{new Date(p.date).toLocaleString('pt-BR')}</td>
                  <td>{p.changedFiles}</td>
                  <td style={{ color: C.accent, fontWeight: 600 }}>{p.totalImpacted}</td>
                  <td style={{ color: p.newRisks > 0 ? C.red : C.muted }}>{p.newRisks}</td>
                  <td style={{ color: p.newRuleViolations > 0 ? C.red : C.muted }}>{p.newRuleViolations}</td>
                  <td style={{ color: (p.healthDelta ?? 0) < 0 ? C.red : C.green }}>{p.healthDelta !== null ? `${p.healthDelta >= 0 ? '+' : ''}${p.healthDelta}` : '—'}</td>
                  <td>{p.gateFailed ? '❌ gate' : '✅ ok'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}
