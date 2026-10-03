import { useEffect, useRef } from 'react';
import { LotusIcon, SendIcon, StopIcon } from './Icons.jsx';

// Message input bar. Enter sends, Shift+Enter adds a new line. While an answer streams,
// the send button turns into "Stop generating".
export default function Composer({ value, onChange, onSend, onStop, streaming, placeholder }) {
  const ref = useRef(null);

  // Grow with the text (up to a limit).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const submit = () => !streaming && value.trim() && onSend();
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gold-500/50 bg-ink-900/90 p-2 pl-4 backdrop-blur">
      <LotusIcon className="hidden shrink-0 text-gold-400 sm:block" width={30} height={30} />
      <span className="hidden h-8 w-px bg-white/10 sm:block" />
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        maxLength={4000}
        aria-label="Message"
        className="min-h-[2.5rem] flex-1 resize-none bg-transparent py-2 text-parchment outline-none placeholder:text-parchment/40"
      />
      {streaming ? (
        <button
          onClick={onStop}
          aria-label="Stop generating"
          title="Stop generating"
          className="flex h-12 shrink-0 items-center gap-2 rounded-full border border-gold-300/70 bg-ink-800 px-4 text-gold-200 transition hover:bg-ink-700"
        >
          <StopIcon width={16} height={16} />
          <span className="hidden text-sm sm:inline">Stop</span>
        </button>
      ) : (
        <button
          onClick={submit}
          disabled={!value.trim()}
          aria-label="Send"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold-300 text-ink-950 transition hover:bg-gold-200 disabled:opacity-40"
        >
          <SendIcon />
        </button>
      )}
    </div>
  );
}
