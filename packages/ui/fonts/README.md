# Self-hosted webfonts

Per PROJECT_SPEC Section 7 ("One self-hosted variable font for UI text + one
monospace font for technical output", no third-party CDNs), both families are
vendored here and loaded via `@font-face` at the top of `../src/tokens.css`.

| Family           | File                                           | Version | License | Source                                      |
| ---------------- | ---------------------------------------------- | ------- | ------- | ------------------------------------------- |
| Inter (variable) | `InterVariable.woff2` (344KB)                  | 4.1     | OFL-1.1 | github.com/rsms/inter releases              |
| JetBrains Mono   | `-Regular.woff2`, `-Medium.woff2` (~92KB each) | 2.304   | OFL-1.1 | github.com/JetBrains/JetBrainsMono releases |

License texts ship alongside: `INTER-LICENSE.txt`, `JETBRAINS-MONO-OFL.txt`.

Notes:

- The CSS token stacks (`--lt-font-ui`, `--lt-font-mono`) name these families
  first; system fallbacks remain for pre-swap rendering.
- JetBrains Mono ships static weights only (no variable woff2 in its release);
  400 + 500 cover every mono use in the design system.
- To upgrade, replace the `.woff2` files from the upstream release and bump
  the version column above.
