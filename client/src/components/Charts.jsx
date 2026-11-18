import { useEffect, useId, useState } from 'react';

// Hand-made SVG charts (no chart library): a score ring and a radar chart.

// true one frame after mounting, so CSS transitions have something to animate from
function useMounted() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return on;
}

// A ring that fills to value/max, with the score in the middle. tone: 'a' | 'b' picks the contestant colour.
export function ScoreRing({ value, max = 10, size = 148, stroke = 13, tone = 'a', sublabel }) {
  const id = useId();
  const mounted = useMounted();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  const colour = tone === 'b' ? 'var(--color-side-b)' : 'var(--color-side-a)';
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${value} out of ${max}, ${Math.round(pct * 100)} percent`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={colour} />
            <stop offset="100%" stopColor={colour} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id}-g)`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={mounted ? c * (1 - pct) : c}
          style={{ transition: 'stroke-dashoffset 1.3s cubic-bezier(0.2, 0.8, 0.2, 1)', filter: `drop-shadow(0 0 6px ${colour})` }}
        />
      </svg>
      <div className="absolute text-center leading-none">
        <div className="font-sans text-4xl font-semibold tabular-nums" style={{ color: colour }}>{value}</div>
        <div className="mt-1 text-xs text-parchment/60">out of {max}</div>
        {sublabel && <div className="mt-1 text-[11px] font-medium text-parchment/80">{sublabel}</div>}
      </div>
    </div>
  );
}

// A radar (spider) chart. axes = [{ label, a, b }] with a and b as 0..1 shares of that axis's maximum.
// b may be omitted for a single contestant.
export function Radar({ axes, size = 280 }) {
  const mounted = useMounted();
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 56;
  const n = axes.length;
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const point = (i, share) => [cx + Math.cos(angle(i)) * radius * share, cy + Math.sin(angle(i)) * radius * share];
  const poly = (key) => axes.map((ax, i) => point(i, Math.max(0.02, ax[key] ?? 0)).join(',')).join(' ');
  const hasB = axes.some((ax) => ax.b != null);

  return (
    <svg viewBox={`-34 -6 ${size + 68} ${size + 12}`} className="mx-auto w-full max-w-[330px] overflow-visible" role="img" aria-label="Radar chart comparing the two answers on accuracy, grounding, honesty and clarity">
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon key={ring} points={axes.map((_, i) => point(i, ring).join(',')).join(' ')} fill={ring === 1 ? 'currentColor' : 'none'} fillOpacity="0.04" stroke="currentColor" strokeOpacity={ring === 1 ? 0.3 : 0.14} strokeWidth="1" />
      ))}
      {axes.map((_, i) => {
        const [x, y] = point(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="currentColor" strokeOpacity="0.16" />;
      })}
      {mounted && (
        <>
          <polygon className="radar-poly" points={poly('a')} fill="var(--color-side-a)" fillOpacity="0.28" stroke="var(--color-side-a)" strokeWidth="2.4" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 5px var(--color-side-a))' }} />
          {hasB && <polygon className="radar-poly" style={{ animationDelay: '0.15s', filter: 'drop-shadow(0 0 5px var(--color-side-b))' }} points={poly('b')} fill="var(--color-side-b)" fillOpacity="0.24" stroke="var(--color-side-b)" strokeWidth="2.4" strokeLinejoin="round" />}
          {axes.map((ax, i) => {
            const [x, y] = point(i, Math.max(0.02, ax.a ?? 0));
            const [x2, y2] = point(i, Math.max(0.02, ax.b ?? 0));
            return (
              <g key={i}>
                <circle cx={x} cy={y} r="4" fill="var(--color-side-a)" />
                {hasB && <circle cx={x2} cy={y2} r="4" fill="var(--color-side-b)" />}
              </g>
            );
          })}
        </>
      )}
      {axes.map((ax, i) => {
        const [x, y] = point(i, 1.2);
        const anchor = Math.abs(x - cx) < 6 ? 'middle' : x > cx ? 'start' : 'end';
        return (
          <g key={ax.label}>
            <text x={x} y={y - 2} textAnchor={anchor} className="fill-current text-[12px] font-medium" opacity="0.9">{ax.label}</text>
            <text x={x} y={y + 12} textAnchor={anchor} className="text-[10px]" fill="var(--color-side-a)">{Math.round((ax.a ?? 0) * 100)}%</text>
            {hasB && <text x={x} y={y + 24} textAnchor={anchor} className="text-[10px]" fill="var(--color-side-b)">{Math.round((ax.b ?? 0) * 100)}%</text>}
          </g>
        );
      })}
    </svg>
  );
}
