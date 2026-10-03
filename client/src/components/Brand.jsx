import { LotusIcon } from './Icons.jsx';

// VedaSutra logo block, used in the sidebar and on the auth pages.
export default function Brand({ size = 'md' }) {
  const big = size === 'lg';
  return (
    <div className="text-center">
      <LotusIcon className="mx-auto text-gold-300" width={big ? 56 : 44} height={big ? 56 : 44} strokeWidth={1.2} />
      <div className={`font-serif font-semibold tracking-wide text-gold-200 ${big ? 'text-4xl' : 'text-3xl'}`}>VedaSutra</div>
      <div className="text-[11px] text-gold-300/70">Ancient Knowledge. Modern Answers.</div>
    </div>
  );
}
