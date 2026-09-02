import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Button } from '@localtools/ui';

export interface SignaturePadHandle {
  hasStrokes: boolean;
  toPng: () => Promise<Uint8Array>;
}

/**
 * Signature drawing pad (Section 3.1 Sign PDF, "draw" mode): pointer-event
 * strokes on a transparent canvas, exported as a content-trimmed PNG for
 * pdf-core's signPdf image placement. Keyboard users use the "type" mode
 * instead — the pad itself is inherently spatial (noted in its aria-label).
 */
export function SignaturePad({
  handleRef,
  onStrokesChange: strokesChange,
}: {
  /** Mutable ref shape (React's RefObject.current is readonly in @types/react 18). */
  handleRef: { current: SignaturePadHandle | null };
  /** Notified on every stroke-completion/clear so parents can validate. */
  onStrokesChange?: (hasStrokes: boolean) => void;
}): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  const pos = (event: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (canvas === null) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const begin = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx === null || ctx === undefined) return;
    drawingRef.current = true;
    canvasRef.current?.setPointerCapture(event.pointerId);
    const { x, y } = pos(event);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    const { x, y } = pos(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    drawingRef.current = false;
    canvasRef.current?.releasePointerCapture(event.pointerId);
    setHasStrokes(true);
    strokesChange?.(true);
  };

  const clear = useCallback((): void => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
    strokesChange?.(false);
  }, [strokesChange]);

  const toPng = useCallback(async (): Promise<Uint8Array> => {
    const canvas = canvasRef.current;
    if (canvas === null) throw new Error('The signature pad is not ready.');
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('The signature pad is not ready.');
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = 0;
    let maxY = 0;
    let found = false;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const alpha = data[(y * canvas.width + x) * 4 + 3];
        if (alpha !== undefined && alpha > 8) {
          found = true;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) throw new Error('Draw your signature first.');
    const w = Math.max(1, maxX - minX + 4);
    const h = Math.max(1, maxY - minY + 4);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const outCtx = out.getContext('2d');
    if (outCtx === null) throw new Error('The signature pad is not ready.');
    outCtx.drawImage(canvas, minX - 2, minY - 2, w, h, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => {
      out.toBlob(resolve, 'image/png');
    });
    if (blob === null) throw new Error('The signature could not be encoded.');
    return new Uint8Array(await blob.arrayBuffer());
  }, []);

  // Publish the imperative handle (hasStrokes is also state so the parent
  // can validate; toPng/clear travel via the ref).
  handleRef.current = { hasStrokes, toPng };

  return (
    <div className="lt-signature">
      <canvas
        ref={canvasRef}
        className="lt-signature__canvas"
        width={560}
        height={180}
        aria-label="Signature drawing area (or use the Type mode instead)"
        role="img"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="lt-camera__actions">
        <Button variant="ghost" onClick={clear} disabled={!hasStrokes}>
          Clear
        </Button>
      </div>
    </div>
  );
}
