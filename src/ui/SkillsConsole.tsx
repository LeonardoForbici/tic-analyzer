import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SkillsOverview } from './App';

/**
 * Console de Skills de Engenharia (github.com/mattpocock/skills).
 *
 * Dá acesso HUMANO às skills que antes só existiam via MCP (consumidas pela IA):
 *   - zoom-out          → visão macro por fronteiras de domínio
 *   - triage            → AGENT-BRIEF acionável de qualquer entidade
 *   - diagnosing-bugs   → roteiro de diagnóstico em 6 fases falsificáveis
 *   - improve-architecture → oportunidades de melhoria (deletion test, god modules…)
 *   - manutenção preditiva → onde o próximo bug tende a nascer
 *   - out-of-scope      → decisões que o time já fechou
 *
 * Tudo é gerado pelo engine local a partir do index.db — ZERO tokens de IA.
 */

const C = {
  surfaceContainerLow: '#131b2e', surfaceContainer: '#171f33', surfaceContainerHigh: '#222a3d',
  primaryFixedDim: '#00dbe9', secondary: '#4edea3', error: '#ffb4ab', tertiaryFixedDim: '#ffb95f',
  onSurface: '#dae2fd', onSurfaceVariant: '#b9cacb', outline: '#849495', outlineVariant: '#3b494b',
  purple: '#9d8cff',
};
const F = {
  headline: "'Geist', 'Inter', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif", code: "'JetBrains Mono', monospace",
};

function Icon({ name, size = 18, color, fill = 0 }: { name: string; size?: number; color?: string; fill?: number }) {
  return (
    <span className="material-symbols-outlined" style={{
      fontSize: `${size}px`, color, lineHeight: 1, display: 'inline-flex', alignItems: 'center',
      fontVariationSettings: `'FILL' ${fill}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
    }}>{name}</span>
  );
}

// ── Mini-renderer de markdown (dependency-free) ──────────────────────────────────
// Cobre o subconjunto que as skills emitem: headings, **bold**, `code`, listas,
// tabelas, blockquotes, checkboxes e regras. Suficiente para um render premium.
function inline(text: string, key: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*)|(`[^`]+`)/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) parts.push(<strong key={`${key}-b${i}`} style={{ color: C.onSurface, fontWeight: 700 }}>{tok.slice(2, -2)}</strong>);
    else parts.push(<code key={`${key}-c${i}`} style={{ fontFamily: F.code, fontSize: 12, color: C.primaryFixedDim, background: C.surfaceContainerHigh, padding: '1px 5px', borderRadius: 4 }}>{tok.slice(1, -1)}</code>);
    last = m.index + tok.length; i++;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MiniMarkdown({ md }: { md: string }) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;
  const flushList = (items: string[], start: number) => {
    out.push(
      <ul key={`ul-${start}`} style={{ margin: '6px 0', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((it, k) => {
          const cb = it.match(/^\[( |x)\]\s+(.*)$/);
          if (cb) return (
            <li key={k} style={{ listStyle: 'none', marginLeft: -22, display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: C.onSurfaceVariant }}>
              <Icon name={cb[1] === 'x' ? 'check_box' : 'check_box_outline_blank'} size={16} color={cb[1] === 'x' ? C.secondary : C.outline} />
              <span style={{ lineHeight: 1.5 }}>{inline(cb[2], `cb-${start}-${k}`)}</span>
            </li>
          );
          return <li key={k} style={{ fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.5 }}>{inline(it, `li-${start}-${k}`)}</li>;
        })}
      </ul>
    );
  };
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    // Tabela
    if (line.includes('|') && lines[i + 1]?.match(/^\s*\|?[\s:|-]+\|?\s*$/)) {
      const header = line.split('|').map((c) => c.trim()).filter(Boolean);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(lines[i].split('|').map((c) => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1 || arr.length <= 2 ? true : true));
        i++;
      }
      out.push(
        <div key={`tbl-${i}`} style={{ overflowX: 'auto', margin: '8px 0' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <thead><tr>{header.map((h, k) => <th key={k} style={{ textAlign: 'left', padding: '6px 10px', color: C.primaryFixedDim, borderBottom: `1px solid ${C.outlineVariant}`, fontFamily: F.code, fontWeight: 700 }}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} style={{ padding: '5px 10px', color: C.onSurfaceVariant, borderBottom: `1px solid ${C.outlineVariant}55` }}>{inline(c, `t-${ri}-${ci}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }
    // Heading
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      const sizes = [0, 19, 16, 14, 13];
      out.push(<div key={`h-${i}`} style={{ fontFamily: F.headline, fontWeight: 700, fontSize: sizes[lvl], color: lvl <= 2 ? C.onSurface : C.primaryFixedDim, margin: lvl <= 2 ? '16px 0 6px' : '12px 0 4px' }}>{inline(h[2], `h-${i}`)}</div>);
      i++; continue;
    }
    // Blockquote
    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) { quote.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(<div key={`bq-${i}`} style={{ borderLeft: `3px solid ${C.tertiaryFixedDim}`, padding: '6px 12px', margin: '8px 0', background: `${C.tertiaryFixedDim}11`, borderRadius: '0 6px 6px 0', fontSize: 12.5, color: C.onSurfaceVariant, lineHeight: 1.5 }}>{quote.map((q, k) => <div key={k}>{inline(q, `bq-${i}-${k}`)}</div>)}</div>);
      continue;
    }
    // Lista
    if (line.match(/^\s*[-*]\s+/) || line.match(/^\s*\d+\.\s+/)) {
      const items: string[] = []; const start = i;
      while (i < lines.length && (lines[i].match(/^\s*[-*]\s+/) || lines[i].match(/^\s*\d+\.\s+/))) {
        items.push(lines[i].replace(/^\s*(?:[-*]|\d+\.)\s+/, '')); i++;
      }
      flushList(items, start); continue;
    }
    // Regra
    if (line.match(/^---+$/)) { out.push(<hr key={`hr-${i}`} style={{ border: 'none', borderTop: `1px solid ${C.outlineVariant}`, margin: '12px 0' }} />); i++; continue; }
    // Parágrafo
    out.push(<p key={`p-${i}`} style={{ fontSize: 13, color: C.onSurfaceVariant, lineHeight: 1.6, margin: '6px 0' }}>{inline(line, `p-${i}`)}</p>);
    i++;
  }
  return <div>{out}</div>;
}

// ── Estrutura das skills ─────────────────────────────────────────────────────────
type SkillId = 'zoom-out' | 'agent-brief' | 'diagnose' | 'architecture' | 'risk' | 'out-of-scope';

const SKILLS: Array<{ id: SkillId; label: string; source: string; icon: string; color: string; desc: string }> = [
  { id: 'zoom-out',     label: 'Zoom-out',          source: 'zoom-out',                  icon: 'zoom_out_map',     color: C.primaryFixedDim, desc: 'Visão macro por fronteiras de domínio — o sistema inteiro ou onde uma parte se encaixa.' },
  { id: 'agent-brief',  label: 'Agent Brief',        source: 'triage',                    icon: 'assignment',       color: C.secondary,       desc: 'Brief acionável de uma entidade: comportamento, interfaces, critérios de aceite e escopo.' },
  { id: 'diagnose',     label: 'Diagnóstico',        source: 'diagnosing-bugs',           icon: 'biotech',          color: C.purple,          desc: 'Roteiro em 6 fases: feedback loop, reprodução, hipóteses falsificáveis e instrumentação.' },
  { id: 'architecture', label: 'Arquitetura',        source: 'improve-codebase-architecture', icon: 'architecture', color: C.tertiaryFixedDim, desc: 'Oportunidades de melhoria: módulos pass-through, god modules, acoplamento e ciclos.' },
  { id: 'risk',         label: 'Risco preditivo',    source: 'manutenção preditiva',      icon: 'online_prediction', color: C.error,          desc: 'Onde o próximo bug tende a nascer — churn × complexidade × acoplamento.' },
  { id: 'out-of-scope', label: 'Fora de escopo',     source: 'decisões do time',          icon: 'block',            color: C.outline,         desc: 'O que o time já decidiu NÃO fazer, para não rediscutir.' },
];

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}`, borderRadius: 6, color: done ? C.secondary : C.onSurfaceVariant, fontSize: 11, fontFamily: F.code, cursor: 'pointer' }}>
      <Icon name={done ? 'check' : 'content_copy'} size={14} color={done ? C.secondary : C.onSurfaceVariant} />
      {done ? 'copiado' : 'copiar markdown'}
    </button>
  );
}

function GenPanel({ projectPath, skill }: { projectPath: string; skill: SkillId }) {
  const [entity, setEntity] = useState('');
  const [to, setTo] = useState('');
  const [md, setMd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true); setError(null); setMd(null);
    try {
      let res: { markdown?: string; error?: string };
      if (skill === 'agent-brief') res = await window.ticAnalyzer.getAgentBrief(projectPath, entity.trim());
      else if (skill === 'diagnose') res = await window.ticAnalyzer.getDiagnosis(projectPath, entity.trim(), to.trim() || undefined);
      else res = await window.ticAnalyzer.getZoomOut(projectPath, entity.trim() || undefined);
      if (res.error) setError(res.error);
      else setMd(res.markdown ?? '');
    } catch (e) { setError(String(e)); }
    setLoading(false);
  }, [projectPath, skill, entity, to]);

  // Zoom-out abre o sistema inteiro automaticamente.
  useEffect(() => { if (skill === 'zoom-out') run(); /* eslint-disable-line */ }, [skill]);

  const ph = skill === 'agent-brief' ? 'arquivo, procedure (PKG.PROC), tabela ou id de triagem…'
    : skill === 'diagnose' ? 'onde o sintoma aparece (tela, endpoint)…'
    : 'entidade para zoom focado (vazio = sistema inteiro)…';

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input value={entity} onChange={(e) => setEntity(e.target.value)} placeholder={ph}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          style={{ flex: 1, minWidth: 260, padding: '9px 12px', background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}`, borderRadius: 8, color: C.onSurface, fontFamily: F.code, fontSize: 12.5, outline: 'none' }} />
        {skill === 'diagnose' && (
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="entidade suspeita do outro lado (opcional)…"
            onKeyDown={(e) => e.key === 'Enter' && run()}
            style={{ flex: 1, minWidth: 220, padding: '9px 12px', background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}`, borderRadius: 8, color: C.onSurface, fontFamily: F.code, fontSize: 12.5, outline: 'none' }} />
        )}
        <button onClick={run} disabled={loading || (skill !== 'zoom-out' && !entity.trim())}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: C.primaryFixedDim, border: 'none', borderRadius: 8, color: '#00363a', fontWeight: 700, fontSize: 13, fontFamily: F.body, cursor: loading || (skill !== 'zoom-out' && !entity.trim()) ? 'not-allowed' : 'pointer', opacity: loading || (skill !== 'zoom-out' && !entity.trim()) ? 0.5 : 1 }}>
          <Icon name={loading ? 'progress_activity' : 'bolt'} size={16} color="#00363a" />
          {loading ? 'gerando…' : 'gerar'}
        </button>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: `${C.error}18`, border: `1px solid ${C.error}55`, borderRadius: 8, fontSize: 12.5, color: C.error }}>
          <Icon name="error" size={18} color={C.error} />{error}
        </div>
      )}

      {md != null && !error && (
        <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 10, padding: '4px 20px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 14 }}><CopyButton text={md} /></div>
          <MiniMarkdown md={md} />
        </div>
      )}
    </div>
  );
}

function ArchitecturePanel({ overview }: { overview: SkillsOverview | null }) {
  const items = overview?.archSuggestions ?? [];
  if (items.length === 0) return <Empty icon="celebration" text="Nenhum candidato a melhoria arquitetural encontrado. 🎉" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((c, i) => (
        <div key={i} style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            {c.strength && <span style={{ fontSize: 10, fontFamily: F.code, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${C.tertiaryFixedDim}22`, color: C.tertiaryFixedDim, textTransform: 'uppercase' }}>{c.strength}</span>}
            <span style={{ fontSize: 13, fontWeight: 700, color: C.onSurface }}>{c.kind}</span>
            <span style={{ fontSize: 11, fontFamily: F.code, color: C.outline }}>{(c.files ?? []).join(', ')}</span>
          </div>
          {c.problem && <Field label="Problema" value={c.problem} color={C.error} />}
          {c.solution && <Field label="Solução" value={c.solution} color={C.secondary} />}
          {c.benefits && <Field label="Benefícios" value={c.benefits} color={C.primaryFixedDim} />}
        </div>
      ))}
    </div>
  );
}

function RiskPanel({ overview }: { overview: SkillsOverview | null }) {
  const items = overview?.riskPrediction ?? [];
  if (items.length === 0) return <Empty icon="schedule" text="Sem predição de risco (projeto sem histórico git ou análise desatualizada)." />;
  const max = Math.max(...items.map((r) => r.score), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 12, color: C.onSurfaceVariant, marginBottom: 6 }}>Score = churn 90d (40%) + commits de fix (20%) + complexidade (20%) + acoplamento (20%).</div>
      {items.slice(0, 20).map((r, i) => {
        const sev = r.score >= 70 ? C.error : r.score >= 40 ? C.tertiaryFixedDim : C.secondary;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 8 }}>
            <span style={{ width: 38, textAlign: 'right', fontFamily: F.code, fontWeight: 700, color: sev, fontSize: 15 }}>{r.score}</span>
            <div style={{ width: 80, height: 6, background: C.surfaceContainerHigh, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${(r.score / max) * 100}%`, height: '100%', background: sev }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: F.code, fontSize: 12, color: C.onSurface, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.file}</div>
              {r.reasons?.length ? <div style={{ fontSize: 11, color: C.outline }}>{r.reasons.join(' · ')}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OutOfScopePanel({ overview }: { overview: SkillsOverview | null }) {
  const items = overview?.outOfScope ?? [];
  if (items.length === 0) return <Empty icon="block" text="Nenhuma decisão out-of-scope registrada. Adicione em .tic-rules.json → outOfScope." />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((d, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 14px', background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 8 }}>
          <Icon name="gpp_maybe" size={20} color={C.outline} />
          <div>
            <div style={{ fontSize: 13, color: C.onSurface, fontWeight: 500 }}>{d.decision}</div>
            {d.reason && <div style={{ fontSize: 12, color: C.onSurfaceVariant, marginTop: 2 }}>{d.reason}</div>}
            <div style={{ fontSize: 10, fontFamily: F.code, color: C.outline, marginTop: 4 }}>{d.id}{d.date ? ` · ${d.date}` : ''}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ fontSize: 12.5, color: C.onSurfaceVariant, lineHeight: 1.5, marginTop: 3 }}>
      <span style={{ fontFamily: F.code, fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', marginRight: 6 }}>{label}</span>{value}
    </div>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ fontSize: 13, color: C.onSurfaceVariant, padding: '40px 0', textAlign: 'center', background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 12 }}>
      <Icon name={icon} size={30} color={C.outline} />
      <div style={{ marginTop: 10 }}>{text}</div>
    </div>
  );
}

export function SkillsConsole({ projectPath }: { projectPath: string }) {
  const [active, setActive] = useState<SkillId>('zoom-out');
  const [overview, setOverview] = useState<SkillsOverview | null>(null);

  useEffect(() => {
    window.ticAnalyzer.getSkillsOverview(projectPath).then((o) => setOverview(o as SkillsOverview)).catch(() => setOverview(null));
  }, [projectPath]);

  const meta = useMemo(() => SKILLS.find((s) => s.id === active)!, [active]);

  const kpis = [
    { label: 'prontos p/ agente', value: overview?.triageCounts.readyForAgent ?? 0, icon: 'smart_toy', color: C.secondary },
    { label: 'oportunidades de arquitetura', value: overview?.archSuggestions.length ?? 0, icon: 'architecture', color: C.tertiaryFixedDim },
    { label: 'hotspots de risco', value: overview?.riskPrediction.filter((r) => r.score >= 40).length ?? 0, icon: 'local_fire_department', color: C.error },
    { label: 'decisões fechadas', value: overview?.outOfScope.length ?? 0, icon: 'block', color: C.outline },
  ];

  return (
    <div style={{ fontFamily: F.body, color: C.onSurface }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: F.headline, margin: 0, lineHeight: 1.2 }}>Skills de Engenharia</h2>
        <p style={{ fontSize: 13, color: C.onSurfaceVariant, margin: '4px 0 0', maxWidth: 760, lineHeight: 1.6 }}>
          As mesmas skills que a IA consome via MCP — agora à sua disposição. Cada artefato é gerado pelo
          <strong style={{ color: C.onSurface }}> engine local a partir do grafo de impacto</strong>, com
          <strong style={{ color: C.secondary }}> zero tokens de IA</strong>. Analise tudo aqui antes de envolver qualquer agente.
        </p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 10 }}>
            <Icon name={k.icon} size={26} color={k.color} fill={1} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: F.headline, color: C.onSurface, lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 11, color: C.onSurfaceVariant, marginTop: 2 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Seletor de skill */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 20 }}>
        {SKILLS.map((s) => {
          const on = active === s.id;
          return (
            <button key={s.id} onClick={() => setActive(s.id)} style={{
              textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
              background: on ? `${s.color}18` : C.surfaceContainerLow,
              border: `1px solid ${on ? s.color : C.outlineVariant}`, transition: 'all .12s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Icon name={s.icon} size={18} color={s.color} fill={on ? 1 : 0} />
                <span style={{ fontSize: 13.5, fontWeight: 700, color: on ? C.onSurface : C.onSurfaceVariant }}>{s.label}</span>
              </div>
              <div style={{ fontSize: 10.5, fontFamily: F.code, color: C.outline }}>skill: {s.source}</div>
            </button>
          );
        })}
      </div>

      {/* Painel ativo */}
      <div style={{ background: C.surfaceContainer, border: `1px solid ${C.outlineVariant}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Icon name={meta.icon} size={22} color={meta.color} fill={1} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: F.headline, color: C.onSurface }}>{meta.label}</div>
            <div style={{ fontSize: 12, color: C.onSurfaceVariant }}>{meta.desc}</div>
          </div>
        </div>

        {(active === 'zoom-out' || active === 'agent-brief' || active === 'diagnose') && <GenPanel projectPath={projectPath} skill={active} />}
        {active === 'architecture' && <ArchitecturePanel overview={overview} />}
        {active === 'risk' && <RiskPanel overview={overview} />}
        {active === 'out-of-scope' && <OutOfScopePanel overview={overview} />}
      </div>
    </div>
  );
}
