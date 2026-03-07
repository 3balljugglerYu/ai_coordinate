---
name: testing-flow
description: Orchestrates the complete Next.js test implementation workflow. Use to guide through test creation steps, check dependencies, and determine the next action for any target.
disable-model-invocation: false
---

# Testing Flow (Next.js)

You are orchestrating the test implementation workflow for this Next.js repository.

## Workflow

### Step 1: Accept Input

Usage patterns:

```bash
# Get next recommended target
/test-flow

# Work on a specific target
/test-flow GenerateRoute

# Check overall progress
/test-flow --status
```

### Step 2: Determine Current State

For a given target (or recommended target), check the following in order:

#### 2.1 Check if target file exists

- Read the source file path from `docs/test-progress.yaml`
- If not found, report error and suggest alternatives from same tier

#### 2.2 Check Dependencies (Foundation/Boundary)

Required boundaries must exist before stable tests:

- Supabase client boundary
- Stripe boundary
- Resend/email boundary
- GA4/BigQuery boundary
- Nanobanana/image generation boundary

If the target directly calls external SDK/API without abstraction, flag as dependency risk.

#### 2.3 Check Characterization/Baseline Test

If boundary refactor is required but baseline behavior is not captured:

- Check for existing baseline test in `tests/characterization/**`
- If no baseline exists, recommend `/char-test {Target}`

#### 2.4 Check Spec File

- Location: `docs/specs/{domain}/{target}_spec.yaml`
- If not found, recommend `/spec-extract {Target}`

#### 2.5 Check Test File

Use target type to determine expected location:

| Target Type | Test Location |
|---|---|
| API Route | `tests/integration/api/{target}.test.ts` |
| Component | `tests/unit/components/{target}.test.tsx` |
| Server Utility | `tests/unit/lib/{target}.test.ts` |
| E2E Page | `tests/e2e/{target}.spec.ts` |

#### 2.6 Check Test Review Status

If test file exists:

- Run or reference latest test execution result
- Check for recent `/test-reviewing` output
- If failures exist, ensure issues are categorized before fixing

### Step 3: Determine Next Action

Based on current state, recommend ONE action:

| State | Next Action |
|---|---|
| No target selected | `/test-checklist` to select next target |
| External dependency not abstracted | `/interface-create {BoundaryName}` |
| Baseline behavior not captured before boundary change | `/char-test {Target}` |
| Boundary ready, no spec | `/spec-extract {Target}` |
| Spec exists, needs refinement | `/spec-write {Target}` |
| Spec ready, no tests | `/test-generate {Target}` |
| Tests generated, not reviewed | `/test-reviewing {Target}` |
| Review shows failures | `/test-fixing` |
| Review passes | `/spec-verify {Target}` |
| All complete | `/test-checklist complete {Target}` |

### Step 4: Output Status Report

Output format:

```markdown
## {TargetName} Test Implementation Status

### Current State
| Component | Status | Location |
|---|---|---|
| Source File | Found | app/api/generate/route.ts |
| Dependencies | 1 boundary needed | NanobananaClient |
| Baseline Test | Not created | - |
| Spec File | Not created | - |
| Test File | Not created | - |

### Dependency Analysis
- **NanobananaClient**: Not found
  - Required for: image generation request
  - Wraps: external generation API

### Next Action

**Run `/char-test GenerateRoute`**

Reason: Before extracting SDK boundary, capture current behavior to prevent accidental behavior drift.

After completing this step, run `/test-flow GenerateRoute` again.
```

## Status Flag (--status)

When invoked with `--status`, delegate to `/test-checklist` to show overall progress.

```bash
/test-flow --status
```

Expected summary format:

```markdown
## Test Implementation Progress

### Summary
| Tier | Total | Completed | In Progress | Pending | Progress |
|---|---|---|---|---|---|
| Tier 1 | 4 | 0 | 0 | 4 | 0% |
| Tier 2 | 6 | 0 | 0 | 6 | 0% |
| Tier 3 | 7 | 0 | 0 | 7 | 0% |
| Widgets | 10 | 0 | 0 | 10 | 0% |
| **Total** | **27** | **0** | **0** | **27** | **0%** |
```

## Workflow Diagram (from TEST_PLAN.md Section 5.1)

```
Step 1: Target Selection (/test-checklist)
    │
    ▼
Step 2: Dependency Check (/test-flow)
    │
    ├── Dependencies ready → Step 4
    │
    └── Dependencies missing ↓
            ▼
Step 3: Boundary Preparation
    │
    │  3a. Characterization (/char-test)
    │  3b. Extract boundary (/interface-create)
    │
    ▼
Step 4: Spec Extraction (/spec-extract)
    │
    ▼
Step 5: Spec Review (/spec-write)
    │
    ▼
Step 6: Test Generation (/test-generate)
    │
    ▼
Step 6.5: Test Review (/test-reviewing)
    │
    ├── All tests pass → Step 8
    └── Failures → Step 7
            ▼
Step 7: Test Fixing (/test-fixing)
    │
    └── Loop back to Step 6.5
            ▼
Step 8: Coverage Verification (/spec-verify)
    │
    ▼
Step 9: Progress Update (/test-checklist complete)
```

## External Dependency Mapping

| External Dependency | Recommended Boundary |
|---|---|
| Supabase client | `*Repository` / `*ServerApi` module |
| Stripe SDK | `*BillingService` / credits service module |
| Resend SDK | `mail-client` helper module |
| GA4/BigQuery | analytics data provider module |
| Image generation API | `nanobanana client` module |

## Checklist Before Completion

- [ ] Target source file located
- [ ] External dependencies identified
- [ ] Boundary risks flagged
- [ ] Spec/test presence accurately determined
- [ ] Single next action recommended
- [ ] Clear follow-up command provided

## References

- `docs/TEST_PLAN.md` Section 5.1: Test Implementation Flow
- `docs/TEST_PLAN.md` Section 8.2: /test-flow usage
- `docs/TEST_PLAN.md` Section 3.2-3.6: Tier priority lists
- `docs/test-progress.yaml`: Progress tracking data
