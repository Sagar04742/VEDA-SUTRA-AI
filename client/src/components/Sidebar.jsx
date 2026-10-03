import Brand from './Brand.jsx';
import UserMenu from './UserMenu.jsx';
import { ChevronLeft, ChevronRight, PlusIcon, RootIcon, TempleIcon } from './Icons.jsx';

// Topic shortcuts: clicking one starts a chat with that prompt.
export const TOPICS = [
  { id: 'maths', title: 'Vedic Maths', Icon: RootIcon, prompt: 'Multiply 98 × 97 using a Vedic maths technique' },
  { id: 'science', title: 'Ancient Science', Icon: TempleIcon, prompt: 'What is the concept of zero in ancient India?' },
];

export default function Sidebar({ open, onClose, onNewChat, onTopic, chats = [] }) {
  return (
    <>
      {/* Mobile backdrop */}
      {open && <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col gap-4 border-r border-white/5 bg-ink-900 p-4 transition-transform md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="relative pt-2">
          <Brand />
          <button onClick={onClose} aria-label="Close sidebar" className="absolute right-0 top-2 text-parchment/60 hover:text-gold-300 md:hidden">
            <ChevronLeft />
          </button>
        </div>

        <button
          onClick={onNewChat}
          className="flex items-center justify-center gap-2 rounded-xl border border-gold-300/60 bg-gradient-to-b from-gold-500/45 to-gold-600/30 py-3 font-medium text-gold-200 transition hover:from-gold-500/60"
        >
          <PlusIcon /> New Chat
        </button>

        <div className="space-y-2">
          {TOPICS.map(({ id, title, Icon, prompt }) => (
            <button
              key={id}
              onClick={() => onTopic(prompt)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-ink-800 px-4 py-3 text-left transition hover:border-gold-500/40"
            >
              <Icon className="text-gold-300" width={26} height={26} />
              <span className="flex-1">{title}</span>
              <ChevronRight className="text-parchment/50" />
            </button>
          ))}
        </div>

        <div className="border-t border-white/10 pt-3 text-sm text-parchment/80">Recent Chats</div>
        <nav className="-mt-2 min-h-0 flex-1 overflow-y-auto">
          {chats.length === 0 && <p className="px-1 text-sm text-parchment/40">Your conversations will appear here.</p>}
        </nav>

        <UserMenu />
      </aside>
    </>
  );
}
