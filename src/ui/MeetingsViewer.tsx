import { useCallback, useEffect, useState } from 'react';

type DecisionType = 'decision' | 'action-item' | 'risk-flagged' | 'out-of-scope';

interface DecisionRow {
  summary: string;
  entity: string;
  decisionType: DecisionType;
  owner: string;
  dueDate: string;
  rationale: string;
}

interface MeetingIndexEntry {
  id: string;
  ts: string;
  title: string;
  decisionCount: number;
}

const C = {
  surfaceContainerLow: '#ffffff', surfaceContainer: '#ffffff', surfaceContainerHigh: '#f2f5fb',
  primaryFixedDim: '#2563eb', secondary: '#16a34a', error: '#dc2626', tertiaryFixedDim: '#d97706',
  onSurface: '#1e293b', onSurfaceVariant: '#64748b', outline: '#94a3b8', outlineVariant: '#e2e8f0',
  purple: '#7c3aed',
};
const F = {
  headline: "'Geist', 'Inter', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif", code: "'JetBrains Mono', monospace",
};

const TYPE_META: Record<DecisionType, { label: string; color: string }> = {
  decision: { label: 'decisão', color: C.primaryFixedDim },
  'action-item': { label: 'ação', color: C.tertiaryFixedDim },
  'risk-flagged': { label: 'risco', color: C.error },
  'out-of-scope': { label: 'fora de escopo', color: C.purple },
};

function Icon({ name, size = 18, color }: { name: string; size?: number; color?: string }) {
  return (
    <span className="material-symbols-outlined" style={{ fontSize: `${size}px`, color, lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>{name}</span>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}`,
  borderRadius: 6, color: C.onSurface, fontFamily: F.code, fontSize: 12, outline: 'none', width: '100%'
};

const emptyRow = (): DecisionRow => ({ summary: '', entity: '', decisionType: 'decision', owner: '', dueDate: '', rationale: '' });

export function MeetingsViewer({ projectPath }: { projectPath: string }) {
  const [meetings, setMeetings] = useState<MeetingIndexEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState('');
  const [participants, setParticipants] = useState('');
  const [transcript, setTranscript] = useState('');
  const [rows, setRows] = useState<DecisionRow[]>([emptyRow()]);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    (window as any).ticAnalyzer.listMeetings(projectPath).then((r: MeetingIndexEntry[] | { error?: string }) => {
      setMeetings(Array.isArray(r) ? r : []);
      setLoaded(true);
    });
  }, [projectPath]);

  useEffect(() => { load(); }, [load]);

  const updateRow = (i: number, patch: Partial<DecisionRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    if (!title.trim()) { setStatus({ kind: 'error', text: 'Título é obrigatório.' }); return; }
    const decisions = rows
      .filter((r) => r.summary.trim())
      .map((r) => ({
        summary: r.summary.trim(),
        entity: r.entity.trim() || undefined,
        decisionType: r.decisionType,
        owner: r.owner.trim() || undefined,
        dueDate: r.dueDate.trim() || undefined,
        rationale: r.rationale.trim() || undefined
      }));

    setSubmitting(true);
    setStatus(null);
    try {
      const body = {
        title: title.trim(),
        transcript: transcript.trim() || undefined,
        participants: participants.split(',').map((p) => p.trim()).filter(Boolean),
        decisions
      };
      const r = await (window as any).ticAnalyzer.ingestMeeting(projectPath, body);
      if (!r?.ok) { setStatus({ kind: 'error', text: r?.error ?? 'Falha ao registrar.' }); return; }
      if (r.pending) {
        setStatus({ kind: 'ok', text: `Transcript salvo (id: ${r.meetingId}) — ainda sem decisões estruturadas.` });
      } else {
        setStatus({ kind: 'ok', text: `Registrado: ${r.memoryEntriesCreated ?? 0} decisão(ões) vinculada(s) à memória.` });
        setTitle(''); setParticipants(''); setTranscript(''); setRows([emptyRow()]);
      }
      load();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ fontFamily: F.body, color: C.onSurface }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: F.headline, margin: 0, lineHeight: 1.2 }}>Reuniões</h2>
        <p style={{ fontSize: 13, color: C.onSurfaceVariant, margin: '4px 0 0' }}>
          Cole o transcript (opcional, só para auditoria) e estruture as decisões — cada decisão com entidade vira
          memória permanente vinculada (aba Memória), consultável por <code style={{ fontFamily: F.code }}>recall</code>/<code style={{ fontFamily: F.code }}>get_agent_brief</code>.
        </p>
      </div>

      <div style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 10, padding: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <input style={inputStyle} placeholder="Título da reunião/story" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input style={inputStyle} placeholder="Participantes (separados por vírgula)" value={participants} onChange={(e) => setParticipants(e.target.value)} />
        </div>
        <textarea
          style={{ ...inputStyle, minHeight: 70, resize: 'vertical', marginBottom: 12 }}
          placeholder="Transcript já pronto (opcional — só para auditoria, a extração de decisões é manual/pelo agente)"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
        />

        <div style={{ fontSize: 11, fontFamily: F.code, color: C.outline, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Decisões estruturadas
        </div>
        {rows.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
            <select style={{ ...inputStyle, width: 130, flexShrink: 0 }} value={row.decisionType} onChange={(e) => updateRow(i, { decisionType: e.target.value as DecisionType })}>
              {(Object.keys(TYPE_META) as DecisionType[]).map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
            </select>
            <input style={{ ...inputStyle, flex: 2 }} placeholder="Resumo da decisão" value={row.summary} onChange={(e) => updateRow(i, { summary: e.target.value })} />
            <input style={{ ...inputStyle, flex: 1 }} placeholder="entidade (file:...)" value={row.entity} onChange={(e) => updateRow(i, { entity: e.target.value })} />
            <input style={{ ...inputStyle, width: 100, flexShrink: 0 }} placeholder="responsável" value={row.owner} onChange={(e) => updateRow(i, { owner: e.target.value })} />
            <button
              onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}
              title="Remover"
            >
              <Icon name="close" size={16} color={C.outline} />
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span onClick={() => setRows((rs) => [...rs, emptyRow()])} style={{ fontSize: 12, color: C.primaryFixedDim, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="add" size={14} color={C.primaryFixedDim} /> adicionar decisão
          </span>
          <button
            onClick={submit}
            disabled={submitting}
            style={{ padding: '8px 20px', background: C.primaryFixedDim, border: 'none', borderRadius: 6,
              color: '#00363a', fontWeight: 700, fontSize: 13, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? 'Registrando…' : 'Registrar reunião'}
          </button>
        </div>
        {status && (
          <div style={{ marginTop: 10, fontSize: 12, color: status.kind === 'ok' ? C.secondary : C.error }}>{status.text}</div>
        )}
      </div>

      {!loaded ? null : meetings.length === 0 ? (
        <div style={{ fontSize: 13, color: C.onSurfaceVariant, padding: '32px 0', textAlign: 'center',
          background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 12 }}>
          <Icon name="groups" size={28} color={C.outline} />
          <div style={{ marginTop: 10 }}>Nenhuma reunião registrada ainda.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {meetings.map((m) => (
            <div key={m.id} style={{ background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="event_note" size={16} color={C.primaryFixedDim} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>{m.title}</span>
              <span style={{ fontSize: 11, color: C.outline, fontFamily: F.code }}>{m.ts.slice(0, 10)}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: F.code, color: C.onSurfaceVariant }}>{m.decisionCount} decisão(ões)</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
