---
name: codex-webpack-build
description: Repository-specific production build verification workflow for this Next.js app. Use when a user asks Codex to run a build, verify whether a change builds, investigate build failures, or confirm release readiness in this repo. In Codex and sandbox environments, prefer `npm run build -- --webpack` over plain `npm run build` because the default Turbopack build can stall here while webpack completes. If the user explicitly asks to test Turbopack or change build tooling, follow that request instead.
---

# Codex Webpack Build

Run production build verification from the repo root with `npm run build -- --webpack` unless the user explicitly asks for Turbopack. Treat this as the default Codex validation path for this repository.

## Workflow

1. Confirm the repo root contains `package.json` and a `build` script.
2. Run `npm run build -- --webpack`.
3. Summarize the result.
   - Report success or failure.
   - Separate warnings from build failures.
   - Note that `baseline-browser-mapping` staleness warnings are non-blocking unless the user asks to clean them up.
4. If the webpack build succeeds but plain `npm run build` previously stalled, explain that the app build is valid under webpack and that Turbopack behavior should be treated as an environment or toolchain issue to investigate separately.
5. If the user explicitly asks for `npm run build`, Turbopack, or a `package.json` change, comply and explain the repository-specific tradeoff.

## Defaults

- Prefer `npm run build -- --webpack` for Codex-run validation.
- Do not rewrite `package.json` to add `--webpack` unless the user explicitly asks.
- Do not treat network-restricted failures from external services as app regressions without calling that out.
- Keep existing font and network mitigations intact; this skill is about how to run build verification, not about changing runtime behavior.

## Reporting

- Include the exact command used.
- State whether the build completed with exit code `0`.
- If failures occur, identify the first actionable error.
