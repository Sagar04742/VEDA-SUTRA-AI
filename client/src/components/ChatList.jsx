import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChatIcon, CheckIcon, CloseIcon, PencilIcon, TrashIcon } from './Icons.jsx';

// Sidebar list of chats: open, rename inline, delete.
export default function ChatList({ chats, loading, activeId, onRename, onDelete, onNavigate }) {
  const [editing, setEditing] = useState(null); // { id, value }

  function commit() {
    const title = editing.value.trim();
    if (title) onRename(editing.id, title);
    setEditing(null);
  }

  if (loading) return <p className="px-1 text-sm text-parchment/40">Loading…</p>;
  if (chats.length === 0) return <p className="px-1 text-sm text-parchment/40">Your conversations will appear here.</p>;

  return (
    <ul className="space-y-0.5">
      {chats.map((chat) => {
        const active = chat.id === activeId;
        return (
          <li key={chat.id} className={`group relative flex items-center rounded-lg ${active ? 'bg-gold-500/15' : 'hover:bg-white/5'}`}>
            {editing?.id === chat.id ? (
              <div className="flex w-full items-center gap-1 p-1.5">
                <input
                  autoFocus
                  value={editing.value}
                  maxLength={80}
                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                  onKeyDown={(e) => (e.key === 'Enter' ? commit() : e.key === 'Escape' && setEditing(null))}
                  aria-label="Chat title"
                  className="min-w-0 flex-1 rounded border border-gold-400/60 bg-ink-950 px-2 py-1 text-sm outline-none"
                />
                <button onClick={commit} aria-label="Save title" className="text-gold-300"><CheckIcon width={16} height={16} /></button>
                <button onClick={() => setEditing(null)} aria-label="Cancel" className="text-parchment/50"><CloseIcon width={16} height={16} /></button>
              </div>
            ) : (
              <>
                <Link to={`/c/${chat.id}`} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-sm text-parchment/90" title={chat.title}>
                  <ChatIcon className="shrink-0 text-gold-400/70" width={18} height={18} />
                  <span className="truncate">{chat.title}</span>
                </Link>
                {/* Visible on hover, keyboard focus, and always on touch screens. */}
                <span className="mr-1 flex shrink-0 gap-1 opacity-100 transition md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                  <button onClick={() => setEditing({ id: chat.id, value: chat.title })} aria-label={`Rename ${chat.title}`} className="rounded p-1 text-parchment/60 hover:text-gold-300">
                    <PencilIcon width={15} height={15} />
                  </button>
                  <button
                    onClick={() => window.confirm(`Delete "${chat.title}"? This cannot be undone.`) && onDelete(chat.id)}
                    aria-label={`Delete ${chat.title}`}
                    className="rounded p-1 text-parchment/60 hover:text-red-400"
                  >
                    <TrashIcon width={15} height={15} />
                  </button>
                </span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
