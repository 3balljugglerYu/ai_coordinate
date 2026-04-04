---
name: resolve-gemini-review
description: >
  Resolve, reply to, and triage Gemini Code Assist pull request review comments.
  Use this skill whenever the user wants to address PR review feedback from Gemini Code Assist,
  including listing unresolved comments, deciding how to respond, fixing code, and marking
  comments as resolved. Trigger on phrases like "resolve gemini comments", "handle gemini review",
  "reply to gemini", "fix gemini feedback", or any time the user wants to work through PR review comments.
---

# Gemini Code Assist Review Resolution Skill

## Overview

This skill guides Claude through a structured, interactive workflow for triaging and resolving
Gemini Code Assist review comments on a pull request. It enforces the rule:
**never resolve a comment without a reply, and never dismiss feedback without reasoning.**

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

### Step 1 — List All Unresolved Conversations

Fetch all review comments on the current PR using:

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

---

### Step 2 — Analyze and Categorize

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

### Step 3 — Ask the User Which to Address

Ask the user which comments to resolve in this session:

> "Which of these would you like to address now? You can say 'all', list numbers (e.g., '1, 3'), or pick one at a time."

Handle one comment at a time when the user picks individual items.

---

### Step 4 — For Each Selected Comment

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

### Step 5 — Repeat

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

## Hard Rules

| Rule                            | Detail                                                       |
| ------------------------------- | ------------------------------------------------------------ |
| **Never resolve without reply** | Always post a reply before resolving.                        |
| **Never dismiss silently**      | Every disagreement must include clear reasoning.             |
| **Match Gemini's language**     | Reply in the same language Gemini used in the comment.       |
| **Always tag Gemini**           | Start every reply with `/gemini review`.                     |
| **Include SHA on fixes**        | Every "Fixed" reply must include the short commit SHA.       |
| **Get sign-off before resolve** | If disagreeing, only resolve after user explicitly confirms. |
| **Use project skills**          | Check relevant project skills before evaluating comments.    |
| **Verify with context7**        | Query latest docs when comment involves library-specific API or version behavior. |
