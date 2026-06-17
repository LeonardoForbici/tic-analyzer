import { useCallback, useState } from 'react';
import type { SearchCodeResponse, SearchHitUI } from './App';

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

const ORIGIN_META: Record<string, { color: string; label: string; title: string }> = {
  both: { color: C.secondary, label: 'FTS+VEC', title: 'Encontrado por texto e por similaridade semântica' },
  vec:  { color: C.purple, label: 'VEC', title: 'Encontrado por similaridade semântica (embeddings)' },
  fts:  { color: C.primaryFixedDim, label: 'FTS', title: 'Encontrado por busca textual (FTS5/BM25)' },
};

const MODE_LABEL: Record<string, string> = {
  rrf: 'FTS5 + vetorial fundidos (RRF)',
  fts: 'FTS5/BM25 (embeddings off)',
  empty: '', short: '',
};

function Icon({ name, size = 18, color, fill = 0 }: { name: string; size?: number; color?: string; fill?: number }) {
  return (
    <span className="material-symbols-outlined" style={{
      fontSize: `${size}px`, color, lineHeight: 1, display: 'inline-flex', alignItems: 'center',
      fontVariationSettings: `'FILL' ${fill}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
    }}>{name}</span>
  );
}

export function SearchCodeViewer({ projectPath }: { projectPath: string }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHitUI[] | null>(null);
  const [mode, setMode] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true); setError(null);
    try {
      const r = (await window.ticAnalyzer.searchCode(projectPath, q)) as SearchCodeResponse;
      if (r.error) { setError(r.error); setHits([]); }
      else { setHits(r.hits ?? []); setMode(r.mode ?? ''); }
    } catch (e) {
      setError(String(e)); setHits([]);
    } finally { setLoading(false); }
  }, [projectPath, query]);

  return (
    <div style={{ fontFamily: F.body, color: C.onSurface }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: F.headline, margin: 0, lineHeight: 1.2 }}>
          Busca de Código
        </h2>
        <p style={{ fontSize: 13, color: C.onSurfaceVariant, margin: '4px 0 0' }}>
          Busca híbrida: texto (FTS5) e semântica (embeddings locais) fundidos via Reciprocal Rank Fusion. Mesma engine da tool MCP <code style={{ fontFamily: F.code }}>search_code</code>.
        </p>
      </div>

      {/* Caixa de busca */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1,
          background: C.surfaceContainerHigh, border: `1px solid ${C.outlineVariant}`, borderRadius: 8, padding: '0 12px' }}>
          <Icon name="search" size={18} color={C.outline} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
            placeholder="ex: validação de pagamento, SP_PROCESSAR, checkout…"
            autoFocus
            style={{ flex: 1, padding: '10px 0', background: 'transparent', border: 'none',
              color: C.onSurface, fontFamily: F.body, fontSize: 14, outline: 'none' }}
          />
        </div>
        <button onClick={run} disabled={loading || !query.trim()}
          style={{ padding: '0 20px', background: C.primaryFixedDim, border: 'none', borderRadius: 8,
            color: '#00363a', cursor: loading || !query.trim() ? 'default' : 'pointer',
            fontWeight: 700, fontFamily: F.code, fontSize: 13, opacity: loading || !query.trim() ? 0.5 : 1 }}>
          {loading ? '…' : 'Buscar'}
        </button>
      </div>

      {mode && hits && hits.length > 0 && (
        <div style={{ fontSize: 11, color: C.outline, fontFamily: F.code, marginBottom: 12 }}>
          {hits.length} resultado(s) · {MODE_LABEL[mode] ?? mode}
        </div>
      )}

      {error && (
        <div style={{ padding: 16, color: C.error, fontSize: 13, background: `${C.error}14`,
          border: `1px solid ${C.error}44`, borderRadius: 8 }}>{error}</div>
      )}

      {hits && hits.length === 0 && !error && (
        <div style={{ fontSize: 13, color: C.onSurfaceVariant, padding: '48px 0', textAlign: 'center',
          background: C.surfaceContainerLow, border: `1px solid ${C.outlineVariant}`, borderRadius: 12 }}>
          <Icon name="search_off" size={32} color={C.outline} />
          <div style={{ marginTop: 12 }}>Nenhum arquivo encontrado. Tente termos mais gerais.</div>
        </div>
      )}

      {hits && hits.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {hits.map((h, i) => {
            const om = ORIGIN_META[h.origin] ?? ORIGIN_META.fts;
            return (
              <div key={`${h.file}-${i}`} style={{ background: C.surfaceContainerLow,
                border: `1px solid ${C.outlineVariant}`, borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 22, textAlign: 'right', fontSize: 11, fontFamily: F.code, color: C.outline }}>{i + 1}</span>
                  <span style={{ flex: 1, fontFamily: F.code, fontSize: 13, color: C.onSurface, wordBreak: 'break-all' }}>{h.file}</span>
                  <span title={om.title} style={{ fontSize: 9, fontFamily: F.code, fontWeight: 700, padding: '2px 7px',
                    borderRadius: 4, background: `${om.color}22`, color: om.color }}>{om.label}</span>
                  <span style={{ fontSize: 10, fontFamily: F.code, color: C.outline }}>score {h.score}</span>
                </div>
                {h.snippet && (
                  <div style={{ marginTop: 8, marginLeft: 30, fontSize: 12, fontFamily: F.code,
                    color: C.onSurfaceVariant, background: C.surfaceContainer, padding: '8px 10px',
                    borderRadius: 6, borderLeft: `2px solid ${om.color}55`, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {h.snippet}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
