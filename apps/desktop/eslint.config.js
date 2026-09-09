import base from '@localtools/eslint-config';

// apps/desktop: the JS surface is one build script (.mjs); the Rust
// shell is checked by cargo. engine-dist is a gitignored build product
// (pnpm-deploy copy of the engine) and never linted here — the shared
// config's dist/** ignore doesn't match the src-tauri/ path.
export default [
  ...base,
  {
    ignores: ['src-tauri/**'],
  },
];
