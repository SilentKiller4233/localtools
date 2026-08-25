# Contributing to LocalTools

Thanks for helping build a free, private alternative to paywalled utility sites.

## Development setup

```bash
git clone <repo-url> && cd localtools
corepack enable        # or: npm i -g pnpm@10
pnpm install
pnpm verify            # format + lint + typecheck + build must pass
```

## Ground rules

1. **Privacy by default.** New features must work without network calls unless
   they inherently need one (Group C downloader only). No telemetry ever.
2. **Security is review-blocking.** Anything touching file handling,
   subprocesses, or URLs follows PROJECT_SPEC Section 5 — argument-array
   subprocess execution only, magic-byte validation on uploads, SSRF guards on
   anything outbound. PRs that construct shell strings from user input will be
   rejected.
3. **Conventional commits** (`feat:`, `fix:`, `chore:`, `docs:`, `test:` …).
4. **Strict TypeScript.** `strict: true` plus stricter flags is the baseline;
   do not weaken tsconfig to make code compile.
5. **Tests travel with features** — happy path, malformed input, empty input,
   oversized input per PROJECT_SPEC Section 14.1.
6. **Design system adherence.** UI changes go through the tokens/components in
   `packages/ui` (Section 9); no one-off styling.
7. **Update living docs.** If your change affects architecture or decisions:
   SUMMARY.md / DECISIONS.md get updated in the same commit.

## Reporting issues

Bug reports welcome; see SECURITY.md before reporting anything
security-sensitive.
