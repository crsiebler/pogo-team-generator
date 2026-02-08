// Atom: Button
// Origin: Adapted from corysiebler.com/components/atoms/Button
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useTheme } from '@hooks/useTheme';
import clsx from 'clsx';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'base' | 'sm' | 'lg';
  children: ReactNode;
}

export const Button = ({
  variant = 'primary',
  size = 'base',
  className,
  children,
  ...rest
}: ButtonProps) => {
  const { theme } = useTheme();
  return (
    <button
      className={clsx(
        'rounded-xl font-semibold transition-colors focus:ring focus:outline-none',
        // Size
        size === 'sm' && 'px-3 py-1.5 text-sm',
        size === 'base' && 'px-5 py-2 text-base',
        size === 'lg' && 'px-6 py-3 text-lg',
        // Variant
        variant === 'primary' &&
          (theme === 'dark'
            ? 'bg-blue-700 text-white hover:bg-blue-800'
            : 'bg-blue-600 text-white hover:bg-blue-700'),
        variant === 'secondary' &&
          (theme === 'dark'
            ? 'bg-gray-700 text-gray-100 hover:bg-gray-800'
            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'),
        variant === 'danger' &&
          (theme === 'dark'
            ? 'bg-red-700 text-white hover:bg-red-800'
            : 'bg-red-600 text-white hover:bg-red-700'),
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
};
