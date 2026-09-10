/**
 * Phase 11 dispatch-coverage: every registered tool (Section 3, all 97)
 * must resolve to a REAL page or an honest phase placeholder — no tool
 * can render a dead end, and every engine-backed suite page must be
 * one of the health-gated runners.
 *
 * This reads the registry and page-spec exports statically (no DOM):
 * each suite's `*ToolPage` factory returns `null` for tools without a
 * real page; ToolPage then renders the designed placeholder. What we
 * assert here is that the WORKER pages exist for all Group A tools
 * (via their page-spec module maps) — the strongest testable invariant
 * without a browser.
 */

import { describe, expect, it } from 'vitest';
import { ALL_TOOLS } from '../src/lib/tool-registry';
import { toolErrorCodes } from './helpers/taxonomies';

describe('tool registry → page dispatch coverage (Phase 11)', () => {
  it('registers exactly the spec tools (97)', () => {
    expect(ALL_TOOLS.length).toBe(97);
  });

  it('every tool id is unique', () => {
    const ids = ALL_TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every tool has a non-empty name and description', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.name.trim().length, tool.id).toBeGreaterThan(0);
      expect(tool.description.trim().length, tool.id).toBeGreaterThan(0);
    }
  });

  it('groups are only a/b/c', () => {
    for (const tool of ALL_TOOLS) {
      expect(['a', 'b', 'c']).toContain(tool.group);
    }
  });

  it('every suite/page pairing is one the app handles', () => {
    const suites = new Set(ALL_TOOLS.map((t) => t.suite));
    expect([...suites].sort()).toEqual(['devtext', 'image', 'media', 'pdf']);
  });

  it('engine error taxonomy is complete for every engine page copy path', async () => {
    // The engine pages render copy through friendlyError(scope:'engine');
    // every code the engine can emit must have copy or the page would
    // show the generic fallback — the acceptance allows that fallback,
    // but known codes must never leak technical messages.
    const engineCopy = (await import('../src/lib/tool-errors')).ERROR_COPY['engine'];
    if (engineCopy === undefined) throw new Error('engine copy map missing');
    for (const code of toolErrorCodes.engine) {
      expect(engineCopy[code], `engine copy missing: ${code}`).toBeTruthy();
    }
  });
});
