import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';

export interface ActivityEvent {
  ts: string;
  type: string;
  severity: 'info' | 'warn' | 'critical';
  title: string;
  detail?: string;
  entity?: string;
}

interface Accuracy { confirmed: number; total: number; hitRate: number; }

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

const SEV_META: Record<string, { color: string; bg: string }> = {
  info: { color: C.primaryFixedDim, bg: `${C.primaryFixedDim}20` },
  warn: { color: C.tertiaryFixedDim, bg: `${C.tertiaryFixedDim}20` },
  critical: { color: C.error, bg: `${C.error}20` },
};

const TYPE_META: Record<string, { icon: string; color: string }> = {
  analysis: { icon: 'search', color: C.primaryFixedDim },
  'health-up': { icon: 'trending_up', color: C.secondary },
  'health-down': { icon: 'trending_down', color: C.error },
  'risk-new': { icon: 'warning', color: C.tertiaryFixedDim },
  'rule-violation': { icon: 'gavel', color: C.tertiaryFixedDim },
  'triage-new': { icon: 'inbox', color: '#7c3aed' },
  'module-added': { icon: 'add_circle', color: C.secondary },
  'module-removed': { icon: 'remove_circle', color: C.error },
  'prediction-confirmed': { icon: 'target', color: C.secondary },
  'alert-sent': { icon: 'notifications', color: C.primaryFixedDim },
  'memory-contradiction': { icon: 'psychology_alt', color: C.error },
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

export function ActivityFeed({ ticCodeDir, projectPath }: { ticCodeDir: string; projectPath: string }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [accuracy, setAccuracy] = useState<Accuracy | null>(null);

  const load = useCallback(() => {
    window.ticAnalyzer.getActivity(projectPath, 200).then((e) => setEvents(Array.isArray(e) ? e : []));
    window.ticAnalyzer.readFile(`${ticCodeDir}/prediction-accuracy.json`).then((c) => {
      try { setAccuracy(c ? JSON.parse(c) : null); } catch { setAccuracy(null); }
    });
  }, [projectPath, ticCodeDir]);

  useEffect(() => {
    load();
    const off = window.ticAnalyzer.onActivity((e) => {
      setEvents((prev) => [...prev, e]);
      if (e.type === 'prediction-confirmed' || e.type === 'analysis') load();
    });
    return off;
  }, [load]);

  const ordered = [...events].reverse();
  const hitPct = accuracy && accuracy.total > 0 ? Math.round(accuracy.hitRate * 100) : null;

  return (
    <div style={{ fontFamily: F.body, color: C.onSurface }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: F.headline, color: C.onSurface, margin: 0, lineHeight: 1.2 }}>
            Linha do Tempo
          </h2>
          <p style={{ fontSize: 13, color: C.onSurfaceVariant, margin: '4px 0 0' }}>
            O batimento do projeto — o que mudou a cada análise. Atualiza ao vivo.
          </p>
        </div>
        {accuracy && accuracy.total > 0 && (
          <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`,
            borderRadius: 12, padding: '14px 20px', textAlign: 'center' as const, minWidth: 120 }}>
            <div style={{ fontSize: 32, fontWeight: 900, fontFamily: F.headline, lineHeight: 1,
              color: hitPct! >= 70 ? C.secondary : C.tertiaryFixedDim }}>{hitPct}%</div>
            <div style={{ fontSize: 10, color: C.onSurfaceVariant, fontFamily: F.code, letterSpacing: '0.06em',
              marginTop: 4, textTransform: 'uppercase' as const }}>Acerto Preditivo</div>
            <div style={{ fontSize: 11, color: C.onSurfaceVariant, marginTop: 2 }}>
              {accuracy.confirmed}/{accuracy.total} predições
            </div>
          </div>
        )}
      </div>

      {/* Accuracy KPIs */}
      {accuracy && accuracy.total > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Confirmadas', value: accuracy.confirmed, color: C.secondary, icon: 'check_circle' },
            { label: 'Total Predições', value: accuracy.total, color: C.primaryFixedDim, icon: 'psychology' },
            { label: 'Taxa de Acerto', value: `${hitPct}%`, color: hitPct! >= 70 ? C.secondary : C.tertiaryFixedDim, icon: 'target' },
          ].map((k) => (
            <div key={k.label} style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`,
              borderRadius: 8, padding: '12px 16px', flex: '1 1 130px',
              display: 'flex', alignItems: 'center', gap: 12 }}>
              <Icon name={k.icon} size={24} color={k.color} fill={1} />
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: F.headline, color: k.color, lineHeight: 1 }}>
                  {k.value}
                </div>
                <div style={{ fontSize: 11, color: C.onSurfaceVariant, fontFamily: F.code, marginTop: 2 }}>{k.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {ordered.length === 0 ? (
        <div style={{ fontSize: 13, color: C.onSurfaceVariant, padding: '48px 0', textAlign: 'center' as const,
          background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 12 }}>
          <Icon name="hourglass_empty" size={32} color={C.outline} />
          <div style={{ marginTop: 12, fontFamily: F.body }}>
            Nenhuma atividade ainda. Rode uma análise — a partir da 2ª, o delta aparece aqui.
          </div>
        </div>
      ) : (
        <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 12, overflow: 'hidden' }}>
          {/* Timeline column */}
          <div style={{ position: 'relative', padding: '8px 0' }}>
            {/* Vertical line */}
            <div style={{ position: 'absolute', left: 44, top: 0, bottom: 0, width: 1,
              background: C.outlineVariant, pointerEvents: 'none' }} />

            {ordered.map((e, i) => {
              const tMeta = TYPE_META[e.type] ?? { icon: 'circle', color: C.primaryFixedDim };
              const sMeta = SEV_META[e.severity] ?? SEV_META.info;
              return (
                <div key={i} style={{ display: 'flex', gap: 0, position: 'relative', padding: '12px 20px 12px 0',
                  borderBottom: i < ordered.length - 1 ? `1px solid ${C.outlineVariant}20` : 'none' }}>
                  {/* Timestamp */}
                  <div style={{ width: 44, flexShrink: 0, paddingLeft: 20, paddingRight: 8 }}>
                    <span style={{ fontSize: 10, fontFamily: F.code, color: C.outline, letterSpacing: '-0.02em' }}>
                      {new Date(e.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {/* Icon dot */}
                  <div style={{ width: 32, flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 1 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: sMeta.bg,
                      border: `1px solid ${sMeta.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      position: 'relative', zIndex: 1 }}>
                      <Icon name={tMeta.icon} size={13} color={tMeta.color} />
                    </div>
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, paddingLeft: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10,
                          fontFamily: F.code, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                          color: tMeta.color, marginBottom: 3 }}>
                          {e.type.replace(/-/g, ' ')}
                        </span>
                        <div style={{ fontSize: 13, color: C.onSurface, fontWeight: 500, lineHeight: 1.4, fontFamily: F.body }}>
                          {e.title}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontFamily: F.code, color: C.outline, flexShrink: 0, paddingTop: 2 }}
                        title={new Date(e.ts).toLocaleString('pt-BR')}>
                        {relativeTime(e.ts)}
                      </span>
                    </div>
                    {e.detail && (
                      <div style={{ fontSize: 12, color: C.onSurfaceVariant, marginTop: 4, fontFamily: F.body }}>
                        {e.detail}
                      </div>
                    )}
                    {e.entity && (
                      <div style={{ fontSize: 11, color: C.primaryFixedDim, marginTop: 4, fontFamily: F.code }}>
                        {e.entity.replace(/^file:/, '')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
