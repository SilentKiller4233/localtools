/**
 * LocalTools shared types & contracts (Layer 1 <-> Layer 2 API contract).
 *
 * Phase 0 stub: establishes the module shape only. Real schemas arrive with
 * their phases; every addition must keep this file the single source of truth
 * shared by apps/client and apps/engine.
 */

/** Which suite a tool belongs to — drives nav sections and tool grids. */
export type SuiteId = 'pdf' | 'media' | 'image' | 'devtext';

/** Processing group per PROJECT_SPEC Section 3 definitions. */
export type ToolGroup = 'a' | 'b' | 'c';

export interface ToolDefinition {
  id: string;
  suite: SuiteId;
  name: string;
  /** One-line description shown on the tool card. */
  description: string;
  group: ToolGroup;
}

/** Generic envelope every engine endpoint answers with. */
export type EngineResult<T> = { ok: true; data: T } | { ok: false; error: EngineError };

export interface EngineError {
  code: string;
  /** Human-readable, safe-to-show message (never raw filesystem paths). */
  message: string;
}
