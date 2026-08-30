/**
 * Vitest global setup: ensure every pdf-lib-producible fixture exists before
 * the suite runs. Committed fixtures are authoritative; this only fills gaps
 * (fresh clone safety) — it never overwrites committed bytes.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixtureEntries } from '../scripts/generate-fixtures';

const OUT_DIR = fileURLToPath(new URL('../../../fixtures/pdf', import.meta.url));

export default async function setup(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, make] of fixtureEntries()) {
    const path = `${OUT_DIR}/${name}`;
    if (!existsSync(path)) {
      const bytes = await make();
      writeFileSync(path, bytes);
      console.log(`[global-setup] regenerated missing fixture ${name}`);
    }
  }
}
