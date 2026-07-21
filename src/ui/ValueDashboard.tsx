import { useCallback, useEffect, useState } from 'react';
import { SvgBarChart } from './charts/SvgBarChart';
import { SvgLineChart } from './charts/SvgLineChart';
import { Icon } from './Icon';

const C = {
  bg: '#e9edf5', surfaceContainer: '#ffffff', surfaceContainerLow: '#ffffff',
  surfaceContainerHigh: '#f2f5fb', surfaceContainerHighest: '#e6ebf3',
  primary: '#111827', primaryFixedDim: '#2563eb', primaryFixed: '#93c5fd',
  secondary: '#16a34a', error: '#dc2626',
  tertiaryFixedDim: '#d97706',
  onSurface: '#1e293b', onSurfaceVariant: '#64748b',
  outline: '#94a3b8', outlineVariant: '#e2e8f0',
};
const F = {
  headline: "'Geist Sans', 'Inter', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  code: "'JetBrains Mono', monospace",
};

interface RoiFile { file: string; debtScore: number; hours: number; cost: number; reasons: string[]; }
interface Roi {
  currency: string; hourlyRate: number; hoursPerDebtPoint: number;
  remediationHours: number; devDays: number; debtCost: number; totalDebtScore: number;
  hoursSaved: number; savedCost: number; net: number;
  byModule: Array<{ module: string; cost: number; hours: number }>;
  topFiles: RoiFile[];
}
interface ModuleOwn { module: string; primaryOwner: string; ownershipPct: number; authorCount: number; busFactor: number; onboardingHours: number; difficulty: string; }
interface Ownership { modules: ModuleOwn[]; knowledgeRisk: Array<{ file: string; author: string; reason: string }>; startHere: string[]; }
interface Snapshot { counts?: { debtCost?: number; remediationHours?: number } }

function KpiCard({ label, value, sub, unit, color, icon, accentBg = false }: {
  label: string; value: string; sub?: string; unit?: string; color: string; icon: string; accentBg?: boolean;
}) {
  return (
    <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`,
      borderRadius: 12, padding: 20, flex: '1 1 170px', position: 'relative', overflow: 'hidden' }}>
      {accentBg && (
        <div style={{ position: 'absolute', top: 0, right: 0, width: 96, height: 96,
          background: color, borderRadius: '50%', filter: 'blur(40px)', opacity: 0.1, pointerEvents: 'none' }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Icon name={icon} size={16} color={color} />
        <span style={{ fontSize: 10, fontFamily: F.code, letterSpacing: '0.08em', fontWeight: 700,
          color: C.onSurfaceVariant, textTransform: 'uppercase' as const }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, position: 'relative' }}>
        <span style={{ fontSize: 30, fontWeight: 900, fontFamily: F.headline, lineHeight: 1, color }}>{value}</span>
        {unit && <span style={{ fontSize: 13, color: C.onSurfaceVariant, fontFamily: F.code }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 12, color: `${color}cc`, marginTop: 8, position: 'relative' }}>{sub}</div>}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`,
      borderRadius: 12, padding: 20, marginTop: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, fontFamily: F.headline, color: C.onSurface, margin: '0 0 16px',
        display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon && <Icon name={icon} size={16} color={C.onSurfaceVariant} />}
        {title}
      </h3>
      {children}
    </div>
  );
}

const DIFF_COLOR: Record<string, string> = { baixa: C.secondary, média: C.tertiaryFixedDim, alta: C.error };

export function ValueDashboard({ ticCodeDir, projectPath }: { ticCodeDir: string; projectPath: string }) {
  const [roi, setRoi] = useState<Roi | null>(null);
  const [own, setOwn] = useState<Ownership | null>(null);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [curInput, setCurInput] = useState('R$');
  const [savingCfg, setSavingCfg] = useState(false);
  const [showFormula, setShowFormula] = useState(false);

  const load = useCallback(() => {
    const readJson = async (f: string) => { const c = await window.ticAnalyzer.readFile(`${ticCodeDir}/${f}`); try { return c ? JSON.parse(c) : null; } catch { return null; } };
    readJson('roi.json').then((r) => { setRoi(r); if (r) { setRateInput(String(r.hourlyRate)); setCurInput(r.currency); } });
    readJson('ownership.json').then(setOwn);
    readJson('snapshots.json').then((d) => Array.isArray(d) && setSnaps(d));
  }, [ticCodeDir]);

  const applyRoiConfig = useCallback(async () => {
    const rate = Number(rateInput);
    if (!rate || rate <= 0) { setMsg('Erro: taxa-hora inválida'); return; }
    setSavingCfg(true); setMsg('');
    const r = await window.ticAnalyzer.setRoiConfig(projectPath, { hourlyRate: rate, currency: curInput }) as { ok: boolean; roi?: Roi; error?: string };
    setSavingCfg(false);
    if (r.ok && r.roi) { setRoi(r.roi); setMsg(`Taxa atualizada para ${curInput} ${rate}/h`); }
    else setMsg(`Erro: ${r.error ?? 'falhou'}`);
  }, [rateInput, curInput, projectPath]);

  useEffect(() => {
    load();
    const off = window.ticAnalyzer.onActivity?.((e: { type?: string }) => { if (e?.type === 'analysis') load(); });
    return off;
  }, [load]);

  const exportReport = useCallback(async (format: 'pdf' | 'html') => {
    setExporting(true); setMsg('');
    const r = await window.ticAnalyzer.exportExecutiveReport(projectPath, format);
    setExporting(false);
    setMsg(r.ok ? `Relatório gerado: ${r.path}` : `Erro: ${r.error}`);
  }, [projectPath]);

  const money = (n: number) => `${roi?.currency ?? 'R$'} ${n.toLocaleString()}`;
  const trend = snaps.filter((s) => typeof s.counts?.debtCost === 'number');

  return (
    <div style={{ fontFamily: F.body, color: C.onSurface }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: F.headline, color: C.onSurface, margin: 0, lineHeight: 1.2 }}>
            Valor & ROI
          </h2>
          <p style={{ fontSize: 13, color: C.onSurfaceVariant, margin: '4px 0 0' }}>
            Dívida técnica em tempo e dinheiro, risco de conhecimento e onboarding.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => exportReport('pdf')} disabled={exporting}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              background: C.primaryFixedDim, border: 'none', borderRadius: 8,
              color: '#ffffff', cursor: 'pointer', fontFamily: F.code, fontSize: 12, fontWeight: 700 }}>
            <Icon name="picture_as_pdf" size={15} color="#ffffff" />
            {exporting ? '…' : 'Relatório Executivo'}
          </button>
          <button onClick={() => exportReport('html')} disabled={exporting}
            style={{ padding: '8px 14px', background: 'transparent', border: `1px solid ${C.outlineVariant}`,
              borderRadius: 8, color: C.onSurfaceVariant, cursor: 'pointer', fontFamily: F.code, fontSize: 12 }}>
            HTML
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ fontSize: 12, color: msg.startsWith('Erro') ? C.error : C.secondary, marginBottom: 12,
          fontFamily: F.code, padding: '8px 12px', background: C.surfaceContainerHigh, borderRadius: 6 }}>
          {msg}
        </div>
      )}

      {!roi ? (
        <div style={{ fontSize: 13, color: C.onSurfaceVariant, padding: '40px', textAlign: 'center' as const,
          background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 12 }}>
          <Icon name="receipt_long" size={32} color={C.outline} />
          <div style={{ marginTop: 12 }}>roi.json não encontrado — rode a análise novamente.</div>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <KpiCard label="Custo da Dívida" value={money(roi.debtCost)} unit={`${roi.devDays} dev-days`}
              sub="para sanear completamente" color={C.error} icon="account_balance_wallet" />
            <KpiCard label="Economizado (PRs)" value={`${roi.hoursSaved}h`} unit="/semana"
              sub={money(roi.savedCost)} color={C.secondary} icon="savings" accentBg />
            <KpiCard label="Saldo" value={money(Math.abs(roi.net))}
              sub={roi.net >= 0 ? 'ferramenta já se pagou' : 'investir em saneamento'}
              color={roi.net >= 0 ? C.secondary : C.tertiaryFixedDim} icon="balance" accentBg />
            <KpiCard label="Conhecimento em Risco" value={String(own?.knowledgeRisk.length ?? 0)}
              unit="arquivos" sub="com 1 só autor" color={C.tertiaryFixedDim} icon="person_alert" />
          </div>

          {/* Formula accordion */}
          <div style={{ marginBottom: 20, marginTop: 16, background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 12, overflow: 'hidden' }}>
            <button onClick={() => setShowFormula(s => !s)} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', color: C.onSurfaceVariant,
              fontFamily: F.body, fontSize: 13,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>calculate</span>
                Como este valor foi calculado
              </span>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{showFormula ? 'expand_less' : 'expand_more'}</span>
            </button>
            {showFormula && (
              <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${C.outlineVariant}` }}>
                {/* Debt cost formula */}
                <div style={{ marginTop: 16, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.error, marginBottom: 6, fontFamily: F.code }}>CUSTO DE DÉBITO</div>
                  <div style={{ fontFamily: F.code, fontSize: 12, color: C.onSurface, background: C.surfaceContainer, padding: '8px 12px', borderRadius: 8, borderLeft: `2px solid ${C.error}` }}>
                    <div>Custo = Σ(debtScore × {roi.hoursPerDebtPoint}h) × {curInput}{roi.hourlyRate}/h</div>
                    <div style={{ color: C.onSurfaceVariant, marginTop: 4 }}>= {roi.remediationHours}h × {curInput}{roi.hourlyRate} = <span style={{ color: C.error }}>{money(roi.debtCost)}</span></div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: C.onSurfaceVariant, fontFamily: F.body }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>debtScore por arquivo:</div>
                    <div>• Complexidade ciclomática &gt; 20 → até 40 pts</div>
                    <div>• Arquivo &gt; 1.500 linhas → 10 pts (ou &gt; 500 linhas → 3 pts)</div>
                    <div>• Dependências de saída &gt; 15 → até 15 pts</div>
                  </div>
                </div>
                {/* Savings formula */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.secondary, marginBottom: 6, fontFamily: F.code }}>ECONOMIA VIA PRs</div>
                  <div style={{ fontFamily: F.code, fontSize: 12, color: C.onSurface, background: C.surfaceContainer, padding: '8px 12px', borderRadius: 8, borderLeft: `2px solid ${C.secondary}` }}>
                    <div>Economia = (entidades impactadas × 5 min) / 60 × {curInput}{roi.hourlyRate}/h</div>
                    <div style={{ color: C.onSurfaceVariant, marginTop: 4 }}>= {roi.hoursSaved}h × {curInput}{roi.hourlyRate} = <span style={{ color: C.secondary }}>{money(roi.savedCost)}</span></div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: C.onSurfaceVariant }}>
                    Cada entidade impactada num PR = ~5 minutos economizados de navegação manual no código.
                  </div>
                </div>
                {/* Net */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.primaryFixedDim, marginBottom: 6, fontFamily: F.code }}>SALDO</div>
                  <div style={{ fontFamily: F.code, fontSize: 12, color: C.onSurface, background: C.surfaceContainer, padding: '8px 12px', borderRadius: 8, borderLeft: `2px solid ${C.primaryFixedDim}` }}>
                    Saldo = Economia − Custo = {money(roi.savedCost)} − {money(roi.debtCost)} = <span style={{ color: roi.net >= 0 ? C.secondary : C.error }}>{money(Math.abs(roi.net))}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ROI Config */}
          <Section title="Como calculamos a dívida" icon="info">
            <p style={{ fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.6, margin: '0 0 16px' }}>
              A dívida sai de <strong style={{ color: C.onSurface }}>3 sinais</strong>:{' '}
              <span style={{ color: C.error }}>complexidade alta</span>,{' '}
              <span style={{ color: C.error }}>arquivos muito grandes</span> e{' '}
              <span style={{ color: C.error }}>acoplamento excessivo</span>.
              Score total: <strong style={{ color: C.onSurface, fontFamily: F.code }}>{roi.totalDebtScore.toLocaleString('pt-BR')}</strong> pontos
              (≈ {Math.round(roi.hoursPerDebtPoint * 60)} min por ponto × taxa-hora abaixo).
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: 13, color: C.onSurfaceVariant }}>Taxa-hora do dev:</span>
              <select value={curInput} onChange={(e) => setCurInput(e.target.value)}
                style={{ padding: '7px 10px', background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}`,
                  borderRadius: 6, color: C.onSurface, fontSize: 13, fontFamily: F.code, cursor: 'pointer' }}>
                <option value="R$">R$</option><option value="US$">US$</option><option value="€">€</option>
              </select>
              <input type="number" value={rateInput} onChange={(e) => setRateInput(e.target.value)} placeholder="90"
                style={{ width: 90, padding: '7px 10px', background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}`,
                  borderRadius: 6, color: C.onSurface, fontSize: 13, fontFamily: F.code }} />
              <span style={{ fontSize: 13, color: C.onSurfaceVariant }}>/hora</span>
              <button onClick={applyRoiConfig} disabled={savingCfg}
                style={{ padding: '7px 16px', background: C.primaryFixedDim, border: 'none', borderRadius: 6,
                  color: '#ffffff', cursor: 'pointer', fontWeight: 700, fontSize: 12, fontFamily: F.code }}>
                {savingCfg ? '…' : 'Aplicar'}
              </button>
            </div>
          </Section>

          {/* Cost by module bar chart */}
          {roi.byModule.length > 0 && (
            <Section title="Custo da dívida por módulo" icon="bar_chart">
              <SvgBarChart items={roi.byModule.slice(0, 10).map((m) => ({ label: m.module, value: m.cost }))} color={C.tertiaryFixedDim} formatValue={(v) => money(v)} />
            </Section>
          )}

          {/* Top files table */}
          {roi.topFiles.length > 0 && (() => {
            const top = roi.topFiles.slice(0, 12);
            const topCost = top.reduce((s, f) => s + f.cost, 0);
            const pct = roi.debtCost > 0 ? Math.round((topCost / roi.debtCost) * 100) : 0;
            return (
              <Section title="De onde vem a dívida — comece por estes arquivos" icon="search">
                <div style={{ fontSize: 13, color: C.onSurfaceVariant, marginBottom: 12 }}>
                  Estes <strong style={{ color: C.onSurface }}>{top.length} arquivos</strong> concentram{' '}
                  <strong style={{ color: C.tertiaryFixedDim }}>{pct}%</strong> da dívida ({money(topCost)}).
                </div>
                <div style={{ overflowX: 'auto' as const }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', fontFamily: F.body }}>
                    <thead>
                      <tr style={{ fontSize: 10, fontFamily: F.code, letterSpacing: '0.06em', color: C.onSurfaceVariant,
                        borderBottom: `1px solid ${C.outlineVariant}`, textAlign: 'left' as const }}>
                        <th style={{ padding: '6px 8px' }}>ARQUIVO</th>
                        <th style={{ padding: '6px 8px' }}>POR QUÊ</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' as const }}>HORAS</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' as const }}>CUSTO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top.map((f) => (
                        <tr key={f.file} style={{ borderBottom: `1px solid ${C.outlineVariant}40` }}>
                          <td style={{ padding: '10px 8px', fontFamily: F.code, color: C.primaryFixedDim, fontSize: 12,
                            maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}
                            title={f.file}>{f.file.split('/').pop()}</td>
                          <td style={{ padding: '10px 8px', color: C.onSurfaceVariant, maxWidth: 280,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                            {f.reasons.join(' · ') || 'débito acumulado'}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'right' as const, fontFamily: F.code }}>{f.hours}h</td>
                          <td style={{ padding: '10px 8px', textAlign: 'right' as const, color: C.tertiaryFixedDim, fontWeight: 700, fontFamily: F.code }}>
                            {money(f.cost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            );
          })()}

          {/* Debt trend */}
          {trend.length >= 2 && (
            <Section title="Tendência do custo da dívida" icon="trending_up">
              <SvgLineChart points={trend.map((s, i) => ({ x: i, y: s.counts!.debtCost! }))}
                color={C.error} height={140} formatY={(v) => money(Math.round(v))} />
            </Section>
          )}
        </>
      )}

      {/* Ownership table */}
      {own && own.modules.length > 0 && (
        <Section title="Ownership & Onboarding por Módulo" icon="group">
          <div style={{ overflowX: 'auto' as const }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', fontFamily: F.body }}>
              <thead>
                <tr style={{ fontSize: 10, fontFamily: F.code, letterSpacing: '0.06em', color: C.onSurfaceVariant,
                  borderBottom: `1px solid ${C.outlineVariant}`, textAlign: 'left' as const }}>
                  <th style={{ padding: '6px 8px' }}>MÓDULO</th><th style={{ padding: '6px 8px' }}>DONO</th>
                  <th style={{ padding: '6px 8px' }}>COB.</th><th style={{ padding: '6px 8px' }}>AUTORES</th>
                  <th style={{ padding: '6px 8px' }}>BUS FACTOR</th><th style={{ padding: '6px 8px' }}>ONBOARDING</th>
                </tr>
              </thead>
              <tbody>
                {own.modules.slice(0, 12).map((m) => (
                  <tr key={m.module} style={{ borderBottom: `1px solid ${C.outlineVariant}40` }}>
                    <td style={{ padding: '10px 8px' }}>{m.module}</td>
                    <td style={{ padding: '10px 8px', fontFamily: F.code, color: C.primaryFixedDim, fontSize: 11 }}>{m.primaryOwner}</td>
                    <td style={{ padding: '10px 8px' }}>{m.ownershipPct}%</td>
                    <td style={{ padding: '10px 8px' }}>{m.authorCount}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <span style={{ color: m.busFactor <= 1 ? C.error : C.onSurface, fontWeight: m.busFactor <= 1 ? 700 : 400,
                        display: 'flex', alignItems: 'center', gap: 4 }}>
                        {m.busFactor <= 1 && <Icon name="warning" size={13} color={C.error} fill={1} />}
                        {m.busFactor}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px', color: DIFF_COLOR[m.difficulty] ?? C.onSurface }}>~{m.onboardingHours}h ({m.difficulty})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {own.startHere.length > 0 && (
            <div style={{ fontSize: 12, color: C.onSurfaceVariant, marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="rocket_launch" size={14} color={C.secondary} />
              Comece por aqui (onboarding): <strong style={{ color: C.secondary, fontFamily: F.code }}>{own.startHere.join(', ')}</strong>
            </div>
          )}
        </Section>
      )}

      {/* Knowledge risk */}
      {own && own.knowledgeRisk.length > 0 && (
        <Section title="Conhecimento em Risco (bus-factor 1)" icon="person_alert">
          <p style={{ fontSize: 13, color: C.onSurfaceVariant, margin: '0 0 12px' }}>
            Arquivos importantes com apenas um autor — se essa pessoa sair, o conhecimento vai junto.
          </p>
          {own.knowledgeRisk.slice(0, 10).map((k) => (
            <div key={k.file} style={{ display: 'flex', gap: 12, padding: '10px 0',
              borderBottom: `1px solid ${C.outlineVariant}40`, fontSize: 12, alignItems: 'center' }}>
              <Icon name="warning" size={14} color={C.tertiaryFixedDim} fill={1} />
              <span style={{ fontFamily: F.code, color: C.primaryFixedDim, flex: 1, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{k.file}</span>
              <span style={{ color: C.onSurface, flexShrink: 0 }}>{k.author}</span>
              <span style={{ color: C.onSurfaceVariant, flexShrink: 0, width: 180, textAlign: 'right' as const }}>{k.reason}</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
