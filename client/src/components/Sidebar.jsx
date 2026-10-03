import { Link } from 'react-router-dom';
import Brand from './Brand.jsx';
import UserMenu from './UserMenu.jsx';
import ChatList from './ChatList.jsx';
import { ChevronLeft, ChevronRight, PlusIcon, RootIcon, TempleIcon } from './Icons.jsx';

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
        className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col gap-4 border-r border-white/5 bg-ink-900 p-4 transition-transform md:static md:translate-x-0 ${
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

        <div className="space-y-2">
          {TOPICS.map(({ id, title, Icon }) => (
            <button
              key={id}
              onClick={() => onTopic(id)}
              title="Click again for a different question"
              className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-ink-800 px-4 py-3 text-left transition hover:border-gold-500/40"
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
