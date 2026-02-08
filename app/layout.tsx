import './globals.css';
import { ThemeProvider } from '@hooks/useTheme';
import type { Metadata } from 'next';
import { ThemeToggle } from '@/components/atoms';

export const metadata: Metadata = {
  title: 'Pokémon GO PvP Team Generator',
  description:
    'Generate optimized teams for Play! Pokémon and GO Battle League tournaments',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
        <ThemeProvider>
          <ThemeToggle />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
