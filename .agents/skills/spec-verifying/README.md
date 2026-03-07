# Spec Verifying スキル

## 概要

このスキルは、EARS形式の仕様ファイルと実装されたテストファイルの整合性を検証します。仕様に対するテストカバレッジを確認し、未実装のテストや仕様に紐づかないテストを特定します。

TEST_PLAN.md セクション 8.6 に基づいて設計されています。

## 使用方法

### 起動方法

```bash
/spec-verify クラス名
```

例:
```bash
/spec-verify AuthViewModel
```

### 前提条件

- 対象クラスの仕様ファイルが存在すること
  - 場所: `docs/specs/{feature}/{class}_spec.yaml`
  - 存在しない場合は `/spec-extract` を先に実行

## 出力

### カバレッジレポート

スキル実行後、以下の情報を含むレポートが出力されます:

#### サマリー

| 指標 | 説明 |
|------|------|
| Total Specifications | 仕様の総数 |
| Expected Test Cases | 期待されるテストケース数 |
| Implemented Test Cases | 実装済みテストケース数 |
| Coverage | カバレッジ率（%） |

#### 仕様カバレッジ詳細

各仕様IDに対して:
- 対応するメソッド名
- 期待されるテスト数
- 実装済みテスト数
- ステータス（COMPLETE / PARTIAL / MISSING）

#### 未実装仕様リスト

実装されていないテストケースの一覧。

#### 仕様に紐づかないテスト

仕様IDが不明なテストの一覧（削除または仕様追加を検討）。

#### 命名規則違反

`Method_GivenScenario_ShouldResult` パターンに従っていないテスト名。

## 検証項目

### 1. Spec ID 対応

テストと仕様の紐づけは以下の方法で検出:

- `tags: ['AUTH-001']` アノテーション
- `// Spec: AUTH-001` コメント
- `group('AUTH-001 ...', () {...})` グループ名
- テスト名がメソッド名で始まる

### 2. 命名規則

テスト名は以下のパターンに従う必要があります:

```
MethodName_GivenScenario_ShouldExpectedResult
```

例:
- `signIn_GivenValidCredentials_ShouldReturnSuccess`
- `fetchAccount_GivenNetworkError_ShouldReturnNull`

### 3. タグ

仕様とテストのトレーサビリティのため、以下のタグ付けを推奨:

```dart
@Tags(['unit', 'AUTH'])  // ファイルレベル
void main() {
  group('AUTH-001 signIn', () {
    test('signIn_GivenSuccess_ShouldSetLoggedIn', () async {
      // Spec: AUTH-001
      ...
    }, tags: ['AUTH-001']);
  });
}
```

## ファイル構成

```
docs/
├── specs/
│   └── {feature}/
│       └── {class}_spec.yaml    # 検証対象の仕様ファイル

.claude/
└── skills/
    └── spec-verifying/
        ├── SKILL.md             # スキル本体（英語）
        └── README.md            # ドキュメント（日本語）

test/
├── unit_tests/
│   └── ui/{feature}/
│       └── {class}_test.dart    # 検証対象のテストファイル
```

## 出力例

TEST_PLAN.md セクション 8.6 より:

```
## AuthViewModel Spec-Test Consistency Report

### Summary
| Metric | Count |
|--------|-------|
| Total Specifications | 12 |
| Expected Test Cases | 24 |
| Implemented Test Cases | 20 |
| Coverage | 83.3% |

### Unimplemented Specifications
- AUTH-005: updatePassword_GivenInvalidOldPassword_ShouldReturnError
- AUTH-007: deleteAccount_GivenSuccess_ShouldLogoutAndReturnTrue
```

## 推奨ワークフロー

1. **仕様抽出**: `/spec-extract ClassName` で仕様を生成
2. **テスト生成**: `/test-generate ClassName` でテストを生成
3. **整合性検証**: `/spec-verify ClassName` でカバレッジを確認
4. **不足分の実装**: レポートに基づいて不足テストを実装
5. **再検証**: 実装後に再度 `/spec-verify` で確認

## ステータス定義

| ステータス | 定義 |
|-----------|------|
| COMPLETE | 全てのテストケースが実装済み |
| PARTIAL | 一部のテストケースが実装済み |
| MISSING | テストケースが未実装 |
| EXTRA | 期待より多くのテストが存在（仕様の更新を検討） |

## 参考資料

- `docs/TEST_PLAN.md` セクション 8.6: /spec-verify スキルの使用方法
- `docs/TEST_PLAN.md` セクション 6: テスト記述規則
- `docs/TEST_PLAN.md` セクション 6.4: トレーサビリティ
- `.agents/skills/spec-extracting/`: 仕様抽出スキル
