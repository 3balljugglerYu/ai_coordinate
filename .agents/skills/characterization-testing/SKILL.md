---
name: characterization-testing
description: Creates characterization tests to capture existing behavior before refactoring. Use when writing char tests, creating snapshot tests, preparing for refactoring, or preserving legacy code behavior.
disable-model-invocation: false
---

# Characterization Testing

You are helping the user create characterization tests that capture the current behavior of existing code before refactoring. This ensures that refactoring does not introduce regressions.

## What is Characterization Testing?

Characterization tests (also known as "Golden Master Tests" or "Snapshot Tests") record the current behavior of code, not necessarily the "correct" behavior. For legacy code with unclear specifications, the current behavior becomes the specification.

**Reference**: See `docs/TEST_PLAN.md` sections 4.3 and 8.3 for detailed patterns.

## Workflow

### Step 1: Accept Target

Accept the target name as argument, e.g. `/char-test GenerateAsyncRoute`.

### Step 2: Read and Analyze Target

1. Read the target file (look it up in `docs/test-progress.yaml` under `file:`)
2. List its exported functions or route handlers and their signatures
3. Note dependencies (Supabase clients, `lib/auth`, `lib/env`, external APIs, `fetch`)

### Step 3: Identify Input Patterns

For each exported function or handler, identify test scenarios:

| Pattern | Description | Example |
|---------|-------------|---------|
| Normal | Valid inputs | `POST` with a valid body |
| Error | Invalid/malformed inputs | `POST` with an empty `prompt` |
| Boundary | Edge cases | Credit balance just below the cost |
| Auth | Missing or wrong user | `getUser()` returns `null` |

### Step 4: Generate Test Code

Use `tests/characterization/api/generate-async-route.char.test.ts` as the reference for structure and style. Read it before writing a new file.

- Mock dependencies with `jest.mock("@/...")` at the top of the file.
- Wrap the file in `describe("Characterization: {Target}")` and name each test `CHAR-{PREFIX}-{NNN}: {observed behavior}`.
- Record the observed output with `toMatchInlineSnapshot()` (or `toMatchSnapshot()` for large payloads). Snapshot the current behavior as-is, even where it looks wrong.

### Step 5: Output Location

| Type | Output Path |
|------|-------------|
| API Route | `tests/characterization/api/{target}.char.test.ts` |
| Feature module | `tests/characterization/{feature}/{target}.char.test.ts` |
| Component | `tests/characterization/components/{target}.char.test.tsx` |
| Snapshots | `__snapshots__/` next to the test (Jest `toMatchSnapshot`) |

### Step 6: Provide Next Steps

After generating the test file, instruct the user:

```bash
# 1. Run the test (first run writes the snapshot)
npx jest tests/characterization/{area}/

# 2. Review the generated __snapshots__/*.snap
# 3. If correct, commit the test and its snapshot
git add tests/characterization/{area}/
```

### Step 7: Update Progress Tracker

**IMPORTANT**: After creating the characterization test file, you MUST update `docs/test-progress.yaml`:

1. Find the target class entry in the appropriate tier (tier1, tier2, tier3)
2. Update the following fields:
   - `status`: Change from `pending` to `char_test_created`
   - `char_test`: Set to the test file path

Example update:
```yaml
# Before
GenerateAsyncRoute:
  status: pending
  char_test: null

# After
GenerateAsyncRoute:
  status: char_test_created
  char_test: tests/characterization/api/generate-async-route.char.test.ts
```

This step is mandatory. Do not skip it.

## Deterministic Testing Techniques

Characterization tests must produce the same output for the same input. Handle non-deterministic elements:

| Element | Solution |
|---------|----------|
| `Date.now()` / `new Date()` | `jest.useFakeTimers().setSystemTime(...)` |
| Random values / UUIDs | Mock the generator (`jest.spyOn(crypto, "randomUUID")`) |
| Network responses | Replace `global.fetch` with a `jest.fn()` |
| Supabase calls | Mock `createClient` / `createAdminClient` with a query-builder stub |
| Console noise | `jest.spyOn(console, "error").mockImplementation(() => {})` |

## Post-Refactoring Verification

After completing the refactoring (e.g., `/interface-create`):

```bash
# Run characterization tests
npx jest tests/characterization/{area}/

# Expected results:
# - No diff = Refactoring successful
# - Diff found = Behavior changed, review and either:
#   - Fix the refactoring
#   - Approve as intentional change
```

## Checklist

Before completing characterization test generation:

- [ ] All public methods identified
- [ ] Normal, error, boundary patterns covered
- [ ] Non-deterministic elements mocked
- [ ] Test file created at correct path
- [ ] Every dependency mocked with `jest.mock`
- [ ] Test names follow `CHAR-{PREFIX}-{NNN}: ...`
- [ ] User instructed on next steps (review and commit snapshots)
- [ ] **docs/test-progress.yaml updated** (status: char_test_created, char_test: path)

## References

- `docs/TEST_PLAN.md` section 4.3 - Characterization Test Implementation
- `docs/TEST_PLAN.md` section 8.3 - /char-test Skill Usage
- `tests/characterization/api/generate-async-route.char.test.ts` - Reference characterization test
- [Jest snapshot testing](https://jestjs.io/docs/snapshot-testing)
