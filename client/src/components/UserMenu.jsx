import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { DotsIcon, LogoutIcon } from './Icons.jsx';

// Avatar + name at the bottom of the sidebar; opens a small menu with Logout.
export default function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close when clicking outside.
  useEffect(() => {
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="absolute inset-x-0 bottom-full mb-2 rounded-xl border border-gold-500/25 bg-ink-800 p-1 shadow-xl">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-white/5"
          >
            <LogoutIcon width={18} height={18} /> Logout
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-ink-800 p-3 text-left hover:border-gold-500/30"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 font-serif text-lg font-bold text-ink-950">
          {user.name.trim()[0]?.toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{user.name}</span>
          <span className="block truncate text-xs text-parchment/50">{user.email}</span>
        </span>
        <DotsIcon className="shrink-0 text-parchment/60" />
      </button>
    </div>
  );
}
