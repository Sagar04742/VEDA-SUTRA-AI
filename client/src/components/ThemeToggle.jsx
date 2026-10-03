import { toggleTheme, useTheme } from '../utils/theme.js';

const Sun = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const Moon = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.500 4 8 8 0 1 0 20 14.500z" />
  </svg>
);

// Dark / light switch. Shows the icon of the mode you would switch TO.
export default function ThemeToggle({ className = '' }) {
  const theme = useTheme();
  const toLight = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={toLight ? 'Switch to light mode' : 'Switch to dark mode'}
      title={toLight ? 'Light mode' : 'Dark mode'}
      className={`grid h-10 w-10 place-items-center rounded-full border border-gold-500/40 bg-ink-900/60 text-gold-300 backdrop-blur transition hover:scale-110 hover:border-gold-300 hover:bg-gold-500/15 ${className}`}
    >
      <span key={theme} className="pop-in grid place-items-center">{toLight ? <Moon /> : <Sun />}</span>
    </button>
  );
}
