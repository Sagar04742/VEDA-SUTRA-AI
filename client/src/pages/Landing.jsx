import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { profileApi } from '../api/profile.js';
import { HeroBackdrop } from '../components/Hero.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { ArrowRight, GlobeIcon, LotusIcon, MicIcon, PaperclipIcon, RootIcon, SparkIcon, TempleIcon, CheckIcon } from '../components/Icons.jsx';

// Fades a section in as it scrolls into view.
function Reveal({ children, className = '', delay = 0 }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return setShown(true);
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setShown(true), io.disconnect()), { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ transitionDelay: `${delay}ms` }} className={`reveal ${shown ? 'in' : ''} ${className}`}>
      {children}
    </div>
  );
}

const Section = ({ id, eyebrow, title, children, className = '' }) => (
  <section id={id} className={`mx-auto w-full max-w-7xl px-5 py-16 sm:py-20 ${className}`}>
    <Reveal>
      {eyebrow && <p className="text-sm uppercase tracking-[0.25em] text-gold-400">{eyebrow}</p>}
      <h2 className="mt-2 max-w-3xl font-serif text-3xl font-semibold text-parchment sm:text-5xl">{title}</h2>
    </Reveal>
    <div className="mt-8">{children}</div>
  </section>
);

const FEATURES = [
  { Icon: RootIcon, title: 'Exact Vedic maths', text: 'Nikhilam, Urdhva-Tiryagbhyam, squares, vinculum, divisibility and more. Every answer is calculated by code and double-checked, then shown step by step.' },
  { Icon: TempleIcon, title: 'Ancient science, with sources', text: 'Astronomy, Ayurveda, metallurgy, mathematics. Answers come from a library of sourced entries, and when the library has nothing, VedaSutra says so.' },
  { Icon: GlobeIcon, title: 'Your language', text: 'Ask in English, Hindi or another Indian language and get the answer back in the same one.' },
  { Icon: MicIcon, title: 'Speak your question', text: 'Tap the microphone and talk. Voice typing works in ten languages.' },
  { Icon: PaperclipIcon, title: 'Snap a problem', text: 'Photograph a sum, a verse or a diagram and ask about it.' },
  { Icon: SparkIcon, title: 'Three answer levels', text: 'Sutra Lite for a quick reply, Plus for more detail, Pro for the full explanation.' },
];

const STEPS = [
  { n: 1, title: 'You ask', text: 'Type, speak or attach a photo, in any language you like.' },
  { n: 2, title: 'We look it up', text: 'VedaSutra searches its library of sourced entries for what is relevant to your question.' },
  { n: 3, title: 'Maths is computed', text: 'For calculations, an exact solver does the arithmetic and writes the numbered steps. The AI never does sums in its head.' },
  { n: 4, title: 'The AI explains', text: 'Gemini writes a clear answer from those facts, names the source, and says how certain the source is.' },
];

const LABELS = [
  { name: 'Verified maths', tone: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200', text: 'Can be checked by calculation. Stated as fact.' },
  { name: 'Traditional text', tone: 'border-gold-400/50 bg-gold-400/10 text-gold-200', text: 'What an old text says or attributes. Shown as "according to…", never as proven.' },
  { name: 'Interpretation', tone: 'border-sky-400/50 bg-sky-400/10 text-sky-200', text: 'A modern or scholarly reading. Presented as an interpretation, not settled fact.' },
];

export default function Landing() {
  const { user, loading } = useAuth();
  const [stats, setStats] = useState(null);
  useEffect(() => {
    profileApi.publicStats().then(setStats).catch(() => {});
  }, []);

  const cta = (
    <Link
      to="/chat"
      className="group inline-flex items-center gap-2 rounded-full bg-gold-300 px-7 py-3.5 text-lg font-medium text-ink-950 shadow-lg shadow-gold-500/20 transition hover:bg-gold-200"
    >
      {user ? 'Continue your conversation' : 'Start the conversation'}
      <ArrowRight className="transition group-hover:translate-x-1" />
    </Link>
  );

  return (
    <div className="min-h-dvh text-parchment">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-gold-500/15 bg-ink-950/55 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-3">
          <Link to="/" className="flex items-center gap-2 font-serif text-2xl text-gold-200">
            <LotusIcon className="text-gold-300" width={30} height={30} strokeWidth={1.3} /> VedaSutra
          </Link>
          <nav className="ml-6 hidden items-center gap-6 text-sm text-parchment/70 md:flex" aria-label="Page sections">
            <a href="#about" className="hover:text-gold-300">About</a>
            <a href="#features" className="hover:text-gold-300">What you can do</a>
            <a href="#how" className="hover:text-gold-300">How it works</a>
            <a href="#honesty" className="hover:text-gold-300">Honesty</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle className="h-9 w-9" />
            {!loading && user ? (
              <>
                <Link to="/profile" className="hidden items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-sm hover:border-gold-500/50 sm:flex">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-xs font-bold text-ink-950">{user.name.trim()[0]?.toUpperCase()}</span>
                  {user.name.split(' ')[0]}
                </Link>
                <Link to="/chat" className="rounded-full bg-gold-300 px-4 py-1.5 text-sm font-medium text-ink-950 hover:bg-gold-200">Open chat</Link>
              </>
            ) : (
              !loading && (
                <>
                  <Link to="/login" className="px-3 py-1.5 text-sm text-parchment/80 hover:text-gold-300">Log in</Link>
                  <Link to="/chat" className="rounded-full bg-gold-300 px-4 py-1.5 text-sm font-medium text-ink-950 hover:bg-gold-200">Start</Link>
                </>
              )
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="relative overflow-hidden">
        <HeroBackdrop />
        <div className="relative mx-auto flex min-h-[78vh] max-w-7xl flex-col items-center justify-center px-5 py-20 text-center">
          <p className="fade-up mb-5 rounded-full border border-gold-500/50 bg-ink-900/55 px-4 py-1 text-sm text-gold-200 backdrop-blur">Vedic mathematics · Ancient Indian science</p>
          <h1 className="max-w-4xl font-serif text-5xl font-semibold leading-tight text-parchment sm:text-7xl">
            Ancient knowledge.
            <span className="shimmer-text block">Modern answers.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-parchment/80 sm:text-xl">
            VedaSutra is an AI guide that solves problems with Vedic techniques step by step, and answers questions about ancient Indian science from a library of sourced entries, telling you how sure each source is.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            {cta}
            <a href="#how" className="rounded-full border border-gold-500/50 px-6 py-3.5 text-lg text-gold-200 backdrop-blur transition hover:bg-gold-500/10">How it works</a>
          </div>
          <p className="mt-4 text-sm text-parchment/50">{user ? `Welcome back, ${user.name.split(' ')[0]}.` : 'You only need to log in when you start chatting.'}</p>

          {/* Live numbers from the library */}
          <dl className="mt-14 grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              [stats?.knowledgeEntries ?? '…', 'sourced entries in the library'],
              [stats?.topicAreas ?? '…', 'topic areas'],
              ['12', 'exact Vedic techniques'],
              ['10', 'voice languages'],
            ].map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-gold-500/30 bg-ink-900/55 px-3 py-4 shadow-lg shadow-black/10 backdrop-blur-md transition hover:-translate-y-1 hover:border-gold-300/70">
                <dt className="sr-only">{label}</dt>
                <dd className="font-serif text-4xl font-semibold text-gold-200">{value}</dd>
                <dd className="mt-1 text-xs text-parchment/60">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* About */}
      <Section id="about" eyebrow="About the project" title="A guide that shows its working, and tells you where it learned it.">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Reveal className="space-y-4 text-lg text-parchment/80">
            <p>
              Vedic mathematics is a collection of mental-calculation shortcuts: multiply near 100 in a few seconds, square any number ending in 5 at a glance. Ancient Indian science is a much bigger story, from the zero and the sine tables to surgery, metallurgy and astronomy.
            </p>
            <p>
              Good answers on these topics are surprisingly hard to find. Many websites repeat popular myths, and AI chatbots can sound sure while being wrong. So VedaSutra is built differently: it keeps its own library of entries with a real source and an honest label on each, and it uses code, not guesswork, for every calculation.
            </p>
            <p className="text-parchment/60">
              It is an educational tool, built to be curious, kind and careful. It can still make mistakes, and it will say so when it does not know.
            </p>
          </Reveal>

          {/* A taste of the product: an example exchange */}
          <Reveal delay={120}>
            <div className="rounded-3xl border border-gold-500/30 bg-ink-900/80 p-5 shadow-2xl">
              <p className="mb-3 text-xs uppercase tracking-widest text-parchment/40">Example</p>
              <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md border border-gold-500/30 bg-gold-600/25 px-4 py-2.5">Multiply 98 × 97</div>
              <div className="mt-4 overflow-hidden rounded-xl border border-gold-500/40 bg-ink-950/70">
                <div className="flex items-center gap-2 border-b border-gold-500/20 bg-gold-500/10 px-4 py-2 text-sm">
                  <RootIcon className="text-gold-300" width={18} height={18} />
                  <span className="text-gold-200">Nikhilam</span>
                  <span className="ml-auto rounded-full bg-gold-300 px-3 py-0.5 font-semibold text-ink-950">= 9506</span>
                </div>
                <ol className="space-y-1.5 px-4 py-3 text-sm text-parchment/85">
                  {['Base 100. Deviations: 98 − 100 = −2 and 97 − 100 = −3.', 'Left part, cross-add: 98 + (−3) = 95.', 'Right part: (−2) × (−3) = 06.', 'Join: 95 | 06 = 9506.'].map((s, i) => (
                    <li key={s} className="flex gap-3">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-gold-400/60 text-[11px] text-gold-300">{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
              <p className="mt-4 text-sm text-parchment/70">The answer 9506 was computed and verified by code, then explained by the AI in a sentence or two.</p>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* Features */}
      <Section id="features" eyebrow="What you can do" title="Ask. Speak. Snap. Learn.">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ Icon, title, text }, i) => (
            <Reveal key={title} delay={i * 60}>
              <div className="h-full rounded-2xl border border-gold-500/25 bg-ink-900/70 p-6 transition hover:-translate-y-1 hover:border-gold-400/60">
                <Icon className="text-gold-300" width={34} height={34} />
                <h3 className="mt-4 font-serif text-2xl text-parchment">{title}</h3>
                <p className="mt-2 text-parchment/70">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section id="how" eyebrow="How it works" title="How VedaSutra is built, in four steps.">
        <ol className="grid gap-5 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 90}>
              <li className="relative h-full rounded-2xl border border-gold-500/25 bg-ink-900/70 p-6">
                <span className="grid h-11 w-11 place-items-center rounded-full border border-gold-300/70 bg-gold-500/15 font-serif text-xl text-gold-200">{s.n}</span>
                <h3 className="mt-4 font-serif text-2xl">{s.title}</h3>
                <p className="mt-2 text-sm text-parchment/70">{s.text}</p>
              </li>
            </Reveal>
          ))}
        </ol>
        <Reveal className="mt-8">
          <div className="rounded-2xl border border-white/10 bg-ink-900/50 p-6 text-parchment/75">
            <p className="font-medium text-parchment">What "learning from your data" really means</p>
            <p className="mt-2">
              We do not train an AI on these topics. The library (sourced books, papers and question banks, cleaned and labelled) is searched every time you ask, and only the relevant pieces are given to the AI to write from. That keeps answers traceable: change one entry and the next answer changes.
            </p>
            <p className="mt-3 text-sm text-parchment/55">
              Built with React, Node.js and MongoDB Atlas. Answers are written by Google Gemini; chat titles by Mistral. Calculations are done by our own tested solver.
            </p>
          </div>
        </Reveal>
      </Section>

      {/* Honesty */}
      <Section id="honesty" eyebrow="Our promise" title="Every claim carries a label.">
        <div className="grid gap-5 md:grid-cols-3">
          {LABELS.map((l, i) => (
            <Reveal key={l.name} delay={i * 80}>
              <div className="h-full rounded-2xl border border-white/10 bg-ink-900/60 p-6">
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${l.tone}`}><CheckIcon width={14} height={14} /> {l.name}</span>
                <p className="mt-4 text-parchment/75">{l.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-6">
          <p className="max-w-3xl text-parchment/70">
            Popular myths get a sourced correction instead of a polite repeat. Historical remedies are treated as history, not medical advice. If the library has nothing on your question, VedaSutra says so rather than guessing.
          </p>
        </Reveal>
      </Section>

      {/* Closing call to action */}
      <section className="relative overflow-hidden border-t border-gold-500/20 bg-gradient-to-b from-ink-950/30 to-ink-900/70 backdrop-blur-sm">
        <div className="drift pointer-events-none absolute -right-10 -top-10 select-none font-serif text-[16rem] leading-none text-gold-500/5" aria-hidden>ॐ</div>
        <Reveal className="relative mx-auto max-w-3xl px-5 py-20 text-center">
          <h2 className="font-serif text-4xl font-semibold sm:text-5xl">Ready to begin gaining knowledge?</h2>
          <p className="mt-4 text-lg text-parchment/70">Ask your first question. Signing up takes a few seconds.</p>
          <div className="mt-8">{cta}</div>
        </Reveal>
      </section>

      <footer className="border-t border-white/10 bg-ink-950/40 px-5 py-8 text-center text-sm text-parchment/60 backdrop-blur">
        <p>VedaSutra is for education. It can make mistakes, so please check important information. It is not medical advice.</p>
      </footer>
    </div>
  );
}
