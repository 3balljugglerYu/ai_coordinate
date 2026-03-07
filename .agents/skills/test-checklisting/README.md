# Test Checklisting スキル（Next.js）

## 概要

Next.js向けのテスト実装進捗を管理するスキルです。  
`docs/TEST_PLAN.md` の Tier 1-3 と E2E優先度に基づいて、次の実装対象を推奨します。

## 使用方法

```bash
# 進捗確認
/test-checklist

# 完了マーク
/test-checklist complete GenerateRoute

# 作業開始
/test-checklist start GenerateRoute
```

## 出力例

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

## test-progress.yaml の構造

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

## ステータス

- `pending`
- `char_test_created`
- `interface_created`
- `spec_extracted`
- `test_generated`
- `completed`

進捗集計時:

- Completed: `completed`
- In Progress: `char_test_created/interface_created/spec_extracted/test_generated` または `pending + started_at`
- Pending: `pending`（`started_at` なし）

## 推奨ロジック

1. In Progress を先に完了する
2. 完了していない最小Tierから、高スコア順で着手する
3. Tier 1-3 完了後は `widgets.priority` が小さい順に着手する
4. 依存前提（外部境界・fixture）を確認する

## 関連ファイル

- `docs/TEST_PLAN.md`
- `docs/test-progress.yaml`
- `docs/specs/`

## 関連スキル

- `/test-flow`
- `/char-test`
- `/interface-create`
- `/spec-extract`
- `/spec-write`
- `/test-generate`
- `/test-reviewing`
- `/test-fixing`
- `/spec-verify`

## 参考資料

- [docs/TEST_PLAN.md](../../../docs/TEST_PLAN.md)
- [docs/specs/](../../../docs/specs/)
