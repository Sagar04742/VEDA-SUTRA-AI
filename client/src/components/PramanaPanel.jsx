import { useState } from 'react';
import { Radar, ScoreRing } from './Charts.jsx';
import { BoltIcon, CheckIcon, CloseIcon, CopyIcon, CrownIcon, ShieldIcon } from './Icons.jsx';

const KIND = {
  calculation: 'the exact Vedic solver',
  knowledge: 'the knowledge base',
  unknown_topic: 'the knowledge base (it has nothing on this topic)',
  offtopic: 'the scope rules (an off-topic question)',
  smalltalk: 'the friendliness rules (a greeting)',
  unchecked: 'the rules only (the question is not in English, so its facts cannot be checked)',
  general: 'the rules only',
};
const PROVENANCE = { verified_math: 'verified maths', traditional_text: 'traditional text', interpretation: 'interpretation' };

const CONFIDENCE = {
  exact: ['Exact', 'every sum was proven by the Vedic solver'],
  high: ['High', 'a clear knowledge-base match'],
  medium: ['Medium', 'the knowledge base only partly covers the question'],
  limited: ['Limited', 'another language: figures, dates, sums and sources were compared, not the wording'],
  rules: ['Rules only', 'nothing to look up: scope, manners and honesty were checked'],
};

// A short plain-text summary that can be pasted anywhere.
function summary(a, b, winner, margin, evidence) {
  const line = (s) => `${s.name}: ${s.score ?? 'no answer'}/10${s.seal ? ` (${s.seal}, hallucination risk ${s.risk?.level})` : ''}`;
  const result = winner === 'tie' ? 'Draw' : winner ? `${(winner === 'a' ? a : b).name} wins by ${margin}` : 'No winner';
  return `Shastrarth, judged by Pramana (no AI judge)\n${line(a)}\n${line(b)}\n${result}. Checked against ${evidence?.checkedAgainst ?? 'the rules'}.`;
}

const SEALS = {
  verified: { label: 'Verified', tone: 'border-good/60 bg-good/15 text-good' },
  sound: { label: 'Sound', tone: 'border-gold-400/60 bg-gold-400/15 text-gold-200' },
  shaky: { label: 'Shaky', tone: 'border-warn/60 bg-warn/15 text-warn' },
  unreliable: { label: 'Unreliable', tone: 'border-bad/60 bg-bad/15 text-bad' },
};
const RISK = { low: { label: 'Low', tone: 'text-good' }, medium: { label: 'Medium', tone: 'text-warn' }, high: { label: 'High', tone: 'text-bad' } };

const CLAIM = {
  verified: { label: 'Verified', tone: 'border-good bg-good/10', chip: 'bg-good/20 text-good' },
  supported: { label: 'Matches the knowledge base', tone: 'border-good/70 bg-good/[0.07]', chip: 'bg-good/15 text-good' },
  web: { label: 'Matches Wikipedia (read by the model)', tone: 'border-side-b/80 bg-side-b/[0.07]', chip: 'bg-side-b/15 text-side-b' },
  inconsistent: { label: 'Contradicts itself', tone: 'border-bad bg-bad/10', chip: 'bg-bad/20 text-bad' },
  general: { label: 'General (not checkable)', tone: 'border-white/20', chip: 'bg-white/10 text-parchment/70' },
  conflict: { label: 'Contradicts the knowledge base', tone: 'border-bad bg-bad/10', chip: 'bg-bad/20 text-bad' },
  unsourced: { label: 'Not in the knowledge base', tone: 'border-warn bg-warn/10', chip: 'bg-warn/20 text-warn' },
  overclaim: { label: 'Overclaims', tone: 'border-bad bg-bad/10', chip: 'bg-bad/20 text-bad' },
  wrong: { label: 'Wrong', tone: 'border-bad bg-bad/10', chip: 'bg-bad/20 text-bad' },
};

export function Seal({ seal }) {
  const s = SEALS[seal];
  if (!s) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${s.tone}`}>
      <ShieldIcon width={14} height={14} /> {s.label}
    </span>
  );
}

function SideSummary({ side, tone, isWinner }) {
  const risk = RISK[side.risk?.level];
  const st = side.stats;
  if (side.score == null) return <div className="rounded-xl border border-white/10 bg-ink-800/40 px-4 py-8 text-center text-sm text-parchment/60">{side.name}<br />No answer, so no score.</div>;
  return (
    <div className={`flex flex-col items-center gap-2 rounded-2xl border px-4 py-4 text-center ${isWinner ? (tone === 'a' ? 'border-side-a shadow-side-a' : 'border-side-b shadow-side-b') : 'border-white/10'} bg-ink-800/35`}>
      <p className={`flex items-center gap-1.5 text-sm font-medium ${tone === 'a' ? 'text-side-a' : 'text-side-b'}`}>
        {isWinner && <CrownIcon width={16} height={16} className="crown-drop" />} {side.name}
      </p>
      <ScoreRing value={side.score} tone={tone} sublabel={`${Math.round(side.score * 10)}%`} />
      <Seal seal={side.seal} />
      {risk && (
        <p className="text-xs text-parchment/70">
          Hallucination risk: <strong className={risk.tone}>{risk.label}</strong>
          {side.risk.reasons?.length > 0 && <span className="mt-0.5 block text-[11px] text-parchment/55">{side.risk.reasons.join('; ')}</span>}
        </p>
      )}
      {st && st.total > 0 && (
        <p className="text-[11px] text-parchment/60">
          {st.total} claim{st.total === 1 ? '' : 's'} checked: <span className="text-good">{st.verified + st.supported} confirmed</span>, {st.general} general{st.flagged > 0 && <>, <span className="text-bad">{st.flagged} flagged</span></>}
        </p>
      )}
    </div>
  );
}

function XRay({ a, b }) {
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-2 text-[11px]" aria-label="Legend">
        {Object.entries(CLAIM).map(([k, v]) => <li key={k} className={`rounded-full px-2.5 py-0.5 ${v.chip}`}>{v.label}</li>)}
      </ul>
      <div className="grid gap-4 md:grid-cols-2">
        {[a, b].map((side, n) => (
          <div key={n} className="min-w-0">
            <p className={`mb-2 font-medium ${n === 0 ? 'text-side-a' : 'text-side-b'}`}>{side.name}</p>
            {side.claims?.length ? (
              <ul className="space-y-1.5">
                {side.claims.map((c, i) => {
                  const style = CLAIM[c.status];
                  if (!style) return <li key={i} className="px-3 text-[11px] italic text-parchment/40">{c.text}</li>;
                  return (
                    <li key={i} className={`rounded-lg border-l-4 px-3 py-1.5 text-xs ${style.tone}`}>
                      <span className="text-parchment/90">{c.text}</span>
                      {c.note && <span className="mt-0.5 block text-[11px] text-parchment/60">{c.note}</span>}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-parchment/60">Nothing to analyse.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Why({ a, b, evidence }) {
  return (
    <div>
      {evidence && (
        <p className="mb-3 rounded-lg bg-ink-800/60 px-3 py-2 text-xs text-parchment/80">
          Checked against <strong>{KIND[evidence.kind] ?? 'the project data'}</strong>.
          {evidence.calculation && <> The solver says {evidence.calculation.label} = <strong>{evidence.calculation.answer}</strong>.</>}
          {evidence.entries?.length > 0 && <> Entries used: {evidence.entries.map((e) => `${e.name} (${e.source}; ${PROVENANCE[e.provenance] ?? e.provenance})`).join('; ')}.</>}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {[a, b].map((side, n) => (
          <div key={n} className="min-w-0">
            <p className={`mb-1 font-medium ${n === 0 ? 'text-side-a' : 'text-side-b'}`}>{side.name}</p>
            {side.breakdown ? (
              <ul className="space-y-1 text-xs text-parchment/80">
                {side.breakdown.flatMap((c) =>
                  c.notes.map((note, i) => (
                    <li key={`${c.key}-${i}`} className="flex gap-2">
                      <span className={`mt-0.5 shrink-0 ${note.ok ? 'text-good' : 'text-bad'}`}>{note.ok ? <CheckIcon width={14} height={14} /> : <CloseIcon width={14} height={14} />}</span>
                      <span className="min-w-0"><span className="text-parchment/50">{c.label}:</span> {note.text} {note.of > 0 && <span className="text-parchment/50">({note.points}/{note.of})</span>}</span>
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <p className="text-xs text-parchment/60">Nothing to score.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function WinnerBanner({ winner, margin, a, b }) {
  const w = winner === 'a' ? a : winner === 'b' ? b : null;
  return (
    <div className="mx-4 mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-xl border border-gold-400/50 bg-gradient-to-r from-gold-500/10 via-gold-400/20 to-gold-500/10 px-4 py-3 text-center">
      {w ? <CrownIcon className="crown-drop text-gold-300" width={26} height={26} /> : <BoltIcon className="text-gold-300" width={24} height={24} />}
      <p className="font-serif text-xl text-parchment">
        {w ? <><span className={winner === 'a' ? 'text-side-a' : 'text-side-b'}>{w.name}</span> wins by {margin} point{margin === 1 ? '' : 's'}</> : winner === 'tie' ? 'An honourable draw' : 'Only one side answered'}
      </p>
      {winner === 'tie' && <p className="w-full text-xs text-parchment/60">The scores are within half a point of each other.</p>}
    </div>
  );
}

// Pramana (प्रमाण, "valid proof"): the verdict of VedaSutra's own verification engine. No AI judges the answers; the exact
// Vedic solver and the sourced knowledge base are the ground truth, and every claim is checked against them.
export default function PramanaPanel({ a, b, winner, margin, evidence, judgedMs }) {
  const [tab, setTab] = useState('xray');
  const [copied, setCopied] = useState(false);
  const conf = CONFIDENCE[evidence?.confidence];
  async function copy() {
    try {
      await navigator.clipboard.writeText(summary(a, b, winner, margin, evidence));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: ignore */
    }
  }
  const crit = (a.breakdown ?? b.breakdown ?? []).map((c, i) => ({ ...c, i }));
  const axes = crit.filter((c) => !c.skipped).map((c) => ({ label: c.label, a: a.breakdown ? a.breakdown[c.i].score / c.max : 0, b: b.breakdown ? b.breakdown[c.i].score / c.max : 0 }));

  return (
    <section aria-label="Scores" className="overflow-hidden rounded-2xl border border-gold-500/50 bg-ink-900/80 shadow-lg shadow-black/10 backdrop-blur-md" data-testid="pramana">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-gold-500/20 bg-gold-500/10 px-4 py-2.5">
        <span className="font-serif text-xl text-gold-200">Pramana <span className="font-deva text-lg">प्रमाण</span></span>
        <span className="text-xs text-parchment/70">VedaSutra&rsquo;s own verification engine. No AI judges this: the exact solver and the sourced knowledge base do.</span>
        <button onClick={copy} className="ml-auto flex items-center gap-1 text-xs text-parchment/60 transition hover:text-gold-300" aria-label="Copy the verdict">
          {copied ? <CheckIcon width={14} height={14} /> : <CopyIcon width={14} height={14} />} {copied ? 'Copied' : 'Copy verdict'}
        </button>
      </header>
      {(conf || judgedMs) && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-3 text-[11px] text-parchment/60">
          {conf && <span title={conf[1]}>Confidence: <strong className="text-gold-200">{conf[0]}</strong> <span className="text-parchment/45">({conf[1]})</span></span>}
          {judgedMs && <span className="flex items-center gap-1"><BoltIcon width={12} height={12} className="text-gold-300" /> Judged in {judgedMs} ms</span>}
        </p>
      )}

      <WinnerBanner winner={winner} margin={margin} a={a} b={b} />

      <div className="grid items-center gap-5 px-4 py-5 md:grid-cols-[1fr_minmax(240px,300px)_1fr]">
        <SideSummary side={a} tone="a" isWinner={winner === 'a'} />
        <div>
          <Radar axes={axes} />
          <p className="mt-1 flex justify-center gap-4 text-[11px] text-parchment/70">
            <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-side-a" /> {a.name}</span>
            <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-side-b" /> {b.name}</span>
          </p>
        </div>
        <SideSummary side={b} tone="b" isWinner={winner === 'b'} />
      </div>

      <div className="overflow-x-auto px-4 pb-4">
        <table className="w-full min-w-[320px] text-left text-xs" aria-label="Score by criterion">
          <thead className="text-parchment/50">
            <tr><th className="py-1 font-normal">Criterion</th><th className="py-1 font-normal text-side-a">{a.name}</th><th className="py-1 font-normal text-side-b">{b.name}</th></tr>
          </thead>
          <tbody>
            {crit.map((c) => (
              <tr key={c.key} className="border-t border-white/10">
                <td className="py-1.5 text-parchment/85">{c.label} <span className="text-parchment/40">(out of {c.max})</span></td>
                {[a, b].map((side, n) => {
                  const part = side.breakdown?.[c.i];
                  return <td key={n} className="py-1.5 tabular-nums text-parchment/85">{c.skipped ? <span className="text-parchment/40">not scored</span> : part ? <>{part.score} <span className="text-parchment/50">· {Math.round((part.score / c.max) * 100)}%</span></> : '–'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-gold-500/20 px-4 py-3">
        <div role="tablist" className="mb-3 flex gap-2 text-sm">
          {[['xray', 'Claim X-ray'], ['why', 'Why these scores?']].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-full border px-4 py-1 transition ${tab === id ? 'border-gold-300 bg-gold-500/25 text-gold-200' : 'border-white/10 text-parchment/60 hover:border-gold-500/40'}`}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'xray' ? <XRay a={a} b={b} /> : <Why a={a} b={b} evidence={evidence} />}
      </div>
    </section>
  );
}
