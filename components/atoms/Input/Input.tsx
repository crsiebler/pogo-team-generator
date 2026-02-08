// Atom: Input
// Origin: Adapted from local usage and atomic conventions
import type { InputHTMLAttributes } from 'react';
import { useTheme } from '@hooks/useTheme';
import clsx from 'clsx';

export interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size'
> {
  size?: 'base' | 'sm' | 'lg';
}

export const Input = ({ size = 'base', className, ...props }: InputProps) => {
  const { theme } = useTheme();
  return (
    <input
      className={clsx(
        'rounded-lg border transition outline-none focus:ring',
        size === 'sm' && 'px-2 py-1 text-sm',
        size === 'base' && 'px-3 py-2 text-base',
        size === 'lg' && 'px-4 py-3 text-lg',
        theme === 'dark'
          ? 'border-gray-700 bg-gray-900 text-gray-100 placeholder:text-gray-400 focus:ring-blue-500'
          : 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:ring-blue-500',
        className,
      )}
      {...props}
    />
  );
};
