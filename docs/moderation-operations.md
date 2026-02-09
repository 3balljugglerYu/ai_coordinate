# Moderation Operations Runbook

## Scope
This runbook covers the moderation features introduced for Persta.AI:

- Post report (`/api/reports/posts`)
- User block (`/api/users/[userId]/block`)
- Auto pending via report threshold
- Admin moderation queue (`/admin/moderation`)

## Status Model
- `visible`: public feedに表示
- `pending`: 一般ユーザーには非表示、審査待ち
- `removed`: 公開停止（却下）

Status is stored in `public.generated_images.moderation_status`.

## Report Threshold Logic
- Minimum reports: `3`
- Weighted report threshold: `max(3, ceil(active_users_7d * 0.005))`
- Spike rule: `3 reports within 10 minutes` => pending
- **Important**: Pending is evaluated only when a **new** report is submitted. The aggregation uses the Admin client so that **all** reports for the post are counted (RLS on `post_reports` otherwise allows each user to see only their own reports, which would prevent the threshold from ever being reached).

## Report Rate Limiting
- Per user, per 10 minutes: `10`
- Per user, per 24 hours: `50`
- API returns `429` when exceeded.

## Admin Review Procedure
1. Open `/admin/moderation`.
2. Inspect queued post with:
   - report count
   - weighted score
   - moderation reason
3. Decide:
   - `承認` => set `visible`
   - `却下` => set `removed`
4. Confirm audit log inserted in `moderation_audit_logs`.

## Audit & Traceability
- Auto pending: action `pending_auto`
- Admin approve: action `approve`
- Admin reject: action `reject`

All actions should include:
- `post_id`
- `actor_id`
- `reason`
- `metadata`

## Troubleshooting: Reports Exist but Post Still Visible
- **Cause (fixed)**: The pending metrics were previously calculated with the user's Supabase client. RLS on `post_reports` allows each user to see only their own reports, so `weightedScore` and `recentCount` were always at most 1 per request and the threshold was never reached. The API now uses the Admin client for this aggregation.
- **Already-affected posts**: Pending is only re-evaluated when a **new** report is submitted. For a post that already has ≥threshold reports but no one has reported since the fix:
  - The next user who submits a new report (and has not already reported that post) will trigger the correct aggregation and the post will be set to `pending`.
  - Alternatively, an admin can set `moderation_status = 'pending'` and insert an audit log row manually, or run a one-off script that re-evaluates such posts using the same logic with the Admin client.

## Incident Handling
If false positives spike:
1. Check report distribution by category/subcategory.
2. Temporarily raise threshold (0.5% -> 0.7%).
3. Prioritize manual review for reported categories.
4. Rollback threshold after stabilization.

## Supabase MCP Checklist
1. `apply_migration` for schema changes.
2. `list_tables` and `execute_sql` for verification.
3. `get_advisors` after major schema updates.
4. `list_migrations` to confirm applied version.
