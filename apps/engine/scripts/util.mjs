/** Shared tiny helpers for engine scripts (no deps). */
import { stat } from 'node:fs/promises';

/** True when the path exists (any type). */
export async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
