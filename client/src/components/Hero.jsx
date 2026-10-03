import { LotusIcon } from './Icons.jsx';

// The scene comes from the shared photo backdrop (Backdrop.jsx); this adds a floating Sanskrit verse beside the headline.
export function HeroBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <p className="float absolute left-[5%] top-[42%] hidden font-deva text-2xl leading-relaxed text-gold-300/70 drop-shadow lg:block">
        || ज्ञानम्<br />&nbsp;&nbsp;विज्ञानम्<br />&nbsp;&nbsp;भविष्यत् दीपकः ||
      </p>
    </div>
  );
}

export function Ornament() {
  return (
    <div className="mx-auto my-4 flex items-center justify-center gap-3 text-gold-400/80" aria-hidden>
      <span className="h-px w-24 bg-gradient-to-r from-transparent to-gold-400/70" />
      <LotusIcon className="glow-pulse rounded-full" width={22} height={22} />
      <span className="h-px w-24 bg-gradient-to-l from-transparent to-gold-400/70" />
    </div>
  );
}
