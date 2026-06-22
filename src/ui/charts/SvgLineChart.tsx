/** Gráfico de linha em SVG puro para séries temporais (tendência de health). */
import { useState } from 'react';

export interface SeriesPoint {
  x: number; // índice ou timestamp
  y: number;
  label?: string; // tooltip
}

interface SvgLineChartProps {
  points: SeriesPoint[];
  width?: number;
  height?: number;
  color?: string;
  yMin?: number;
  yMax?: number;
  formatY?: (y: number) => string;
}

export function SvgLineChart({ points, width = 640, height = 180, color = '#7c83fd', yMin, yMax, formatY = (y) => String(y) }: SvgLineChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return null;

  const pad = { l: 40, r: 14, t: 14, b: 22 };
  const W = width - pad.l - pad.r;
  const H = height - pad.t - pad.b;
  const ys = points.map((p) => p.y);
  const lo = yMin ?? Math.min(...ys);
  const hi = yMax ?? Math.max(...ys);
  const range = hi - lo || 1;

  const px = (i: number) => pad.l + (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  const py = (y: number) => pad.t + H - ((y - lo) / range) * H;

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(p.y).toFixed(1)}`).join(' ');
  const area = `${path} L ${px(points.length - 1).toFixed(1)} ${pad.t + H} L ${px(0).toFixed(1)} ${pad.t + H} Z`;
  const gridYs = [lo, lo + range / 2, hi];

  return (
    <svg width={width} height={height} style={{ display: 'block', maxWidth: '100%' }}
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const mx = e.clientX - rect.left;
        let best = 0, bd = Infinity;
        points.forEach((_, i) => { const d = Math.abs(px(i) - mx); if (d < bd) { bd = d; best = i; } });
        setHover(bd < 30 ? best : null);
      }}>
      <defs>
        <linearGradient id="lc-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridYs.map((g) => (
        <g key={g}>
          <line x1={pad.l} y1={py(g)} x2={width - pad.r} y2={py(g)} stroke="#1a1a3a" strokeWidth={1} />
          <text x={pad.l - 6} y={py(g) + 4} textAnchor="end" fill="#666" fontSize={10}>{formatY(Math.round(g * 10) / 10)}</text>
        </g>
      ))}
      <path d={area} fill="url(#lc-fill)" />
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={px(i)} cy={py(p.y)} r={hover === i ? 5 : points.length > 40 ? 0 : 3} fill={hover === i ? '#fff' : color} />
      ))}
      {hover !== null && (
        <g>
          <line x1={px(hover)} y1={pad.t} x2={px(hover)} y2={pad.t + H} stroke="#2a2a4e" strokeWidth={1} />
          <rect x={Math.min(px(hover) + 8, width - 168)} y={pad.t} width={160} height={36} rx={6} fill="#16213e" stroke="#2a2a4e" />
          <text x={Math.min(px(hover) + 16, width - 160)} y={pad.t + 15} fill="#e0e0e0" fontSize={11} fontWeight={600}>{formatY(points[hover].y)}</text>
          <text x={Math.min(px(hover) + 16, width - 160)} y={pad.t + 29} fill="#888" fontSize={10}>{points[hover].label ?? ''}</text>
        </g>
      )}
    </svg>
  );
}
