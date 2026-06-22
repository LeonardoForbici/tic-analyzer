/** Gráfico de barras horizontal em SVG puro (distribuições por módulo etc.). */

export interface BarItem {
  label: string;
  value: number;
  color?: string;
}

interface SvgBarChartProps {
  items: BarItem[];
  width?: number;
  barHeight?: number;
  color?: string;
  formatValue?: (v: number) => string;
}

export function SvgBarChart({ items, width = 560, barHeight = 22, color = '#7c83fd', formatValue = (v) => String(v) }: SvgBarChartProps) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.value), 1);
  const labelW = 170;
  const gap = 6;
  const height = items.length * (barHeight + gap);

  return (
    <svg width={width} height={height} style={{ display: 'block', maxWidth: '100%' }}>
      {items.map((item, i) => {
        const y = i * (barHeight + gap);
        const w = Math.max(2, ((width - labelW - 56) * item.value) / max);
        return (
          <g key={item.label}>
            <text x={labelW - 8} y={y + barHeight / 2 + 4} textAnchor="end" fill="#aaa" fontSize={11} fontFamily="monospace">
              {item.label.length > 24 ? `…${item.label.slice(-23)}` : item.label}
            </text>
            <rect x={labelW} y={y + 2} width={w} height={barHeight - 4} rx={4} fill={item.color ?? color} opacity={0.85}>
              <animate attributeName="width" from="0" to={w} dur="0.4s" />
            </rect>
            <text x={labelW + w + 6} y={y + barHeight / 2 + 4} fill="#e0e0e0" fontSize={11} fontWeight={600}>
              {formatValue(item.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
