import { useEffect, useState } from 'react';
import { LotusIcon } from './Icons.jsx';

const PHRASES = ['Gathering ancient knowledge…', 'Aligning the planets…', 'Opening the library of sutras…', 'Warming up the calculations…'];

// Full-screen loader: slow golden rings turning around a glowing lotus, with phrases that change.
// `leaving` fades it out once the page is ready.
export default function Loader({ leaving = false, label }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % PHRASES.length), 1500);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={!leaving}
      className={`fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-ink-950 transition-opacity duration-700 ${leaving ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
    >
      {/* soft glow */}
      <div className="absolute h-[60vmin] w-[60vmin] rounded-full bg-gold-400/15 blur-3xl" />

      <div className="relative text-center">
        <div className="relative mx-auto h-40 w-40">
          {/* outer ring: slow turn */}
          <span className="absolute inset-0 animate-[spin_7s_linear_infinite] rounded-full border border-gold-500/25 border-t-gold-300 border-r-gold-400/60" />
          {/* dashed ring: turns the other way */}
          <span className="absolute inset-4 animate-[spin_11s_linear_infinite_reverse] rounded-full border border-dashed border-gold-400/40" />
          {/* inner ring */}
          <span className="absolute inset-9 animate-[spin_5s_linear_infinite] rounded-full border-2 border-transparent border-b-gold-300/80 border-l-gold-400/40" />
          {/* little planets travelling round the outer ring */}
          <span className="absolute inset-0 animate-[spin_7s_linear_infinite]"><span className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-gold-200 shadow-[0_0_14px_3px_rgb(242_211_143/0.7)]" /></span>
          <span className="absolute inset-4 animate-[spin_11s_linear_infinite_reverse]"><span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-gold-300 shadow-[0_0_10px_2px_rgb(228_185_104/0.6)]" /></span>
          {/* the lotus */}
          <span className="absolute inset-0 grid place-items-center text-gold-300">
            <LotusIcon className="animate-[pulse_2.6s_ease-in-out_infinite] drop-shadow-[0_0_14px_rgb(242_211_143/0.65)]" width={56} height={56} strokeWidth={1.2} />
          </span>
        </div>

        <p className="shimmer-text mt-8 font-serif text-4xl font-semibold tracking-wide">VedaSutra</p>
        <p key={i} className="fade-up mt-2 h-6 text-sm text-parchment/60">{label ?? PHRASES[i]}</p>
      </div>
    </div>
  );
}
