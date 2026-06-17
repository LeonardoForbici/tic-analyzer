import { useEffect, useState } from 'react';
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

const C = {
  bg: '#0b1326', surfaceContainer: '#171f33', surfaceContainerLow: '#131b2e',
  surfaceContainerHigh: '#222a3d', surfaceContainerHighest: '#2d3449',
  primary: '#dbfcff', primaryFixedDim: '#00dbe9', primaryFixed: '#7df4ff',
  secondary: '#4edea3', error: '#ffb4ab',
  tertiaryFixedDim: '#ffb95f',
  onSurface: '#dae2fd', onSurfaceVariant: '#b9cacb',
  outline: '#849495', outlineVariant: '#3b494b',
};
const F = {
  headline: "'Geist', 'Inter', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  code: "'JetBrains Mono', monospace",
};

function Icon({ name, size = 20, color, fill = 0 }: { name: string; size?: number; color?: string; fill?: number }) {
  return (
    <span className="material-symbols-outlined" style={{
      fontSize: `${size}px`, color, lineHeight: 1, display: 'inline-flex', alignItems: 'center',
      fontVariationSettings: `'FILL' ${fill}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
    }}>{name}</span>
  );
}

const DIM_META: Record<string, {
  label: string; icon: string; color: string;
  goodStatus: string; midStatus: string; badStatus: string;
  weight: string; desc: string;
  itemsOf: (cur: Snapshot, resolutionPct: number) => Array<[string, string]>;
}> = {
  debt: {
    label: 'Dívida', icon: 'account_balance_wallet', color: C.tertiaryFixedDim,
    goodStatus: 'SAUDÁVEL', midStatus: 'ATENÇÃO', badStatus: 'CRÍTICO', weight: '25%',
    desc: 'Arquivos com código muito complexo — custam caro para manter e têm mais bugs.',
    itemsOf: (cur) => [
      ['Complexidade Alta', `${cur.counts.hotspots} arquivos`],
      ['Violações', `${cur.counts.violations} itens`],
    ],
  },
  risks: {
    label: 'Risco', icon: 'gpp_maybe', color: C.primaryFixedDim,
    goodStatus: 'SAUDÁVEL', midStatus: 'ATENÇÃO', badStatus: 'CRÍTICO', weight: '30%',
    desc: 'Arquivos que mudam muito E são complexos ao mesmo tempo — os mais propensos a quebrar.',
    itemsOf: (cur) => [
      ['Riscos detectados', `${cur.counts.risks} itens`],
      ['Endpoints expostos', `${cur.counts.endpoints} endpoints`],
    ],
  },
  violations: {
    label: 'Drift', icon: 'compare_arrows', color: C.secondary,
    goodStatus: 'ESTÁVEL', midStatus: 'MONITOR', badStatus: 'CRÍTICO', weight: '15%',
    desc: 'O projeto está seguindo as regras de organização definidas? Drift = desvio da arquitetura planejada.',
    itemsOf: (cur) => [
      ['Regras quebradas', `${cur.counts.violations} itens`],
      ['Módulos analisados', `${cur.counts.modules} módulos`],
    ],
  },
  deadCode: {
    label: 'Código Morto', icon: 'delete_sweep', color: C.primaryFixed,
    goodStatus: 'OTIMIZADO', midStatus: 'MONITOR', badStatus: 'CRÍTICO', weight: '10%',
    desc: 'Código que existe mas nunca é usado — deixa o projeto mais lento e confuso.',
    itemsOf: (cur) => [
      ['Componentes não usados', `${cur.counts.deadComponents} itens`],
      ['PL/SQL morto', `${cur.counts.deadPlsql} itens`],
    ],
  },
  coupling: {
    label: 'Acoplamento', icon: 'link', color: C.tertiaryFixedDim,
    goodStatus: 'SAUDÁVEL', midStatus: 'ATENÇÃO', badStatus: 'CRÍTICO', weight: '15%',
    desc: 'Arquivos que dependem de muitos outros — uma mudança pode quebrar várias partes.',
    itemsOf: (cur) => [
      ['Arquivos muito conectados', `${cur.counts.hotspots} arquivos`],
      ['Conexões rastreadas', `${cur.counts.impactEdges.toLocaleString()}`],
    ],
  },
  resolution: {
    label: 'Heurísticas', icon: 'psychology', color: C.secondary,
    goodStatus: 'ESTÁVEL', midStatus: 'MONITOR', badStatus: 'CRÍTICO', weight: '5%',
    desc: 'O quanto o analisador entendeu a estrutura do código. Quanto maior, mais precisa a análise.',
    itemsOf: (_cur, res) => [
      ['Compreensão do código', `${res}%`],
      ['Dependências mapeadas', `${_cur.counts.totalEdges.toLocaleString()}`],
    ],
  },
};

function CircularGauge({ score, grade, delta }: { score: number; grade: string; delta: number | null }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(100, score)) / 100);
  const gaugeColor = score >= 75 ? C.primaryFixedDim : score >= 60 ? C.secondary : C.error;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0' }}>
      <div style={{ position: 'relative', width: 192, height: 192 }}>
        <svg width={192} height={192} viewBox="0 0 100 100" style={{ filter: 'drop-shadow(0 0 8px rgba(0,219,233,0.15))' }}>
          <circle cx="50" cy="50" r={r} fill="none" stroke={C.surfaceContainerHighest} strokeWidth={8} strokeLinecap="round"
            transform="rotate(-90 50 50)" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={gaugeColor} strokeWidth={8} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            transform="rotate(-90 50 50)"
            style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 48, fontWeight: 900, lineHeight: 1, color: gaugeColor, fontFamily: F.headline,
            textShadow: `0 0 12px ${gaugeColor}80` }}>{score}</span>
          <span style={{ fontSize: 12, color: C.onSurfaceVariant, fontFamily: F.code, marginTop: 2 }}>/ 100</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span style={{ fontSize: 13, color: C.onSurfaceVariant, fontFamily: F.body }}>Grade</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: gaugeColor, fontFamily: F.headline }}>{grade}</span>
        {delta !== null && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 12, fontFamily: F.code,
            color: delta >= 0 ? C.secondary : C.error }}>
            <Icon name={delta >= 0 ? 'trending_up' : 'trending_down'} size={14} color={delta >= 0 ? C.secondary : C.error} />
            {delta >= 0 ? '+' : ''}{delta}
          </span>
        )}
      </div>
    </div>
  );
}

export function HealthDashboard({ ticCodeDir }: { ticCodeDir: string }) {
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null);
  const [roi, setRoi] = useState<{ devDays?: number; hoursSaved?: number; debtCost?: number; savedCost?: number; currency?: string } | null>(null);
  const [error, setError] = useState('');
  const [selectedRisk, setSelectedRisk] = useState<'critical' | 'medium' | 'low' | null>(null);

  useEffect(() => {
    const load = () => {
      window.ticAnalyzer.readFile(`${ticCodeDir}/snapshots.json`).then((content) => {
        if (!content) { setError('snapshots.json não encontrado — execute a análise novamente.'); return; }
        try { setSnaps(JSON.parse(content)); setError(''); } catch { setError('snapshots.json inválido.'); }
      });
      window.ticAnalyzer.readFile(`${ticCodeDir}/roi.json`).then((c) => {
        try { if (c) setRoi(JSON.parse(c)); } catch { /* optional */ }
      });
    };
    load();
    const off = window.ticAnalyzer.onActivity?.((e: { type?: string }) => { if (e?.type === 'analysis') load(); });
    return off;
  }, [ticCodeDir]);

  if (error) return (
    <div style={{ padding: '40px', textAlign: 'center', color: C.onSurfaceVariant, fontFamily: F.body, fontSize: 13 }}>
      <Icon name="info" size={24} color={C.outline} />
      <div style={{ marginTop: 8 }}>{error}</div>
    </div>
  );
  if (!snaps || snaps.length === 0) return (
    <div style={{ padding: '40px', textAlign: 'center', color: C.onSurfaceVariant, fontFamily: F.body, fontSize: 13 }}>
      <div style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>
        <Icon name="progress_activity" size={24} color={C.primaryFixedDim} />
      </div>
      <div style={{ marginTop: 8 }}>Carregando…</div>
    </div>
  );

  const cur = snaps[snaps.length - 1];
  const prev = snaps.length > 1 ? snaps[snaps.length - 2] : null;
  const delta = prev ? Math.round((cur.score - prev.score) * 10) / 10 : null;
  const resolutionPct = cur.counts.totalEdges > 0 ? Math.round((cur.counts.resolvedEdges / cur.counts.totalEdges) * 100) : 0;

  const currency = roi?.currency ?? 'R$';
  const money = (n: number) => `${currency} ${n.toLocaleString()}`;

  return (
    <div style={{ fontFamily: F.body, color: C.onSurface }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: F.headline, color: C.onSurface, margin: 0, lineHeight: 1.2 }}>
            Saúde do Ecossistema
          </h2>
          <p style={{ fontSize: 13, color: C.onSurfaceVariant, margin: '4px 0 0', fontFamily: F.body }}>
            {snaps.length} análise(s) · última em {new Date(cur.timestamp).toLocaleString('pt-BR')}
            {cur.gitSha ? ` · git ${cur.gitSha.slice(0, 8)}` : ''}
          </p>
        </div>
        <div style={{ fontSize: 12, color: C.onSurfaceVariant, fontFamily: F.code, textAlign: 'right' }}>
          <div>{cur.totalFiles.toLocaleString()} arquivos</div>
          <div>{cur.totalLines.toLocaleString()} linhas</div>
        </div>
      </div>

      {/* Top Row: Gauge + Business Impact */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 16 }}>
        {/* Gauge Card */}
        <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 12,
          padding: 24, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160,
            background: C.primaryFixedDim, borderRadius: '50%', filter: 'blur(80px)', opacity: 0.08, pointerEvents: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, fontFamily: F.headline, color: C.onSurface, margin: 0 }}>
              System Health Score
            </h3>
            <span style={{ fontSize: 10, fontFamily: F.code, letterSpacing: '0.08em', fontWeight: 700,
              color: C.primaryFixedDim, border: `1px solid ${C.primaryFixedDim}40`,
              background: `${C.primaryFixedDim}18`, padding: '3px 8px', borderRadius: 4 }}>
              {cur.score >= 75 ? 'STABLE' : cur.score >= 60 ? 'MONITOR' : 'CRITICAL'}
            </span>
          </div>
          <p style={{ fontSize: 12, color: C.onSurfaceVariant, margin: '8px 0 0' }}>
            Health agregado de todas as dimensões analisadas.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <CircularGauge score={cur.score} grade={cur.grade} delta={delta} />
          </div>
          {/* Sparkline trend */}
          {snaps.length >= 2 && (
            <div style={{ borderTop: `1px solid ${C.outlineVariant}`, paddingTop: 12, marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: C.onSurfaceVariant, fontFamily: F.code }}>Tendência ({snaps.length} análises)</span>
                {delta !== null && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: F.code,
                    color: delta >= 0 ? C.secondary : C.error }}>
                    <Icon name={delta >= 0 ? 'trending_up' : 'trending_down'} size={13} color={delta >= 0 ? C.secondary : C.error} />
                    {delta >= 0 ? '+' : ''}{delta}%
                  </span>
                )}
              </div>
              <SvgLineChart
                points={snaps.map((s, i) => ({
                  x: i, y: s.score,
                  label: `${new Date(s.timestamp).toLocaleDateString('pt-BR')}${s.gitSha ? ` · ${s.gitSha.slice(0, 7)}` : ''}`
                }))}
                yMin={0} yMax={100}
                color={cur.score >= 75 ? C.primaryFixedDim : cur.score >= 60 ? C.secondary : C.error}
                height={32}
              />
            </div>
          )}
        </div>

        {/* Business Impact */}
        <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 12,
          padding: 24, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, fontFamily: F.headline, color: C.onSurface, margin: 0,
                display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="payments" size={18} color={C.secondary} />
                Business Impact Analysis
              </h3>
              <p style={{ fontSize: 12, color: C.onSurfaceVariant, margin: '4px 0 0' }}>
                Estimativa do custo técnico atual vs ganhos potenciais.
              </p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 1 }}>
            {/* Custo da Dívida */}
            <div style={{ background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}50`, borderRadius: 8,
              padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, fontFamily: F.code, letterSpacing: '0.08em', fontWeight: 700,
                color: C.onSurfaceVariant, display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>
                Custo da Dívida
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 900, fontFamily: F.headline, lineHeight: 1,
                  color: C.error }}>
                  {roi?.devDays ?? cur.counts.hotspots}
                </span>
                <span style={{ fontSize: 14, color: C.onSurfaceVariant, fontFamily: F.code }}>
                  {roi?.devDays !== undefined ? 'dev-days' : 'hotspots'}
                </span>
              </div>
              <div style={{ marginTop: 12, background: C.surfaceContainerHighest, height: 6, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: C.error, borderRadius: 3,
                  width: `${Math.min(100, roi ? 65 : (cur.counts.hotspots / 20 * 100))}%` }} />
              </div>
              <span style={{ fontSize: 12, color: `${C.error}cc`, marginTop: 8, display: 'block' }}>
                {roi?.debtCost ? money(roi.debtCost) : `${cur.counts.risks} riscos detectados`}
              </span>
            </div>
            {/* Potencial de Economia */}
            <div style={{ background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}50`, borderRadius: 8,
              padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center',
              position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 128, height: 128,
                background: C.secondary, borderRadius: '50%', filter: 'blur(40px)', opacity: 0.08 }} />
              <span style={{ fontSize: 10, fontFamily: F.code, letterSpacing: '0.08em', fontWeight: 700,
                color: C.onSurfaceVariant, display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>
                Potencial de Economia (PR)
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, position: 'relative' }}>
                <span style={{ fontSize: 32, fontWeight: 900, fontFamily: F.headline, lineHeight: 1,
                  color: C.secondary }}>
                  {roi?.hoursSaved ?? Math.round(cur.counts.resolvedEdges / 100)}
                </span>
                <span style={{ fontSize: 14, color: C.onSurfaceVariant, fontFamily: F.code }}>
                  {roi?.hoursSaved !== undefined ? 'h/semana' : 'h estimadas'}
                </span>
              </div>
              <div style={{ marginTop: 12, background: C.surfaceContainerHighest, height: 6, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: C.secondary, borderRadius: 3, width: '85%' }} />
              </div>
              <span style={{ fontSize: 12, color: `${C.secondary}cc`, marginTop: 8, display: 'block', position: 'relative' }}>
                {roi?.savedCost ? money(roi.savedCost) : `${resolutionPct}% resolução AST`}
              </span>
            </div>
          </div>
          {/* KPI grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
            {[
              { label: 'Riscos', value: cur.counts.risks, delta: prev ? cur.counts.risks - prev.counts.risks : null, goodDown: true, color: C.error },
              { label: 'Violações', value: cur.counts.violations, delta: prev ? cur.counts.violations - prev.counts.violations : null, goodDown: true, color: C.tertiaryFixedDim },
              { label: 'Hotspots', value: cur.counts.hotspots, delta: prev ? cur.counts.hotspots - prev.counts.hotspots : null, goodDown: true, color: C.tertiaryFixedDim },
              { label: 'Dead Code', value: cur.counts.deadComponents + cur.counts.deadPlsql, delta: null, goodDown: true, color: C.onSurfaceVariant },
              { label: 'Resolução', value: `${resolutionPct}%`, delta: null, goodDown: false, color: C.secondary },
              { label: 'Imp. Edges', value: cur.counts.impactEdges.toLocaleString(), delta: null, goodDown: false, color: C.primaryFixedDim },
            ].map((k) => (
              <div key={k.label} style={{ background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}`,
                borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: typeof k.value === 'string' ? 16 : 18, fontWeight: 800, color: k.color, fontFamily: F.headline, lineHeight: 1 }}>
                  {k.value}
                  {k.delta !== null && k.delta !== 0 && (
                    <span style={{ fontSize: 10, marginLeft: 4, fontFamily: F.code,
                      color: (k.delta! > 0) !== !k.goodDown ? C.secondary : C.error }}>
                      {k.delta! > 0 ? '+' : ''}{k.delta}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: C.onSurfaceVariant, fontFamily: F.code, marginTop: 2 }}>{k.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0 12px', borderBottom: `1px solid ${C.outlineVariant}50` }}>
        <Icon name="grid_view" size={18} color={C.onSurfaceVariant} />
        <h3 style={{ fontSize: 16, fontWeight: 600, fontFamily: F.headline, color: C.onSurface, margin: 0 }}>
          Análise Dimensional (6 Eixos)
        </h3>
      </div>

      {/* 6 Dimension Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
        {Object.entries(DIM_META).map(([dim, meta]) => {
          const b = cur.breakdown?.[dim] ?? { penalty: 0, raw: 0, max: 1 };
          const pct = b.max > 0 ? (b.penalty / b.max) * 100 : 0;
          const dimScore = Math.round(Math.max(0, (1 - b.penalty / Math.max(b.max, 1)) * 100));
          const status = pct >= 60 ? meta.badStatus : pct >= 30 ? meta.midStatus : meta.goodStatus;
          const statusColor = pct >= 60 ? C.error : pct >= 30 ? C.tertiaryFixedDim : meta.color;
          const items = meta.itemsOf(cur, resolutionPct);

          return (
            <div key={dim} style={{
              background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`,
              borderTop: `2px solid ${meta.color}`, borderRadius: 12, padding: 20,
              transition: 'background 0.15s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, fontFamily: F.code, color: C.onSurface, margin: 0,
                  display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name={meta.icon} size={18} color={meta.color} />
                  {meta.label}
                </h4>
                <span style={{ fontSize: 22, fontWeight: 700, fontFamily: F.headline, color: meta.color, lineHeight: 1 }}>
                  {dimScore}
                </span>
              </div>
              <p style={{ fontSize: 11, color: C.onSurfaceVariant, margin: '0 0 10px', fontFamily: F.body, lineHeight: 1.4 }}>
                {meta.desc}
              </p>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 10, fontFamily: F.code, letterSpacing: '0.08em', fontWeight: 700,
                  color: C.onSurfaceVariant, background: C.surfaceContainerHighest,
                  padding: '2px 7px', borderRadius: 4 }}>
                  Importância: {meta.weight}
                </span>
                <span style={{ fontSize: 10, fontFamily: F.code, letterSpacing: '0.08em', fontWeight: 700,
                  color: statusColor, background: `${statusColor}18`,
                  border: `1px solid ${statusColor}40`, padding: '2px 7px', borderRadius: 4 }}>
                  {status}
                </span>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map(([label, val], i) => (
                  <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: 12, fontFamily: F.body }}>
                    <span style={{ color: C.onSurfaceVariant, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                      {label}
                    </span>
                    <span style={{ color: C.onSurface, fontFamily: F.code, fontSize: 11, flexShrink: 0 }}>{val}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Hotspot Treemap */}
      {cur.counts.hotspots > 0 && (() => {
        const hotspotBlocks = (() => {
          const total = cur.counts.hotspots;
          const critical = Math.ceil(total * 0.2);
          const medium = Math.ceil(total * 0.3);
          const low = total - critical - medium;
          return [
            ...Array.from({ length: Math.min(critical, 3) }, (_, i) => ({ risk: 'critical', span: i === 0 ? 2 : 1, rowSpan: i === 0 ? 2 : 1, label: i === 0 ? `${critical} hotspots críticos` : '' })),
            ...Array.from({ length: Math.min(medium, 4) }, (_, i) => ({ risk: 'medium', span: i === 0 ? 2 : 1, rowSpan: 1, label: i === 0 ? `${medium} médios` : '' })),
            ...Array.from({ length: Math.min(low, 6) }, (_, i) => ({ risk: 'low', span: 1, rowSpan: i === 0 ? 3 : 1, label: i === 0 ? `${low} baixo risco` : '' })),
          ];
        })();
        return (
          <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 12, padding: 24, marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600, fontFamily: F.headline, color: C.onSurface, margin: 0,
                  display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="map" size={16} color={C.primaryFixedDim} />
                  Mapa de Hotspots
                </h3>
                <p style={{ fontSize: 12, color: C.onSurfaceVariant, margin: '4px 0 0' }}>
                  Arquivos com alta taxa de alteração (Churn) × alta Complexidade. <strong style={{ color: C.onSurface }}>Clique num bloco</strong> para ver a contagem por categoria.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontFamily: F.code, color: C.onSurfaceVariant, letterSpacing: '0.06em' }}>
                BAIXO RISCO
                <div style={{ width: 64, height: 8, background: `linear-gradient(to right, ${C.surfaceContainerHighest}, #93000a)`, borderRadius: 4 }} />
                ALTO RISCO
              </div>
            </div>
            <div style={{ width: '100%', height: 240, background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}50`,
              borderRadius: 8, padding: 4,
              display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gridTemplateRows: 'repeat(4, 1fr)', gap: 4 }}>
              {hotspotBlocks.map((b, i) => {
                const bg = b.risk === 'critical' ? '#93000a' : b.risk === 'medium' ? '#855300' : C.surfaceContainerHighest;
                const border = b.risk === 'critical' ? `${C.error}80` : b.risk === 'medium' ? `${C.tertiaryFixedDim}50` : `${C.outlineVariant}80`;
                const textColor = b.risk === 'low' ? C.onSurfaceVariant : '#fff';
                return (
                  <div key={i} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 4,
                    gridColumn: `span ${b.span}`, gridRow: `span ${b.rowSpan}`,
                    padding: 6, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                    cursor: 'pointer', transition: 'filter 0.15s', overflow: 'hidden' }}
                    onClick={() => setSelectedRisk(prev => prev === b.risk ? null : b.risk as 'critical' | 'medium' | 'low')}
                    onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.3)')}
                    onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}>
                    {b.label && (
                      <span style={{ fontSize: 10, fontFamily: F.code, color: textColor, opacity: 0.85,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{b.label}</span>
                    )}
                    {b.risk === 'critical' && b.span > 1 && (
                      <span style={{ fontSize: 9, fontFamily: F.code, color: C.error, letterSpacing: '0.06em', fontWeight: 700 }}>CRÍTICO</span>
                    )}
                  </div>
                );
              })}
            </div>
            {selectedRisk && (() => {
              const count = selectedRisk === 'critical' ? Math.ceil(cur.counts.hotspots * 0.2)
                : selectedRisk === 'medium' ? Math.ceil(cur.counts.hotspots * 0.3)
                : cur.counts.hotspots - Math.ceil(cur.counts.hotspots * 0.2) - Math.ceil(cur.counts.hotspots * 0.3);
              const color = selectedRisk === 'critical' ? C.error : selectedRisk === 'medium' ? C.tertiaryFixedDim : C.outline;
              const label = selectedRisk === 'critical' ? 'Críticos' : selectedRisk === 'medium' ? 'Médios' : 'Baixo Risco';
              return (
                <div style={{ marginTop: 12, padding: '12px 16px', background: `${color}14`, border: `1px solid ${color}40`, borderRadius: 8, fontSize: 13, fontFamily: F.body }}>
                  <span style={{ color, fontWeight: 700 }}>{count} arquivo(s) — {label}</span>
                  <span style={{ color: C.onSurfaceVariant, marginLeft: 12 }}>
                    {selectedRisk === 'critical' ? 'Mudam frequentemente E têm código complexo. São os mais urgentes para refatorar.' :
                     selectedRisk === 'medium' ? 'Risco moderado — monitorar nas próximas sprints.' :
                     'Risco baixo — complexidade ou churn acima da média, mas ainda gerenciável.'}
                  </span>
                  <span style={{ color: C.outline, marginLeft: 8, fontSize: 11 }}>— veja os arquivos na aba Explorador.</span>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* Trend Chart */}
      {snaps.length >= 2 && (
        <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 12,
          padding: 20, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, fontFamily: F.headline, color: C.onSurface, margin: 0,
              display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="show_chart" size={16} color={C.primaryFixedDim} />
              Tendência do Health Score
            </h3>
            <span style={{ fontSize: 11, color: C.onSurfaceVariant, fontFamily: F.code }}>{snaps.length} análises</span>
          </div>
          <SvgLineChart
            points={snaps.map((s, i) => ({
              x: i, y: s.score,
              label: `${new Date(s.timestamp).toLocaleDateString('pt-BR')} ${new Date(s.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${s.gitSha ? ` · ${s.gitSha.slice(0, 7)}` : ''}`
            }))}
            yMin={0} yMax={100}
            color={cur.score >= 75 ? C.primaryFixedDim : cur.score >= 60 ? C.secondary : C.error}
          />
          <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 11, color: C.onSurfaceVariant, fontFamily: F.code }}>
            <span>Riscos: {prev!.counts.risks} → <strong style={{ color: cur.counts.risks > prev!.counts.risks ? C.error : C.secondary }}>{cur.counts.risks}</strong></span>
            <span>Violações: {prev!.counts.violations} → <strong style={{ color: cur.counts.violations > prev!.counts.violations ? C.error : C.secondary }}>{cur.counts.violations}</strong></span>
            <span>Linhas: {prev!.totalLines.toLocaleString()} → {cur.totalLines.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
