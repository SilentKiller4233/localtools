export interface ProgressBarProps {
  /** 0–100. Omit for an indeterminate bar. */
  percent?: number;
  /** Accessible name announced by screen readers. */
  label?: string;
}

/**
 * Thin linear progress per Section 9 ("real progress reporting always").
 * Native progressbar semantics; the optional label becomes its
 * accessible name so concurrent bars are distinguishable.
 */
export function ProgressBar({ percent, label }: ProgressBarProps): React.ReactNode {
  const determinate = typeof percent === 'number' && Number.isFinite(percent);
  const clamped = determinate ? Math.min(100, Math.max(0, percent)) : 0;
  return (
    <div
      className="lt-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={determinate ? Math.round(clamped) : undefined}
    >
      <div
        className={
          determinate ? 'lt-progress__fill' : 'lt-progress__fill lt-progress__fill--indeterminate'
        }
        style={determinate ? { width: `${String(clamped)}%` } : undefined}
      />
    </div>
  );
}
