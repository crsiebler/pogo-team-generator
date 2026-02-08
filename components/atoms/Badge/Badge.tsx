// Atom: Badge/Tag
'use client';
import { ReactNode } from 'react';
import clsx from 'clsx';

const COLOR_MAP = {
  // Predefined colors
  primary: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  purple:
    'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
  gray: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-100',
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
  const colorClass = COLOR_MAP[color] || COLOR_MAP.default;

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
