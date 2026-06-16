/**
 * Aba Valor — o argumento de tempo & custo para liderança:
 * custo da dívida em dinheiro, dev-days para sanear, horas economizadas,
 * matriz de ownership/bus-factor, onboarding e o botão de Relatório Executivo.
 */
import { useCallback, useEffect, useState } from 'react';
import { SvgBarChart } from './charts/SvgBarChart';
import { SvgLineChart } from './charts/SvgLineChart';

const C = { card: '#16213e', border: '#2a2a4e', accent: '#7c83fd', green: '#56cfad', red: '#ff6b6b', orange: '#f0a500', text: '#e0e0e0', muted: '#888' };

interface RoiFile { file: string; debtScore: number; hours: number; cost: number; reasons: string[]; }
interface Roi { currency: string; hourlyRate: number; hoursPerDebtPoint: number; remediationHours: number; devDays: number; debtCost: number; totalDebtScore: number; hoursSaved: number; savedCost: number; net: number; byModule: Array<{ module: string; cost: number; hours: number }>; topFiles: RoiFile[]; }
interface ModuleOwn { module: string; primaryOwner: string; ownershipPct: number; authorCount: number; busFactor: number; onboardingHours: number; difficulty: string; }
interface Ownership { modules: ModuleOwn[]; knowledgeRisk: Array<{ file: string; author: string; reason: string }>; startHere: string[]; }
interface Snapshot { counts?: { debtCost?: number; remediationHours?: number } }

const DIFF_COLOR: Record<string, string> = { baixa: C.green, média: C.orange, alta: C.red };

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px', flex: '1 1 170px' }}>
      <div style={{ fontSize: '11px', color: C.muted, fontWeight: 600, marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px', marginTop: '16px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>{title}</div>
      {children}
    </div>
  );
}

export function ValueDashboard({ ticCodeDir, projectPath }: { ticCodeDir: string; projectPath: string }) {
  const [roi, setRoi] = useState<Roi | null>(null);
  const [own, setOwn] = useState<Ownership | null>(null);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [curInput, setCurInput] = useState('R$');
  const [savingCfg, setSavingCfg] = useState(false);

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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px' }}>Valor & Custo</div>
          <div style={{ fontSize: '12px', color: C.muted }}>Dívida técnica em tempo e dinheiro, risco de conhecimento e onboarding. Estimativas baseadas no débito e na taxa-hora (.tic-rules.json → roi).</div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => exportReport('pdf')} disabled={exporting}
            style={{ padding: '7px 14px', background: C.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}>
            {exporting ? '...' : '📄 Relatório Executivo (PDF)'}
          </button>
          <button onClick={() => exportReport('html')} disabled={exporting}
            style={{ padding: '7px 10px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '8px', color: C.muted, cursor: 'pointer', fontSize: '12px' }}>HTML</button>
        </div>
      </div>
      {msg && <div style={{ fontSize: '11px', color: msg.startsWith('Erro') ? C.red : C.green, marginBottom: '10px' }}>{msg}</div>}

      {!roi ? (
        <div style={{ fontSize: '12px', color: C.muted, padding: '20px' }}>roi.json não encontrado — rode a análise novamente.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Kpi label="💰 CUSTO DA DÍVIDA" value={money(roi.debtCost)} sub={`${roi.devDays} dev-days para sanear`} color={C.red} />
            <Kpi label="📉 ECONOMIZADO (PRs)" value={`${roi.hoursSaved} h`} sub={`${money(roi.savedCost)} de investigação evitada`} color={C.green} />
            <Kpi label="⚖️ SALDO" value={money(roi.net)} sub={roi.net >= 0 ? 'a ferramenta já se pagou' : 'investir em saneamento'} color={roi.net >= 0 ? C.green : C.orange} />
            <Kpi label="🧠 CONHECIMENTO EM RISCO" value={String(own?.knowledgeRisk.length ?? 0)} sub="arquivos críticos com 1 só autor" color={C.orange} />
          </div>

          {/* Como calculamos + ajuste de taxa-hora */}
          <Section title="ℹ️ Como calculamos a dívida — e ajuste a taxa">
            <div style={{ fontSize: '12px', color: C.muted, lineHeight: 1.6, marginBottom: '12px' }}>
              A dívida sai de <strong style={{ color: C.text }}>3 sinais</strong> medidos no código:
              <span style={{ color: C.red }}> complexidade alta</span> (lógica difícil de mexer),
              <span style={{ color: C.red }}> arquivos muito grandes</span> e
              <span style={{ color: C.red }}> acoplamento excessivo</span> (muita coisa depende dele).
              Isso vira um <strong style={{ color: C.text }}>score de débito</strong> por arquivo ({roi.totalDebtScore.toLocaleString('pt-BR')} pontos no total),
              convertido em horas de refatoração (≈ {Math.round(roi.hoursPerDebtPoint * 60)} min por ponto) × a taxa-hora abaixo.
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: '12px', color: C.muted }}>Taxa-hora do dev:</span>
              <select value={curInput} onChange={(e) => setCurInput(e.target.value)} style={{ padding: '6px 8px', background: '#0d1b2a', border: `1px solid ${C.border}`, borderRadius: '6px', color: C.text, fontSize: '12px' }}>
                <option value="R$">R$</option><option value="US$">US$</option><option value="€">€</option>
              </select>
              <input type="number" value={rateInput} onChange={(e) => setRateInput(e.target.value)} placeholder="90"
                style={{ width: '90px', padding: '6px 8px', background: '#0d1b2a', border: `1px solid ${C.border}`, borderRadius: '6px', color: C.text, fontSize: '12px' }} />
              <span style={{ fontSize: '12px', color: C.muted }}>/hora</span>
              <button onClick={applyRoiConfig} disabled={savingCfg}
                style={{ padding: '6px 14px', background: C.accent, border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}>
                {savingCfg ? '...' : 'Aplicar'}
              </button>
              <span style={{ fontSize: '11px', color: '#666' }}>atualiza os números na hora, sem re-analisar</span>
            </div>
          </Section>

          {roi.byModule.length > 0 && (
            <Section title="💰 Custo da dívida por módulo">
              <SvgBarChart items={roi.byModule.slice(0, 10).map((m) => ({ label: m.module, value: m.cost }))} color={C.orange} formatValue={(v) => money(v)} />
            </Section>
          )}

          {roi.topFiles.length > 0 && (() => {
            const top = roi.topFiles.slice(0, 12);
            const topCost = top.reduce((s, f) => s + f.cost, 0);
            const pct = roi.debtCost > 0 ? Math.round((topCost / roi.debtCost) * 100) : 0;
            return (
              <Section title="🔎 De onde vem a dívida — comece por estes arquivos">
                <div style={{ fontSize: '11px', color: C.muted, marginBottom: '10px' }}>
                  Estes <strong style={{ color: C.text }}>{top.length} arquivos</strong> concentram <strong style={{ color: C.orange }}>{pct}%</strong> da dívida ({money(topCost)}). Atacá-los primeiro dá o maior retorno.
                </div>
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ color: C.muted, textAlign: 'left' as const }}>
                    <th style={{ padding: '4px' }}>Arquivo</th><th>Por quê</th><th style={{ textAlign: 'right' as const }}>Horas</th><th style={{ textAlign: 'right' as const }}>Custo</th>
                  </tr></thead>
                  <tbody>
                    {top.map((f) => (
                      <tr key={f.file} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: '6px 4px', fontFamily: 'monospace', color: C.accent, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }} title={f.file}>{f.file.split('/').pop()}</td>
                        <td style={{ color: C.muted }}>{f.reasons.join(' · ') || 'débito acumulado'}</td>
                        <td style={{ textAlign: 'right' as const }}>{f.hours}h</td>
                        <td style={{ textAlign: 'right' as const, color: C.orange, fontWeight: 600 }}>{money(f.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            );
          })()}

          {trend.length >= 2 && (
            <Section title="Tendência do custo da dívida">
              <SvgLineChart points={trend.map((s, i) => ({ x: i, y: s.counts!.debtCost! }))} color={C.red} height={140} formatY={(v) => money(Math.round(v))} />
            </Section>
          )}
        </>
      )}

      {own && own.modules.length > 0 && (
        <Section title="👥 Ownership & onboarding por módulo">
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead><tr style={{ color: C.muted, textAlign: 'left' }}>
              <th style={{ padding: '4px' }}>Módulo</th><th>Dono</th><th>Cobertura</th><th>Autores</th><th>Bus-factor</th><th>Onboarding</th>
            </tr></thead>
            <tbody>
              {own.modules.slice(0, 12).map((m) => (
                <tr key={m.module} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: '6px 4px' }}>{m.module}</td>
                  <td>{m.primaryOwner}</td>
                  <td>{m.ownershipPct}%</td>
                  <td>{m.authorCount}</td>
                  <td style={{ color: m.busFactor <= 1 ? C.red : C.text, fontWeight: m.busFactor <= 1 ? 700 : 400 }}>{m.busFactor}{m.busFactor <= 1 ? ' ⚠️' : ''}</td>
                  <td style={{ color: DIFF_COLOR[m.difficulty] ?? C.text }}>~{m.onboardingHours}h ({m.difficulty})</td>
                </tr>
              ))}
            </tbody>
          </table>
          {own.startHere.length > 0 && <div style={{ fontSize: '11px', color: C.muted, marginTop: '10px' }}>🚀 Comece por aqui (onboarding): <strong style={{ color: C.green }}>{own.startHere.join(', ')}</strong></div>}
        </Section>
      )}

      {own && own.knowledgeRisk.length > 0 && (
        <Section title="🧠 Conhecimento em risco (bus-factor 1)">
          <div style={{ fontSize: '11px', color: C.muted, marginBottom: '8px' }}>Arquivos importantes que só uma pessoa tocou — se ela sair, o conhecimento vai junto.</div>
          {own.knowledgeRisk.slice(0, 10).map((k) => (
            <div key={k.file} style={{ display: 'flex', gap: '10px', padding: '5px 0', borderBottom: `1px solid ${C.border}`, fontSize: '12px' }}>
              <span style={{ fontFamily: 'monospace', color: C.accent, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.file}</span>
              <span style={{ color: C.text }}>{k.author}</span>
              <span style={{ color: C.muted, width: '160px', textAlign: 'right' as const }}>{k.reason}</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
