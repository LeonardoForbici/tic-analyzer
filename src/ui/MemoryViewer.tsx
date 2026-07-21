import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';

/** Espelha GithubLink de src/analyzer/store/memoryStore.ts */
interface GithubLink {
  kind: 'pr' | 'commit' | 'issue';
  repo: string;
  number?: number;
  sha?: string;
  url: string;
  title?: string;
  state?: string;
  verifiedAt?: string;
}

/** Espelha MemoryEntry de src/analyzer/store/memoryStore.ts */
interface MemoryEntry {
  id: string;
  ts: string;
  entity: string;
  kind: 'decision' | 'fix-attempt' | 'outcome' | 'note';
  summary: string;
  detail?: string;
  result?: 'worked' | 'failed' | 'unknown';
  source?: string;
  refs?: string[];
  githubLinks?: GithubLink[];
}

function githubLinkLabel(l: GithubLink): string {
  if (l.kind === 'pr') return `PR #${l.number}`;
  if (l.kind === 'issue') return `issue #${l.number}`;
  return `commit ${(l.sha ?? '').slice(0, 7)}`;
}

const C = {
  surfaceContainerLow: '#ffffff', surfaceContainer: '#ffffff', surfaceContainerHigh: '#f2f5fb',
  primaryFixedDim: '#2563eb', secondary: '#16a34a', error: '#dc2626', tertiaryFixedDim: '#d97706',
  onSurface: '#1e293b', onSurfaceVariant: '#64748b', outline: '#94a3b8', outlineVariant: '#e2e8f0',
  purple: '#7c3aed',
};
const F = {
  headline: "'Geist Sans', 'Inter', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif", code: "'JetBrains Mono', monospace",
};

const KIND_META: Record<MemoryEntry['kind'], { icon: string; color: string; label: string }> = {
  decision:     { icon: 'gavel',       color: C.primaryFixedDim, label: 'decisão' },
  'fix-attempt':{ icon: 'build',       color: C.tertiaryFixedDim, label: 'tentativa' },
  outcome:      { icon: 'flag',        color: C.secondary, label: 'resultado' },
  note:         { icon: 'sticky_note_2', color: C.purple, label: 'nota' },
};

const RESULT_META: Record<string, { color: string; label: string }> = {
  worked:  { color: C.secondary, label: 'funcionou' },
  failed:  { color: C.error, label: 'falhou' },
  unknown: { color: C.outline, label: '—' },
};

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

export function MemoryViewer({ ticCodeDir }: { ticCodeDir: string }) {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filterKind, setFilterKind] = useState<'all' | MemoryEntry['kind']>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    window.ticAnalyzer.readFile(`${ticCodeDir}/memory.json`).then((c) => {
      try {
        const parsed = c ? JSON.parse(c) : [];
        setEntries(Array.isArray(parsed) ? parsed : []);
      } catch { setEntries([]); }
      setLoaded(true);
    });
  }, [ticCodeDir]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => filterKind === 'all' || e.kind === filterKind)
      .filter((e) => !q || e.entity.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q))
      .slice()
      .reverse();
  }, [entries, filterKind, query]);

  // Detecta contradições: mesma entity com outcomes worked E failed
  const contradictions = useMemo(() => {
    const byEntity = new Map<string, Set<string>>();
    for (const e of entries) {
      if (!e.result || e.result === 'unknown') continue;
      const set = byEntity.get(e.entity) ?? new Set();
      set.add(e.result);
      byEntity.set(e.entity, set);
    }
    return new Set([...byEntity.entries()].filter(([, s]) => s.has('worked') && s.has('failed')).map(([k]) => k));
  }, [entries]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { decision: 0, 'fix-attempt': 0, outcome: 0, note: 0 };
    for (const e of entries) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [entries]);

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '4px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: F.code,
    background: active ? C.primaryFixedDim : C.surfaceContainerHigh,
    border: `1px solid ${active ? C.primaryFixedDim : C.outlineVariant}`,
    color: active ? '#ffffff' : C.onSurfaceVariant, fontWeight: active ? 700 : 400,
  });

  return (
    <div style={{ fontFamily: F.body, color: C.onSurface }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: F.headline, margin: 0, lineHeight: 1.2 }}>
          Memória do Projeto
        </h2>
        <p style={{ fontSize: 13, color: C.onSurfaceVariant, margin: '4px 0 0' }}>
          O que já foi decidido, tentado e resolvido — por entidade, entre análises. Alimentada por agentes (<code style={{ fontFamily: F.code }}>remember</code>) e pela pipeline.
        </p>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <span onClick={() => setFilterKind('all')} style={chip(filterKind === 'all')}>todos ({entries.length})</span>
        {(Object.keys(KIND_META) as MemoryEntry['kind'][]).map((k) => (
          <span key={k} onClick={() => setFilterKind(k)} style={chip(filterKind === k)}>
            {KIND_META[k].label} ({counts[k] ?? 0})
          </span>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          <Icon name="search" size={14} color={C.outline} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar entidade/resumo…"
            style={{ padding: '4px 8px', background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}`,
              borderRadius: 6, color: C.onSurface, fontFamily: F.code, fontSize: 11, width: 200, outline: 'none' }} />
        </div>
      </div>

      {contradictions.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 16,
          background: `${C.error}18`, border: `1px solid ${C.error}55`, borderRadius: 8, fontSize: 12 }}>
          <Icon name="warning" size={18} color={C.error} fill={1} />
          <span><b>{contradictions.size}</b> entidade(s) com resultados contraditórios (funcionou + falhou). Revise antes de confiar no histórico.</span>
        </div>
      )}

      {!loaded ? null : filtered.length === 0 ? (
        <div style={{ fontSize: 13, color: C.onSurfaceVariant, padding: '48px 0', textAlign: 'center',
          background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 12 }}>
          <Icon name="neurology" size={32} color={C.outline} />
          <div style={{ marginTop: 12 }}>
            {entries.length === 0
              ? 'Memória vazia. Agentes registram com a tool remember(); a pipeline grava outcomes ao confirmar predições.'
              : 'Nenhuma entrada para esse filtro.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((e) => {
            const km = KIND_META[e.kind];
            const rm = e.result ? RESULT_META[e.result] : null;
            const isContradiction = contradictions.has(e.entity);
            return (
              <div key={e.id} style={{ background: C.surfaceContainerLow,
                border: `1px solid ${isContradiction ? `${C.error}55` : C.outlineVariant}`,
                borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Icon name={km.icon} size={16} color={km.color} fill={1} />
                  <span style={{ fontSize: 10, fontFamily: F.code, fontWeight: 700, letterSpacing: '0.06em',
                    textTransform: 'uppercase', color: km.color }}>{km.label}</span>
                  {rm && (
                    <span style={{ fontSize: 10, fontFamily: F.code, fontWeight: 700, padding: '1px 8px',
                      borderRadius: 4, background: `${rm.color}22`, color: rm.color }}>{rm.label}</span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: F.code, color: C.outline }}
                    title={new Date(e.ts).toLocaleString('pt-BR')}>{relativeTime(e.ts)}</span>
                </div>
                <div style={{ fontSize: 14, color: C.onSurface, fontWeight: 500, lineHeight: 1.4 }}>{e.summary}</div>
                {e.detail && <div style={{ fontSize: 12, color: C.onSurfaceVariant, marginTop: 4 }}>{e.detail}</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontFamily: F.code, color: C.primaryFixedDim }}>
                    {e.entity.replace(/^file:/, '')}
                  </span>
                  {e.source && <span style={{ fontSize: 10, fontFamily: F.code, color: C.outline }}>· {e.source}</span>}
                  {e.refs?.length ? <span style={{ fontSize: 10, fontFamily: F.code, color: C.outline }}>· refs: {e.refs.join(', ')}</span> : null}
                  {e.githubLinks?.map((l, i) => (
                    <a key={i} href={l.url} target="_blank" rel="noreferrer"
                      title={l.verifiedAt ? `confirmado em ${new Date(l.verifiedAt).toLocaleDateString('pt-BR')}` : 'ainda não confirmado contra a API do GitHub'}
                      style={{ fontSize: 10, fontFamily: F.code, fontWeight: 700, padding: '1px 8px', borderRadius: 4,
                        background: `${C.purple}22`, color: C.purple, textDecoration: 'none',
                        opacity: l.verifiedAt ? 1 : 0.6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="link" size={11} color={C.purple} />
                      {githubLinkLabel(l)}{l.state ? ` · ${l.state}` : ''}
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
