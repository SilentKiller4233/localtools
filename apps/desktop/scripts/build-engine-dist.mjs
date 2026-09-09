/**
 * Build the self-contained engine bundle for the desktop app.
 *
 * Produces apps/desktop/src-tauri/engine-dist/:
 *   bundle/   — `pnpm deploy` isolation of the engine (prod deps only,
 *               real files — no pnpm symlink indirection) + dist/
 *   node/     — a node runtime copied in when LOCALTOOLS_DESKTOP_NODE
 *               names one (CI packs the runner's node; release builds
 *               pin the nodejs.org runtime, D-037).
 *
 * The bundle ships as a Tauri resource (tauri.conf.json bundle.resources)
 * and resolves at runtime via the resource dir (paths.rs). Dev
 * (`tauri dev`) skips it entirely and runs the repo's engine/dist.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// Monorepo root (this script lives at apps/desktop/scripts/).
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const engineDir = join(root, 'apps', 'engine');
const outDir = join(root, 'apps', 'desktop', 'src-tauri', 'engine-dist');

console.log('[engine-dist] building engine dist…');
// Windows: pnpm is pnpm.cmd — spawn through the shell (args are static).
execFileSync('pnpm', ['--filter', '@localtools/engine', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

console.log('[engine-dist] deploying engine with prod deps…');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
// pnpm deploy materializes an isolated, self-contained copy: package.json
// + fully-resolved node_modules with real files (pnpm resolves the
// workspace symlinks into the target).
// pnpm 10 requires --legacy for workspaces that don't use injected
// dependencies (verified live: ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE).
// Windows runs through the shell (pnpm is pnpm.cmd), so the space-
// containing target path must be quoted there.
const target = join(outDir, 'bundle');
const quoted = process.platform === 'win32' ? `"${target}"` : target;
execFileSync('pnpm', ['--filter', '@localtools/engine', 'deploy', quoted, '--prod', '--legacy'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
cpSync(join(engineDir, 'dist'), join(outDir, 'bundle', 'dist'), { recursive: true });

// Node runtime, when provided (release builds always provide one).
const nodeEnv = process.env.LOCALTOOLS_DESKTOP_NODE;
mkdirSync(join(outDir, 'node'), { recursive: true });
if (nodeEnv && existsSync(nodeEnv)) {
  if (statSync(nodeEnv).isDirectory()) {
    for (const entry of readdirSync(nodeEnv)) {
      cpSync(join(nodeEnv, entry), join(outDir, 'node', entry), { recursive: true });
    }
  } else {
    const name = process.platform === 'win32' ? 'node.exe' : 'node';
    cpSync(nodeEnv, join(outDir, 'node', name));
  }
  console.log('[engine-dist] node runtime copied from', nodeEnv);
} else {
  // The dir must exist for tauri.conf.json's resource mapping to pass
  // the build-time check; dev runs fall back to system node (paths.rs).
  const readme = join(outDir, 'node', 'README.txt');
  writeFileSync(
    readme,
    'Dev/CI build: no bundled Node runtime.\n' +
      'Release builds set LOCALTOOLS_DESKTOP_NODE to pin the nodejs.org\n' +
      'runtime (see DECISIONS.md D-037).\n',
  );
  console.log(
    '[engine-dist] NOTE: LOCALTOOLS_DESKTOP_NODE not set — dev runs system node; release builds must ship one.',
  );
}

// Sanity: entrypoint exists.
if (!existsSync(join(outDir, 'bundle', 'dist', 'server.js'))) {
  throw new Error('engine bundle missing dist/server.js — check the engine build');
}
console.log('[engine-dist] done:', outDir);
