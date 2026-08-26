import type { ReactNode } from 'react';
import { cx } from '../cx';

export type BadgeTone = 'neutral' | 'instant' | 'setup' | 'success' | 'warning' | 'error' | 'info';

export interface BadgeProps {
  tone?: BadgeTone;
  /** Optional leading status dot. */
  dot?: boolean;
  children: ReactNode;
}

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: '',
  instant: 'lt-badge--instant',
  setup: 'lt-badge--setup',
  success: 'lt-badge--success',
  warning: 'lt-badge--warning',
  error: 'lt-badge--error',
  info: 'lt-badge--info',
};

/** Micro-label pill. "Instant"/"One-time setup" tones drive the tool-grid badges. */
export function Badge({ tone = 'neutral', dot = false, children }: BadgeProps): ReactNode {
  return (
    <span className={cx('lt-badge', TONE_CLASS[tone])}>
      {dot ? <span aria-hidden="true" className="lt-badge__dot" /> : null}
      {children}
    </span>
  );
}
