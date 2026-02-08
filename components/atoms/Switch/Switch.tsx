'use client';

import { useCallback } from 'react';
import clsx from 'clsx';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: SwitchProps) {
  const handleClick = useCallback(() => {
    if (!disabled) {
      onChange(!checked);
    }
  }, [checked, onChange, disabled]);

  return (
    <div className="flex items-center justify-between">
      {(label || description) && (
        <div className="flex-1 pr-4">
          {label && (
            <span
              className={clsx(
                'block text-sm font-medium',
                disabled
                  ? 'text-gray-400 dark:text-gray-500'
                  : 'text-gray-900 dark:text-gray-100',
              )}
            >
              {label}
            </span>
          )}
          {description && (
            <span
              className={clsx(
                'block text-xs',
                disabled
                  ? 'text-gray-400 dark:text-gray-500'
                  : 'text-gray-600 dark:text-gray-400',
              )}
            >
              {description}
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={handleClick}
        className={clsx(
          'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:outline-none',
          checked
            ? 'bg-blue-600 dark:bg-blue-700'
            : 'bg-gray-200 dark:bg-gray-700',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  );
}
