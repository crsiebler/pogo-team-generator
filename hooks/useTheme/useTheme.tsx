// useTheme atom hook (mock for atomic components)
import { useContext, createContext } from 'react';

interface ThemeContextType {
  theme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'light' });

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: 'light' | 'dark';
}) {
  return (
    <ThemeContext.Provider value={{ theme }}>{children}</ThemeContext.Provider>
  );
}
