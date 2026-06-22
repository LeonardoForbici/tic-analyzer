import { useCallback, useEffect, useState } from 'react';
import { SvgBarChart } from './charts/SvgBarChart';

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

interface ProjectSummary {
  id: string; name: string; path: string; analyzedAt: string;
  healthScore: number | null; healthGrade: string | null;
  totalFiles: number; totalLines: number;
  risks: { total: number; critical: number; high: number };
  archErrors: number; debtCost: number | null; currency: string; hoursSaved: number | null;
}

function Icon({ name, size = 20, color, fill = 0 }: { name: string; size?: number; color?: string; fill?: number }) {
  return (
    <span className="material-symbols-outlined" style={{
      fontSize: `${size}px`, color, lineHeight: 1, display: 'inline-flex', alignItems: 'center',
      fontVariationSettings: `'FILL' ${fill}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
    }}>{name}</span>
  );
}

const scoreColor = (s: number | null) =>
  s === null ? C.onSurfaceVariant : s >= 75 ? C.secondary : s >= 60 ? C.tertiaryFixedDim : C.error;

function MiniGauge({ score }: { score: number | null }) {
  if (score === null) return <span style={{ color: C.onSurfaceVariant, fontFamily: F.code, fontSize: 13 }}>—</span>;
  const r = 12;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(100, score)) / 100);
  const color = scoreColor(score);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width={32} height={32} viewBox="0 0 32 32">
        <circle cx="16" cy="16" r={r} fill="none" stroke={C.surfaceContainerHighest} strokeWidth={3}
          transform="rotate(-90 16 16)" />
        <circle cx="16" cy="16" r={r} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset} transform="rotate(-90 16 16)" />
      </svg>
      <span style={{ fontSize: 16, fontWeight: 800, fontFamily: F.headline, color, lineHeight: 1 }}>{score}</span>
    </div>
  );
}

export function PortfolioDashboard() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    window.ticAnalyzer.getPortfolio().then((p) => setProjects(Array.isArray(p) ? p as ProjectSummary[] : []));
  }, []);
  useEffect(load, [load]);

  const addProject = useCallback(async () => {
    const folder = await window.ticAnalyzer.selectFolder();
    if (!folder) return;
    setBusy(true);
    await window.ticAnalyzer.analyzePortfolioProject(folder);
    setBusy(false);
    load();
  }, [load]);

  const reanalyze = useCallback(async (path: string) => {
    setBusy(true);
    await window.ticAnalyzer.analyzePortfolioProject(path);
    setBusy(false);
    load();
  }, [load]);

  const remove = useCallback(async (id: string) => {
    await window.ticAnalyzer.removePortfolioProject(id);
    load();
  }, [load]);

  const totalDebt = projects.reduce((s, p) => s + (p.debtCost ?? 0), 0);
  const totalCritical = projects.reduce((s, p) => s + p.risks.critical, 0);
  const avgHealth = projects.length
    ? Math.round(projects.reduce((s, p) => s + (p.healthScore ?? 0), 0) / projects.length)
    : 0;
  const currency = projects[0]?.currency ?? 'R$';

  return (
    <div style={{ fontFamily: F.body, color: C.onSurface }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: F.headline, color: C.onSurface, margin: 0, lineHeight: 1.2 }}>
            Portfólio de Projetos
          </h2>
          <p style={{ fontSize: 13, color: C.onSurfaceVariant, margin: '4px 0 0' }}>
            Visão executiva cross-repositório — onde focar tempo e dinheiro primeiro.
          </p>
        </div>
        <button onClick={addProject} disabled={busy}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            background: C.primaryFixedDim, border: 'none', borderRadius: 8,
            color: '#00363a', cursor: busy ? 'wait' : 'pointer', fontFamily: F.code, fontSize: 12, fontWeight: 700,
            opacity: busy ? 0.7 : 1 }}>
          <Icon name={busy ? 'progress_activity' : 'add'} size={15} color="#00363a" />
          {busy ? 'Analisando…' : 'Adicionar projeto'}
        </button>
      </div>

      {projects.length === 0 ? (
        <div style={{ fontSize: 13, color: C.onSurfaceVariant, padding: '48px 24px', textAlign: 'center' as const,
          background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 12 }}>
          <Icon name="inventory_2" size={40} color={C.outline} />
          <div style={{ marginTop: 12, marginBottom: 8 }}>Portfólio vazio.</div>
          <div style={{ fontSize: 12 }}>
            Clique em <strong style={{ color: C.primaryFixedDim }}>Adicionar projeto</strong> ou rode{' '}
            <code style={{ fontFamily: F.code, color: C.primaryFixedDim }}>tic-analyzer analyze</code> para popular a visão executiva.
          </div>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              { label: 'Projetos', value: String(projects.length), color: C.primaryFixedDim, icon: 'folder_special' },
              { label: 'Saúde Média', value: `${avgHealth}/100`, color: scoreColor(avgHealth), icon: 'health_metrics' },
              { label: 'Riscos Críticos', value: String(totalCritical), color: totalCritical > 0 ? C.error : C.secondary, icon: 'crisis_alert' },
              { label: 'Dívida Total', value: `${currency} ${totalDebt.toLocaleString()}`, color: C.tertiaryFixedDim, icon: 'account_balance_wallet' },
            ].map((k) => (
              <div key={k.label} style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`,
                borderLeft: `3px solid ${k.color}`, borderRadius: 8, padding: '16px 20px', flex: '1 1 150px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Icon name={k.icon} size={15} color={k.color} />
                  <span style={{ fontSize: 10, fontFamily: F.code, letterSpacing: '0.08em', fontWeight: 700,
                    color: C.onSurfaceVariant, textTransform: 'uppercase' as const }}>{k.label}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: k.color, fontFamily: F.headline, lineHeight: 1 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Debt bar chart */}
          {projects.some((p) => p.debtCost) && (
            <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`,
              borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, fontFamily: F.headline, color: C.onSurface,
                margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="bar_chart" size={16} color={C.onSurfaceVariant} />
                Custo da dívida por projeto
              </h3>
              <SvgBarChart
                items={projects.filter((p) => p.debtCost).map((p) => ({ label: p.name, value: p.debtCost! }))}
                color={C.tertiaryFixedDim}
                formatValue={(v) => `${currency} ${v.toLocaleString()}`}
              />
            </div>
          )}

          {/* Projects table */}
          <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' as const }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', fontFamily: F.body }}>
                <thead>
                  <tr style={{ fontSize: 10, fontFamily: F.code, letterSpacing: '0.06em', color: C.onSurfaceVariant,
                    borderBottom: `1px solid ${C.outlineVariant}`, textAlign: 'left' as const,
                    background: C.surfaceContainer }}>
                    <th style={{ padding: '10px 16px' }}>HEALTH</th>
                    <th style={{ padding: '10px 16px' }}>PROJETO</th>
                    <th style={{ padding: '10px 16px' }}>ARQUIVOS</th>
                    <th style={{ padding: '10px 16px' }}>CRÍT / ALTO</th>
                    <th style={{ padding: '10px 16px' }}>DRIFT</th>
                    <th style={{ padding: '10px 16px' }}>DÍVIDA</th>
                    <th style={{ padding: '10px 16px' }}>ANALISADO</th>
                    <th style={{ padding: '10px 16px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${C.outlineVariant}40`,
                      transition: 'background 0.1s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = C.surfaceContainer)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '12px 16px' }}>
                        <MiniGauge score={p.healthScore} />
                        {p.healthGrade && <span style={{ fontSize: 10, color: C.onSurfaceVariant, fontFamily: F.code, marginLeft: 4 }}>{p.healthGrade}</span>}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: C.onSurface }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: C.onSurfaceVariant, fontFamily: F.code,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                          maxWidth: 240 }} title={p.path}>{p.path}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: F.code }}>{p.totalFiles.toLocaleString()}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ color: p.risks.critical ? C.error : C.onSurfaceVariant, fontWeight: p.risks.critical ? 700 : 400, fontFamily: F.code }}>
                          {p.risks.critical}
                        </span>
                        <span style={{ color: C.outlineVariant }}> / </span>
                        <span style={{ color: p.risks.high ? C.tertiaryFixedDim : C.onSurfaceVariant, fontFamily: F.code }}>
                          {p.risks.high}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: F.code,
                        color: p.archErrors ? C.error : C.onSurfaceVariant }}>{p.archErrors}</td>
                      <td style={{ padding: '12px 16px', fontFamily: F.code,
                        color: p.debtCost !== null ? C.tertiaryFixedDim : C.onSurfaceVariant }}>
                        {p.debtCost !== null ? `${p.currency} ${p.debtCost.toLocaleString()}` : '—'}
                      </td>
                      <td style={{ padding: '12px 16px', color: C.onSurfaceVariant, fontFamily: F.code, fontSize: 11 }}>
                        {new Date(p.analyzedAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' as const, whiteSpace: 'nowrap' as const }}>
                        <button onClick={() => reanalyze(p.path)} disabled={busy} title="Re-analisar"
                          style={{ background: 'transparent', border: 'none', color: C.primaryFixedDim,
                            cursor: 'pointer', padding: '4px 6px', borderRadius: 4 }}>
                          <Icon name="refresh" size={16} color={C.primaryFixedDim} />
                        </button>
                        <button onClick={() => remove(p.id)} title="Remover"
                          style={{ background: 'transparent', border: 'none', color: C.onSurfaceVariant,
                            cursor: 'pointer', padding: '4px 6px', borderRadius: 4 }}>
                          <Icon name="close" size={16} color={C.onSurfaceVariant} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
