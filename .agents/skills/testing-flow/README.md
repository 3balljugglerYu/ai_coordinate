# Testing Flow スキル（Next.js）

## 概要

Next.jsプロジェクト向けに、テスト実装フロー全体をオーケストレートするスキルです。  
対象選定から完了確認まで、次にやるべき1アクションを明確化します。

`docs/TEST_PLAN.md` のセクション 5.1 / 8.2 に準拠します。

## 使用方法

### 起動方法

```bash
# 次の推奨対象を取得
/test-flow

# 特定ターゲットに対して実行
/test-flow GenerateRoute

# 全体進捗を確認
/test-flow --status
```

## 出力例

```markdown
## GenerateRoute Test Implementation Status

### Current State
| Component | Status | Location |
|---|---|---|
| Source File | Found | app/api/generate/route.ts |
| Dependencies | 1 boundary needed | NanobananaClient |
| Baseline Test | Not created | - |
| Spec File | Not created | - |
| Test File | Not created | - |

### Next Action

**Run `/char-test GenerateRoute`**

Reason: 境界抽出の前に現状挙動を固定し、回帰を防ぐため。
```

## ワークフロー

```text
Step 1: 対象選定（/test-checklist）
    │
    ▼
Step 2: 依存チェック（/test-flow）
    │
    ├── 依存準備済み → Step 4
    │
    └── 依存未準備 ↓
            ▼
Step 3: 境界準備
    │
    │  3a. 特性テスト（/char-test）
    │  3b. 境界抽出（/interface-create）
    │
    ▼
Step 4: 仕様抽出（/spec-extract）
    │
    ▼
Step 5: 仕様レビュー（/spec-write）
    │
    ▼
Step 6: テスト生成（/test-generate）
    │
    ▼
Step 6.5: テストレビュー（/test-reviewing）
    │
    ├── 全件パス → Step 8
    └── 失敗あり → Step 7
            ▼
Step 7: テスト修正（/test-fixing）
    │
    └── Step 6.5へループ
            ▼
Step 8: 整合性検証（/spec-verify）
    │
    ▼
Step 9: 進捗更新（/test-checklist complete）
```

## 状態判定と次アクション

| 状態 | 次のアクション |
|---|---|
| 対象未選定 | `/test-checklist` で対象選択 |
| 外部依存の境界未整備 | `/interface-create {BoundaryName}` |
| 境界変更前の挙動固定が未実施 | `/char-test {Target}` |
| 仕様なし | `/spec-extract {Target}` |
| 仕様レビュー必要 | `/spec-write {Target}` |
| テスト未生成 | `/test-generate {Target}` |
| テスト未レビュー | `/test-reviewing {Target}` |
| テスト失敗あり | `/test-fixing` |
| テストレビュー通過 | `/spec-verify {Target}` |
| すべて完了 | `/test-checklist complete {Target}` |

## 外部依存マッピング（Next.js）

| 外部依存 | 推奨境界 |
|---|---|
| Supabase | repository / server-api module |
| Stripe | billing service module |
| Resend | mail client module |
| GA4 / BigQuery | analytics provider module |
| 画像生成API | nanobanana client module |

## テストファイル配置（推奨）

| ターゲット種別 | テストファイル場所 |
|---|---|
| API Route | `tests/integration/api/{target}.test.ts` |
| Component | `tests/unit/components/{target}.test.tsx` |
| Server Utility | `tests/unit/lib/{target}.test.ts` |
| E2E Page | `tests/e2e/{target}.spec.ts` |

## ファイル構成

```text
.agents/skills/testing-flow/
├── SKILL.md
└── README.md
```

## 関連スキル

| スキル | 目的 |
|---|---|
| `/test-checklist` | 進捗管理、次の対象推奨 |
| `/char-test` | 既存挙動の固定 |
| `/interface-create` | 外部依存境界の抽出 |
| `/spec-extract` | 仕様抽出 |
| `/spec-write` | 仕様精緻化 |
| `/test-generate` | テスト生成 |
| `/test-reviewing` | テストレビュー |
| `/test-fixing` | 失敗修正 |
| `/spec-verify` | 仕様整合性確認 |

## 参考資料

- [docs/TEST_PLAN.md](../../../docs/TEST_PLAN.md) セクション 5.1: テスト実装フロー
- [docs/TEST_PLAN.md](../../../docs/TEST_PLAN.md) セクション 8.2: /test-flow の使い方
- [docs/TEST_PLAN.md](../../../docs/TEST_PLAN.md) セクション 3.2-3.6: 優先度リスト
- [docs/test-progress.yaml](../../../docs/test-progress.yaml): 進捗追跡データ
