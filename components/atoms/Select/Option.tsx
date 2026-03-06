import type { OptionHTMLAttributes, ReactElement } from 'react';

export type OptionProps = OptionHTMLAttributes<HTMLOptionElement>;

/**
 * Renders a reusable option element for Select.
 */
export function Option({ children, ...props }: OptionProps): ReactElement {
  return <option {...props}>{children}</option>;
}
