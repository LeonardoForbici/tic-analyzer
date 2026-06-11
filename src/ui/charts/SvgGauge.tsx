/** Gauge semicircular 0–100 em SVG puro (sem dependências), tema dark. */

interface SvgGaugeProps {
  value: number; // 0–100
  grade: string;
  size?: number;
  delta?: number | null;
}

function gradeColor(score: number): string {
  if (score >= 90) return '#56cfad';
  if (score >= 75) return '#9be36b';
  if (score >= 60) return '#f0a500';
  if (score >= 40) return '#ff9f43';
  return '#ff6b6b';
}

export function SvgGauge({ value, grade, size = 220, delta }: SvgGaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const cx = size / 2;
  const cy = size / 2 + 10;
  const r = size / 2 - 18;
  const startAngle = Math.PI; // 180°
  const endAngle = startAngle + Math.PI * (clamped / 100);
  const color = gradeColor(clamped);

  const arc = (from: number, to: number) => {
    const x1 = cx + r * Math.cos(from);
    const y1 = cy + r * Math.sin(from);
    const x2 = cx + r * Math.cos(to);
    const y2 = cy + r * Math.sin(to);
    const large = to - from > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  return (
    <svg width={size} height={size / 2 + 56} style={{ display: 'block' }}>
      <path d={arc(Math.PI, 2 * Math.PI)} fill="none" stroke="#1a1a3a" strokeWidth={14} strokeLinecap="round" />
      {clamped > 0 && (
        <path d={arc(startAngle, endAngle)} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round">
          <animate attributeName="opacity" from="0" to="1" dur="0.5s" />
        </path>
      )}
      {/* marcas de grade */}
      {[0, 25, 50, 75, 100].map((t) => {
        const a = Math.PI + Math.PI * (t / 100);
        const x1 = cx + (r - 12) * Math.cos(a);
        const y1 = cy + (r - 12) * Math.sin(a);
        const x2 = cx + (r - 20) * Math.cos(a);
        const y2 = cy + (r - 20) * Math.sin(a);
        return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2a2a4e" strokeWidth={2} />;
      })}
      <text x={cx} y={cy - 14} textAnchor="middle" fill={color} fontSize={size / 5.5} fontWeight={800} fontFamily="'Segoe UI', system-ui, sans-serif">
        {clamped}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#888" fontSize={13}>
        grade <tspan fill={color} fontWeight={700}>{grade}</tspan>
      </text>
      {delta !== null && delta !== undefined && (
        <text x={cx} y={cy + 34} textAnchor="middle" fontSize={12} fill={delta >= 0 ? '#56cfad' : '#ff6b6b'}>
          {delta >= 0 ? '▲' : '▼'} {delta >= 0 ? '+' : ''}{delta} vs análise anterior
        </text>
      )}
    </svg>
  );
}
