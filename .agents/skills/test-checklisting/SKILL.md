---
name: test-checklisting
description: Manages Next.js test implementation progress tracking. Use when checking progress, finding next test targets, or reviewing completion status by Tier priority.
disable-model-invocation: false
---

# Test Checklisting (Next.js)

Tracks test implementation progress based on `docs/TEST_PLAN.md` Tier 1-3 targets and E2E page priorities.

## Workflow

### Step 1: Load Progress Data

Read `docs/test-progress.yaml`.

Expected structure:

```yaml
version: "2.0"
last_updated: "2026-03-07"

tier1:
  GenerateRoute:
    status: pending
    score: 100
    file: app/api/generate/route.ts
    spec_file: docs/specs/api/generate_route_spec.yaml
    test_file: tests/integration/api/generate-route.test.ts

tier2: {}
tier3: {}

widgets:
  CoordinatePage:
    status: pending
    priority: 1
    file: app/(app)/coordinate/page.tsx
    e2e_test: tests/e2e/coordinate.spec.ts

summary:
  tier1: { total: 4, completed: 0, percentage: 0 }
  tier2: { total: 6, completed: 0, percentage: 0 }
  tier3: { total: 7, completed: 0, percentage: 0 }
  widgets: { total: 10, completed: 0, percentage: 0 }
  overall: { total: 27, completed: 0, percentage: 0 }
```

Status lifecycle:

- `pending`
- `char_test_created`
- `interface_created`
- `spec_extracted`
- `test_generated`
- `completed`

For reporting:

- **Completed**: `status == completed`
- **In Progress**: `char_test_created/interface_created/spec_extracted/test_generated`, or `pending` with `started_at`
- **Pending**: `status == pending` and no `started_at`

### Step 2: Cross-Reference with TEST_PLAN.md

Compare against `docs/TEST_PLAN.md` sections 3.2-3.6.

Tier references:

- Tier 1: GenerateRoute, GenerateAsyncRoute, PercoinService, GenerationService
- Tier 2: PostsRoute, NotificationsRoute, AuthForm, GenerationForm, PostDetail, GA4DashboardData
- Tier 3: ContactRoute, CreditsBalanceRoute, BannerStorage, NotificationBadge, MyPageServerApi, EventServerApi, UrlUtils
- Widgets Top 10: CoordinatePage ... TopPage

### Step 3: Generate Progress Report

Output format:

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

### Next Recommended Target

**GenerateRoute** (Tier 1, Score 100)
- Status: Pending
- File: `app/api/generate/route.ts`
- Next action: `/char-test GenerateRoute`
```

### Step 4: Recommend Next Target

Priority logic:

1. Complete any in-progress item first
2. Start highest-score pending item in the lowest incomplete tier (1 -> 2 -> 3)
3. If Tier 1-3 complete, start highest-priority pending widget
4. Check prerequisites before recommending

## Commands

### View Progress

```bash
/test-checklist
```

### Mark Complete

```bash
/test-checklist complete GenerateRoute
```

### Start Target

```bash
/test-checklist start GenerateRoute
```

Set `started_at` timestamp on the target entry. Do not overwrite existing workflow status.

## Related Files

- `docs/TEST_PLAN.md`
- `docs/test-progress.yaml`
- `/test-flow`

## Checklist

Before marking complete:

- [ ] Test file exists in expected location
- [ ] Relevant tests pass (`npm run test` or targeted command)
- [ ] Spec file exists (`docs/specs/...`)
- [ ] Regressions confirmed as none in reviewed scope
