import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Sidebar, { TOPICS } from '../components/Sidebar.jsx';
import Composer from '../components/Composer.jsx';
import { HeroBackdrop, Ornament } from '../components/Hero.jsx';
import { ArrowRight, MenuIcon } from '../components/Icons.jsx';

const CARDS = [
  { ...TOPICS[0], blurb: 'Fast calculations, unique techniques and concepts from the Vedas.' },
  { ...TOPICS[1], blurb: 'Astronomy, Ayurveda, Vastu, ancient inventions and more.' },
];

// Chat shell (sidebar + hero + composer). The live conversation is wired up in phase 2.
export default function Chat() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [text, setText] = useState('');
  const firstName = user.name.trim().split(/\s+/)[0];

  const fill = (prompt) => {
    setText(prompt);
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onNewChat={() => fill('')} onTopic={fill} />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <HeroBackdrop />

        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sidebar"
          className="relative z-10 m-3 w-fit rounded-lg border border-white/10 bg-ink-900/70 p-2 text-gold-300 md:hidden"
        >
          <MenuIcon />
        </button>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-end overflow-y-auto px-4 pb-6 text-center">
          <h1 className="font-serif text-5xl font-semibold text-parchment sm:text-6xl">Namaste, {firstName}</h1>
          <p className="mt-2 font-serif text-2xl text-parchment/90">How can I help you today?</p>
          <Ornament />

          <div className="mb-8 mt-2 grid w-full max-w-3xl gap-4 sm:grid-cols-2">
            {CARDS.map(({ id, title, Icon, blurb, prompt }) => (
              <button
                key={id}
                onClick={() => fill(prompt)}
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

          <div className="w-full max-w-4xl">
            <Composer
              value={text}
              onChange={setText}
              onSend={() => {}}
              disabled
              placeholder="Ask about Vedic Maths or Ancient Science…"
            />
            <p className="mt-2 text-xs text-parchment/40">Live answers are switched on in the next phase.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
