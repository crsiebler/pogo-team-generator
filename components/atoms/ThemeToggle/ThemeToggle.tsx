// Atom: Theme Toggle Button
'use client';
import { toggleTheme } from '@/lib/utils/themeManager';

export function ThemeToggle() {
  return (
    <button
      onClick={toggleTheme}
      className="fixed top-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-gray-800 shadow-lg transition-colors hover:bg-gray-300 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none sm:top-6 sm:right-6 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
      aria-label="Toggle theme"
    >
      {/* Moon icon for dark mode toggle (visible in light mode) */}
      <svg
        className="h-5 w-5 dark:hidden"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
        />
      </svg>
      {/* Sun icon for light mode toggle (visible in dark mode) */}
      <svg
        className="hidden h-5 w-5 dark:block"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
    </button>
  );
}
