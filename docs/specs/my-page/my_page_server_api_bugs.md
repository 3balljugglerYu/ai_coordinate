# MyPageServerApi Bug Reports

## MPSAPI-006: Follow count RPC partial data is not zeroed when error is present

- Date: 2026-03-27
- Status: Fixed in working tree
- Spec ID: `MPSAPI-006`
- Classification: `A. Implementation Bug`
- Affected file: `features/my-page/lib/server-api.ts`

### Summary

`getUserStatsServer` reads `followCounts?.following_count` and `followCounts?.follower_count` before checking `followCountsError`, so a `get_follow_counts` response that contains both partial data and an error can leak non-zero follow counts instead of forcing both counters to `0`.

### Expected

- If `get_follow_counts` returns an error, `console.error("Follow counts fetch error:", error)` is emitted.
- `followerCount` is `0`.
- `followingCount` is `0`.
- Other aggregates remain based on their own query results.

### Actual

- The helper derives `followingCount` and `followerCount` from `followCounts` first.
- When the RPC returns both `data` and `error`, those partial counts are preserved.
- The error is logged, but the returned follow counts can still be non-zero.

### Root Cause

- The implementation computes follow counters from `followCounts` before the error branch.
- The error path only logs and does not override the already-derived values.

### Recommended Fix

- Branch on `followCountsError` before deriving `followingCount` and `followerCount`, or explicitly zero both counters inside the error path.
- Keep the existing behavior for the non-error/nullish-data branch.

### Fix

- Updated `getUserStatsServer` so `followingCount` and `followerCount` stay `0` whenever `followCountsError` is present.
- Kept the nullish-data fallback behavior unchanged for the non-error branch.

### Verification

- `npm test -- --runInBand tests/unit/lib/my-page-server-api.test.ts`
- The `MPSAPI-006` test now injects partial follow count data together with the RPC error and verifies both counters still resolve to `0`.
