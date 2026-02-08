// Atom: Badge/Tag
'use client';
import { ReactNode } from 'react';
import { useTheme } from '@hooks/useTheme';
import clsx from 'clsx';

const COLOR_MAP = {
  // Predefined colors
  primary: (theme: 'light' | 'dark') =>
    theme === 'dark'
      ? 'bg-blue-900 text-blue-100'
      : 'bg-blue-100 text-blue-800',
  green: (theme: 'light' | 'dark') =>
    theme === 'dark'
      ? 'bg-green-900 text-green-100'
      : 'bg-green-100 text-green-800',
  red: (theme: 'light' | 'dark') =>
    theme === 'dark' ? 'bg-red-900 text-red-100' : 'bg-red-100 text-red-800',
  purple: (theme: 'light' | 'dark') =>
    theme === 'dark'
      ? 'bg-purple-900 text-purple-100'
      : 'bg-purple-100 text-purple-800',
  gray: (theme: 'light' | 'dark') =>
    theme === 'dark'
      ? 'bg-gray-800 text-gray-100'
      : 'bg-gray-200 text-gray-700',
  // Pokemon type colors
  normal: 'bg-gray-500 text-white',
  fire: 'bg-orange-500 text-white',
  water: 'bg-blue-500 text-white',
  electric: 'bg-yellow-400 text-black',
  grass: 'bg-green-500 text-white',
  ice: 'bg-cyan-300 text-black',
  fighting: 'bg-red-600 text-white',
  poison: 'bg-purple-500 text-white',
  ground: 'bg-yellow-600 text-white',
  flying: 'bg-indigo-300 text-black',
  psychic: 'bg-pink-500 text-white',
  bug: 'bg-lime-500 text-white',
  rock: 'bg-yellow-700 text-white',
  ghost: 'bg-purple-700 text-white',
  dragon: 'bg-indigo-600 text-white',
  dark: 'bg-gray-700 text-white',
  steel: 'bg-gray-400 text-black',
  fairy: 'bg-pink-400 text-white',
  // Default fallback
  default: 'bg-gray-300 text-gray-600',
};

export interface BadgeProps {
  children: ReactNode;
  color?: keyof typeof COLOR_MAP;
  className?: string;
}

export const Badge = ({
  children,
  color = 'default',
  className,
}: BadgeProps) => {
  const { theme } = useTheme();
  const colorClass =
    typeof COLOR_MAP[color] === 'function'
      ? COLOR_MAP[color](theme)
      : COLOR_MAP[color] || COLOR_MAP.default;

  return (
    <span
      className={clsx(
        'rounded-full px-2 py-1 text-xs font-semibold uppercase',
        colorClass,
        className,
      )}
    >
      {children}
    </span>
  );
};
