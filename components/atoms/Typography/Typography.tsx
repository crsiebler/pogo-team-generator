// Atom: Typography (Text, Heading, etc.)
'use client';
import { ElementType, ReactNode } from 'react';
import clsx from 'clsx';

interface TypographyProps {
  as?: ElementType;
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span';
  className?: string;
  children: ReactNode;
}

export const Typography = ({
  as: Tag = 'span',
  variant = 'span',
  className,
  children,
}: TypographyProps) => {
  return (
    <Tag
      className={clsx(
        variant === 'h1' && 'text-3xl font-bold',
        variant === 'h2' && 'text-2xl font-bold',
        variant === 'h3' && 'text-xl font-bold',
        variant === 'h4' && 'text-lg font-bold',
        variant === 'h5' && 'text-base font-semibold',
        variant === 'h6' && 'text-sm font-semibold',
        variant === 'p' && 'text-base',
        'text-gray-900 dark:text-gray-100',
        className,
      )}
    >
      {children}
    </Tag>
  );
};
