import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@localtools/ui';

export interface CameraCaptureProps {
  /** Called with a captured page (name + JPEG bytes). */
  onCapture: (name: string, bytes: Uint8Array) => void;
  /** How many pages have been captured so far (display only). */
  capturedCount: number;
}

/**
 * Scan-to-PDF camera capture (Section 3.1): getUserMedia preview with a
 * capture button. Each capture becomes one JPEG "page" (highest-quality
 * JPEG keeps memory sane for multi-page scans; the worker's imagesToPdf
 * embeds JPEGs directly). Camera errors surface as human-readable text —
 * permission denied, no camera, insecure context (getUserMedia requires
 * HTTPS or localhost).
 */
export function CameraCapture({ onCapture, capturedCount }: CameraCaptureProps): ReactNode {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    return () => {
      // Stop tracks on unmount — camera light must never stay on.
      streamRef.current?.getTracks().forEach((t) => {
        t.stop();
      });
    };
  }, []);

  const start = async (): Promise<void> => {
    setError(undefined);
    // On insecure contexts navigator.mediaDevices genuinely does not exist,
    // though DOM-lib types say it always does. Widen through unknown so the
    // runtime guard is not "provably dead" to the type-aware lint rule.
    const media = (navigator as unknown as { mediaDevices?: MediaDevices }).mediaDevices;
    const getUserMedia = media?.getUserMedia.bind(media);
    if (getUserMedia === undefined) {
      setError(
        'Camera capture needs a secure connection (https or localhost) and a browser with camera access.',
      );
      return;
    }
    try {
      const stream = await getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video !== null) {
        video.srcObject = stream;
        await video.play();
      }
      setActive(true);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Camera access was denied. Allow it in your browser settings and try again.'
          : name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : 'The camera could not be started. Close other apps using it and retry.',
      );
    }
  };

  const stop = (): void => {
    streamRef.current?.getTracks().forEach((t) => {
      t.stop();
    });
    streamRef.current = null;
    setActive(false);
  };

  const capture = (): void => {
    const video = videoRef.current;
    if (video === null || video.videoWidth === 0) {
      setError('The camera is still warming up — try again in a second.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      setError('Capturing failed — the browser would not allocate a canvas.');
      return;
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          setError('Capturing failed — the browser could not encode the photo.');
          return;
        }
        void blob.arrayBuffer().then((buf) => {
          onCapture(`scan-page-${String(capturedCount + 1)}.jpg`, new Uint8Array(buf));
        });
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <div className="lt-camera">
      <video
        ref={videoRef}
        className={active ? 'lt-camera__video lt-camera__video--on' : 'lt-camera__video'}
        muted
        playsInline
        aria-label="Camera preview"
      />
      {error !== undefined ? (
        <p className="lt-tool-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="lt-camera__actions">
        {!active ? (
          <Button
            variant="outline"
            onClick={() => {
              void start();
            }}
          >
            Start camera
          </Button>
        ) : (
          <>
            <Button onClick={capture}>Capture page</Button>
            <Button variant="ghost" onClick={stop}>
              Stop camera
            </Button>
          </>
        )}
        {capturedCount > 0 ? (
          <span className="lt-tool-hint">{String(capturedCount)} page(s) captured</span>
        ) : null}
      </div>
    </div>
  );
}
