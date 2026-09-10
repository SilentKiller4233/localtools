/**
 * useFakeProgress (Phase 11, spec line 495: "consistent progress
 * reporting").
 *
 * Every engine-side runner previously rolled its own synthetic ticker
 * (setInterval advancing a percentage) with per-page cadences. This hook
 * unifies the pattern: start() kicks off a deterministic liveness
 * ticker (same cadence everywhere), stop() clears it, and the runner
 * sets 100 on completion. The label contract is uniform too:
 * `Processing <tool name>` for every suite.
 *
 * This is "liveness" progress (honest: the engine reports no upload
 * percentage over the JSON API), distinct from the REAL per-page /
 * per-file progress the worker pages now emit via progress messages —
 * both flow into the same ProgressBar UI.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** One liveness tick: advance a percent toward the ceiling. Pure —
 * unit-tested without a renderer. */
export function nextLivenessPercent(current: number | undefined): number {
  return current === undefined ? START : Math.min(CEILING, current + STEP);
}

const TICK_MS = 400;
const STEP = 4;
const CEILING = 90;
const START = 5;

export interface FakeProgress {
  /** Undefined when idle; a 0–100 liveness percent otherwise. */
  percent: number | undefined;
  /** Start the liveness ticker. */
  start: () => void;
  /** Stop the ticker (leave percent where it is, e.g. at 100). */
  stop: () => void;
  /** Force a value (runners set 100 on success). */
  set: (n: number) => void;
}

/** Synthetic liveness progress for engine calls with no byte stream. */
export function useFakeProgress(): FakeProgress {
  const [percent, setPercent] = useState<number | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const stop = useCallback(() => {
    if (timer.current !== undefined) {
      clearInterval(timer.current);
      timer.current = undefined;
    }
  }, []);

  const start = useCallback(() => {
    stop();
    setPercent(nextLivenessPercent(undefined));
    timer.current = setInterval(() => {
      setPercent((p) => nextLivenessPercent(p));
    }, TICK_MS);
  }, [stop]);

  const set = useCallback((n: number) => {
    setPercent(n);
  }, []);

  useEffect(() => stop, [stop]);

  return { percent, start, stop, set };
}
