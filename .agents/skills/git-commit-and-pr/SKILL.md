---
name: git-commit-and-pr
description: Execute commit/push and PR workflows, post-merge branch cleanup, and draft Conventional Commit + PR descriptions. Use when user says "プッシュして", "PRを作成して", "マージしました", "create pr", "pull request", or asks for PR description drafting.
---

## Purpose

This skill helps the agent:
- Propose and refine Git commit messages that follow the Conventional Commits specification.
- Draft pull request descriptions using the team’s PR template, including clear test plans.
- Execute commit->push flow when requested.
- Execute end-to-end flow when requested: auth check -> branch handling -> commit -> push -> PR creation.
- Execute post-merge cleanup flow: switch to main -> pull -> verify remote branch deletion -> delete local branch.

## Trigger and mode

When user says phrases such as:
- 「プッシュして」
- 「PRを作成して」
- 「PR作って」
- 「マージしました」
- "create pr"
- "open a pull request"

Default to **execution mode** (not draft-only mode), unless the user explicitly asks to only draft text.

Modes:
- Draft mode: only propose commit/PR text.
- Push mode: run add/commit/push flow without creating PR.
- Execution mode: actually run git/gh commands and create the PR.
- Post-merge cleanup mode: run safe branch cleanup after merge confirmation.

## Authentication and access checks (execution mode)

Before commit/push/PR creation, verify:
1. Repository and branch context are valid.
2. GitHub auth is available for this project.

Preferred auth source for this repository:
- `.local/github-auth.env` with:
  - `GITHUB_USERNAME=...`
  - `GH_TOKEN=...`

Fallback:
- `gh auth status` authenticated account.

Rules:
- Never print raw tokens.
- Never write credentials into tracked files.
- Keep `.local/` ignored by git.

## Conventional Commits

When generating commit messages, always follow:
- The Conventional Commits spec: https://www.conventionalcommits.org/en/v1.0.0/
- Basic format:

type(optional-scope): short, imperative summary

Examples of common types (not exhaustive):
- feat: a new feature
- fix: a bug fix
- docs: documentation changes
- refactor: code changes that neither fix a bug nor add a feature
- test: adding or updating tests
- chore: maintenance tasks, build scripts, etc.

Rules for this project:
- Prefer using a meaningful scope when possible, such as the component, module, or API path.
- Keep the summary short and imperative (e.g., "add user deactivate API", not "added" or "adding").
- If multiple logical changes are present, suggest splitting into multiple commits.

When user does not provide commit message:
- Summarize the staged/uncommitted diff first.
- Offer 2-3 Conventional Commit options and ask user to choose.

## PR template

When drafting a PR description, use the following structure:

```markdown
### 概要
[{Jira ticket number if included, can be multiple}]
{description}

### 変更内容
{what is updated}

### テスト方法
{how to run the test, show what test has been added both runn or unit test}
```

Guidelines:
- In 「概要」, include:
  - Related Jira ticket numbers in square brackets.
  - A concise summary of the intent of the change.
- In 「変更内容」, list concrete code changes:
  - New endpoints, modified behavior, refactoring, config changes, etc.
- In 「テスト方法」:
  - Explain exactly how to verify the change.
  - Mention both runn scenarios and unit tests where applicable.
  - Include example commands (e.g., cargo make internal-tests-runn "...") if helpful.

## Main-branch safety rule

If current branch is `main`, do not continue directly.

Required behavior:
1. Propose branch name candidates (3 options, recommended first), for example:
   - `feature/<slug>` (recommended)
   - `fix/<slug>`
   - `chore/<slug>-YYYYMMDD`
2. Ask user to select one option or enter a custom branch name.
3. Create/switch to that branch.
4. Continue commit/push/PR flow on the selected branch.

## Push mode defaults (project decision)

For 「プッシュして」 in this project, defaults are:

1. Add behavior: `staged only` (recommended by user)
   - Do not auto-run `git add -A` unless user explicitly asks.
2. Protected branch behavior: stop on `main`/`master` and request branch selection
   - Never commit directly on `main` or `master`.

For this repository, prefer:
- `scripts/git-commit-and-push.sh`

## Post-merge cleanup mode

When user says 「マージしました」 (or equivalent), run this exact flow:

1. Remember current branch as source branch.
2. Switch to `main`.
3. Pull latest main with `git pull --ff-only origin main`.
4. Only if pull succeeds, check whether `origin/<source-branch>` is deleted.
5. If remote source branch still exists, stop immediately (do not delete local).
6. If remote source branch is deleted, delete local source branch using `git branch -d`.

For this repository, prefer:
- `scripts/post-merge-cleanup.sh`

Safety rules:
- Never force delete branch (`-D` is forbidden unless user explicitly requests).
- If working tree is dirty, stop and ask user how to proceed.
- If currently on `main`, stop (no source branch to delete).

## Question format to user

When user input is required, ask concise multiple-choice with recommendation first:

```text
次のどれで進めますか？
1. <option A>（推奨）
2. <option B>
3. <option C>
```

Apply this format for:
- branch selection (especially on `main`)
- commit message choice
- PR base branch choice (if ambiguous)
- PR title/body choice when multiple plausible options exist
- cleanup conflict handling (if branch deletion prerequisites are not met)

## How the agent should use this skill

1. Gather context:
   - Check `git status`, current branch, and target files.
   - Check auth source (`.local/github-auth.env` preferred).

2. Handle branch:
   - If on `main`, run the main-branch safety rule above.

3. Prepare commit:
   - Summarize diff.
   - Propose Conventional Commit options and let user choose.
   - Commit only approved scope/files.

4. Push:
   - Push selected branch to `origin`.

5. Prepare PR content:
   - Build title/body with the PR template.
   - Include Jira ticket(s) if provided.
   - Include concrete test steps.

6. Push-only flow (when user says 「プッシュして」):
   - Check branch safety (stop on main/master and ask branch choice).
   - Summarize staged/uncommitted changes.
   - Propose 2-3 Conventional Commit messages and let user choose.
   - By default, commit staged files only.
   - Commit and push current branch to `origin`.

7. Create PR:
   - Prefer `gh pr create --base ... --head ... --title ... --body ...`.
   - If PR already exists for head branch, share URL instead of duplicating.

8. Post-merge cleanup (when requested):
   - Run the post-merge cleanup mode steps.
   - Stop if remote branch is not deleted.
   - Delete local branch only when remote deletion is confirmed.

9. Always:
   - Keep commit message and PR description consistent.
   - Use exact API/resource names used in code.
   - Keep the text concise but reviewer-friendly.
   - Use `scripts/git-commit-and-push.sh` for push-only mode in this repository.
   - Use `scripts/git-commit-push-pr.sh` when suitable for this repository.
   - Use `scripts/post-merge-cleanup.sh` for merge-complete cleanup in this repository.
