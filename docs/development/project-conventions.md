# Project Conventions

Japanese version: [`project-conventions.ja.md`](./project-conventions.ja.md)

- Last updated: `2026-03-14`
- Audience: Developers working in this repository
- Role: Canonical human-readable reference for repo structure, stack, and general implementation conventions

## Why this document exists

`.cursor/rules/project-rule.mdc` is a Cursor-specific adapter that is always loaded by the tool.  
This document is the canonical reference for developers and other agents that need the full project conventions.

Recommended reading order:

1. This file for repo-wide development conventions
2. `docs/architecture/data.en.md` for data and Supabase architecture
3. `docs/product/requirements.en.md` for product requirements
4. `docs/planning/implementation-roadmap.md` for implementation status. This document is currently maintained in Japanese
5. `docs/API.md` for route-level contracts

## Technology stack

### Frontend

- Next.js `16.0.7` with App Router
- React `19.2.0`
- TypeScript `^5` with `strict` mode
- Tailwind CSS `^4.1.16`
- shadcn/ui

### Backend and data

- Supabase for API and PostgreSQL
- Supabase Auth for authentication
- Supabase Storage for generated assets

### Deployment

- Vercel
- Production secrets and runtime configuration are managed through environment variables

## Repository layout

### App Router structure

- `app/(marketing)/`: public pages
- `app/(app)/`: authenticated area
- `app/(app)/admin/`: admin area
- `app/api/`: Route Handlers
- `app/layout.tsx`: root layout
- `app/loading.tsx`: global loading UI

### Feature-based structure

- `features/[feature-name]/`
- `features/[feature-name]/components/`: feature-specific components
- `features/[feature-name]/actions/`: Server Actions when needed
- `features/[feature-name]/lib/`: feature-specific utilities, schemas, and server helpers
- `features/[feature-name]/types.ts`: feature-specific types

### Shared resources

- `components/ui/`: shadcn/ui based shared UI components
- `components/`: generic shared components
- `lib/`: shared utilities and platform helpers
- `hooks/`: fully generic hooks
- `types/`: cross-cutting shared types
- `constants/`: app-wide constants

Important shared files:

- `lib/supabase/client.ts`: browser Supabase client
- `lib/supabase/server.ts`: session-scoped server Supabase client
- `lib/env.ts`: typed environment access
- `lib/auth.ts`: auth helpers

### Supabase layout

- `supabase/migrations/`: SQL migrations and source of truth
- `supabase/functions/`: Edge Functions
- `supabase/policies/`: RLS policies when split out

## General development rules

### Path aliases

- `@/*` points to the project root
- Example: `import { cn } from '@/lib/utils'`

### Environment variables

- Secrets must not be committed
- Use `.env.local` for local development
- Read environment variables through `lib/env.ts`
- Keep Vercel environment variables aligned with runtime expectations

### Coding conventions

- Prefer React Server Components unless a client component is required
- Keep feature-specific code in `features/`
- Put cross-cutting reusable code in `lib/` or `components/`
- Keep data access mode explicit:
  - session-scoped access with `createClient()`
  - privileged access with `createAdminClient()`
  - multi-table business logic in SQL RPCs or triggers

### Rendering and performance

- Use Next.js 16 Partial Prerendering patterns where they fit
- Pre-render static content and stream dynamic content behind `Suspense`
- Prefer route-level or component-level code splitting when it materially reduces shipped client code

### Styling

- Use Tailwind CSS v4 utility classes
- Define theme tokens in `globals.css` with `@theme inline` when needed
- Use shadcn/ui where it fits the established UI language
- Use `cn()` from `lib/utils.ts` to merge class names
- Use Lucide React for icons

## Mobile-first rules

This product is primarily used on smartphones. Default to a mobile-first implementation.

### Layout and responsiveness

- Design for mobile widths first, then extend with `sm:`, `md:`, `lg:`, and `xl:`
- Keep content width controlled with `max-w-*` or container constraints

### Touch targets

- Interactive elements should be at least `44x44px`, ideally `48x48px`
- Buttons and links should have enough padding for touch use
- Treat hover effects as additive desktop behavior, not a dependency

### Mobile UX

- Use sufficient spacing around scrollable content
- Prefer `text-base` or larger for form inputs
- Be careful with mobile keyboard overlap and fixed positioning
- Consider safe areas for notches and home indicators when using sticky or fixed UI

### Mobile performance

- Use `next/image` when appropriate
- Keep bundle size and client-side JavaScript under control
- Consider slow mobile networks when designing fetch and loading patterns
- Use skeletons and progressive loading where useful

### Testing expectations

- Check mobile layouts in browser DevTools during development
- Prefer real-device verification when the change is touch, viewport, or Safari sensitive

## Security and safety

- Never hardcode API keys or database credentials
- Keep `.env.local` out of git
- Add new feature code under `features/` unless it is clearly shared

## Related references

- `docs/development/deployment-environments.ja.md` (Japanese)
- `docs/development/preview-environment-runbook.ja.md` (Japanese)
- `docs/architecture/data.en.md`
- `docs/product/requirements.en.md`
- `docs/product/user-stories.en.md`
- `docs/planning/implementation-roadmap.md`
- `docs/business/monetization.md`
- `docs/API.md`
