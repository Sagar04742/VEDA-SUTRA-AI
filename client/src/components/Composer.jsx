import { useEffect, useRef } from 'react';
import { ChevronDown, CloseIcon, GlobeIcon, LotusIcon, MicIcon, PaperclipIcon, SendIcon, SparkIcon, StopIcon } from './Icons.jsx';
import { VOICE_LANGUAGES } from '../hooks/useSpeech.js';
import ModelPicker from './ModelPicker.jsx';
import { MAX_IMAGES } from '../utils/image.js';

function Toggle({ on, onClick, Icon, children, title, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on && !disabled}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
        disabled
          ? 'cursor-not-allowed border-white/5 bg-ink-900/40 text-parchment/30 line-through decoration-parchment/30'
          : on
            ? 'border-gold-300 bg-gold-500/25 text-gold-200'
            : 'border-white/10 bg-ink-900/70 text-parchment/60 hover:border-gold-500/40'
      }`}
    >
      <Icon width={14} height={14} /> {children}
    </button>
  );
}

// Message input bar. Enter sends, Shift+Enter adds a new line. While an answer streams,
// the send button turns into "Stop generating".
export default function Composer({
  value, onChange, onSend, onStop, streaming, placeholder,
  images, onPickImages, onRemoveImage, imageError,
  options, onOptions,
  speech, voiceLang, onVoiceLang,
  picker,
}) {
  const ref = useRef(null);
  const fileRef = useRef(null);

  // Grow with the text (up to a limit).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const canSend = Boolean(value.trim() || images.length);
  const submit = () => !streaming && canSend && onSend();
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div>
      {/* Tools row */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Toggle
          on={options.webSearch}
          disabled={!picker.capabilities.webSearch}
          onClick={() => onOptions({ ...options, webSearch: !options.webSearch })}
          Icon={GlobeIcon}
          title={picker.capabilities.webSearch ? "Let the assistant search the web (answers are labelled 'From the web')" : "Web search isn't included in the current Gemini plan, so it is switched off"}
        >
          Web search
        </Toggle>
        <Toggle on={options.deepExplain} onClick={() => onOptions({ ...options, deepExplain: !options.deepExplain })} Icon={SparkIcon} title="A longer, more thorough explanation with examples">
          Deep explain
        </Toggle>
        {speech.supported && (
          <label className="ml-auto flex items-center gap-1.5 text-xs text-parchment/60">
            <MicIcon width={14} height={14} />
            <span className="sr-only">Voice language</span>
            <select
              value={voiceLang}
              onChange={(e) => onVoiceLang(e.target.value)}
              aria-label="Voice language"
              className="rounded-md border border-white/10 bg-ink-900 px-1.5 py-0.5 text-xs text-parchment/80 outline-none focus:border-gold-400"
            >
              {VOICE_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* Attached pictures */}
      {images.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2" aria-label="Attached images">
          {images.map((img, i) => (
            <li key={i} className="relative">
              <img src={img.preview} alt={`Attachment ${i + 1}`} className="h-16 w-16 rounded-lg border border-gold-500/40 object-cover" />
              <button onClick={() => onRemoveImage(i)} aria-label={`Remove image ${i + 1}`} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink-950 text-parchment ring-1 ring-gold-400/60">
                <CloseIcon width={12} height={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {(imageError || speech.error) && <p role="status" className="mb-2 text-xs text-gold-300">{imageError || speech.error}</p>}

      <div className={`flex items-center gap-2 rounded-2xl border bg-ink-900/90 p-2 pl-4 backdrop-blur sm:gap-3 ${speech.listening ? 'border-gold-200 shadow-[0_0_0_3px_rgb(211_169_92/0.25)]' : 'border-gold-500/50'}`}>
        {/* The lotus logo is the answer-level picker: click it to choose Sutra Lite, Plus or Pro. */}
        <ModelPicker tiers={picker.tiers} value={picker.tier} onChange={picker.setTier} label="Choose answer level (Sutra Lite, Plus or Pro)">
          <LotusIcon className="text-gold-400" width={28} height={28} />
          <span className="hidden text-xs text-gold-200 sm:inline">{picker.current?.name}</span>
          <ChevronDown className="text-parchment/50" width={14} height={14} />
        </ModelPicker>
        <span className="hidden h-8 w-px bg-white/10 sm:block" />
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={speech.listening ? 'Listening… speak now' : placeholder}
          maxLength={4000}
          aria-label="Message"
          className="min-h-[2.5rem] min-w-0 flex-1 resize-none bg-transparent py-2 text-parchment outline-none placeholder:text-parchment/40"
        />

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          data-testid="file-input"
          onChange={(e) => {
            onPickImages([...e.target.files]);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => fileRef.current.click()}
          disabled={images.length >= MAX_IMAGES}
          aria-label="Attach image"
          title={images.length >= MAX_IMAGES ? `Up to ${MAX_IMAGES} images` : 'Attach an image (a maths problem, a verse, a diagram)'}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-parchment/70 transition hover:bg-white/5 hover:text-gold-300 disabled:opacity-40"
        >
          <PaperclipIcon />
        </button>

        {speech.supported && (
          <button
            onClick={() => (speech.listening ? speech.stop() : speech.start(value))}
            aria-label={speech.listening ? 'Stop voice typing' : 'Start voice typing'}
            aria-pressed={speech.listening}
            title={speech.listening ? 'Stop listening' : 'Speak your question'}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition ${speech.listening ? 'animate-pulse bg-red-500/80 text-white' : 'text-parchment/70 hover:bg-white/5 hover:text-gold-300'}`}
          >
            <MicIcon />
          </button>
        )}

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
            disabled={!canSend}
            aria-label="Send"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gold-300 text-ink-950 transition hover:bg-gold-200 disabled:opacity-40"
          >
            <SendIcon />
          </button>
        )}
      </div>
    </div>
  );
}
