import { useCallback, useEffect, useState } from 'react';

interface HttpFlow {
  from: string;
  to: string;
  url?: string;
  method?: string;
}

const C = {
  bg: '#e9edf5', surfaceContainerLow: '#ffffff', surfaceContainer: '#ffffff',
  surfaceContainerHigh: '#f2f5fb', primary: '#111827', primaryFixedDim: '#2563eb',
  secondary: '#16a34a', error: '#dc2626', tertiaryFixedDim: '#d97706',
  onSurface: '#1e293b', onSurfaceVariant: '#64748b', outline: '#94a3b8', outlineVariant: '#e2e8f0',
};
const F = {
  headline: "'Geist', 'Inter', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif", code: "'JetBrains Mono', monospace",
};

const METHOD_COLOR: Record<string, string> = {
  GET: C.secondary, POST: '#60a5fa', PUT: C.tertiaryFixedDim, DELETE: C.error,
  PATCH: '#c084fc', default: C.outline,
};

function Icon({ name, size = 18, color }: { name: string; size?: number; color?: string }) {
  return (
    <span className="material-symbols-outlined" style={{ fontSize: `${size}px`, color, lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>{name}</span>
  );
}

export function HttpFlowsViewer({ projectPath }: { projectPath: string }) {
  const [flows, setFlows] = useState<HttpFlow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await (window as any).ticAnalyzer.listHttpFlows(projectPath) as { flows?: HttpFlow[]; error?: string };
      if (r.error) setError(r.error);
      else setFlows(r.flows ?? []);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [projectPath]);

  useEffect(() => { load(); }, [load]);

  // Group by frontend component (from)
  const groups = flows.reduce<Record<string, HttpFlow[]>>((acc, f) => {
    (acc[f.from] = acc[f.from] ?? []).push(f);
    return acc;
  }, {});

  return (
    <div style={{ fontFamily: F.body, color: C.onSurface }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: F.headline, margin: 0 }}>HTTP Flows</h2>
        <p style={{ fontSize: 13, color: C.onSurfaceVariant, margin: '4px 0 0' }}>
          Chamadas cross-tier detectadas: quais componentes frontend chamam quais endpoints backend (fetch, axios, HttpClient).
        </p>
      </div>
      {loading && <div style={{ fontSize: 13, color: C.onSurfaceVariant }}>Carregando…</div>}
      {error && <div style={{ color: C.error, fontSize: 13 }}>{error}</div>}
      {!loading && flows.length === 0 && !error && (
        <div style={{ fontSize: 13, color: C.onSurfaceVariant, padding: '48px 0', textAlign: 'center',
          background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 12 }}>
          <Icon name="http" size={32} color={C.outline} />
          <div style={{ marginTop: 12 }}>Nenhuma chamada HTTP cross-tier detectada.<br />O projeto precisa ter fetch/axios/HttpClient no frontend e endpoints no backend.</div>
        </div>
      )}
      {Object.entries(groups).map(([from, calls]) => (
        <div key={from} style={{ marginBottom: 16, background: C.surfaceContainerLow,
          border: `1px solid ${C.outlineVariant}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', background: C.surfaceContainer,
            borderBottom: `1px solid ${C.outlineVariant}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="web" size={16} color={C.primaryFixedDim} />
            <span style={{ fontFamily: F.code, fontSize: 13, color: C.onSurface, wordBreak: 'break-all' }}>{from}</span>
            <span style={{ fontSize: 10, color: C.outline, marginLeft: 'auto' }}>{calls.length} chamada(s)</span>
          </div>
          {calls.map((c, i) => {
            const mc = METHOD_COLOR[c.method?.toUpperCase() ?? ''] ?? METHOD_COLOR.default;
            return (
              <div key={i} style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
                borderBottom: i < calls.length - 1 ? `1px solid ${C.outlineVariant}20` : 'none' }}>
                <Icon name="arrow_forward" size={14} color={C.outline} />
                {c.method && (
                  <span style={{ fontSize: 10, fontFamily: F.code, fontWeight: 700, padding: '2px 7px',
                    borderRadius: 4, background: `${mc}22`, color: mc, flexShrink: 0 }}>
                    {c.method.toUpperCase()}
                  </span>
                )}
                <span style={{ fontFamily: F.code, fontSize: 12, color: C.onSurfaceVariant, flex: 1, wordBreak: 'break-all' }}>
                  {c.url ?? c.to}
                </span>
                <span style={{ fontSize: 11, color: C.outline, flexShrink: 0 }}>{c.to.split('/').pop()}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
