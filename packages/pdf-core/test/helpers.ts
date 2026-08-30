import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import type { ToolErrorCode } from '../src/errors';
import { ToolError } from '../src/errors';

const FIXTURE_DIR = fileURLToPath(new URL('../../../fixtures/pdf', import.meta.url));

/** Read a committed fixture (must exist — global-setup fills only gaps). */
export function fixture(name: string): Uint8Array {
  const path = `${FIXTURE_DIR}/${name}`;
  return new Uint8Array(readFileSync(path));
}

/** List every committed fixture (for existence/coverage assertions). */
export function fixtureNames(): string[] {
  return readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.pdf'));
}

/**
 * Assert a promise rejects with a ToolError of the exact code. Returns the
 * error for further message assertions.
 */
export async function expectToolError(
  p: Promise<unknown>,
  code: ToolErrorCode,
): Promise<ToolError> {
  const err = await p.then(
    () => {
      throw new Error('expected rejection');
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ToolError);
  const toolErr = err as ToolError;
  expect(toolErr.code).toBe(code);
  return toolErr;
}
