# AI Coordinate Next.js テスト計画書

**バージョン**: 2.0  
**作成日**: 2026-03-07  
**最終更新**: 2026-03-07

---

## 目次

1. [概要](#1-概要)
2. [テスト戦略](#2-テスト戦略)
3. [テスト対象一覧](#3-テスト対象一覧)
4. [実装前の準備作業](#4-実装前の準備作業)
5. [テスト実装フロー](#5-テスト実装フロー)
6. [テスト記述規則](#6-テスト記述規則)
7. [仕様フォーマット（EARS形式）](#7-仕様フォーマットears形式)
8. [AIスキルの使い方](#8-aiスキルの使い方)
9. [CI/CD設定](#9-cicd設定)
10. [付録](#付録)

---

## 1. 概要

### 1.1 目的

本計画書は、`ai_coordinate`（Next.js App Router）に対する実行可能なテスト戦略を定義する。  
目的は以下の3点。

- リリース前に回帰を検出する
- 仕様をEARS形式で明文化し、テストと整合させる
- 重要APIと主要ユーザーフローを優先的に守る

### 1.2 スコープ

| レイヤー | テスト種別 | 対象 |
|---|---|---|
| Server Utility | Unit | `features/*/lib`, `lib/*` の純粋関数・変換処理 |
| React Component | Unit | `features/*/components` の Client/Synchronous Server Component |
| API Route / Server Action | Integration | `app/api/**/route.ts`、認証・課金・生成フロー |
| Page Flow | E2E | `app/(app)/**`, `app/posts/[id]/page.tsx`, `app/search/page.tsx` |

### 1.3 現状

| 指標 | 現在値 | 目標値 |
|---|---|---|
| Unit テストカバレッジ | 未整備（限定的） | 70%+ |
| Integration テストカバレッジ | 未整備（限定的） | Tier 1/2 API を100% |
| E2E カバー率 | 未整備 | 優先10フローを100% |

---

## 2. テスト戦略

### 2.1 テストアプローチ

Next.js公式ガイドの前提に合わせ、以下を採用する。

- Unit: Jest + React Testing Library
- Integration: Jest で Route Handler を直接検証
- E2E: Playwright

**重要方針**: `async` Server Components は Jest での検証に制約があるため、主要検証はE2Eで担保する。

| 対象 | 手法 | Assert対象 | Mock対象 |
|---|---|---|---|
| Utility | Pure Unit | 戻り値・例外・境界値 | なし |
| Component | UI Unit | 表示・イベント・状態遷移 | API呼び出し境界 |
| API Route | Integration | HTTP status / body / side effects | Supabase/Stripe/外部API |
| Async Server Componentを含む画面 | E2E | 画面遷移・主要操作完了 | 原則なし（外部はスタブ環境） |

### 2.2 パフォーマンス/設計ガイド（Vercel Best Practices適用）

本計画での設計判断は以下を優先する。

- `async-parallel`: 独立I/Oは `Promise.all` で並列化し、テストも並列結果を検証
- `server-serialization`: クライアントへ渡すデータ最小化（不要フィールドをテストで検出）
- `bundle-dynamic-imports`: 重いクライアント部品は分割し、表示遅延やフォールバックをテスト
- `rerender-derived-state-no-effect`: 派生状態はrender時に算出し、副作用依存を減らす

### 2.3 外部依存の境界設計

以下はモジュール境界で置き換え可能にし、Integration/E2Eの安定性を確保する。

| 外部依存 | 現在の主な実装箇所 | テストでの扱い |
|---|---|---|
| Supabase | `lib/supabase/*`, `features/*/lib/*` | module mock / test client |
| Stripe | `app/api/credits/checkout/route.ts`, `app/api/stripe/webhook/route.ts` | webhook fixture + signature検証 |
| Resend | `app/api/contact/route.ts` | module mock |
| GA4 / BigQuery | `features/analytics/lib/*` | repository層でスタブ |
| Nanobanana API | `features/generation/lib/nanobanana.ts` | HTTP client mock |

---

## 3. テスト対象一覧

### 3.1 優先度評価基準

| 評価軸 | 重み | 説明 |
|---|---|---|
| ビジネス影響 | 40% | 障害時の売上/継続率/問い合わせ影響 |
| 変更頻度 | 25% | 直近の改修頻度 |
| 複雑度 | 20% | 分岐数・依存数・非同期処理 |
| 検出難易度 | 15% | 手動検証で見逃しやすいか |

### 3.2 Tier 1: 最優先（スコア 90-100）

| # | 対象 | ファイル | スコア | 前提条件 |
|---|---|---|---|---|
| 1 | GenerateAsyncRoute | `app/api/generate-async/route.ts` | 98 | job status fixture整備 |
| 2 | PercoinService | `features/credits/lib/percoin-service.ts` | 96 | Stripe/Supabaseの境界分離 |

### 3.3 Tier 2: 高優先（スコア 75-89）

| # | 対象 | ファイル | スコア | 前提条件 |
|---|---|---|---|---|
| 5 | PostsRoute | `app/api/posts/route.ts` | 88 | 認証ユーザーfixture |
| 6 | NotificationsRoute | `app/api/notifications/route.ts` | 86 | unread/read更新fixture |
| 7 | AuthForm | `features/auth/components/AuthForm.tsx` | 84 | Auth client mock |
| 8 | GenerationForm | `features/generation/components/GenerationForm.tsx` | 82 | upload/generate API mock |
| 9 | PostDetail | `features/posts/components/PostDetail.tsx` | 80 | post/comment API mock |
| 10 | GA4DashboardData | `features/analytics/lib/get-ga4-dashboard-data.ts` | 78 | BigQuery client mock |

### 3.4 Tier 3: 中優先（スコア 60-74）

| # | 対象 | ファイル | スコア |
|---|---|---|---|
| 11 | ContactRoute | `app/api/contact/route.ts` | 72 |
| 12 | CreditsBalanceRoute | `app/api/credits/balance/route.ts` | 70 |
| 13 | BannerStorage | `features/banners/lib/banner-storage.ts` | 68 |
| 14 | NotificationBadge | `features/notifications/components/NotificationBadge.tsx` | 65 |
| 15 | MyPageServerApi | `features/my-page/lib/server-api.ts` | 64 |
| 16 | EventServerApi | `features/event/lib/server-api.ts` | 62 |
| 17 | UrlUtils | `lib/url-utils.ts` | 60 |

### 3.5 Tier 4-6: 標準〜低優先

詳細は付録A参照。

### 3.6 E2E テスト対象（上位10）

| # | 画面 | ファイル | 優先度 |
|---|---|---|---|
| E-1 | Coordinate Page | `app/(app)/coordinate/page.tsx` | 最優先 |
| E-2 | Login Page | `app/(app)/login/page.tsx` | 最優先 |
| E-3 | Signup Page | `app/(app)/signup/page.tsx` | 最優先 |
| E-4 | My Page | `app/(app)/my-page/page.tsx` | 最優先 |
| E-5 | Notifications Page | `app/(app)/notifications/page.tsx` | 高 |
| E-6 | Dashboard Page | `app/(app)/dashboard/page.tsx` | 高 |
| E-7 | Admin Page | `app/(app)/admin/page.tsx` | 高 |
| E-8 | Post Detail Page | `app/posts/[id]/page.tsx` | 高 |
| E-9 | Search Page | `app/search/page.tsx` | 高 |
| E-10 | Top Page | `app/page.tsx` | 高 |

---

## 4. 実装前の準備作業

### 4.1 テスト基盤の準備（Phase 0）

以下を先に整備する。

- `npm run test` / `npm run test:watch` / `npm run test:e2e` スクリプト
- Jest設定（Next.js向け）と `@testing-library/jest-dom`
- Playwright設定（`webServer` で `next dev` もしくは `next start`）
- 共通fixture / factory / mock helper

### 4.2 境界モジュールの明確化

外部依存への直接呼び出しを減らし、mock単位を統一する。

| 領域 | 優先境界 |
|---|---|
| 認証/DB | `lib/supabase/*` 経由に集約 |
| 課金 | Stripe呼び出しは `features/credits/lib/*` に集約 |
| 画像生成 | `features/generation/lib/nanobanana.ts` 経由に集約 |
| 通知/メール | Route内で直接SDKを呼ばず helper 関数化 |

### 4.3 追加するテスト用ディレクトリ（推奨）

```
tests/
├── unit/
│   ├── components/
│   └── lib/
├── integration/
│   └── api/
├── e2e/
└── helpers/
    ├── fixtures/
    ├── factories/
    └── mocks/
```

---

## 5. テスト実装フロー

### 5.1 全体フロー

```
Step 1: 対象選定（/test-checklist）
    │
    ▼
Step 2: 依存チェック（/test-flow）
    │
    ├── 依存準備済み → Step 4 へ
    │
    └── 依存未準備 ↓
            ▼
Step 3: 境界整備
    │
    │  3a. 挙動固定テスト（/char-test）
    │  3b. SDK/外部APIの境界抽出（/interface-create）
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
    └── Step 6.5 へループ
            ▼
Step 8: 仕様カバレッジ検証（/spec-verify）
    │
    ▼
Step 9: 進捗更新（/test-checklist complete）
```

### 5.2 完了判定

対象を完了扱いにする条件:

- 対象テストファイルが存在
- CI想定コマンドでパス
- 対応specが存在
- 既知失敗が `test-fixing` でクローズ済み

---

## 6. テスト記述規則

### 6.1 Unit

- 1テスト1責務
- DOM断片ではなくユーザー観点のrole/label中心
- 実装詳細（内部stateやprivate関数）に依存しない

### 6.2 Integration（API）

- `NextRequest` を使いroute handlerを直接実行
- status/body/副作用（DB更新、enqueueなど）を検証
- 外部SDKはmodule mockで制御

### 6.3 E2E

- 主要ユーザージャーニーのみを厳選
- 失敗時にスクリーンショット/traceを保存
- flaky対策として待機条件はURLとroleで明示

---

## 7. 仕様フォーマット（EARS形式）

仕様は `docs/specs/**` に保存する。

```yaml
id: GEN-API-001
feature: generate
component: GenerateAsyncRoute
requirements:
  - when: "有効な認証済みユーザーが生成APIを呼び出したとき"
    shall: "APIは200を返し、job_idを含むJSONを返す"
  - while: "外部生成APIがタイムアウトしている間"
    shall: "APIは202を返し、再試行可能な状態を返す"
  - if: "入力スキーマが不正な場合"
    shall: "APIは400を返し、エラー詳細を返す"
```

---

## 8. AIスキルの使い方

### 8.1 スキル対応表

| スキル | 目的 |
|---|---|
| `/test-checklist` | 全体進捗の可視化と次ターゲット選定 |
| `/test-flow` | 対象単位の状態判定と次アクション提案 |
| `/char-test` | 境界整備前の既存挙動固定 |
| `/interface-create` | 外部依存の境界抽出 |
| `/spec-extract` | EARS仕様の初期抽出 |
| `/spec-write` | 仕様の曖昧さ解消 |
| `/test-generate` | 仕様ベースのテスト生成 |
| `/test-reviewing` | 実行結果レビューと分類 |
| `/test-fixing` | 失敗原因別の修正 |
| `/spec-verify` | 仕様とテストの整合確認 |

### 8.2 /test-flow の使い方

```bash
# 次の推奨対象
/test-flow

# 特定対象
/test-flow GenerateAsyncRoute

# 進捗サマリー
/test-flow --status
```

### 8.3 /char-test の使い方

```bash
/char-test GenerateAsyncRoute
```

### 8.4 /interface-create の使い方

```bash
/interface-create GenerationProvider
```

### 8.5 /spec-extract の使い方

```bash
/spec-extract GenerateAsyncRoute
```

### 8.6 /spec-verify の使い方

```bash
/spec-verify GenerateAsyncRoute
```

### 8.7 /test-reviewing の使い方

```bash
/test-reviewing GenerateAsyncRoute
```

### 8.8 /test-fixing の使い方

```bash
/test-fixing
```

---

## 9. CI/CD設定

推奨パイプライン順序:

1. `npm run lint`
2. `npm run test`（Unit + Integration）
3. `npm run build -- --webpack`
4. `npm run test:e2e`（main or pre-release branch）

最低限の scripts 例:

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:e2e": "playwright test"
  }
}
```

---

## 付録

### 付録A: Tier 4-6 候補（抜粋）

- `app/api/hello/route.ts`
- `app/api/revalidate/home/route.ts`
- `features/posts/lib/date-utils.ts`
- `features/tutorial/lib/tour-steps.ts`
- `features/challenges/lib/streak-utils.ts`
- `features/event/lib/url-validation.ts`
- `features/materials-images/lib/get-material-images.ts`
- `features/referral/lib/api.ts`
- `features/users/components/FollowButton.tsx`
- `components/NavigationBar.tsx`

### 付録B: 進捗管理データ

- `docs/test-progress.yaml`
