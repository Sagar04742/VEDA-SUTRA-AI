import { LotusIcon } from './Icons.jsx';

// Full-screen loader: a gold ring turning around the lotus. Shown while the page restores your session.
export default function Loader({ label = 'Loading VedaSutra…' }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="fixed inset-0 z-[100] grid place-items-center bg-ink-950">
      <div className="text-center">
        <div className="relative mx-auto h-24 w-24">
          <span className="absolute inset-0 animate-spin rounded-full border-2 border-gold-500/20 border-t-gold-300" />
          <span className="absolute inset-3 animate-spin rounded-full border border-gold-500/10 border-b-gold-400/70 [animation-direction:reverse] [animation-duration:2.2s]" />
          <span className="absolute inset-0 grid place-items-center text-gold-300">
            <LotusIcon className="animate-pulse" width={40} height={40} strokeWidth={1.2} />
          </span>
        </div>
        <p className="mt-5 font-serif text-2xl tracking-wide text-gold-200">VedaSutra</p>
        <p className="mt-1 text-sm text-parchment/50">{label}</p>
      </div>
    </div>
  );
}
