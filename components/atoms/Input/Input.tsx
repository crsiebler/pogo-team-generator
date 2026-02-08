// Atom: Input
'use client';
import type { InputHTMLAttributes } from 'react';
import clsx from 'clsx';

export interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size'
> {
  size?: 'base' | 'sm' | 'lg';
}

export const Input = ({ size = 'base', className, ...props }: InputProps) => {
  return (
    <input
      className={clsx(
        'rounded-lg border transition outline-none focus:ring',
        size === 'sm' && 'px-2 py-1 text-sm',
        size === 'base' && 'px-3 py-2 text-base',
        size === 'lg' && 'px-4 py-3 text-lg',
        'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-400',
        className,
      )}
      {...props}
    />
  );
};
