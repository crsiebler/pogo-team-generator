// Atom: Button
'use client';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
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
          'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800',
        variant === 'secondary' &&
          'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-800',
        variant === 'danger' &&
          'bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
};
