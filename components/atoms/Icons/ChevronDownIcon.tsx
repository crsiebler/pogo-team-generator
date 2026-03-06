import type { ReactElement } from 'react';
import { IconProps } from './types';

/**
 * Renders a downward chevron icon.
 */
export function ChevronDownIcon({
  className,
  size = 20,
  stroke = 'currentColor',
  title,
  'aria-label': ariaLabel,
  'aria-hidden': ariaHidden,
  role,
}: IconProps): ReactElement {
  const resolvedAriaHidden = ariaHidden ?? (!title && !ariaLabel);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={ariaLabel}
      aria-hidden={resolvedAriaHidden}
      role={role}
    >
      {title ? <title>{title}</title> : null}
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
