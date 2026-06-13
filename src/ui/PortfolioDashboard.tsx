/**
 * Aba Portfólio — visão executiva cross-repositório. Compara saúde, risco,
 * drift e custo da dívida de TODOS os projetos analisados (registro global),
 * pior saúde primeiro. Independe do projeto aberto.
 */
import { useCallback, useEffect, useState } from 'react';
import { SvgBarChart } from './charts/SvgBarChart';

const C = { card: '#16213e', border: '#2a2a4e', accent: '#7c83fd', green: '#56cfad', red: '#ff6b6b', orange: '#f0a500', text: '#e0e0e0', muted: '#888' };

interface ProjectSummary {
  id: string; name: string; path: string; analyzedAt: string;
  healthScore: number | null; healthGrade: string | null;
  totalFiles: number; totalLines: number;
  risks: { total: number; critical: number; high: number };
  archErrors: number; debtCost: number | null; currency: string; hoursSaved: number | null;
}

const scoreColor = (s: number | null) => s === null ? C.muted : s >= 75 ? C.green : s >= 60 ? C.orange : C.red;

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
  const avgHealth = projects.length ? Math.round(projects.reduce((s, p) => s + (p.healthScore ?? 0), 0) / projects.length) : 0;
  const currency = projects[0]?.currency ?? 'US$';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px' }}>Portfólio</div>
          <div style={{ fontSize: '12px', color: C.muted }}>Visão executiva cross-repositório — onde focar tempo e dinheiro primeiro (pior saúde no topo).</div>
        </div>
        <button onClick={addProject} disabled={busy}
          style={{ padding: '7px 14px', background: C.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}>
          {busy ? 'Analisando…' : '+ Adicionar projeto'}
        </button>
      </div>

      {projects.length === 0 ? (
        <div style={{ fontSize: '13px', color: C.muted, padding: '30px', textAlign: 'center' as const }}>
          Portfólio vazio. Clique em <strong>+ Adicionar projeto</strong> (ou rode <code>tic-analyzer analyze</code> / a Action em CI) para popular a visão executiva.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {[
              { label: 'PROJETOS', value: String(projects.length), color: C.accent },
              { label: 'SAÚDE MÉDIA', value: `${avgHealth}/100`, color: scoreColor(avgHealth) },
              { label: 'RISCOS CRÍTICOS', value: String(totalCritical), color: totalCritical > 0 ? C.red : C.green },
              { label: 'DÍVIDA TOTAL', value: `${currency} ${totalDebt.toLocaleString()}`, color: C.orange }
            ].map((k) => (
              <div key={k.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '14px', flex: '1 1 150px' }}>
                <div style={{ fontSize: '11px', color: C.muted, fontWeight: 600, marginBottom: '6px' }}>{k.label}</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {projects.some((p) => p.debtCost) && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>💰 Custo da dívida por projeto</div>
              <SvgBarChart items={projects.filter((p) => p.debtCost).map((p) => ({ label: p.name, value: p.debtCost! }))} color={C.orange} formatValue={(v) => `${currency} ${v.toLocaleString()}`} />
            </div>
          )}

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px' }}>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead><tr style={{ color: C.muted, textAlign: 'left' }}>
                <th style={{ padding: '6px 4px' }}>Health</th><th>Projeto</th><th>Arquivos</th><th>Crít/Alto</th><th>Drift</th><th>Dívida</th><th>Analisado</th><th></th>
              </tr></thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px 4px' }}><span style={{ fontWeight: 800, color: scoreColor(p.healthScore) }}>{p.healthScore ?? '—'}</span> <span style={{ color: C.muted, fontSize: '10px' }}>{p.healthGrade}</span></td>
                    <td title={p.path}>{p.name}</td>
                    <td>{p.totalFiles.toLocaleString()}</td>
                    <td><span style={{ color: p.risks.critical ? C.red : C.muted }}>{p.risks.critical}</span>/<span style={{ color: p.risks.high ? C.orange : C.muted }}>{p.risks.high}</span></td>
                    <td style={{ color: p.archErrors ? C.red : C.muted }}>{p.archErrors}</td>
                    <td>{p.debtCost !== null ? `${p.currency} ${p.debtCost.toLocaleString()}` : '—'}</td>
                    <td style={{ color: C.muted }}>{new Date(p.analyzedAt).toLocaleDateString('pt-BR')}</td>
                    <td style={{ textAlign: 'right' as const, whiteSpace: 'nowrap' as const }}>
                      <button onClick={() => reanalyze(p.path)} disabled={busy} title="Re-analisar" style={{ background: 'transparent', border: 'none', color: C.accent, cursor: 'pointer', fontSize: '13px' }}>↻</button>
                      <button onClick={() => remove(p.id)} title="Remover" style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '13px' }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
