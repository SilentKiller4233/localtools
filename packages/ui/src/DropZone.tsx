import type { DragEvent, ReactNode } from 'react';
import { useCallback, useId, useRef, useState } from 'react';
import { cx } from './cx';

export type DropZoneState = 'default' | 'drag-over' | 'uploading' | 'error' | 'compact';

export interface DropZoneProps {
  /** Controlled state override; uncontrolled drag/click behavior otherwise. */
  state?: DropZoneState;
  headline?: string;
  /** Technical hint line — rendered in the mono voice. */
  hint?: string;
  /** Short horizontal variant used inside tool pages. */
  compact?: boolean;
  multiple?: boolean;
  accept?: string;
  onFilesSelected?: (files: File[]) => void;
  className?: string;
  children?: ReactNode;
}

/**
 * Shared drop zone per Section 9's per-tool pattern. States mirror the
 * Stitch component sheet exactly: default, drag-over, uploading, error,
 * compact. Keyboard-operable (Enter/Space opens the picker).
 */
export function DropZone({
  state,
  headline = 'Drop files here or click to browse',
  hint,
  compact = false,
  multiple = true,
  accept,
  onFilesSelected,
  className,
}: DropZoneProps): ReactNode {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [lastError, setLastError] = useState<string>();

  const effectiveState: DropZoneState =
    state ?? (dragOver ? 'drag-over' : lastError !== undefined ? 'error' : 'default');
  const isCompact = compact || effectiveState === 'compact';

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOver(false);
      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) return;
      setLastError(undefined);
      onFilesSelected?.(files);
    },
    [onFilesSelected],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={headline}
      aria-disabled={effectiveState === 'uploading'}
      className={cx(
        'lt-dropzone',
        `lt-dropzone--${effectiveState}`,
        isCompact && 'lt-dropzone--compact',
        className,
      )}
      onClick={() => {
        if (effectiveState !== 'uploading') {
          inputRef.current?.click();
        }
      }}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && effectiveState !== 'uploading') {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => {
        setDragOver(false);
      }}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        id={inputId}
        className="lt-dropzone__input"
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) {
            setLastError(undefined);
            onFilesSelected?.(files);
          }
          // Allow re-selecting the same file later.
          event.target.value = '';
        }}
      />
      <div className="lt-dropzone__content">
        <span aria-hidden="true" className="lt-dropzone__icon">
          ⬆
        </span>
        <p className="lt-dropzone__headline">{headline}</p>
        {hint !== undefined && hint !== '' ? <p className="lt-dropzone__hint">{hint}</p> : null}
      </div>
    </div>
  );
}
