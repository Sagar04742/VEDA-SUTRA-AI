import { Link } from 'react-router-dom';
import Brand from './Brand.jsx';
import UserMenu from './UserMenu.jsx';
import ChatList from './ChatList.jsx';
import { ChevronLeft, ChevronRight, PlusIcon, RootIcon, SwordsIcon, TempleIcon } from './Icons.jsx';

// Topic shortcuts: clicking one puts a different starter question in the input each time (see utils/prompts.js).
export const TOPICS = [
  { id: 'maths', title: 'Vedic Maths', Icon: RootIcon },
  { id: 'science', title: 'Ancient Science', Icon: TempleIcon },
];

// open = the slide-out drawer on phones; collapsed = hidden on larger screens. The close button does both.
export default function Sidebar({ open, collapsed, onClose, onNewChat, onTopic, chatList, activeId, onRename, onDelete }) {
  return (
    <>
      {/* Phone backdrop */}
      {open && <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={onClose} />}
      <aside
        aria-label="Sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col gap-4 border-r border-gold-500/20 bg-ink-900/80 p-4 shadow-2xl backdrop-blur-xl transition-transform md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'md:hidden' : ''}`}
      >
        <div className="relative pt-2">
          <Link to="/" aria-label="VedaSutra home" className="block rounded-xl transition hover:opacity-90">
            <Brand />
          </Link>
          <button
            onClick={onClose}
            aria-label="Close sidebar"
            title="Close sidebar"
            className="absolute right-0 top-1 grid h-8 w-8 place-items-center rounded-lg text-parchment/60 transition hover:bg-white/5 hover:text-gold-300"
          >
            <ChevronLeft />
          </button>
        </div>

        <button
          onClick={onNewChat}
          className="flex items-center justify-center gap-2 rounded-xl border border-gold-300/60 bg-gradient-to-b from-gold-500/45 to-gold-600/30 py-3 font-medium text-gold-200 transition hover:from-gold-500/60"
        >
          <PlusIcon /> New Chat
        </button>

        {/* Featured: the battle arena has its own page */}
        <Link
          to="/shastrarth"
          onClick={onClose}
          aria-label="Open Shastrarth, the battle of the models"
          className="group relative block overflow-hidden rounded-2xl border border-gold-300/60 shadow-lg shadow-black/30 transition hover:-translate-y-0.5 hover:border-gold-200"
        >
          <span aria-hidden className="arena-thumb absolute inset-0 scale-105 transition duration-700 group-hover:scale-110" />
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-950/95 via-ink-950/55 to-ink-950/10" />
          <span aria-hidden className="edge-sweep absolute inset-x-0 top-0 h-0.5" />
          <span className="relative flex min-h-[7rem] flex-col justify-end p-3">
            <span className="mb-auto flex items-center justify-between">
              <span className="rounded-full bg-gold-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-950">Featured</span>
              <SwordsIcon width={18} height={18} className="text-gold-200 drop-shadow" />
            </span>
            <span className="font-serif text-2xl leading-none text-parchment drop-shadow">Shastrarth <span className="font-deva text-lg">शास्त्रार्थ</span></span>
            <span className="mt-0.5 text-[11px] text-parchment/80">Battle of the models, judged by Pramana</span>
          </span>
        </Link>

        <div className="space-y-2">
          {TOPICS.map(({ id, title, Icon }) => (
            <button
              key={id}
              onClick={() => onTopic(id)}
              title="Click again for a different question"
              className="flex w-full items-center gap-3 rounded-xl border border-gold-500/20 bg-ink-800/70 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-gold-400/70 hover:bg-ink-800"
            >
              <Icon className="text-gold-300" width={26} height={26} />
              <span className="flex-1">{title}</span>
              <ChevronRight className="text-parchment/50" />
            </button>
          ))}
        </div>

        <div className="border-t border-white/10 pt-3 text-sm text-parchment/80">Recent Chats</div>
        <nav className="-mt-2 min-h-0 flex-1 overflow-y-auto" aria-label="Recent chats">
          <ChatList {...chatList} activeId={activeId} onRename={onRename} onDelete={onDelete} onNavigate={onClose} />
        </nav>

        <UserMenu />
      </aside>
    </>
  );
}
