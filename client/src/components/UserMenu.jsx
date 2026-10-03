import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { DotsIcon, HomeIcon, LogoutIcon, UserIcon } from './Icons.jsx';

// The person at the bottom of the sidebar. Clicking their name opens their profile and learning stats;
// the dots open a small menu (profile, home page, log out).
export default function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close when clicking outside.
  useEffect(() => {
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const item = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5';

  return (
    <div ref={ref} className="relative">
      {open && (
        <div role="menu" className="absolute inset-x-0 bottom-full mb-2 rounded-xl border border-gold-500/25 bg-ink-800 p-1 shadow-xl">
          <Link role="menuitem" to="/profile" className={item}>
            <UserIcon width={18} height={18} /> My profile
          </Link>
          <Link role="menuitem" to="/" className={item}>
            <HomeIcon width={18} height={18} /> Home page
          </Link>
          <button
            role="menuitem"
            onClick={async () => {
              navigate('/'); // first leave the private page, otherwise the route guard sends you to /login
              await logout();
            }}
            className={`${item} text-red-400`}
          >
            <LogoutIcon width={18} height={18} /> Logout
          </button>
        </div>
      )}
      <div className="flex items-center gap-1 rounded-xl border border-white/5 bg-ink-800 p-1.5 hover:border-gold-500/30">
        <Link to="/profile" aria-label="Open my profile" title="Open my profile" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1.5 text-left transition hover:bg-white/5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 font-serif text-lg font-bold text-ink-950">
            {user.name.trim()[0]?.toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-parchment/50">View profile</span>
          </span>
        </Link>
        <button
          onClick={() => setOpen(!open)}
          aria-label="Account menu"
          aria-haspopup="menu"
          aria-expanded={open}
          className="grid h-10 w-9 shrink-0 place-items-center rounded-lg text-parchment/60 hover:bg-white/5 hover:text-gold-300"
        >
          <DotsIcon />
        </button>
      </div>
    </div>
  );
}
