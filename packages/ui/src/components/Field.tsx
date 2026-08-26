import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';

/** Text input styled to the token set. */
export function Input(props: InputHTMLAttributes<HTMLInputElement>): ReactNode {
  const { className, ...rest } = props;
  return <input className={cx('lt-input', className)} {...rest} />;
}

export interface FieldProps {
  label: string;
  htmlFor: string;
  /** Muted helper text rendered under the control. */
  hint?: string;
  children: ReactNode;
}

/** Labeled form field per the options-panel pattern. */
export function Field({ label, hint, htmlFor, children }: FieldProps): ReactNode {
  return (
    <div className="lt-field">
      <label className="lt-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint !== undefined && hint !== '' ? <p className="lt-field__hint">{hint}</p> : null}
    </div>
  );
}
