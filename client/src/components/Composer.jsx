import { LotusIcon, SendIcon } from './Icons.jsx';

// Message input bar. Enter sends, Shift+Enter adds a new line.
export default function Composer({ value, onChange, onSend, disabled, placeholder }) {
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gold-500/50 bg-ink-900/90 p-2 pl-4 backdrop-blur">
      <LotusIcon className="hidden shrink-0 text-gold-400 sm:block" width={30} height={30} />
      <span className="hidden h-8 w-px bg-white/10 sm:block" />
      <textarea
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent py-2 text-parchment outline-none placeholder:text-parchment/40"
      />
      <button
        onClick={onSend}
        disabled={disabled || !value.trim()}
        aria-label="Send"
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold-300 text-ink-950 transition hover:bg-gold-200 disabled:opacity-40"
      >
        <SendIcon />
      </button>
    </div>
  );
}
