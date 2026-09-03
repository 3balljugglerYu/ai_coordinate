## Claims and Verification

State only what you have actually read. A wrong sentence is cheap; an implementation built
on top of it is not.

- **Cite `file:line` for any behavioral claim.** If you cannot point at the line, label the
  claim unverified. "I read the code and confirmed" must mean you read that exact line — not
  that you inferred it from a symbol name, a type, or a plausible-sounding flow.
- **Read both ends of a decoupled path.** When state crosses files, processes, or layers —
  `sessionStorage`, custom events, React context, `cacheTag` / `revalidateTag`, DB triggers,
  pg_cron, RPCs — read the writer *and* the reader. The comment that explains the behavior
  is usually at the end you did not open.
- **Read the whole source you cite.** Taking a document's conclusion while skipping its
  premise turns an accurate record into support for the opposite claim.
- **Raise the bar with consequence, not confidence.** A claim that decides what gets built
  needs the strictest verification, however obvious it feels.
- **When a claim turns out to be wrong, restate the mechanism, not just the conclusion.**
  A conclusion that survives on a broken explanation will mislead the next decision.

In 2026-09 an agent asserted that publishing a post navigates the user back to home. It had
read only the consumer of the pending-refresh flag (`features/posts/components/PostList.tsx`)
and inferred the rest from the flag's name. The producer
(`features/posts/components/PostModal.tsx`) carries a comment stating the opposite — that
navigation was deliberately removed in #565 — and the agent cited the incident record for
that very removal as supporting evidence, using its conclusion while skipping its premise.
The claim was load-bearing for a design decision and was caught only because the user
questioned it. One `grep` for the producer settled it in seconds. Reporting the verification
as broader than it was is the failure here; being careful is not a control, citing lines is.

## Repository Docs

- Canonical architecture and onboarding docs live in `docs/architecture/`.
- Development conventions are available in English at `docs/development/project-conventions.md` and in Japanese at `docs/development/project-conventions.ja.md`.
- Product requirements are available in Japanese at `docs/product/requirements.md` and in English at `docs/product/requirements.en.md`.
- Product user stories are available in Japanese at `docs/product/user-stories.md` and in English at `docs/product/user-stories.en.md`.
- Screen flow is available in Japanese at `docs/product/screen-flow.md` and in English at `docs/product/screen-flow.en.md`.
- Canonical planning status lives in `docs/planning/implementation-roadmap.md` and is currently Japanese-only.
- Canonical monetization reference lives in `docs/business/monetization.md`.
- Database onboarding starts at `docs/architecture/data.md`, then `data.en.md` or `data.ja.md`.
- `.cursor/rules/database-design.mdc` is the exact schema ledger and Cursor-specific adapter for the data layer.
- `.cursor/rules/project-rule.mdc` is a Cursor-specific adapter; the human-readable source is `docs/development/project-conventions.md`.
- `.agents/` is for MCP config and agent-discoverable skills, not for canonical human-facing documentation.

## Pull Requests

- Pull request titles and bodies must always be written in Japanese in this repository.
- Conventional Commit messages may remain in English, but PR-facing text must include Japanese.

### Merge strategy

Choose the merge method based on what the PR represents. **Do not default to Squash.**

| PR type | Required merge strategy |
| --- | --- |
| Short-lived feature / fix branch into `main` | Squash and merge OK |
| Long-lived branch ↔ `main` sync (e.g. `main` → `feature-model`) | **Create a merge commit** (Squash forbidden) |
| Large release PR from a long-lived branch (e.g. `feature-model` → `main`) | **Create a merge commit** (Squash forbidden) |

Why: Squash merge produces a single commit with one parent, so Git cannot see the
incoming branch's commits as ancestors. For sync / release PRs that bridge two
long-lived branches, this destroys the merge-base linkage and forces the same
conflicts to recur on every subsequent main update. Use `gh pr merge --merge`
(not `--squash`) or click **Create a merge commit** in the GitHub UI for these
PR types.

## Destructive Operations

Do **not** perform the following without an explicit user request or confirmation in the current session. When in doubt, ask before acting.

- **Filesystem deletion** outside regenerable build artifacts. `rm -rf` / `find ... -delete` / `git clean -f` / `git clean -fd` is forbidden against source, tests, configs, `.env*`, dotfiles, untracked working files, and any path outside common throwaway directories (`.next/`, `node_modules/`, `dist/`, `coverage/`, `/tmp/...`).
- **Git history rewriting**: `git reset --hard`, `git push --force` / `--force-with-lease`, `git rebase` against pushed branches, `git commit --amend` after push, `git filter-branch` / `git filter-repo`.
- **Branch / tag / worktree destruction**: `git branch -D`, deleting remote branches (`git push origin --delete`, `git push origin :ref`), deleting tags, `git worktree remove --force`, `git stash drop` / `git stash clear`.
- **Direct writes to `main` / `master`**: never push, merge, or rebase directly to the default branch. PRs only.
- **Process termination beyond your own**: `kill -9`, `pkill`, `killall` against processes you did not start in the current session. Stopping a server you started yourself is fine; killing the user's editor, package manager, or unrelated dev servers is not.
- **Lockfile / generated-config overwrites you did not intend**: do not commit incidental `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` / `Cargo.lock` churn produced by routine installs. A lockfile-only diff with no accompanying `package.json` (or equivalent manifest) change is almost always incidental — revert it; do not commit lockfile changes unless they are a deliberate, in-scope part of the task. Otherwise call it out and ask before committing.
- **Dependency surgery**: do not add, remove, or upgrade dependencies, or modify `package.json` scripts, outside the explicit scope of the task. See also CLAUDE.md.
- **External service destructive calls**: Stripe refunds / subscription cancellations / customer deletion, Resend bulk sends, OpenAI / Gemini billing-relevant batch jobs, any account-deletion or data-purge endpoint. Read-only inspection is fine; writes that move money, send mail to real users, or delete records require confirmation.
- **Supabase destructive operations** (re-stated from CLAUDE.md): `DROP`, `TRUNCATE`, `DELETE` without `WHERE` against production, migration `rollback` / `down`, Edge Function deletion. Read-only queries, applying forward migrations, and deploying Edge Functions are allowed per CLAUDE.md.
- **Secrets**: never read `.env*` keys beyond the Supabase-scoped allowlist in CLAUDE.md, never print secret values to chat / commits / files, never paste them into external services.

Regenerable build outputs and temporary paths (`.next/`, `node_modules/`, `dist/`, `coverage/`, `/tmp/...`, build caches) may be removed freely as part of normal work.

## Database Migration Verification

When a migration creates or replaces a function in the `public` schema, also run:

```
node scripts/check-rpc-grants.mjs
```

Supabase grants `EXECUTE` on new functions to `anon` and `authenticated` by default,
so a `CREATE FUNCTION` silently opens the RPC to unauthenticated callers unless the
migration revokes it. `ALTER DEFAULT PRIVILEGES` cannot fix this (the `supabase_admin`
default is not ours to change), so this check is the only guard.

In 2026-08 this default exposed 22 RPCs, including balance mutation, account
deactivation, and template moderation. A warning comment in a migration did not
prevent a recurrence; running the check does.

The script compares the live grants against an allowlist and exits non-zero on any
difference. Both directions matter: an unexpected function means a new hole, and a
missing one means a logged-out screen just broke.

Prefer applying the migration **before** merging. New parameters carry `DEFAULT`s, so
the currently deployed app keeps working, and a bad migration can be rolled back with
`GRANT` before any user-facing code ships. Merging first breaks the app in the window
between deploy and apply.

## UI Verification Workflow

When verifying UI changes via browser automation (Playwright MCP, Puppeteer, headless browsers, etc.):

- **Stop running animations before interacting.** Carousels (e.g. Swiper with autoplay), CSS marquees, and other auto-animating elements can fail click stability checks and time out the click action (e.g. `browser_click` after 5s). Before any click, programmatically halt the animation — for Swiper, run `el.swiper?.autoplay?.stop()` via the page evaluator. The same applies to measurement: take one stable sample instead of many in-flight rAF samples.
- **Trust HMR; do not call `location.reload()` to verify code changes.** This Next.js project (App Router, dev mode) recompiles routes on demand, so each reload incurs roughly 5–15 seconds of wait. After editing a file, re-run the same browser flow without reloading. Only reload if you have concrete evidence HMR did not pick up the change.
- **Account for first-navigation compile delay.** When navigating to a route the agent has not visited yet in this dev session (`/style`, `/posts/[id]`, `/my-page/...`, etc.), the first hit triggers an on-demand compile. Allow extra wait time and do not interpret the delay as a bug.

## Skills
### Available skills
- codex-webpack-build: Repository-specific production build verification workflow for this Next.js app. Use when a user asks Codex to run a build, verify whether a change builds, investigate build failures, or confirm release readiness in this repo. In Codex and sandbox environments, prefer `npm run build -- --webpack` over plain `npm run build` because the default Turbopack build can stall here while webpack completes. If the user explicitly asks to test Turbopack or change build tooling, follow that request instead. (file: .agents/skills/codex-webpack-build/SKILL.md)
- project-database-context: Repository-specific guide for understanding Persta.AI's Supabase data model and implementation. Use when a task touches the database schema, RLS, RPCs, triggers, migrations, Storage-backed image flows, or when onboarding a developer or agent to the data layer. (file: .agents/skills/project-database-context/SKILL.md)
- implementation-planning: 新機能の実装計画を立案するスキル。EARS要件定義、ADR、フェーズ別実装計画、変更ファイル一覧、テスト観点、ロールバック方針を含む計画作成に使う。新機能の設計・実装計画を求められた場合に使用する。 (file: .agents/skills/implementation-planning/SKILL.md)

### How to use skills
- Use the repo-local skill above when the request matches its description.
- Follow broader platform-level skill instructions in addition to this local skill list.
