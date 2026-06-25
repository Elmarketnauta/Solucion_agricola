// ============================================================================
// Yunta-Agro — Sparkline SVG sin dependencias de gráficos.
// Developed by Marketnauta
// ----------------------------------------------------------------------------
// Mini-gráfico de tendencia para series de telemetría. SVG puro (cero libs) para
// mantener liviano el bundle de la PWA. Opcionalmente dibuja una banda de umbral.
// ============================================================================
interface SparklineProps {
  data: (number | null)[];
  width?: number;
  height?: number;
  color?: string;
  /** Umbral a marcar como línea punteada (ej. 12% VWC crítico). */
  threshold?: number | null;
  /** Fuerza el dominio Y; si falta, se autoescala a [min, max] de los datos. */
  domain?: [number, number];
  ariaLabel?: string;
}

export default function Sparkline({
  data, width = 120, height = 36, color = 'var(--brote)',
  threshold = null, domain, ariaLabel,
}: SparklineProps) {
  const pts = data.filter((v): v is number => typeof v === 'number');
  if (pts.length < 2) {
    return <div className="sparkline-empty" style={{ width, height }}>—</div>;
  }

  const min = domain ? domain[0] : Math.min(...pts);
  const max = domain ? domain[1] : Math.max(...pts);
  const range = max - min || 1;
  const pad = 3;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const xy = (v: number, i: number) => {
    const x = pad + (i / (data.length - 1)) * w;
    const y = pad + h - ((v - min) / range) * h;
    return [x, y] as const;
  };

  // Construye el path saltando nulos (segmentos discontinuos).
  let d = '';
  data.forEach((v, i) => {
    if (typeof v !== 'number') return;
    const [x, y] = xy(v, i);
    d += d && typeof data[i - 1] === 'number' ? ` L${x.toFixed(1)},${y.toFixed(1)}` : ` M${x.toFixed(1)},${y.toFixed(1)}`;
  });

  // Último punto (marcador).
  const lastIdx = data.map((v, i) => (typeof v === 'number' ? i : -1)).filter(i => i >= 0).pop();
  const lastXY = lastIdx != null ? xy(data[lastIdx] as number, lastIdx) : null;

  // Línea de umbral.
  const thY = threshold != null ? pad + h - ((threshold - min) / range) * h : null;
  const thInRange = threshold != null && threshold >= min && threshold <= max;

  return (
    <svg width={width} height={height} role="img" aria-label={ariaLabel ?? 'tendencia'} className="sparkline">
      {thInRange && thY != null && (
        <line x1={pad} y1={thY} x2={width - pad} y2={thY}
          stroke="#E5484D" strokeWidth="1" strokeDasharray="2 2" opacity="0.7" />
      )}
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      {lastXY && <circle cx={lastXY[0]} cy={lastXY[1]} r="2.4" fill={color} />}
    </svg>
  );
}
