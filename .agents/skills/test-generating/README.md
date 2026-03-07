# Test Generating

EARS仕様からテストコードを自動生成するスキル。

## 概要

このスキルは、EARS形式で記述された仕様ファイルからテストコードを自動生成します。London School（モックスト）アプローチに基づき、Arrange-Act-Assert パターンでテストを構造化します。

### 主な機能

- 仕様からテストコードを自動生成
- クラスタイプに応じた適切な出力先
- Arrange-Act-Assert パターンの自動適用
- 仕様IDによるトレーサビリティ

## 使用方法

```bash
/test-generate クラス名
```

### 例

```bash
# ViewModelのテスト生成
/test-generate AuthViewModel

# Repositoryのテスト生成
/test-generate LiveViewRepository

# Serviceのテスト生成
/test-generate AnalyticsService
```

## 前提条件

このスキルを実行する前に、以下が完了している必要があります：

1. **仕様ファイルの作成**: `/spec-extract` で仕様を抽出済み
2. **インターフェースの作成**: 外部依存がモック化可能な状態

### 仕様ファイルの場所

```
docs/specs/{feature}/{class}_spec.yaml
```

仕様ファイルが存在しない場合、先に `/spec-extract` を実行してください。

## 出力先

クラスタイプに応じて、以下のディレクトリにテストファイルを生成します：

| クラスタイプ | 出力先 |
|-------------|--------|
| ViewModel | `test/unit_tests/ui/{feature}/{class}_test.dart` |
| Repository | `test/unit_tests/domain/repository/{class}_test.dart` |
| Service | `test/unit_tests/service/{class}_test.dart` |

### 出力例

```
test/unit_tests/ui/auth/auth_view_model_test.dart
test/unit_tests/domain/repository/live_view_repository_test.dart
test/unit_tests/service/analytics_service_test.dart
```

## テスト構造

生成されるテストは Arrange-Act-Assert パターンに従います。

### テストファイル構造

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

@GenerateMocks([Repository, Service])
import 'auth_view_model_test.mocks.dart';

@Tags(['unit', 'AUTH'])
void main() {
  late MockRepository mockRepository;
  late AuthViewModel viewModel;

  setUp(() async {
    mockRepository = MockRepository();
    await setupMockLocatorForTest(
      repository: mockRepository,
    );
  });

  tearDown(() async {
    await locator.reset();
  });

  group('AUTH-001 signIn', () {
    test('signIn_GivenValidCredentials_ShouldSetLoggedInTrue', () async {
      // Spec: AUTH-001
      // ============================================================
      // Arrange
      // ============================================================
      when(mockAuthService.signIn(any, any))
          .thenAnswer((_) async => SignInResult(isSignedIn: true));

      // ============================================================
      // Act
      // ============================================================
      viewModel = AuthViewModel();
      final result = await viewModel.signIn(
        email: 'test@example.com',
        password: 'password123',
      );

      // ============================================================
      // Assert
      // ============================================================
      expect(result, equals(SignInStatus.success));
      expect(viewModel.state.isLoggedIn, isTrue);
    }, tags: ['AUTH-001']);
  });
}
```

### テスト命名規則

テストメソッド名は以下のパターンに従います：

```
{メソッド名}_Given{シナリオ}_Should{期待結果}
```

**例:**
- `signIn_GivenValidCredentials_ShouldReturnSuccess`
- `signIn_GivenInvalidPassword_ShouldReturnError`
- `fetchAccount_GivenNetworkError_ShouldReturnNull`

## Arrange-Act-Assert パターン

`TEST_PLAN.md` セクション6.3で定義されたパターンを使用します。

### Arrange（準備）

テストの前提条件を設定します：
- モックの戻り値を設定
- 初期状態を準備
- テストデータを作成

### Act（実行）

テスト対象のメソッドを実行します：
- 単一のメソッド呼び出し
- 明確な実行ポイント

### Assert（検証）

結果を検証します：
- **状態検証（主）**: `expect()` で状態変更を確認
- **インタラクション検証（副）**: `verify()` で副作用を確認

## ファイル構成

```
.agents/skills/test-generating/
├── SKILL.md    # スキル定義（英語）
└── README.md   # ドキュメント（日本語）
```

## 生成後の手順

テストファイル生成後、以下の手順を実行してください：

### 1. モックの生成

```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

### 2. テストの実行

```bash
flutter test test/unit_tests/ui/auth/auth_view_model_test.dart
```

### 3. カバレッジの確認

```bash
/spec-verify AuthViewModel
```

## 関連スキル

| スキル | 説明 |
|--------|------|
| `/spec-extract` | コードからEARS仕様を抽出 |
| `/spec-write` | 仕様を対話的に明確化 |
| `/spec-verify` | 仕様とテストの整合性を検証 |
| `/interface-create` | 外部依存のインターフェースを作成 |

## ベストプラクティス

### 1. 仕様の確認

テスト生成前に仕様ファイルを確認し、不足がないかチェック：

```bash
# 仕様ファイルを確認
cat docs/specs/auth/auth_view_model_spec.yaml
```

### 2. 依存関係の確認

モック化が必要な依存関係が全てインターフェース化されているか確認：

```bash
# インターフェースの存在を確認
ls lib/service/interfaces/
```

### 3. テストの段階的実装

生成されたテストをすべて一度に実装せず、段階的に進める：

1. 最初に正常系（success）のテストを実装
2. 次にエラー系（error）のテストを実装
3. 最後にエッジケースを実装

## 参考資料

- [docs/TEST_PLAN.md](../../../docs/TEST_PLAN.md) セクション5.2: ViewModelテスト実装手順
- [docs/TEST_PLAN.md](../../../docs/TEST_PLAN.md) セクション6.3: Arrange-Act-Assert パターン
- [docs/TEST_PLAN.md](../../../docs/TEST_PLAN.md) セクション6.1: テストファイル配置
- [docs/TEST_PLAN.md](../../../docs/TEST_PLAN.md) セクション6.4: タグによるトレーサビリティ
