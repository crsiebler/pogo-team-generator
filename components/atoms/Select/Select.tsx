'use client';

import { useState } from 'react';
import type {
  ChangeEvent,
  FocusEvent,
  ReactElement,
  SelectHTMLAttributes,
} from 'react';
import clsx from 'clsx';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/atoms/Icons';

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'size'
> {
  label: string;
}

/**
 * Renders a themed select with floating label treatment.
 */
export function Select({
  label,
  className,
  value,
  defaultValue,
  onFocus,
  onBlur,
  onChange,
  disabled,
  children,
  id,
  ...props
}: SelectProps): ReactElement {
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [selectedValue, setSelectedValue] = useState<string>(
    String(value ?? defaultValue ?? ''),
  );

  const resolvedValue = value !== undefined ? String(value) : selectedValue;
  const hasValue = resolvedValue !== '';

  const labelFloated = hasValue || isFocused;
  const selectId = id ?? `select-${label.toLowerCase().replace(/\s+/g, '-')}`;

  const handleFocus = (event: FocusEvent<HTMLSelectElement>): void => {
    setIsFocused(true);
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLSelectElement>): void => {
    setIsFocused(false);
    onBlur?.(event);
  };

  const handleChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    if (value === undefined) {
      setSelectedValue(event.target.value);
    }

    onChange?.(event);
  };

  return (
    <div className="relative">
      <label
        htmlFor={selectId}
        className={clsx(
          'pointer-events-none absolute left-3 z-10 bg-white px-1 text-sm transition-all duration-150',
          labelFloated
            ? 'top-2 text-xs font-semibold text-blue-700 dark:bg-gray-900 dark:text-blue-300'
            : 'top-1/2 -translate-y-1/2 text-gray-600 dark:bg-gray-900 dark:text-gray-400',
          disabled &&
            'text-gray-400 dark:bg-gray-900 dark:text-gray-500 dark:opacity-100',
        )}
      >
        {label}
      </label>
      <select
        id={selectId}
        className={clsx(
          'w-full appearance-none rounded-xl border bg-white px-4 pt-6 pb-2 text-base text-gray-900 transition outline-none',
          'focus:ring-2 focus:ring-blue-500',
          'border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100',
          'disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-800 dark:disabled:text-gray-500',
          className,
        )}
        value={resolvedValue}
        disabled={disabled}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
        {...props}
      >
        {children}
      </select>

      <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-gray-500 dark:text-gray-400">
        {isFocused && !disabled ? (
          <ChevronUpIcon size={20} />
        ) : (
          <ChevronDownIcon size={20} />
        )}
      </span>
    </div>
  );
}
