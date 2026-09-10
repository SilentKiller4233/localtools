/**
 * Fake-progress ticker tests (Phase 11): the pure nextLivenessPercent
 * step drives every engine page's liveness bar; the constants define
 * the app-wide cadence (spec: consistent progress reporting).
 */

import { describe, expect, it } from 'vitest';
import { nextLivenessPercent } from '../src/hooks/useFakeProgress';

describe('liveness ticker semantics', () => {
  it('starts at 5 on the first tick', () => {
    expect(nextLivenessPercent(undefined)).toBe(5);
  });

  it('advances by the fixed step', () => {
    expect(nextLivenessPercent(5)).toBe(9);
    expect(nextLivenessPercent(9)).toBe(13);
    expect(nextLivenessPercent(50)).toBe(54);
  });

  it('never exceeds the 90 ceiling', () => {
    expect(nextLivenessPercent(88)).toBe(90);
    expect(nextLivenessPercent(90)).toBe(90);
    expect(nextLivenessPercent(99)).toBe(90);
  });

  it('handles 0 without breaking (pre-start states)', () => {
    expect(nextLivenessPercent(0)).toBe(4);
  });
});
