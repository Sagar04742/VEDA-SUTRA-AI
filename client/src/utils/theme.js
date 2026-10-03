import { useSyncExternalStore } from 'react';

// Dark (default) or light. The choice is remembered in this browser; index.html applies it before the page paints.
const KEY = 'theme';
const listeners = new Set();

export const getTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

export function setTheme(theme) {
  const root = document.documentElement;
  root.classList.add('theme-switching'); // makes the colours fade instead of snapping
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#fdf6e8' : '#150f0b');
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private mode: ignore */
  }
  listeners.forEach((l) => l());
  setTimeout(() => root.classList.remove('theme-switching'), 600);
}

export const toggleTheme = () => setTheme(getTheme() === 'light' ? 'dark' : 'light');

export function useTheme() {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    getTheme,
    () => 'dark'
  );
}
