import './globals.css';
import type { Metadata } from 'next';
import { ThemeToggle } from '@/components/atoms';
import { Toast } from '@/components/atoms/Toast';

export const metadata: Metadata = {
  title: 'Pokémon GO PvP Team Generator',
  description:
    'Generate optimized teams for Play! Pokémon and GO Battle League tournaments',
};

const themeScript = `
  (function() {
    const theme = localStorage.getItem('theme') || 
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    
    // Listen for system changes (only if no manual theme set)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        document.documentElement.classList.toggle('dark', e.matches);
      }
    });
  })()
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-white dark:from-gray-900 dark:to-gray-800">
        <ThemeToggle />
        <Toast />
        {children}
      </body>
    </html>
  );
}
