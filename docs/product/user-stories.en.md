# User Stories

Japanese version: [`user-stories.md`](./user-stories.md)

- Last updated: `2026-03-14`
- Audience: Developers, product owners, and designers working in this repository
- Role: Canonical English narrative reference for current user-facing journeys

## Purpose of this document

This document is the source of truth for understanding the current user-facing journeys in story form.
It focuses on what users are trying to achieve, which routes they move through, and where authentication, posting, notifications, and Percoin purchases happen.

For stricter functional definitions, see `docs/product/requirements.en.md`.
For route-level navigation, see `docs/product/screen-flow.en.md`.
For data flow, RPCs, and storage behavior, see `docs/architecture/data.en.md`.

Recommended reading order:

1. Start here to understand the main user journeys
2. Check `docs/product/screen-flow.en.md` for route transitions and back-navigation rules
3. Check `docs/product/requirements.en.md` for detailed requirements
4. Check `docs/architecture/data.en.md` for persistence, RLS, and implementation behavior

## Scope

This document focuses on the current primary user journeys.

- Included: browsing, sign-up, image generation, posting, community interaction, My Page, missions, notifications, and Percoin purchases
- Excluded: detailed admin workflows, future-only ideas, and unimplemented UI proposals

## Story 1: A guest browses content and signs up for their first generation

### Goal

An unauthenticated user browses content on Home, becomes interested, and signs up to start image generation.

### Main routes

- `/`
- `/posts/[id]`
- `/login`
- `/signup`
- `/coordinate`

### Story

1. The user opens Home and browses the feed
2. They open a post detail page to inspect content and the creator
3. They decide to try generation and tap Coordinate in the main navigation
4. Because they are unauthenticated, they are redirected to login or sign-up
5. They complete account creation with email or OAuth and return to the generation screen

### Expected outcome

- Home and public posts remain viewable without authentication
- Authentication is required only when the user enters protected flows
- After registration, the user returns to `/coordinate` without losing context

## Story 2: A new user completes the tutorial and generates their first image

### Goal

A newly registered user uses the initial balance and tutorial to complete their first generation successfully.

### Main routes

- `/coordinate`
- `/challenge`
- `/my-page`

### Story

1. Right after sign-up, the user receives an initial Percoin balance
2. On `/coordinate`, the user uploads a character image, enters a prompt, chooses whether to change the background, and selects the number of images
3. Eligible users see a tutorial flow and can receive an extra bonus after completing it
4. The screen shows the required Percoin amount based on the selected model and image count
5. Once generation starts, images are generated one by one
6. Percoins are consumed only for successfully completed images, not at the start
7. Generated images are saved and can be reviewed through preview or enlarged view

### Expected outcome

- The sign-up bonus is enough to let the user try the product immediately
- Failed generations only charge for completed images
- Generated results remain accessible from My Page even before posting

## Story 3: A user posts generated content and receives community reactions

### Goal

The user publishes generated images and begins interacting with the community through Home, post detail, and notifications.

### Main routes

- `/coordinate`
- `/my-page`
- `/posts/[id]`
- `/users/[userId]`
- `/notifications`

### Story

1. The user opens the posting flow either from the generation preview or from an unposted image on My Page
2. They enter a caption when needed and complete the post
3. The newly posted image appears in the Home feed
4. Other authenticated users discover the content through New, Recommended, or Following views and through post detail pages
5. Community users perform likes, comments, and follows
6. The original poster reviews those reactions on `/notifications` and navigates from notifications to post details or user profiles

### Expected outcome

- Posting can happen immediately after generation or later from My Page
- Community feedback is gathered in notifications and routes cleanly into the right detail screens
- Social actions are limited to authenticated users

## Story 4: A user manages content and account settings from My Page

### Goal

The user manages their generated content, profile, Percoin balance, and account settings from one place.

### Main routes

- `/my-page`
- `/my-page/[id]`
- `/posts/[id]?from=my-page`
- `/my-page/credits`
- `/my-page/account`
- `/my-page/contact`
- `/account/reactivate`

### Story

1. The user opens `/my-page` to review their profile, stats, generated images, and current Percoin balance
2. From the image list, they move either to the shared post detail page or the owner-only detail page
3. For posted images, they can edit captions or unpost
4. For unposted images, they can either post or delete
5. On `/my-page/credits`, they review balance and transaction history
6. On `/my-page/account`, they manage account settings, report history, block-related screens, and withdrawal-related actions
7. If they need to undo a scheduled withdrawal, they use `/account/reactivate`

### Expected outcome

- Available actions change depending on whether an image is posted
- Navigation from My Page preserves the correct return destination through `from=my-page`
- Balance checks, history, and purchase entry points stay grouped under My Page routes

## Story 5: A user keeps returning through missions and bonuses

### Goal

The user keeps engaging through tutorial, streak, referral, and daily-post bonus routes.

### Main routes

- `/challenge`
- `/coordinate`
- `/my-page`

### Story

1. The user opens `/challenge` and checks current bonus routes and progress
2. Early on, the tutorial completion bonus helps improve first-session retention
3. Over time, streak bonuses and daily-post bonuses create reasons to come back
4. When a referred registration is completed through a referral code, the referring user receives a referral bonus
5. The user spends earned bonuses on further generation and posting

### Expected outcome

- Bonus flows are not isolated features. They should lead users back into generation and posting
- Retention incentives are split between `/challenge` and action-triggered grants
- Granted Percoins are reflected in balance and transaction history

## Story 6: A user purchases Percoins and continues generating

### Goal

When balance runs low, the user moves into the purchase flow and resumes generation immediately after payment.

### Main routes

- `/my-page/credits`
- `/my-page/credits/purchase`
- `/coordinate`

### Story

1. The user enters the purchase flow either from the balance card on My Page or from an insufficient-balance prompt during generation
2. On `/my-page/credits/purchase`, they select a package in the Stripe Pricing Table
3. The current package lineup is 110, 240, 960, 1,900, and 4,800 Percoins
4. After Checkout completes, a webhook updates balance and transaction history
5. The user confirms the new balance and returns to generation

### Expected outcome

- Insufficient balance naturally leads to the purchase flow
- Payment completion is visible in transaction history
- The source of truth for package values and pricing is `docs/business/monetization.md` and the related implementation files

## Supporting notes

- Treat Home's primary browsing flows as New, Recommended, and Following
- Even if daily, weekly, and monthly ranking logic exists in the implementation, do not treat those as the central current user journey
- Package values and bonus amounts can change, so always verify numbers against `docs/business/monetization.md` and the relevant implementation files
- For return navigation, follow the `from` query rules documented in `docs/product/screen-flow.en.md`
