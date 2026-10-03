import { useCallback, useEffect, useRef, useState } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useChats } from '../hooks/useChats.js';
import { useConversation } from '../hooks/useConversation.js';
import { useSpeech } from '../hooks/useSpeech.js';
import { MAX_IMAGES, prepareImage } from '../utils/image.js';
import Sidebar, { TOPICS } from '../components/Sidebar.jsx';
import Composer from '../components/Composer.jsx';
import MessageBubble from '../components/MessageBubble.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import { HeroBackdrop, Ornament } from '../components/Hero.jsx';
import { ArrowRight, CloseIcon, GlobeIcon, MenuIcon } from '../components/Icons.jsx';

const CARDS = [
  { ...TOPICS[0], blurb: 'Fast calculations, unique techniques and concepts from the Vedas.' },
  { ...TOPICS[1], blurb: 'Astronomy, Ayurveda, Vastu, ancient inventions and more.' },
];
const SUGGESTIONS = ['Multiply 98 × 97', 'What is Nikhilam?', 'Square of 105', 'वैदिक गणित क्या है?'];

const stored = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const store = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: ignore */
  }
};

export default function Chat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const routeId = useMatch('/c/:id')?.params.id;
  const list = useChats();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [text, setText] = useState('');
  const [images, setImages] = useState([]);
  const [imageError, setImageError] = useState('');
  const [options, setOptions] = useState({ webSearch: false, deepExplain: false });
  const [voiceLang, setVoiceLang] = useState(() => stored('voiceLang', 'en-IN'));

  const conv = useConversation({
    onChatCreated: useCallback((chat) => {
      list.upsertTop(chat);
      navigate(`/c/${chat.id}`, { replace: true }); // conv already knows this id, so it will not reload
    }, [list.upsertTop, navigate]), // eslint-disable-line react-hooks/exhaustive-deps
    onChatDiscarded: useCallback((id) => {
      list.dropLocal(id);
      navigate('/', { replace: true });
    }, [list.dropLocal, navigate]), // eslint-disable-line react-hooks/exhaustive-deps
    onTitle: list.setTitle,
    onActivity: useCallback((id) => list.upsertTop({ id, updatedAt: new Date().toISOString() }), [list.upsertTop]), // eslint-disable-line react-hooks/exhaustive-deps
  });
  const { messages, streaming, loading, error, notice, chatIdRef } = conv;
  const speech = useSpeech({ lang: voiceLang, onText: setText });

  // Keep the open conversation in sync with the URL.
  useEffect(() => {
    if (!routeId) {
      if (chatIdRef.current) conv.reset();
      return;
    }
    if (routeId !== chatIdRef.current) {
      conv.load(routeId).then((ok) => ok || navigate('/', { replace: true }));
    }
  }, [routeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll while answers arrive, unless the reader scrolled up.
  const scrollRef = useRef(null);
  const stick = useRef(true);
  const onScroll = () => {
    const el = scrollRef.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight });
  }, [messages, error]);

  async function pickImages(files) {
    setImageError('');
    const room = MAX_IMAGES - images.length;
    if (files.length > room) setImageError(`You can attach up to ${MAX_IMAGES} images per message.`);
    const prepared = [];
    for (const file of files.slice(0, room)) {
      try {
        prepared.push(await prepareImage(file));
      } catch (e) {
        setImageError(e.message);
      }
    }
    setImages((cur) => [...cur, ...prepared]);
  }

  function send(content = text) {
    if ((!content.trim() && !images.length) || streaming) return;
    speech.stop();
    stick.current = true;
    conv.send({ content, images, ...options });
    setText('');
    setImages([]);
    setImageError('');
  }

  function newChat() {
    conv.reset(); // also needed when the URL is already "/"
    setText('');
    setImages([]);
    setSidebarOpen(false);
    navigate('/');
  }

  async function remove(id) {
    await list.remove(id);
    if (id === chatIdRef.current) navigate('/');
  }

  const changeVoiceLang = (code) => {
    setVoiceLang(code);
    store('voiceLang', code);
  };

  const empty = messages.length === 0 && !loading;
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={newChat}
        onTopic={(prompt) => {
          setText(prompt);
          setSidebarOpen(false);
          if (routeId) navigate('/');
        }}
        chatList={list}
        activeId={routeId}
        onRename={list.rename}
        onDelete={remove}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        {empty && <HeroBackdrop />}

        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sidebar"
          className="relative z-10 m-3 w-fit rounded-lg border border-white/10 bg-ink-900/70 p-2 text-gold-300 md:hidden"
        >
          <MenuIcon />
        </button>

        <div ref={scrollRef} onScroll={onScroll} className={`relative z-10 flex flex-1 flex-col overflow-y-auto px-4 ${empty ? 'items-center text-center' : ''}`}>
          {empty ? (
            <div className="mt-auto flex w-full flex-col items-center pb-4">
              <h1 className="font-serif text-4xl font-semibold text-parchment sm:text-6xl">Namaste, {firstName}</h1>
              <p className="mt-2 font-serif text-2xl text-parchment/90">How can I help you today?</p>
              <Ornament />

              <div className="mb-4 mt-2 grid w-full max-w-3xl gap-4 sm:grid-cols-2">
                {CARDS.map(({ id, title, Icon, blurb, prompt }) => (
                  <button
                    key={id}
                    onClick={() => setText(prompt)}
                    className="group relative flex items-start gap-4 rounded-2xl border border-gold-500/40 bg-ink-900/70 p-5 text-left backdrop-blur transition hover:border-gold-300/70 hover:bg-ink-800/80"
                  >
                    <Icon className="mt-1 shrink-0 text-gold-300" width={38} height={38} />
                    <span className="flex-1">
                      <span className="block font-serif text-2xl text-parchment">{title}</span>
                      <span className="mt-1 block text-sm text-parchment/70">{blurb}</span>
                    </span>
                    <span className="grid h-9 w-9 shrink-0 place-items-center self-end rounded-full border border-gold-400/60 text-gold-300 transition group-hover:bg-gold-400/20">
                      <ArrowRight width={18} height={18} />
                    </span>
                  </button>
                ))}
              </div>

              <div className="mb-4 flex max-w-3xl flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-gold-500/40 bg-ink-900/70 px-4 py-1.5 text-sm text-gold-200 backdrop-blur transition hover:border-gold-300 hover:bg-gold-500/15"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-xs text-parchment/50">Ask in English, हिन्दी, or your own language. Attach a photo of a problem, or tap the microphone to speak.</p>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-6 py-6" aria-live="polite">
              {loading && <p className="text-center text-parchment/50">Loading conversation…</p>}
              {messages.map((m) => <MessageBubble key={m.id} message={m} chatId={chatIdRef.current} />)}
            </div>
          )}
        </div>

        <div className="relative z-10 px-4 pb-4">
          <div className="mx-auto w-full max-w-4xl">
            {notice && (
              <div role="status" className="mb-2 flex items-start gap-3 rounded-xl border border-white/10 bg-ink-900/80 px-4 py-2 text-sm text-parchment/80">
                <GlobeIcon className="mt-0.5 shrink-0 text-gold-400" width={16} height={16} />
                <span className="flex-1">{notice}</span>
                <button onClick={conv.dismissNotice} aria-label="Dismiss" className="opacity-70 hover:opacity-100"><CloseIcon width={16} height={16} /></button>
              </div>
            )}
            {error && <ErrorBanner error={error} onRetry={conv.retry} onDismiss={conv.dismissError} />}
            <Composer
              value={text}
              onChange={setText}
              onSend={() => send()}
              onStop={conv.stop}
              streaming={streaming}
              placeholder="Ask about Vedic Maths or Ancient Science…"
              images={images}
              onPickImages={pickImages}
              onRemoveImage={(i) => setImages((cur) => cur.filter((_, j) => j !== i))}
              imageError={imageError}
              options={options}
              onOptions={setOptions}
              speech={speech}
              voiceLang={voiceLang}
              onVoiceLang={changeVoiceLang}
            />
            <p className="mt-2 text-center text-xs text-parchment/40">VedaSutra can make mistakes. Check important information.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
