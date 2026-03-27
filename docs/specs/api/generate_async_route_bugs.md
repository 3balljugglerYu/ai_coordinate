# GenerateAsyncRoute Bug Reports

## GASYNC-013: Unexpected exceptions were collapsed into generic copy

- Date: 2026-03-27
- Status: Fixed in working tree
- Spec ID: `GASYNC-013`
- Classification: `A. Implementation Bug`
- Affected file: `app/api/generate-async/handler.ts`

### Summary

`postGenerateAsyncRoute` was returning a generic localized failure message for unexpected exceptions instead of preserving `Error.message` when available.

### Expected

- HTTP 500 is returned for unexpected exceptions.
- If the thrown value is an `Error`, the response body returns `error.message`.
- If the thrown value is not an `Error`, the response body returns `Internal server error`.

### Actual

- The catch path returned `copy.generateAsyncFailed` for all unexpected failures.
- This hid the underlying exception message and violated the response contract defined by `GASYNC-013`.

### Root Cause

- The catch block used generic route copy instead of branching on the thrown value type.
- Locale/copy resolution happened before the `try` block, so failures in that path would not follow the standardized unexpected-error handling path.

### Fix

- Moved `getGenerationRouteCopy(getRouteLocale(request))` inside the `try` block.
- Changed the catch response to:
  - `error.message` when `error instanceof Error`
  - `"Internal server error"` for non-`Error` throws

### Verification

- `npx jest tests/integration/api/generate-async-route.test.ts --runInBand`
- `npm test -- --runInBand`
