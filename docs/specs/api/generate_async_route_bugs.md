# GenerateAsyncRoute Bug Reports

## GASYNC-013: Unexpected exceptions exposed internal error messages to clients

- Date: 2026-03-27
- Status: Fixed in working tree
- Spec ID: `GASYNC-013`
- Classification: `A. Implementation Bug`
- Affected file: `app/api/generate-async/handler.ts`

### Summary

`postGenerateAsyncRoute` was returning `Error.message` for unexpected exceptions, which could leak internal authentication, database, or dependency failure details to end users.

### Expected

- HTTP 500 is returned for unexpected exceptions.
- The response body returns the locale-specific generic failure copy.
- The response body includes `errorCode: GENERATION_ASYNC_FAILED`.
- The response body includes a `requestId` for log correlation.

### Actual

- The catch path returned raw `error.message` for `Error` throws.
- This exposed internal runtime failure details directly to clients and UI toasts.

### Root Cause

- The catch block treated unexpected runtime exceptions as user-displayable copy.
- The route had no correlation identifier to let operators inspect logs without exposing internals.

### Fix

- Changed the catch response to always return locale-specific `generateAsyncFailed`.
- Added `requestId` to the HTTP 500 response for log correlation.
- Kept detailed exception information in server logs only.

### Verification

- `npx jest tests/integration/api/generate-async-route.test.ts --runInBand`
- `npm test -- --runInBand`
