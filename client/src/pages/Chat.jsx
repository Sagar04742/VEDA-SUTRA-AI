import { useCallback, useEffect, useRef, useState } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useChats } from '../hooks/useChats.js';
import { useConversation } from '../hooks/useConversation.js';
import { useSpeech } from '../hooks/useSpeech.js';
import { useModelTier } from '../hooks/useModelTier.js';
import { MAX_IMAGES, prepareImage } from '../utils/image.js';
import { randomPrompt } from '../utils/prompts.js';
import Sidebar, { TOPICS } from '../components/Sidebar.jsx';
import Composer from '../components/Composer.jsx';
import MessageBubble from '../components/MessageBubble.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { HeroBackdrop, Ornament } from '../components/Hero.jsx';
import { ArrowRight, CloseIcon, GlobeIcon, MenuIcon, SwordsIcon } from '../components/Icons.jsx';

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
  const routeId = useMatch('/chat/c/:id')?.params.id;
  const list = useChats();
  const [sidebarOpen, setSidebarOpen] = useState(false); // the slide-out drawer on phones
  const [collapsed, setCollapsed] = useState(() => stored('sidebarCollapsed', '0') === '1'); // hidden on larger screens
  const [text, setText] = useState('');
  const [images, setImages] = useState([]);
  const [imageError, setImageError] = useState('');
  const [options, setOptions] = useState({ webSearch: false, deepExplain: false });
  const [voiceLang, setVoiceLang] = useState(() => stored('voiceLang', 'en-IN'));
  const picker = useModelTier();

  const conv = useConversation({
    onChatCreated: useCallback((chat) => {
      list.upsertTop(chat);
      navigate(`/chat/c/${chat.id}`, { replace: true }); // conv already knows this id, so it will not reload
    }, [list.upsertTop, navigate]), // eslint-disable-line react-hooks/exhaustive-deps
    onChatDiscarded: useCallback((id) => {
      list.dropLocal(id);
      navigate('/chat', { replace: true });
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
      conv.load(routeId).then((ok) => ok || navigate('/chat', { replace: true }));
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
    // Only follow the conversation; the empty greeting screen must start at the top (it is taller than a phone screen).
    if (el && stick.current && messages.length) el.scrollTo({ top: el.scrollHeight });
  }, [messages, error]);

  // After an answer that used Web search, ask the server again whether it is available (it may have just found out it is not).
  const usedSearch = useRef(false);
  useEffect(() => {
    if (!streaming && usedSearch.current) {
      usedSearch.current = false;
      picker.refresh();
    }
  }, [streaming]); // eslint-disable-line react-hooks/exhaustive-deps
  const webSearchOn = options.webSearch && picker.capabilities.webSearch;

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
    usedSearch.current = webSearchOn;
    conv.send({ content, images, ...options, webSearch: webSearchOn, tier: picker.tier });
    setText('');
    setImages([]);
    setImageError('');
  }

  function newChat() {
    conv.reset(); // also needed when the URL is already "/chat"
    setText('');
    setImages([]);
    setSidebarOpen(false);
    navigate('/chat');
  }

  async function remove(id) {
    await list.remove(id);
    if (id === chatIdRef.current) navigate('/chat');
  }

  // Closing hides the drawer on phones and collapses the sidebar on larger screens (remembered).
  function closeSidebar() {
    setSidebarOpen(false);
    setCollapsed(true);
    store('sidebarCollapsed', '1');
  }
  function openSidebar() {
    setSidebarOpen(true);
    setCollapsed(false);
    store('sidebarCollapsed', '0');
  }

  // A topic button/card puts a different starter question in the box every time it is clicked.
  function fillTopic(topicId) {
    setText(randomPrompt(topicId));
    setSidebarOpen(false);
    if (routeId) navigate('/chat');
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
        collapsed={collapsed}
        onClose={closeSidebar}
        onNewChat={newChat}
        onTopic={fillTopic}
        chatList={list}
        activeId={routeId}
        onRename={list.rename}
        onDelete={remove}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        {empty && <HeroBackdrop />}

        {/* Menu button: always on phones; on larger screens only after the sidebar was closed. */}
        <div className="relative z-20 flex items-center gap-3 p-3">
          <div className={collapsed ? '' : 'md:hidden'}>
            <button onClick={openSidebar} aria-label="Open sidebar" title="Open sidebar" className="rounded-lg border border-gold-500/30 bg-ink-900/70 p-2 text-gold-300 backdrop-blur hover:border-gold-400">
              <MenuIcon />
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* Always visible, even when the sidebar is closed */}
            <button
              onClick={() => navigate('/shastrarth', { state: { question: text } })}
              title="Open the Shastrarth arena"
              className="flex items-center gap-2 rounded-full border border-gold-300/70 bg-gradient-to-r from-side-a/30 to-side-b/30 px-3.5 py-1.5 text-sm font-medium text-parchment shadow-lg shadow-black/20 backdrop-blur transition hover:-translate-y-0.5 hover:border-gold-200"
            >
              <SwordsIcon width={16} height={16} className="text-gold-200" />
              <span>Shastrarth</span>
              <span className="hidden rounded-full bg-gold-300 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-ink-950 sm:inline">Featured</span>
            </button>
            <ThemeToggle />
          </div>
        </div>

        <div ref={scrollRef} onScroll={onScroll} className={`relative z-10 flex flex-1 flex-col overflow-y-auto px-4 ${empty ? 'items-center text-center' : ''}`}>
          {empty ? (
            <div className="mt-auto flex w-full flex-col items-center pb-4">
              <h1 className="fade-up font-serif text-4xl font-semibold text-parchment drop-shadow-lg sm:text-6xl">Namaste, <span className="shimmer-text">{firstName}</span></h1>
              <p className="fade-up mt-2 font-serif text-2xl text-parchment/90 drop-shadow" style={{ animationDelay: '120ms' }}>How can I help you today?</p>
              <Ornament />

              <div className="mb-4 mt-2 grid w-full max-w-5xl gap-5 sm:grid-cols-2">
                {CARDS.map(({ id, title, Icon, blurb }, n) => (
                  <button
                    key={id}
                    onClick={() => fillTopic(id)}
                    title="Click again for a different question"
                    style={{ animationDelay: `${240 + n * 120}ms` }}
                    className="fade-up group relative flex items-start gap-4 rounded-2xl border border-gold-500/50 bg-ink-900/60 p-6 text-left shadow-lg shadow-black/10 backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-gold-300 hover:bg-ink-800/75 hover:shadow-[0_14px_44px_-12px_rgba(228,185,104,0.5)]"
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

              {/* The featured feature, on its own */}
              <button
                onClick={() => navigate('/shastrarth')}
                aria-label="Open Shastrarth, the battle of the models"
                style={{ animationDelay: '360ms' }}
                className="fade-up group relative mb-5 w-full max-w-5xl overflow-hidden rounded-2xl border border-gold-300/70 text-left shadow-xl shadow-black/30 transition hover:-translate-y-1 hover:border-gold-200"
              >
                <span aria-hidden className="arena-banner-bg absolute inset-0 group-hover:scale-105" />
                <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-ink-950/92 via-ink-950/60 to-ink-950/15" />
                <span aria-hidden className="edge-sweep absolute inset-x-0 top-0 h-0.5" />
                <span className="relative flex flex-wrap items-center gap-4 p-5 sm:p-6">
                  <span className="min-w-0 flex-1">
                    <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-gold-300 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-950"><SwordsIcon width={12} height={12} /> Featured</span>
                    <span className="block font-serif text-3xl leading-tight text-parchment sm:text-4xl">Shastrarth <span className="font-deva text-2xl sm:text-3xl">शास्त्रार्थ</span></span>
                    <span className="mt-1 block max-w-xl text-sm text-parchment/85">Pit two AI models against each other on the same question. Pramana, our own checker (no AI judge), scores both out of 10.</span>
                  </span>
                  <span className="edge-sweep flex shrink-0 items-center gap-2 rounded-full px-6 py-2.5 font-semibold text-ink-950 shadow-lg shadow-black/30 transition group-hover:scale-105">Enter the arena <ArrowRight width={18} height={18} /></span>
                </span>
              </button>

              <div className="fade-up mb-4 flex max-w-4xl flex-wrap justify-center gap-2" style={{ animationDelay: '480ms' }}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-gold-500/50 bg-ink-900/60 px-4 py-1.5 text-sm text-gold-200 shadow backdrop-blur-md transition hover:-translate-y-0.5 hover:border-gold-300 hover:bg-gold-500/20"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="fade-up text-xs text-parchment/70 drop-shadow" style={{ animationDelay: '560ms' }}>Ask in English, हिन्दी, or your own language. Attach a photo of a problem, or tap the microphone to speak.</p>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-5xl space-y-6 py-6" aria-live="polite">
              {loading && <p className="text-center text-parchment/50">Loading conversation…</p>}
              {messages.map((m) => <MessageBubble key={m.id} message={m} chatId={chatIdRef.current} />)}
            </div>
          )}
        </div>

        <div className="relative z-10 px-4 pb-4">
          <div className="mx-auto w-full max-w-5xl">
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
              options={{ ...options, webSearch: webSearchOn }}
              onOptions={setOptions}
              onShastrarth={() => navigate('/shastrarth', { state: { question: text } })}
              speech={speech}
              voiceLang={voiceLang}
              onVoiceLang={changeVoiceLang}
              picker={picker}
            />
            <p className="mt-2 text-center text-xs text-parchment/60">VedaSutra can make mistakes. Check important information.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
