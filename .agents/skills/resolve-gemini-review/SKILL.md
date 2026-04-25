---
name: resolve-gemini-review
description: >
  Resolve, reply to, and triage automated PR review feedback — Gemini Code Assist review
  comments and Codecov coverage reports. Use this skill whenever the user wants to address
  PR review feedback, including listing unresolved Gemini comments, deciding how to respond,
  fixing code, marking comments as resolved, and reviewing/closing coverage gaps reported by
  Codecov. Trigger on phrases like "resolve gemini comments", "handle gemini review",
  "reply to gemini", "fix gemini feedback", "check codecov", "codecov coverage", or any time
  the user wants to work through PR review comments and coverage reports.
---

# PR Review Resolution Skill (Gemini Code Assist + Codecov)

## Overview

This skill guides Claude through a structured, interactive workflow for triaging and resolving
**two kinds of automated PR feedback**:

1. **Gemini Code Assist review comments** — line-level review comments. Replies and
   resolution are required. Rule: **never resolve a comment without a reply, and never dismiss
   feedback without reasoning.**
2. **Codecov coverage reports** — top-level PR comments listing files with missing patch
   coverage. Replies are NOT required (Codecov is a bot that does not converse). Goal:
   surface the missing-line files, decide whether to add tests, and close the gap.

---

## Tools

Always prefer `gh` CLI for all GitHub interactions. Fall back to `git` only when `gh` cannot cover the operation.

---

## Knowledge Sources for Evaluation

When analyzing Gemini's comments, **do not rely solely on general knowledge**. Use the following
project-specific and external sources to make informed judgments:

### Project Skills (read on-demand based on comment topic)

| Comment topic                        | Skill to reference                          |
| ------------------------------------ | ------------------------------------------- |
| React components, Next.js, SSR, RSC  | `vercel-react-best-practices/SKILL.md`      |
| Postgres, SQL, RLS, Supabase         | `supabase-postgres-best-practices/SKILL.md` |
| UI/UX, accessibility, design         | `web-design-guidelines/SKILL.md`            |
| Next.js caching, PPR, use cache      | `next-cache-components/SKILL.md`            |
| Database schema, migrations, RPC     | `project-database-context/SKILL.md`         |
| Remotion, video rendering            | `remotion-best-practices/SKILL.md`          |

**How to use:** Before evaluating a comment, check if its topic matches any skill above.
If so, read the skill's SKILL.md (and relevant sub-files) to inform your assessment.
Skills are located at `.agents/skills/{skill-name}/`.

### context7 — Latest Library Documentation

For comments referencing specific libraries or frameworks (e.g., Next.js API changes,
React patterns, Supabase client usage, next-intl configuration), use context7 MCP tools
to fetch the latest documentation:

```
1. mcp__context7__resolve-library-id  — resolve the library name to an ID
2. mcp__context7__query-docs          — query the docs for the specific topic
```

**When to use context7:**
- Gemini suggests a specific API or pattern — verify it exists in the current version
- Gemini flags a deprecation — confirm with latest docs
- You are unsure whether Gemini's suggestion aligns with current best practices
- The comment involves version-specific behavior (e.g., Next.js 16, React 19)

**Do not use context7** for general code style or obvious logic issues.

---

## Workflow

The workflow has two parallel tracks:

- **Track G** (Gemini): Steps G1–G5
- **Track C** (Codecov): Steps C1–C3

When the user invokes the skill, fetch both kinds of feedback first (Step G1 + Step C1),
then present a combined summary, then act per track.

### Step G1 — List All Unresolved Gemini Conversations

Fetch all review comments on the current PR (review comments are returned by the
`/pulls/.../comments` endpoint):

```bash
gh pr view --json number,url
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments \
  --jq '[.[] | select(.position != null) | {id: .id, path: .path, line: .original_line, body: .body, author: .user.login}]'
```

Or if the user provides the PR number:

```bash
gh api repos/{owner}/{repo}/pulls/{PR_NUMBER}/comments \
  --jq '[.[] | {id: .id, path: .path, line: .original_line, body: .body, author: .user.login}]'
```

Filter to only Gemini Code Assist comments (author contains `gemini-code-assist` or `gemini`).

Present a numbered list:

```
Unresolved Gemini comments:

1. [auth/handler.rs:42] "This function should return a Result<> instead of unwrapping."
2. [src/api/user.rs:88] "Consider extracting this logic into a separate function for readability."
3. [Cargo.toml:12]     "This dependency version is outdated. Please update to >=2.1."
```

### Step C1 — Fetch Codecov Coverage Report

Codecov posts to **issue comments** (top-level PR discussion), not review comments. Use the
issues endpoint:

```bash
gh api repos/{owner}/{repo}/issues/{pr_number}/comments \
  --jq '[.[] | select(.user.login == "codecov-commenter") | {id: .id, updated_at: .updated_at, body: .body}]'
```

If multiple Codecov comments exist (Codecov edits the same comment but rare cases create
multiples), pick the **most recently updated** one — that's the latest report.

Parse the body to extract:
- **Patch coverage** percentage (e.g. `66.66667%`)
- **Files with missing lines** table — each row shows `path | patch %  | N Missing`
- **Project coverage delta** (if shown — e.g. `coverage delta: -0.05%`)

Present a summary alongside the Gemini list:

```
Codecov Report (PR #229, updated 2026-04-25 06:13):
- Patch coverage: 66.67%
- Project delta: not shown
- Files with missing lines:
  • app/api/generation-status/route.ts — 20.00% (4 lines missing)
```

If no Codecov comment exists yet, say so and continue (it may not have run, or coverage is
100%).

---

### Step G2 — Analyze and Categorize Gemini Comments

Read each comment carefully. **Before evaluating**, gather context:

1. **Read the relevant source code** around the line Gemini commented on.
2. **Check project skills** — if the comment topic matches a skill (see table above), read
   the skill to understand project-specific best practices.
3. **Check context7** — if the comment references a specific library API, pattern, or
   version-specific behavior, query context7 for the latest documentation.

Then for **each comment**, determine:

- ✅ **Agree** — the feedback is valid; code should be changed.
- 🤔 **Partially agree** — some aspects are valid; needs discussion.
- ❌ **Disagree** — the feedback is incorrect, inapplicable, or a deliberate trade-off.

Present your assessment clearly to the user, **including the source of your reasoning**:

```
My assessment:

1. [auth/handler.rs:42] ✅ Agree — unwrapping here could panic; wrapping in Result is safer.
   (Based on: Rust error handling best practices)
2. [src/api/user.rs:88] 🤔 Partially agree — extraction makes sense, but scope is already small.
   (Based on: vercel-react-best-practices server-serialization rule)
3. [Cargo.toml:12]      ❌ Disagree — we pin this version intentionally due to a breaking change in 2.1.
   (Based on: context7 docs confirm breaking change in 2.1)
```

---

### Step G3 — Ask the User Which to Address

Ask the user which comments to resolve in this session:

> "Which of these would you like to address now? You can say 'all', list numbers (e.g., '1, 3'), or pick one at a time."

Handle one comment at a time when the user picks individual items.

---

### Step G4 — For Each Selected Gemini Comment

#### If agreed (or user agrees with your assessment):

1. Fix the code.
2. Commit using Conventional Commits:
   ```bash
   git commit -m "fix(scope): address gemini review — <short description>"
   ```
3. Get the commit SHA:
   ```bash
   git rev-parse --short HEAD
   ```
4. Reply to the comment using `gh`:
   ```bash
   gh api repos/{owner}/{repo}/pulls/{pr_number}/comments -X POST \
     -f body="/gemini review
   {message in the same language Gemini used}
   Fixed in <SHA>" \
     -F in_reply_to={comment_id}
   ```

#### If disagreed (or user disagrees):

1. Draft a reply explaining the reasoning clearly. Do **not** dismiss without explanation.
2. Reply to the comment:
   ```bash
   gh api repos/{owner}/{repo}/pulls/{pr_number}/comments -X POST \
     -f body="/gemini review
   {reasoning in the same language Gemini used}" \
     -F in_reply_to={comment_id}
   ```
3. Ask the user: "Would you like to resolve this after your reply, or leave it open for Gemini to respond?"
4. Only resolve if the user explicitly says to.

---

### Step G5 — Repeat

After handling a comment, return to the numbered list and ask which to tackle next, or confirm all are done.

When all selected comments are addressed:

```bash
gh pr view --json reviews,comments
```

Summarize what was done:

- How many comments fixed
- How many replied with disagreement
- Whether any remain open

---

### Step C2 — Decide Whether to Close Coverage Gaps

For each file in the Codecov "missing lines" list, decide:

- ✅ **Add tests** — the file has new logic that should be covered (typical case for code
  introduced in this PR).
- 🤔 **Defer** — the file has trivial / boilerplate code (e.g., type re-exports, generated
  code, glue code where mocking would be more cost than value).
- ❌ **Skip** — the file is intentionally not covered (e.g., dev-only debug code, test
  fixtures).

Show your assessment to the user with the same agree/disagree style as Gemini comments:

```
Codecov coverage decisions:

- app/api/generation-status/route.ts (4 missing) ✅ Add tests
  Lines correspond to the new sanitization branches added in this PR. Tests
  should hit each branch (provider error / openai_api_key / GIF rejection).
```

Ask the user which files to address (same prompt style as Step G3).

### Step C3 — Add Tests and Verify Coverage

For each file the user wants covered:

1. **Identify the missing lines**: read the file in the dashboard link from Codecov, or
   open the patch coverage detail. The Codecov UI shows uncovered lines highlighted; the
   PR comment usually only lists counts.
   - Alternative: run `npm run test:coverage` (or repo-specific equivalent) locally and
     read `coverage/lcov-report/index.html` to find uncovered lines in the changed file.
2. **Choose the right test layer**:
   - Pure utility / classification helpers → unit test.
   - API route handlers → characterization or integration test.
   - UI components → component test in `tests/unit/.../*.test.tsx`.
3. **If a helper is local to a route file**, export it (named export alongside the
   route handler — Next.js supports this) so it can be unit-tested directly. Document
   the export in a brief comment so a reader understands why it is exported.
4. **Write the test** covering each missing branch / line.
5. **Run** `npm run test` (or repo-specific test command) to verify pass.
6. **Commit** using Conventional Commits with the `test(...)` type:
   ```bash
   git commit -m "test(scope): cover <function/branches> per codecov report"
   ```
7. **Push and wait** for Codecov to re-run on the new commit. Confirm the new patch
   coverage in the updated Codecov comment.

Do **not** reply to the Codecov comment. Codecov is a bot that does not converse;
it edits its existing comment when re-run.

---

## Hard Rules

### Common to both tracks

| Rule                            | Detail                                                       |
| ------------------------------- | ------------------------------------------------------------ |
| **Use project skills**          | Check relevant project skills before evaluating comments.    |
| **Verify with context7**        | Query latest docs when comment involves library-specific API or version behavior. |

### Gemini track (G)

| Rule                            | Detail                                                       |
| ------------------------------- | ------------------------------------------------------------ |
| **Never resolve without reply** | Always post a reply before resolving.                        |
| **Never dismiss silently**      | Every disagreement must include clear reasoning.             |
| **Match Gemini's language**     | Reply in the same language Gemini used in the comment.       |
| **Always tag Gemini**           | Start every reply with `/gemini review`.                     |
| **Include SHA on fixes**        | Every "Fixed" reply must include the short commit SHA.       |
| **Get sign-off before resolve** | If disagreeing, only resolve after user explicitly confirms. |

### Codecov track (C)

| Rule                            | Detail                                                       |
| ------------------------------- | ------------------------------------------------------------ |
| **Never reply to Codecov**      | Codecov is a bot; comments are auto-edited on re-run. Do not post replies. |
| **Always check the latest comment** | Codecov usually edits a single comment in place. Use the most recent `updated_at`. |
| **Add tests, don't tweak coverage config** | Default action is to add tests covering the missing lines. Avoid silencing coverage via config (`coverage.ignore`, `--passWithNoTests`, etc.) unless the user explicitly approves. |
| **Use the `test(scope):` commit type** | Coverage-only commits should use Conventional Commits `test(...)` so they are distinguishable from feature/fix commits. |
