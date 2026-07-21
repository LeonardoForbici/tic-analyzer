import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';

const C = {
  overlay: 'rgba(15, 23, 42, 0.45)',
  surface: '#ffffff', surfaceHigh: '#f2f5fb',
  primaryFixedDim: '#2563eb', error: '#dc2626',
  onSurface: '#1e293b', onSurfaceVariant: '#64748b',
  outline: '#94a3b8', outlineVariant: '#e2e8f0',
};
const F = {
  headline: "'Geist Sans', 'Inter', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  code: "'JetBrains Mono', monospace",
};

interface DirEntry { name: string; path: string; }

/**
 * Navegador de pastas próprio, backed pelo servidor (mesma máquina do
 * disco) — substitui o window.prompt() de texto. Um navegador comum não
 * consegue abrir o Explorer nativo nem devolver caminho absoluto de um
 * <input type="file"> por segurança; como o servidor já lê o disco local
 * para tudo (git, .tic-code, etc.), ele lista os diretórios e esta UI
 * desenha uma árvore clicável no lugar.
 */
export function FolderBrowserModal({ onSelect, onClose }: { onSelect: (path: string) => void; onClose: () => void }) {
  const [currentPath, setCurrentPath] = useState('');
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [manualInput, setManualInput] = useState('');

  const load = useCallback(async (dirPath?: string) => {
    setLoading(true);
    setError('');
    try {
      const r = await (window as any).ticAnalyzer.listDir(dirPath);
      if (r?.error) { setError(r.error); setLoading(false); return; }
      setCurrentPath(r.path ?? '');
      setParent(r.parent ?? null);
      setEntries(Array.isArray(r.entries) ? r.entries : []);
      setManualInput(r.path ?? '');
    } catch {
      setError('Não foi possível listar as pastas — confirme que o servidor local está rodando.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const goTo = (p: string) => load(p);
  const goUp = () => { if (parent !== null) load(parent || undefined); };
  const confirmSelection = () => { if (currentPath) onSelect(currentPath); };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: C.overlay, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        className="tic-scale-in"
        style={{ background: C.surface, borderRadius: 16, width: 560, maxHeight: '70vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25)', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.outlineVariant}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="folder_open" size={20} color={C.primaryFixedDim} fill={1} />
          <span style={{ fontFamily: F.headline, fontWeight: 700, fontSize: 16, color: C.onSurface }}>Selecionar pasta do projeto</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <Icon name="close" size={20} color={C.onSurfaceVariant} />
          </button>
        </div>

        {/* Caminho atual + navegação manual */}
        <div style={{ padding: '12px 22px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: `1px solid ${C.outlineVariant}` }}>
          <button onClick={goUp} disabled={parent === null} style={{
            background: C.surfaceHigh, border: `1px solid ${C.outlineVariant}`, borderRadius: 8, padding: '6px 8px',
            cursor: parent === null ? 'not-allowed' : 'pointer', opacity: parent === null ? 0.4 : 1, display: 'flex'
          }}>
            <Icon name="arrow_upward" size={16} color={C.onSurfaceVariant} />
          </button>
          <input
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') load(manualInput); }}
            placeholder="/caminho/do/projeto ou C:\empresa\projeto"
            style={{ flex: 1, padding: '8px 12px', background: C.surfaceHigh, border: `1px solid ${C.outlineVariant}`,
              borderRadius: 8, color: C.onSurface, fontFamily: F.code, fontSize: 12.5, outline: 'none' }}
          />
          <button onClick={() => load(manualInput)} style={{
            padding: '8px 12px', background: C.surfaceHigh, border: `1px solid ${C.outlineVariant}`, borderRadius: 8,
            color: C.onSurfaceVariant, cursor: 'pointer', fontFamily: F.code, fontSize: 12
          }}>Ir</button>
        </div>

        {/* Lista de pastas */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.onSurfaceVariant, fontSize: 13 }}>Carregando…</div>
          ) : error ? (
            <div style={{ padding: 24, color: C.error, fontSize: 13 }}>{error}</div>
          ) : entries.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.onSurfaceVariant, fontSize: 13 }}>Nenhuma subpasta aqui.</div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.path}
                onClick={() => goTo(entry.path)}
                onDoubleClick={() => onSelect(entry.path)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
                  cursor: 'pointer', fontSize: 13.5, color: C.onSurface, fontFamily: F.body }}
                onMouseEnter={(e) => { e.currentTarget.style.background = C.surfaceHigh; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon name="folder" size={18} color={C.primaryFixedDim} />
                {entry.name}
              </div>
            ))
          )}
        </div>

        {/* Rodapé */}
        <div style={{ padding: '14px 22px', borderTop: `1px solid ${C.outlineVariant}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11.5, color: C.onSurfaceVariant, fontFamily: F.code, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentPath || 'Escolha uma unidade/pasta'}
          </span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={onClose} style={{ padding: '9px 16px', background: 'transparent', border: `1px solid ${C.outlineVariant}`,
              borderRadius: 8, color: C.onSurfaceVariant, cursor: 'pointer', fontFamily: F.body, fontSize: 13 }}>
              Cancelar
            </button>
            <button onClick={confirmSelection} disabled={!currentPath} style={{
              padding: '9px 18px', background: currentPath ? C.primaryFixedDim : C.surfaceHigh, border: 'none', borderRadius: 8,
              color: currentPath ? '#ffffff' : C.onSurfaceVariant, cursor: currentPath ? 'pointer' : 'not-allowed',
              fontWeight: 700, fontFamily: F.body, fontSize: 13
            }}>
              Selecionar esta pasta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
