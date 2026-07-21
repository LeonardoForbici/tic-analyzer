/**
 * Ícone único e compartilhado (Material Symbols Outlined, self-hosted via
 * fonts.ts). Antes, cada um dos 12 arquivos de UI definia sua própria cópia
 * deste componente — com pequenas divergências (fill presente/ausente,
 * defaults de tamanho diferentes) — e nenhuma reservava largura/altura fixas
 * para o glifo. Se a fonte de ícones não carregasse a tempo, o nome cru do
 * ícone (ex. "architecture", "dashboard") aparecia como texto e vazava por
 * cima do label ao lado.
 *
 * Aqui o wrapper tem `width`/`height` = `size` e `flexShrink: 0` — mesmo sem
 * a fonte, o pior caso é um texto cortado dentro de uma caixa do tamanho
 * certo, nunca sobreposição.
 */
export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  fill?: number;
}

export function Icon({ name, size = 20, color, fill = 0 }: IconProps) {
  return (
    <span
      className="material-symbols-outlined"
      style={{
        fontSize: `${size}px`,
        width: `${size}px`,
        height: `${size}px`,
        color,
        lineHeight: 1,
        flexShrink: 0,
        overflow: 'hidden',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontVariationSettings: `'FILL' ${fill}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
      }}
    >
      {name}
    </span>
  );
}
