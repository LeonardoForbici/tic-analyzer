/**
 * Dashboard de saúde do projeto: gauge do score atual, breakdown por dimensão,
 * tendência entre análises (snapshots.json) e contadores-chave. 100% local.
 */
import { useEffect, useState } from 'react';
import { SvgGauge } from './charts/SvgGauge';
import { SvgLineChart } from './charts/SvgLineChart';

interface Breakdown { penalty: number; raw: number; max: number; }
interface Snapshot {
  timestamp: string;
  gitSha?: string;
  totalFiles: number;
  totalLines: number;
  score: number;
  grade: string;
  breakdown: Record<string, Breakdown>;
  counts: {
    risks: number; violations: number; hotspots: number;
    deadComponents: number; deadPlsql: number;
    resolvedEdges: number; totalEdges: number;
    endpoints: number; modules: number; impactEdges: number;
  };
}

const C = { card: '#16213e', border: '#2a2a4e', accent: '#7c83fd', green: '#56cfad', red: '#ff6b6b', orange: '#f0a500', text: '#e0e0e0', muted: '#888' };

const DIM_LABELS: Record<string, { label: string; desc: string }> = {
  debt: { label: 'Dívida técnica', desc: 'complexidade × tamanho por KLOC' },
  risks: { label: 'Riscos', desc: 'SQL injection, eval, crypto fraca... ponderados' },
  violations: { label: 'Violações', desc: 'dependências circulares, camadas invertidas' },
  deadCode: { label: 'Dead code', desc: 'componentes e PL/SQL sem uso' },
  coupling: { label: 'Acoplamento', desc: 'arquivos com fan-in+fan-out > 20' },
  resolution: { label: 'Resolução', desc: '% de dependências apenas heurísticas' }
};

export function HealthDashboard({ ticCodeDir }: { ticCodeDir: string }) {
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    window.ticAnalyzer.readFile(`${ticCodeDir}/snapshots.json`).then((content) => {
      if (!content) { setError('snapshots.json não encontrado — execute a análise novamente (versão atual gera o health score).'); return; }
      try { setSnaps(JSON.parse(content)); } catch { setError('snapshots.json inválido.'); }
    });
  }, [ticCodeDir]);

  if (error) return <div style={{ padding: '30px', color: C.muted, fontSize: '13px' }}>{error}</div>;
  if (!snaps || snaps.length === 0) return <div style={{ padding: '30px', color: C.muted }}>Carregando…</div>;

  const cur = snaps[snaps.length - 1];
  const prev = snaps.length > 1 ? snaps[snaps.length - 2] : null;
  const delta = prev ? Math.round((cur.score - prev.score) * 10) / 10 : null;
  const resolutionPct = cur.counts.totalEdges > 0 ? Math.round((cur.counts.resolvedEdges / cur.counts.totalEdges) * 100) : 0;

  const deltaOf = (get: (s: Snapshot) => number): string | null => {
    if (!prev) return null;
    const d = get(cur) - get(prev);
    return d === 0 ? null : `${d > 0 ? '+' : ''}${d}`;
  };

  const kpis: Array<{ label: string; value: string; delta: string | null; goodWhenDown?: boolean; color: string }> = [
    { label: 'Riscos', value: String(cur.counts.risks), delta: deltaOf((s) => s.counts.risks), goodWhenDown: true, color: C.red },
    { label: 'Violações', value: String(cur.counts.violations), delta: deltaOf((s) => s.counts.violations), goodWhenDown: true, color: C.orange },
    { label: 'Hotspots', value: String(cur.counts.hotspots), delta: deltaOf((s) => s.counts.hotspots), goodWhenDown: true, color: C.orange },
    { label: 'Dead code', value: String(cur.counts.deadComponents + cur.counts.deadPlsql), delta: deltaOf((s) => s.counts.deadComponents + s.counts.deadPlsql), goodWhenDown: true, color: C.muted },
    { label: 'Resolução AST', value: `${resolutionPct}%`, delta: null, color: C.green },
    { label: 'Arestas de impacto', value: cur.counts.impactEdges.toLocaleString(), delta: null, color: C.accent }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>Saúde do Projeto</div>
          <div style={{ fontSize: '12px', color: C.muted }}>
            {snaps.length} análise(s) · última em {new Date(cur.timestamp).toLocaleString('pt-BR')}
            {cur.gitSha ? ` · git ${cur.gitSha.slice(0, 8)}` : ''}
          </div>
        </div>
        <div style={{ fontSize: '12px', color: C.muted }}>{cur.totalFiles.toLocaleString()} arquivos · {cur.totalLines.toLocaleString()} linhas</div>
      </div>

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        {/* Gauge + breakdown */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px', display: 'flex', gap: '24px', alignItems: 'center', flex: '1 1 540px' }}>
          <SvgGauge value={cur.score} grade={cur.grade} delta={delta} />
          <div style={{ flex: 1, minWidth: '260px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: C.muted, marginBottom: '10px' }}>PENALIDADES POR DIMENSÃO</div>
            {Object.entries(cur.breakdown)
              .sort((a, b) => b[1].penalty - a[1].penalty)
              .map(([dim, b]) => {
                const meta = DIM_LABELS[dim] ?? { label: dim, desc: '' };
                const pct = b.max > 0 ? (b.penalty / b.max) * 100 : 0;
                const barColor = pct >= 75 ? C.red : pct >= 40 ? C.orange : C.green;
                return (
                  <div key={dim} style={{ marginBottom: '9px' }} title={meta.desc}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                      <span style={{ color: C.text }}>{meta.label}</span>
                      <span style={{ color: b.penalty > 0 ? barColor : C.muted }}>-{b.penalty} <span style={{ color: '#555' }}>/ {b.max}</span></span>
                    </div>
                    <div style={{ height: '6px', background: '#0d1117', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '3px', transition: 'width 0.4s' }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', flex: '1 1 280px', alignContent: 'start' }}>
          {kpis.map((k) => (
            <div key={k.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: k.color }}>{k.value}
                {k.delta && (
                  <span style={{ fontSize: '11px', marginLeft: '6px', color: (k.delta.startsWith('+') !== !k.goodWhenDown) ? C.red : C.green }}>{k.delta}</span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: C.muted }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tendência */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px', marginTop: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: C.muted, marginBottom: '8px' }}>
          TENDÊNCIA DO HEALTH SCORE {snaps.length < 2 ? '— rode novas análises para acompanhar a evolução' : `(${snaps.length} análises)`}
        </div>
        <SvgLineChart
          points={snaps.map((s, i) => ({
            x: i, y: s.score,
            label: `${new Date(s.timestamp).toLocaleDateString('pt-BR')} ${new Date(s.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${s.gitSha ? ` · ${s.gitSha.slice(0, 7)}` : ''}`
          }))}
          yMin={0} yMax={100}
          color={cur.score >= 75 ? C.green : cur.score >= 60 ? C.orange : C.red}
        />
        {snaps.length >= 2 && (
          <div style={{ display: 'flex', gap: '20px', marginTop: '10px', fontSize: '11px', color: C.muted }}>
            <span>Riscos: {prev!.counts.risks} → <strong style={{ color: cur.counts.risks > prev!.counts.risks ? C.red : C.green }}>{cur.counts.risks}</strong></span>
            <span>Violações: {prev!.counts.violations} → <strong style={{ color: cur.counts.violations > prev!.counts.violations ? C.red : C.green }}>{cur.counts.violations}</strong></span>
            <span>Linhas: {prev!.totalLines.toLocaleString()} → {cur.totalLines.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
