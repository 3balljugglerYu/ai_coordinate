# Spec Extracting

コードからEARS形式の仕様を抽出するスキル。

## 概要

このスキルは、既存のFlutter/Dartコードを分析し、EARS（Easy Approach to Requirements Syntax）形式の仕様を自動抽出します。抽出された仕様は、テスト生成の基盤として使用できます。

### 主な機能

- クラスのpublicメソッドを分析
- 状態プロパティを特定
- EARS形式の要件テキストを生成
- テストケース候補を提案

## 使用方法

```bash
/spec-extract クラス名
```

### 例

```bash
# ViewModelの仕様抽出
/spec-extract AuthViewModel

# Repositoryの仕様抽出
/spec-extract LiveViewRepository

# Serviceの仕様抽出
/spec-extract AnalyticsService
```

## 出力先

```
docs/specs/{feature}/{class}_spec.yaml
```

### 出力例

```yaml
# docs/specs/auth/auth_view_model_spec.yaml

metadata:
  class: AuthViewModel
  source: lib/ui/auth/auth_view_model.dart
  version: "1.0"
  created_at: "2025-01-30"

dependencies:
  repositories:
    - LiveViewRepository
  services:
    - AuthService (via IAuthService)
  external:
    - None (wrapped by IAuthService)

state_properties:
  - name: isBusy
    type: bool
    default: false
  - name: isLoggedIn
    type: bool
    default: false

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
    test_cases:
      - signIn_GivenValidCredentials_ShouldSetLoggedInTrue
      - signIn_GivenInvalidPassword_ShouldReturnError
```

## EARSタイプ説明

EARS（Easy Approach to Requirements Syntax）は、要件を明確に記述するための構文体系です。

### 1. Ubiquitous（普遍的）

常に成り立つ不変条件を記述します。

```
The system shall [action]
```

**例:** `The system shall encrypt all stored passwords`

### 2. Event-driven（イベント駆動）

特定のイベント発生時の動作を記述します。

```
When [trigger], shall [action]
```

**例:** `When signIn is invoked, shall authenticate the user`

### 3. State-driven（状態駆動）

特定の状態における動作を記述します。

```
While [state], shall [action]
```

**例:** `While logged in, shall refresh session token periodically`

### 4. Unwanted（望ましくない状況）

エラーや異常時の動作を記述します。

```
If [error], then shall [action]
```

**例:** `If network error occurs, then shall show error message`

### 5. Optional（オプション）

オプション機能の動作を記述します。

```
Where [feature], shall [action]
```

**例:** `Where biometric login is enabled, shall use fingerprint authentication`

## ファイル構成

```
.agents/skills/spec-extracting/
├── SKILL.md    # スキル定義（英語）
└── README.md   # ドキュメント（日本語）
```

## 関連スキル

| スキル | 説明 |
|--------|------|
| `/spec-write` | 仕様を対話的に明確化 |
| `/test-generate` | 仕様からテストコードを生成 |
| `/spec-verify` | 仕様とテストの整合性を検証 |

## ベストプラクティス

### 1. 仕様抽出前の準備

- 対象クラスのコードを最新の状態に更新
- 依存関係が明確であることを確認

### 2. 抽出後のレビュー

- 生成された仕様が実際の動作と一致するか確認
- 不足している条件やエッジケースを追加
- `/spec-write` で仕様を精緻化

### 3. テスト生成との連携

```bash
# 1. 仕様抽出
/spec-extract AuthViewModel

# 2. 仕様レビュー・精緻化
/spec-write AuthViewModel

# 3. テスト生成
/test-generate AuthViewModel
```

## 参考資料

- [docs/TEST_PLAN.md](../../docs/TEST_PLAN.md) セクション7: EARS形式仕様フォーマット
- [docs/TEST_PLAN.md](../../docs/TEST_PLAN.md) セクション8.5: /spec-extract の使い方
- [EARS論文](https://ieeexplore.ieee.org/document/5328509): Easy Approach to Requirements Syntax
