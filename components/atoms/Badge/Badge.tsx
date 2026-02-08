// Atom: Badge/Tag
import { ReactNode } from 'react';
import { useTheme } from '@hooks/useTheme';
import clsx from 'clsx';

export interface BadgeProps {
  children: ReactNode;
  color?: 'primary' | 'green' | 'red' | 'purple' | 'gray' | 'custom';
  className?: string;
  bgColor?: string; // for custom colors
}

export const Badge = ({
  children,
  color = 'primary',
  className,
  bgColor,
}: BadgeProps) => {
  const { theme } = useTheme();
  const computedClass = clsx(
    'rounded-full px-2 py-1 text-xs font-semibold uppercase',
    color === 'primary' &&
      (theme === 'dark'
        ? 'bg-blue-900 text-blue-100'
        : 'bg-blue-100 text-blue-800'),
    color === 'green' &&
      (theme === 'dark'
        ? 'bg-green-900 text-green-100'
        : 'bg-green-100 text-green-800'),
    color === 'red' &&
      (theme === 'dark'
        ? 'bg-red-900 text-red-100'
        : 'bg-red-100 text-red-800'),
    color === 'purple' &&
      (theme === 'dark'
        ? 'bg-purple-900 text-purple-100'
        : 'bg-purple-100 text-purple-800'),
    color === 'gray' &&
      (theme === 'dark'
        ? 'bg-gray-800 text-gray-100'
        : 'bg-gray-200 text-gray-700'),
    color === 'custom' && bgColor,
    className,
  );
  return <span className={computedClass}>{children}</span>;
};
