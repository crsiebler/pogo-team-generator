import { IconProps } from './types';

export function TwitchIcon({
  className,
  fill = 'currentColor',
  title,
  'aria-label': ariaLabel,
  'aria-hidden': ariaHidden,
  role,
  size = 50,
}: IconProps) {
  const resolvedAriaHidden = ariaHidden ?? (!title && !ariaLabel);

  return (
    <svg
      className={className}
      fill={fill}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={ariaLabel}
      aria-hidden={resolvedAriaHidden}
      role={role}
    >
      {title ? <title>{title}</title> : null}
      <path d="M80,32,48,112V416h96v64h64l64-64h80L464,304V32ZM416,288l-64,64H256l-64,64V352H112V80H416Z" />
      <rect x="320" y="143" width="48" height="129" />
      <rect x="208" y="143" width="48" height="129" />
    </svg>
  );
}
