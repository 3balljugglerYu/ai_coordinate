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

## Skills
### Available skills
- codex-webpack-build: Repository-specific production build verification workflow for this Next.js app. Use when a user asks Codex to run a build, verify whether a change builds, investigate build failures, or confirm release readiness in this repo. In Codex and sandbox environments, prefer `npm run build -- --webpack` over plain `npm run build` because the default Turbopack build can stall here while webpack completes. If the user explicitly asks to test Turbopack or change build tooling, follow that request instead. (file: .agents/skills/codex-webpack-build/SKILL.md)
- project-database-context: Repository-specific guide for understanding Persta.AI's Supabase data model and implementation. Use when a task touches the database schema, RLS, RPCs, triggers, migrations, Storage-backed image flows, or when onboarding a developer or agent to the data layer. (file: .agents/skills/project-database-context/SKILL.md)
- implementation-planning: 新機能の実装計画を立案するスキル。EARS要件定義、ADR、フェーズ別実装計画、変更ファイル一覧、テスト観点、ロールバック方針を含む計画作成に使う。新機能の設計・実装計画を求められた場合に使用する。 (file: .agents/skills/implementation-planning/SKILL.md)

### How to use skills
- Use the repo-local skill above when the request matches its description.
- Follow broader platform-level skill instructions in addition to this local skill list.
