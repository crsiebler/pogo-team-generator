export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'pogo-theme';

function getSavedTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem(STORAGE_KEY) as Theme;
  return saved === 'light' || saved === 'dark' ? saved : null;
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function getCurrentTheme(): Theme {
  return getSavedTheme() ?? getSystemTheme();
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

function saveTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, theme);
}

export function toggleTheme(): void {
  const newTheme = getCurrentTheme() === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
  saveTheme(newTheme);
}

export function getTheme(): Theme {
  return getCurrentTheme();
}

export function initTheme(): void {
  applyTheme(getCurrentTheme());
}
