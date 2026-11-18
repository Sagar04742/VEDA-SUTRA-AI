import { useEffect, useState } from 'react';
import { ClockIcon } from '../Icons.jsx';

// A stopwatch for one contestant: counts up while it is answering, then shows the final time.
export default function LiveClock({ startedAt, ms, running }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [running]);
  const shown = running ? (startedAt ? now - startedAt : 0) : ms;
  if (shown == null) return null;
  return (
    <span className="inline-flex items-center gap-1 font-sans text-xs tabular-nums text-parchment/70" aria-label={running ? 'time so far' : 'time taken'}>
      <ClockIcon width={12} height={12} className={running ? 'text-gold-300' : ''} /> {(shown / 1000).toFixed(1)}s
    </span>
  );
}
