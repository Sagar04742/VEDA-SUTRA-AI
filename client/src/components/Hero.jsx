import { LotusIcon } from './Icons.jsx';

const GLYPHS = ['ॐ', 'द्व', 'ज्ञा', 'सू', 'वि', 'अ', 'गं', 'पि'];

// Decorative sun-dial mandala: concentric rings, tick marks, Sanskrit glyphs and an Om at the centre.
function Mandala() {
  const ticks = Array.from({ length: 72 }, (_, i) => i * 5);
  return (
    <svg viewBox="-200 -200 400 400" className="pointer-events-none absolute left-1/2 top-4 w-[520px] max-w-[110vw] -translate-x-1/2 text-gold-400 opacity-35 md:opacity-60 md:left-[58%] md:top-0" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="0.8">
        <circle r="190" opacity=".5" />
        <circle r="150" opacity=".6" />
        <circle r="95" />
        <circle r="60" opacity=".8" />
        {ticks.map((a) => (
          <line key={a} y1="-190" y2={a % 15 === 0 ? -178 : -184} transform={`rotate(${a})`} opacity=".7" />
        ))}
        {[0, 45, 90, 135].map((a) => (
          <line key={a} x1="-150" x2="150" transform={`rotate(${a})`} opacity=".25" />
        ))}
      </g>
      {GLYPHS.map((g, i) => {
        const a = (i / GLYPHS.length) * Math.PI * 2 - Math.PI / 2;
        return (
          <text key={g} x={Math.cos(a) * 122} y={Math.sin(a) * 122 + 6} textAnchor="middle" fontSize="18" fill="currentColor" fontFamily="var(--font-deva)">
            {g}
          </text>
        );
      })}
      <text y="22" textAnchor="middle" fontSize="70" fill="currentColor" fontFamily="var(--font-deva)">ॐ</text>
    </svg>
  );
}

// Dark mountain ridges at the bottom of the hero, evoking the dusk landscape.
function Ridges() {
  return (
    <svg viewBox="0 0 1200 300" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 w-full" aria-hidden>
      <path d="M0 220 L120 160 L240 205 L380 120 L520 190 L660 140 L800 200 L950 130 L1100 185 L1200 150 V300 H0z" fill="#241710" opacity=".55" />
      <path d="M0 260 L150 215 L300 250 L470 190 L640 245 L820 205 L980 250 L1200 215 V300 H0z" fill="#150f0b" opacity=".85" />
    </svg>
  );
}

export function HeroBackdrop() {
  return (
    <div className="hero-bg absolute inset-0 overflow-hidden">
      <Mandala />
      <Ridges />
      <p className="pointer-events-none absolute left-[8%] top-[28%] hidden font-deva text-2xl leading-relaxed text-gold-400/50 lg:block">
        || ज्ञानम्<br />&nbsp;&nbsp;विज्ञानम्<br />&nbsp;&nbsp;भविष्यत् दीपकः ||
      </p>
    </div>
  );
}

export function Ornament() {
  return (
    <div className="mx-auto my-4 flex items-center justify-center gap-3 text-gold-400/70" aria-hidden>
      <span className="h-px w-24 bg-gradient-to-r from-transparent to-gold-400/70" />
      <LotusIcon width={22} height={22} />
      <span className="h-px w-24 bg-gradient-to-l from-transparent to-gold-400/70" />
    </div>
  );
}
