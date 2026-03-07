# spec-writing スキル

## 概要

対話的にEARS形式の仕様を明確化・精緻化するスキルです。

既存の仕様ファイルを読み込み、各仕様について質問形式で以下の点を確認します：
- 事前条件（Preconditions）: 追加の条件はあるか？
- 事後条件（Postconditions）: すべての結果が文書化されているか？
- エッジケース: 境界条件での挙動は？
- エラーハンドリング: すべてのエラーケースがカバーされているか？

## 使用方法

```bash
/spec-write クラス名
```

### 例

```bash
# AuthViewModelの仕様を精緻化
/spec-write AuthViewModel

# EventViewModelの仕様を精緻化
/spec-write EventViewModel
```

## ワークフロー

```
Step 1: クラス名を引数として受け取る
    │
    ▼
Step 2: 既存の仕様ファイルを読み込む
    │   docs/specs/{feature}/{Class}_spec.yaml
    │
    ▼
Step 3: 各仕様について対話的に質問
    │
    ├── 事前条件の確認
    │   - 認証要件はあるか？
    │   - 状態要件はあるか？
    │   - データ要件はあるか？
    │
    ├── 事後条件の確認
    │   - 成功時の状態変更は？
    │   - エラー時の挙動は？
    │
    ├── エッジケースの確認
    │   - null/空の入力時は？
    │   - 境界値では？
    │   - 並行呼び出し時は？
    │
    └── エラーハンドリングの確認
        - どのようなエラーが発生しうるか？
        - 各エラーの対処方法は？
    │
    ▼
Step 4: 仕様ファイルを更新
    │
    ▼
Step 5: サマリーレポートを出力
```

## ファイル構成

```
.claude/skills/spec-writing/
├── SKILL.md    # スキル定義（英語）
└── README.md   # ドキュメント（日本語）
```

### 入力ファイル

```
docs/specs/{feature}/{Class}_spec.yaml
```

### 出力ファイル

```
docs/specs/{feature}/{Class}_spec.yaml  # 更新された仕様
```

## 仕様ファイルの形式

```yaml
metadata:
  class: AuthViewModel
  source: lib/ui/auth/auth_view_model.dart
  version: "1.0"
  created_at: "2025-01-30"

specifications:
  - id: AUTH-001
    method: signIn
    type: event-driven
    ears: |
      When signIn is invoked with valid credentials,
      the AuthViewModel shall authenticate the user
      and update isLoggedIn to true.
    preconditions:
      - User is not currently signed in
    postconditions:
      success:
        - isLoggedIn becomes true
        - account is populated
      error:
        - isLoggedIn remains false
    edge_cases:
      - description: Empty email
        expected: Return validation error
    test_cases:
      - signIn_GivenValidCredentials_ShouldSetLoggedInTrue
```

## ベストプラクティス

### 事前条件の記述

- 認証・認可の要件を明記する
- 必要な状態（初期化済み、非ビジー等）を明記する
- 入力データの要件を明記する

### 事後条件の記述

- 成功時と失敗時を分けて記述する
- 状態変更を明確に記述する
- 戻り値を明記する

### エッジケースの記述

- null/空の入力を必ず考慮する
- 境界値（最小値、最大値）を考慮する
- 並行呼び出しの挙動を考慮する

### EARS文の記述

| タイプ | 構文 |
|--------|------|
| イベント駆動 | When [trigger], the System shall [action] |
| 状態駆動 | While [state], the System shall [action] |
| 異常系 | If [error], then the System shall [action] |
| オプション | Where [feature], the System shall [action] |

## 関連スキル

| スキル | 目的 |
|--------|------|
| `/spec-extract` | コードから仕様を抽出 |
| `/test-generate` | 仕様からテストを生成 |
| `/spec-verify` | 仕様とテストの整合性を検証 |

## 参考資料

- docs/TEST_PLAN.md セクション 7.2 - 仕様ファイル形式
- docs/TEST_PLAN.md セクション 7.1 - EARS要件タイプ
- .claude/skills/spec-extracting/SKILL.md - 仕様抽出スキル
