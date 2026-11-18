import { ShieldIcon } from '../Icons.jsx';

const PROVIDERS = { gemini: 'Gemini', groq: 'Groq', mistral: 'Mistral', openai: 'OpenAI', cohere: 'Cohere' };

// The security check result for one contestant, right under its picker.
export default function ReadyBadge({ status, onRecheck }) {
  const base = 'mt-2 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] leading-tight';
  if (!status || status.state === 'checking') {
    return (
      <p role="status" className={`${base} border-gold-400/40 bg-gold-500/10 text-parchment/80`}>
        <ShieldIcon width={15} height={15} className="glow-pulse shrink-0 text-gold-300" /> <span>Security check: making sure it can answer…</span>
      </p>
    );
  }
  if (status.state === 'ready') {
    const r = status.result;
    const via = r.fallback && r.via ? ` Answers via ${r.via.name} (${PROVIDERS[r.via.provider] ?? r.via.provider}).` : '';
    return (
      <p role="status" className={`${base} border-good/60 bg-good/10 text-good`} data-testid="ready-ok">
        <ShieldIcon width={15} height={15} strokeWidth={2.2} className="shrink-0" />
        <span><strong>Ready</strong>{r.ms ? ` · replied in ${(r.ms / 1000).toFixed(1)}s` : ''}<span className="text-parchment/70">{via}</span></span>
      </p>
    );
  }
  if (status.state === 'unknown') {
    return <p role="status" className={`${base} border-white/15 text-parchment/60`}><ShieldIcon width={15} height={15} className="shrink-0" /> <span>Could not run the check. The debate will try anyway.</span></p>;
  }
  return (
    <p role="alert" className={`${base} border-bad/60 bg-bad/10 text-parchment/90`} data-testid="ready-blocked">
      <ShieldIcon width={15} height={15} className="shrink-0 text-bad" />
      <span className="min-w-0 flex-1"><strong className="text-bad">Not ready:</strong> {status.result?.reason ?? 'it did not answer'}.</span>
      <button type="button" onClick={onRecheck} className="shrink-0 rounded-full border border-bad/50 px-2 py-0.5 text-[10px] text-bad hover:bg-bad/15">Check again</button>
    </p>
  );
}
