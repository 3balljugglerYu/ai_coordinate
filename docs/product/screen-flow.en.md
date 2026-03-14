# Screen Flow

Japanese version: [`screen-flow.md`](./screen-flow.md)

- Last updated: `2026-03-14`
- Audience: Developers, product owners, and designers
- Role: Canonical English screen-flow reference for the current app

## Purpose of this document

This document organizes the current primary user-facing screen transitions and admin routes.
It is not just a route inventory. Its purpose is to show how users move from one screen to another.

Recommended reading order:

1. Use this file to understand the screen flow
2. Check `docs/product/requirements.en.md` for functional requirements
3. Check `docs/architecture/data.en.md` for implementation and data flow
4. Check `docs/planning/implementation-roadmap.md` for current progress and priority. This roadmap is currently maintained in Japanese

## Primary navigation

The main navigation currently shown in the app shell is:

- `/`: Home
- `/coordinate`: Coordinate
- `/challenge`: Mission
- `/notifications`: Notifications
- `/my-page`: My Page

Unauthenticated users can directly use only Home.
If they tap Coordinate, Mission, Notifications, or My Page, they are routed to `/login?redirect=/`.

## Main user flows

```text
Home (/)
  ├─ Tap post -> Post detail (/posts/[id])
  │    ├─ Tap author -> User profile (/users/[userId])
  │    └─ Like / comment / follow -> Authentication required
  │
  ├─ Tap Coordinate -> Login / Signup if unauthenticated
  │    └─ Coordinate (/coordinate)
  │         ├─ Tutorial for eligible users
  │         ├─ Image generation
  │         ├─ Preview / enlarged view
  │         └─ Post -> Post modal -> Home or post detail
  │
  ├─ Tap Mission -> Login if unauthenticated
  │    └─ Mission (/challenge)
  │         ├─ Tutorial state
  │         ├─ Streak / referral / bonus information
  │         └─ Bonus-related routes and explanations
  │
  ├─ Tap Notifications -> Login if unauthenticated
  │    └─ Notifications (/notifications)
  │         ├─ Follow notification -> /users/[userId]?from=notifications
  │         └─ Post notification -> /posts/[id]?from=notifications
  │
  └─ Tap My Page -> Login if unauthenticated
       └─ My Page (/my-page)
            ├─ Percoin card -> /my-page/credits
            │    └─ Purchase flow -> /my-page/credits/purchase
            ├─ Tap image -> /posts/[id]?from=my-page
            ├─ Owner-only image detail -> /my-page/[id]
            ├─ Account -> /my-page/account
            └─ Contact -> /my-page/contact
```

## Screen groups

### 1. Home and browsing flow

- `/`: home feed
- `/posts/[id]`: post detail
- `/users/[userId]`: public user profile
- `/search`: search
- `/free-materials`: free materials

Notes:

- Home is the default landing page
- Post detail can be viewed publicly
- Likes, follows, and comments require authentication
- The sticky header changes the back destination based on the `from` query

### 2. Generation flow

- `/coordinate`: image generation
- generation result preview
- post modal from generation results

Notes:

- The coordinate screen requires authentication
- Eligible users can receive tutorial guidance
- Users can post directly from the generation result UI

### 3. Mission, notifications, and growth flow

- `/challenge`: mission
- `/notifications`: notifications list

Notes:

- Both routes require authentication
- Notifications open post details and profiles with `from=notifications`
- The mission screen is used to understand tutorial, streak, referral, and related bonus routes

### 4. My Page and account management

- `/my-page`: profile summary and generated image list
- `/my-page/[id]`: owner-only image detail
- `/my-page/credits`: balance and history
- `/my-page/credits/purchase`: Percoin purchase
- `/my-page/account`: account management, blocks, report history, and withdrawal request
- `/my-page/contact`: contact form
- `/account/reactivate`: reactivation flow after scheduled withdrawal

Notes:

- `/my-page/[id]` exists in the current implementation. It is not a future placeholder
- My Page can also navigate to the shared post detail at `/posts/[id]?from=my-page`
- Purchase success and cancellation messages are handled on `/my-page/credits/purchase`

### 5. Authentication and recovery flow

- `/login`
- `/signup`
- `/auth/callback`
- `/auth/x-complete`
- `/reset-password`
- `/reset-password/confirm`

Notes:

- The login screen accepts a query parameter for the destination after login
- OAuth completion may pass through `/auth/x-complete` before the final redirect
- Contact and some account routes return to login with a dedicated `redirect` parameter

### 6. Admin routes

Main admin routes:

- `/admin`
- `/admin/users`
- `/admin/users/[userId]`
- `/admin/moderation`
- `/admin/reports`
- `/admin/percoin-defaults`
- `/admin/bonus`
- `/admin/bonus/bulk`
- `/admin/deduction`
- `/admin/credits-summary`
- `/admin/banners`
- `/admin/materials-images/free-materials`
- `/admin/image-optimization`
- `/admin/audit-log`

Notes:

- The admin area is protected by the admin layout. Non-admin users are redirected to `/`
- The current admin surface is much wider than the old screen-flow doc and should be treated as the source of truth for current routes

## Back-navigation rules

The current sticky header resolves the back destination as follows:

- `from=my-page` -> `/my-page`
- `from=notifications` -> `/notifications`
- `from=coordinate` -> `/coordinate`
- any route under `/my-page/*` without `from` -> `/my-page`
- otherwise -> `/`

This matters because the same post detail or profile page can have different return destinations depending on where the user came from.

## Current route map

### Main public and authenticated routes

- `/`
- `/coordinate`
- `/challenge`
- `/notifications`
- `/my-page`
- `/my-page/[id]`
- `/my-page/credits`
- `/my-page/credits/purchase`
- `/my-page/account`
- `/my-page/contact`
- `/posts/[id]`
- `/users/[userId]`
- `/login`
- `/signup`
- `/reset-password`
- `/reset-password/confirm`
- `/about`
- `/pricing`
- `/terms`
- `/privacy`
- `/tokushoho`
- `/payment-services-act`
- `/thanks-sample`
- `/search`
- `/free-materials`
- `/account/reactivate`
- `/i2i/[slug]`

### Authentication helper routes

- `/auth/callback`
- `/auth/x-complete`

## Main differences from the old screen-flow doc

- `/challenge` and `/notifications` are now part of the primary navigation
- `/my-page/[id]` exists in the current implementation. It is not a future-only route
- `/my-page/credits/purchase` exists as a dedicated purchase page
- `/home`, `/credits/purchase`, and `/mypage/images/[id]` should not be treated as current canonical user routes
- The admin flow now includes user search, moderation, reports, defaults, grants, deductions, summaries, image optimization, and audit logs

## Related documents

- `docs/product/requirements.en.md`
- `docs/planning/implementation-roadmap.md`
- `docs/architecture/data.en.md`
- `../../app/`
