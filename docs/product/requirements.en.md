# Product Requirements

Japanese version: [`requirements.md`](./requirements.md)

- Last updated: `2026-03-14`
- Audience: Developers, product owners, and designers working in this repository
- Role: Canonical English reference for product requirements

## Project Overview

### Application name
Dress-up coordination app

### Functional overview
An application that uses nanobanana to change a character illustration's outfit while preserving the original face and style.
When the "Change background too" option is selected, the app can also change the background in addition to the outfit.

### Technical requirements
- **AI generation engine**: nanobanana
- **Image storage**: Supabase Storage
- **Database**: Supabase PostgreSQL
- **Authentication**: Supabase Auth
  - Supabase Auth is the unified authentication system for email/password sign-in and social login
  - Social login, when added, must also be implemented through Supabase Auth
  - Supported OAuth providers can include Google, Twitter/X, GitHub, Apple, Facebook, LINE, and others supported by Supabase Auth
- **Payments**: Stripe
  - Used for Percoin purchases
  - Stripe Checkout is used for the payment flow
- **Rendering optimization**: Partial Prerendering (PPR)
  - Use Next.js 16 Partial Prerendering to optimize initial load performance
  - Pre-render static content such as images, user info, captions, and prompts
  - Stream dynamic content such as like counts, comment counts, view counts, and comment lists
  - Separate static and dynamic content with `Suspense` boundaries

## Functional Requirements

### 1. Image generation

#### 1.1 Generation form
- **Character image upload**
  - Users can upload a character illustration image
  - Supported file types: image files, exact formats to be confirmed
  - File size limit: to be defined

- **Outfit prompt input**
  - Users specify the outfit change through a text field
  - Provide a prompt input area

- **Background change option**
  - Provide a checkbox labeled "Change background too"
  - Checked: outfit change plus background change
  - Unchecked: outfit change only

- **Number of images**
  - Users can select between 1 and 4 images
  - Render four parallel buttons for selection

- **Generation button**
  - Start generation when the "Start Coordinate" button is pressed

#### 1.2 Percoin consumption
- **When consumption happens**
  - **Consume Percoins each time an image finishes generating successfully**: 20, 50, 80, or 100 Percoins depending on the model, with 20 as the standard model cost
  - Do not consume Percoins when generation starts
  - Only charge for successfully generated images
  - Calculation: number of successful images x model-specific Percoin cost. See `features/generation/lib/model-config.ts`
  - Example: if 4-image generation starts and the third image fails, only 40 Percoins are consumed on the standard model

- **When Percoins are insufficient**
  - Before starting generation, confirm the user has enough balance for the requested count. On the standard model, up to 80 Percoins are needed for 4 images
  - Disable the start button if the required balance is missing
  - During generation, check the balance after each completed image and stop further generation if the remaining balance is insufficient
  - Show a warning message and a link to the purchase page when balance is insufficient

#### 1.3 Generation result preview
- **Progress display**
  - Show generated images one by one as they complete
  - Show a loading indicator for images still generating
  - Show completed images as preview thumbnails
  - Show a post button at the top right of each completed image. In multi-image generation, each image can be posted independently

- **Image enlargement**
  - Allow users to enlarge a generated image by click or tap
  - Use a modal or full-screen presentation for the detailed view

- **Image slide navigation** for 2 or more generated images
  - Show left and right navigation buttons in the enlarged view
  - Allow switching images with previous and next buttons
  - Support drag and swipe interactions
  - Support touch devices

### 2. Data persistence

#### 2.1 Image storage
- Save generated images to Supabase Storage when generation completes
- Example: if 4 images are generated, save all 4 images individually
- Store each image as a separate file
- Store metadata such as generated time, prompt, and user ID in the database

#### 2.2 Database design
For detailed data design and Supabase structure, see `docs/architecture/data.en.md`.

**Key tables**:
- `generated_images`: metadata for generated images
- `materials_images`: free material images shown in routes such as `/free-materials`
- `banners`: home-screen banners
- `user_credits`: current Percoin balance
- `credit_transactions`: Percoin transaction history
- `profiles`: user profile data such as nickname, bio, and avatar
- `likes`: like records
- `comments`: comment records
- Percoin packages are managed in `percoin-packages.ts` and `stripe-price-mapping.ts`. The `credit_packages` table is not used

### 3. Authentication

#### 3.1 Authentication methods
- **Authentication system based on Supabase Auth**
  - Email and password login
  - Social login through OAuth
    - Google login
    - Twitter/X login
    - Other providers supported by Supabase Auth

#### 3.2 Authentication flow
- On sign-up:
  - Create an account with email/password or social login
  - Save user information to the database on first login
  - **Automatically grant 50 Percoins as a sign-up benefit** via the `handle_new_user` trigger. See section 7.1
    - Initialize `user_credits` to 50 Percoins
    - Record the transaction in `credit_transactions` as `signup_bonus`
- On login:
  - Manage the authenticated session with Supabase Auth
  - Identify the user through JWT-based session handling
- On logout:
  - End the session and clear authenticated state

#### 3.3 Authentication state management
- Manage authentication state through Supabase Auth sessions
- Authentication state can be checked on both client and server
- Control data access through RLS integration

### 4. My Page

#### 4.1 Profile information display with a modern social-style UI
- **Profile header**
  - Show the user icon or avatar
  - Show the nickname sourced from `profiles`
  - Show and edit self-introduction or bio. Already implemented
  - Show an edit button. Already implemented

- **Statistics section**. Already implemented
  - Number of generated images
  - Number of posted images where `is_posted = true`
  - Total likes
  - View count
  - Following and follower counts

- **Percoin balance card**
  - Show current Percoin balance
  - Navigate to `/my-page/credits` through the purchase button

#### 4.2 Image list display
- Show thumbnails for all images generated by the signed-in user, including both posted and unposted images
- Provide tab switching for All, Posted, and Unposted
- Use a masonry layout matching the home feed
- Sort by generated time in descending order
- Show image-only cards without unnecessary inner spacing
- Navigate to `/posts/[id]?from=my-page` when an image is clicked so the app uses the shared post detail view
- Distinguish posted and unposted state in the detail view

#### 4.3 Image detail display
- Navigate to `/posts/[id]?from=my-page` when a thumbnail is clicked or tapped
- Use the same UI as the shared post detail view, including enlarged image, author info, caption, and prompt
- Show a three-dot menu for owners only, on the right of the like icon in the user info section
  - For unposted images: Post or Delete
  - For posted images: Edit or Unpost
- Allow caption editing for posted images through the edit modal opened from the three-dot menu
- Allow posted images to be unposted by setting `is_posted` back to `false`, while keeping them in My Page
- Allow unposted images to be fully deleted from the database
- Return to My Page through the back button

#### 4.4 Percoin page at `/my-page/credits`
- **Displayed content**
  - Current Percoin balance
  - Percoin purchase section
  - Transaction history for purchases and consumption

- **Access paths**
  - Click the Percoin balance card on My Page
  - Return to My Page through the back button

#### 4.5 Access control
- Only authenticated users can access My Page
- If an unauthenticated user tries to access My Page:
  - Show a dialog encouraging sign-up
  - Show Sign Up and Cancel buttons
  - After successful sign-up, route the user to My Page
  - If sign-up is canceled, close the dialog

### 5. Posting

#### 5.1 Post list on the home page
- **Displayed content**
  - Show posted content in a modern grid layout
  - Allow all users to browse without authentication
  - Use continuous scrolling or infinite scroll
  - Show author name, avatar, like count, image thumbnail, and caption on each post

- **Sorting**
  - Allow tab-based sorting
  - New: sort by latest post time
  - Recommended: sort by like counts over the last 7 days
  - Following: show posts from followed users
  - Daily and monthly ranking are implemented in backend logic but hidden in the current UI
  - **Performance note**: daily, weekly, and monthly like aggregation may become expensive at scale, so cache or materialized views may be required

- **Author info**
  - Tap the author name to open the public profile page
  - Resolve author name and avatar from `profiles`

#### 5.2 Posting flow
- **How to post**
  - Open the post modal from the post button on the top right of a thumbnail on My Page
  - Open the post modal from the post button on the top right of the image in the detail view opened from My Page
  - Open the post modal from the top-right post button on a newly generated image. In multi-image generation, each image can be posted independently
  - Enter an optional caption up to 200 characters
  - Complete posting when the user presses the post button

- **After posting**
  - Route the user to the post list page
  - Reflect the new post immediately in the feed
  - Update `is_posted` to `true`
  - Set `caption` and `posted_at`

#### 5.3 Editing and deleting posts
- **Caption editing**
  - Allow editing a caption from the detail view of a posted image
  - Open an edit modal when the edit button is pressed
  - Limit captions to 200 characters

- **Post deletion**
  - Only the author can delete
  - Expose deletion through the three-dot menu in the detail view
  - For posted images: offer Unpost, which sets `is_posted` back to `false` and keeps the image in My Page
  - For unposted images: offer Delete, which fully removes the record from the database
  - Show a confirmation dialog before deletion
  - Full deletion is only available from My Page. Shared post detail only supports unposting

#### 5.4 Post detail page
- **URL design**
  - URL format: `/posts/[id]`, where `[id]` is `generated_images.id`
  - Allow direct access to post detail pages
  - If navigated from My Page, use `/posts/[id]?from=my-page` so the back button returns to My Page
  - Unposted images can also be shown at `/posts/[id]`, but only to the owner
  - Set SEO metadata such as Open Graph and Twitter Card tags

- **Displayed content**
  - Enlarged image with aspect-aware presentation. Portrait images use 50vh, landscape images use full width
  - Full-screen image view with pinch zoom and double-tap zoom
  - Author info section with avatar, nickname, follow button, like button, like count, and three-dot menu
  - Caption, collapsed after 3 or more lines
  - Prompt, collapsed after more than 1 line, with copy support
  - Comment list. Already implemented
  - Share button through the Web Share API. Already implemented
  - Sticky header that hides and shows on scroll
  - Cardless visual design

- **Like feature**
  - Thumb-up icon button
  - Show liked state in red
  - Reflect like and unlike immediately
  - Allow only one like per user per post
  - Show like counts on both feed cards and detail pages
  - Require authentication for liking. Unauthenticated users can only browse

- **Comment feature**
  - Show comments only on the detail page, ordered newest first
  - Support posting, editing, and deleting comments
  - Allow editing and deleting only for the current user's own comments, enforced by RLS
  - Require authentication for commenting. Unauthenticated users can only browse

- **Share feature**
  - Place a share button on each post
  - Use the Web Share API or platform share buttons
  - Support major social platforms such as Twitter/X, Facebook, and LINE
  - Include image thumbnail and caption in the shared payload when possible

### 6. User profile

#### 6.1 Profile page
- **Displayed content**
  - User name and avatar sourced from `profiles`
  - Post count for posted images
  - Total likes received on the user's posts
  - Post list in a grid layout, showing posted content only

- **Access path**
  - Navigate from the author name on the feed
  - Allow public viewing without authentication, but only show posted images

#### 6.2 Bottom navigation
- **Placement**
  - Fixed to the bottom of the screen
  - Optimized for mobile-first touch interaction

- **Tabs**
  - Home: shows the post list page
  - Coordinate: shows the image generation screen
    - Stay on the coordinate screen even after generation finishes
    - Require authentication. If an unauthenticated user taps it, show login or sign-up
  - My Page: shows My Page and requires authentication

- **Display control**
  - Control tab behavior based on authentication state
  - If an unauthenticated user taps Coordinate, show login or sign-up
  - If an unauthenticated user taps My Page, show a sign-up dialog

### 7. Percoins and payments

#### 7.1 Initial Percoin grants
- **Sign-up benefit**. Already implemented
  - Automatically grant 50 Percoins on account creation
  - The `handle_new_user` trigger runs at registration time when `auth.users` inserts
  - Record the transaction in `credit_transactions` as `signup_bonus`

- **Tutorial bonus**. Already implemented
  - Automatically grant 20 Percoins when the tutorial completes
  - Use `grant_tour_bonus` RPC and record `tour_bonus` in `credit_transactions`
  - Grant only once per user, enforced through a partial unique index
  - Use a driver.js tutorial tour and call the API on completion

#### 7.2 Percoin purchase
- **Percoin packages**. Source of truth: `features/credits/percoin-packages.ts`. Stripe Price ID mapping: `features/credits/lib/stripe-price-mapping.ts`
  - 110 Percoins: 500 JPY
  - 240 Percoins: 1,000 JPY
  - 960 Percoins: 3,000 JPY
  - 1,900 Percoins: 5,000 JPY
  - 4,800 Percoins: 10,000 JPY
  - Selection is done through Stripe Pricing Table

- **Payment flow**
  1. The user selects a Percoin package
  2. Create a Stripe Checkout session
  3. Redirect to the Checkout page
  4. Receive payment completion through a webhook
  5. Update the user's Percoin balance
  6. Record the transaction in `credit_transactions`

- **Stripe integration**
  - Use Stripe Checkout for secure payment processing
  - Detect completed payments at a webhook endpoint
  - Manage test and production Stripe keys through environment variables

#### 7.3 Percoin balance display
- **On My Page**
  - Show a Percoin balance card that navigates to `/my-page/credits`
  - Provide a purchase button
  - Show a warning when balance is low

- **On `/my-page/credits`**
  - Show the current balance prominently
  - Show a purchase section
  - Show detailed transaction history

- **On the generation screen**
  - Show the required Percoin amount for the selected image count and model. Costs are 20, 50, 80, or 100 Percoins per image depending on the model
  - Compare required amount and current balance
  - Show a link to the purchase page when the balance is insufficient

#### 7.4 Percoin consumption management
- **Consumption records**
  - **Consume Percoins each time an image successfully completes generation**
  - Save a separate consumption record to `credit_transactions` for each completed image using the model-specific cost
  - Update the `user_credits` balance after each completed image
  - Guarantee consistency with transaction handling
  - Do not consume Percoins for failed images
  - In multi-image generation, only charge for the successfully completed images

- **Consumption history**
  - Show both purchase history and consumption history on My Page
  - Include date, transaction type, Percoin amount, and related information

## Non-functional Requirements

### Performance
- Properly control image generation wait time, including timeout handling
- Optimize image loading through lazy loading and compression
- Ensure responsive behavior with mobile usage in mind

### Security
- Manage authentication information through Supabase Auth
- Control data access through RLS
- Validate uploaded image files, including type and size limits
- Allow delete and edit operations only for the author, enforced with RLS
- Require authenticated users for likes and comments

### UX and UI
- Mobile-first design
- Support touch interactions such as swipe and tap
- Clearly show loading states
- Provide suitable error handling and user-facing error messages

## Data Flow
For detailed user journeys, see `docs/product/user-stories.en.md`.

**Main flows**:
- Image generation flow: upload image -> enter prompt -> start generation -> consume Percoins as each image completes -> save result
- Percoin purchase flow: select package -> Stripe payment -> webhook detection -> update balance
- Post flow: press post button -> enter caption in modal -> post -> reflect in feed
- Like and comment flow: execute like or comment -> reflect immediately

## Implementation Priority
For the detailed roadmap and task tracking, see `docs/planning/implementation-roadmap.md`. This roadmap is currently maintained in Japanese.

**Main phases**:
- Phase 1: core generation features, including image upload, nanobanana API integration, preview display, and image storage
- Phase 2: authentication and My Page, including Supabase Auth, My Page, unauthenticated user handling, and social login
- Phase 3: posting features, including post modal, feed, sorting, editing and deletion, and bottom navigation
- Phase 4: likes and comments, including like actions, comments, and aggregate like counts
- Phase 5: user profile features, including profile page, post counts, total likes, and navigation
- Phase 6: external sharing, including social share and Web Share API
- Phase 7: bonus and campaign features, including daily post bonus, streak bonus, and referral bonus
- Phase 8: Percoins and payments, including Stripe integration, Percoin purchases, balance management, consumption, transaction history, and webhooks

## Notes and Open Questions

### Technical checks
- nanobanana API specification, including endpoints, authentication, and request and response formats
- Supported image file formats and size limits
- Image generation timeout limits
- nanobanana API rate limits and cost
- Stripe API details for Checkout Session creation and webhooks
- Stripe fee rates in Japan: 3.6 percent plus fixed fee

### Specification details still needing definition
- Retention period for stored images, especially for unauthenticated users if that path is introduced
- Detailed error handling for API and network failures
- Maximum image size and resolution
- Maximum concurrent generation count
- Refund policy for failed generation
- Whether Percoins expire. Purchased Percoins are permanent, while free Percoins expire at the end of the grant month plus six months
- Refund and cancellation policy

### Notification functionality. Already implemented
- Notifications backed by the `notifications` table are already implemented
- Current notification categories include:
  - likes
  - comments
  - follows
  - bonuses such as signup, tutorial, streak, referral, and daily post
- Notifications are listed on `/notifications`
- The app supports mark-as-read, mark-all-as-read, and unread-count badges
- For detailed data design and implementation flow, see `docs/architecture/data.en.md`
