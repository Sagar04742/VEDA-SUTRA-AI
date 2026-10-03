import { useEffect, useState } from 'react';
import { ClockIcon, CloseIcon, RetryIcon } from './Icons.jsx';

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Shows a failed turn. For "usage limit reached" errors it counts down until the user can try again.
export default function ErrorBanner({ error, onRetry, onDismiss }) {
  const waitFor = error.code === 'rate_limit' && error.retryAfterSeconds ? error.retryAfterSeconds : 0;
  const [left, setLeft] = useState(waitFor);

  useEffect(() => {
    setLeft(waitFor);
    if (!waitFor) return;
    const end = Date.now() + waitFor * 1000;
    const t = setInterval(() => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) clearInterval(t);
    }, 500);
    return () => clearInterval(t);
  }, [error, waitFor]);

  const limited = error.code === 'rate_limit';
  const waiting = waitFor > 0 && left > 0;

  return (
    <div
      role="alert"
      className={`mb-2 flex items-start gap-3 rounded-xl border px-4 py-2.5 text-sm ${
        limited ? 'border-gold-400/40 bg-gold-600/15 text-gold-200' : 'border-red-500/30 bg-red-950/70 text-red-200'
      }`}
    >
      {limited && <ClockIcon className="mt-0.5 shrink-0" width={18} height={18} />}
      <span className="flex-1">
        {error.message}
        {waiting && <strong className="ml-2 tabular-nums">{clock(left)}</strong>}
        {limited && waitFor > 0 && left === 0 && <span className="ml-2">You can try again now.</span>}
      </span>
      {!(limited && !waitFor) && (
        <button
          onClick={onRetry}
          disabled={waiting}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-current/40 px-2 py-0.5 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RetryIcon width={14} height={14} /> Retry
        </button>
      )}
      <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 py-0.5 opacity-70 hover:opacity-100">
        <CloseIcon width={16} height={16} />
      </button>
    </div>
  );
}
