import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
}

/** Primary action = filled accent; quiet secondary = outline; ghost/danger as needed. */
export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...rest
}: ButtonProps): ReactNode {
  return (
    <button type={type} className={cx('lt-button', `lt-button--${variant}`, className)} {...rest} />
  );
}
