---
name: test-fixing
description: Guides proper test failure resolution based on specifications. Prevents anti-patterns like modifying tests just to pass. Use when tests fail, fixing test errors, or debugging test issues.
disable-model-invocation: false
---

# Test Fixing

Guides proper test failure resolution to prevent the anti-pattern of "fixing tests just to make them pass" without understanding the root cause.

## Anti-Patterns to Avoid

| Pattern | Problem |
|---------|---------|
| Changing expected values to match implementation | Misses specification violations |
| Modifying mocks to "just work" | Doesn't verify actual behavior |
| Adding `skip` to failing tests | Defers problems instead of solving |
| Fixing based on error message alone | Doesn't understand root cause |

## Workflow

### Step 1: Identify Failing Tests

Run tests and capture output:

```bash
flutter test <test_file> --no-pub 2>&1 | head -100
```

### Step 2: Classify Failure Cause (MANDATORY)

**Classify BEFORE making any changes.**

| Classification | Description | What to Fix |
|----------------|-------------|-------------|
| **A. Implementation Bug** | Implementation violates specification | Implementation code |
| **B. Test Error** | Test doesn't reflect specification correctly | Test code |
| **C. Mock Configuration Issue** | Wrong return value, type, or method name | Test mock setup |
| **D. Test Infrastructure Issue** | Mockito dummy values, imports, etc. | Test setup |
| **E. Specification Ambiguity** | Spec is missing or contradictory | Update specification |

### Step 3: Cross-Reference with Specification (MANDATORY)

Before fixing, ALWAYS:

1. **Read the EARS specification**
   ```
   docs/specs/{feature}/{class}_spec.yaml
   ```

2. **Identify the spec ID** from test tags (e.g., `LVREPO-001`)

3. **Verify expected behavior**
   - `preconditions`: What must be true before
   - `postconditions.success`: Expected success outcome
   - `postconditions.error`: Expected error outcome

4. **Compare with implementation**
   - Implementation matches spec → Fix test
   - Implementation doesn't match spec → Report as bug (don't fix test)

### Step 4: Document Fix Reason (MANDATORY)

Before making changes, state:

```markdown
## Test Fix Reason

**Test**: `methodName_GivenScenario_ShouldResult`
**Spec ID**: SPEC-XXX
**Classification**: B. Test Error

**Problem**:
[What is wrong]

**Spec Verification**:
[What the spec says]

**Fix**:
[What will be changed]

**Why this fix is correct**:
[Justification based on spec/implementation]
```

### Step 5: Apply Fix by Classification

#### A. Implementation Bug

**DO NOT modify the test.** Create a bug report instead:

```
docs/specs/{feature}/{class}_bugs.md
```

#### B. Test Error

Fix test to match specification. Add comment explaining the fix:

```dart
test('methodName_GivenScenario_ShouldResult', () async {
  // Fixed: Changed mock target to apiAccountsUserIdCheckPost
  // Reason: Implementation calls apiAccountsUserIdCheckPost (L984)
  when(mockApi.apiAccountsUserIdCheckPost(...)).thenAnswer(...);
});
```

#### C. Mock Configuration Issue

1. Check which API method the implementation calls
2. Update mock to correct method
3. Verify return type matches (`Response<Account>` vs `Response<dynamic>`)

#### D. Test Infrastructure Issue

Common issues and solutions:

| Issue | Solution |
|-------|----------|
| `MissingDummyValueError` | Add `provideDummy`/`provideDummyBuilder` in setUpAll |
| `ArgumentMatcher` error | Use `param: anyNamed('param')` not `anyNamed('param')` |
| Missing imports | Import required enums/models |
| Type mismatch | Check generated model class structure |

**MissingDummyValueError fix:**

```dart
setUpAll(() {
  provideDummy<Response<Account>>(
    Response(http.Response('', 200), null),
  );
  provideDummy<Response<dynamic>>(
    Response(http.Response('', 200), null),
  );
});
```

**ArgumentMatcher fix:**

```dart
// WRONG
when(mockApi.method(accountId: anyNamed('accountId')))

// CORRECT
when(mockApi.method(accountId: any)).thenAnswer(...);
```

**HttpException testing:**

```dart
// HttpErrorHandlingInterceptor converts 401 to HttpException
final response = Response(http.Response('', 401), null);
when(mockApi.someMethod()).thenThrow(HttpException(response));
```

#### E. Specification Ambiguity

1. Update specification to clarify
2. Then fix test to match updated spec
3. If implementation differs from clarified spec, create bug report

### Step 6: Record in Serena (MANDATORY)

Add fix to `.serena/memories/test_implementation_issues.md`:

```markdown
### Fix: SPEC-XXX - methodName test

**Date**: YYYY-MM-DD
**Classification**: B. Test Error
**Fix**: Changed mock target to apiAccountsUserIdCheckPost
**Reason**: Implementation calls different API than test was mocking
```

### Step 7: Re-run Tests

```bash
flutter test <test_file> --no-pub
```

## Pre-Fix Checklist

- [ ] Classified failure cause (A/B/C/D/E)
- [ ] Read relevant specification section
- [ ] Checked implementation code
- [ ] Documented fix reason
- [ ] Fix is "to match spec" NOT "to pass test"

## Post-Fix Checklist

- [ ] Tests pass
- [ ] Fix reason recorded (comment or Serena)
- [ ] Bug report created (if implementation bug)
- [ ] No `skip` added to avoid fixing

## References

- EARS Specifications: `docs/specs/{feature}/{class}_spec.yaml`
- Bug Reports: `docs/specs/{feature}/{class}_bugs.md`
- Issue Tracking: `.serena/memories/test_implementation_issues.md`
- Test Plan: `docs/TEST_PLAN.md`
