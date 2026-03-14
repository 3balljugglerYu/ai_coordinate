---
name: project-database-context
description: Repository-specific guide for understanding Persta.AI's Supabase data model and implementation. Use when a task touches the database schema, RLS, RPCs, triggers, migrations, Storage-backed image flows, or when onboarding a developer or agent to the data layer.
---

# Project Database Context

Use this skill for Supabase and database-related work in this repository.

## Canonical Sources

Read the smallest set of files that match the task:

1. Start with `docs/architecture/data.md`, then open `data.ja.md` or `data.en.md` based on the user's language.
2. Use `.cursor/rules/database-design.mdc` for the exact table, RLS, index, and function inventory.
3. Use `docs/API.md` when the task touches route-level request or response contracts.
4. Read `supabase/migrations/*.sql` when changing database behavior.

## Repository Rules

- Canonical human-readable docs live in `docs/`.
- Cursor-specific rules stay in `.cursor/rules/`.
- Cross-agent guidance lives in `.agents/skills/`.
- Do not create `.agents/rules/` unless a specific tool explicitly requires that layout.

## Working Model

- `createClient()` means session-scoped access with RLS enforcement.
- `createAdminClient()` means service-role access; app code must re-apply visibility and ownership rules where needed.
- Multi-table, atomic, or idempotent business operations should stay in SQL RPCs or triggers instead of being split across route handlers.

## Update Workflow

When database behavior changes:

1. Update migrations or SQL sources of truth first.
2. Confirm whether the flow is session-client, admin-client, or RPC/trigger driven.
3. Update the right documentation layer:
   - `docs/architecture/data.en.md` and `data.ja.md` for onboarding-level architecture and flow changes
   - `.cursor/rules/database-design.mdc` for exact schema, RLS, index, and function inventory changes
   - `docs/API.md` when route contracts changed
4. Keep `docs/architecture/data.md` as a language selector, not a third full copy.

## Task Shortcuts

- For onboarding: read `docs/architecture/data.*` first.
- For schema diffs: read `.cursor/rules/database-design.mdc` and the relevant migrations.
- For access bugs: inspect RLS, then check whether the code path uses `createClient()` or `createAdminClient()`.
- For billing, bonuses, moderation, or deletion flows: start from RPCs and triggers before editing route handlers.
