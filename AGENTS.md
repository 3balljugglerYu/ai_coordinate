## Skills
### Available skills
- codex-webpack-build: Repository-specific production build verification workflow for this Next.js app. Use when a user asks Codex to run a build, verify whether a change builds, investigate build failures, or confirm release readiness in this repo. In Codex and sandbox environments, prefer `npm run build -- --webpack` over plain `npm run build` because the default Turbopack build can stall here while webpack completes. If the user explicitly asks to test Turbopack or change build tooling, follow that request instead. (file: .agents/skills/codex-webpack-build/SKILL.md)

### How to use skills
- Use the repo-local skill above when the request matches its description.
- Follow broader platform-level skill instructions in addition to this local skill list.
