# Interface Creating スキル

## 概要

このスキルは、外部依存（Amplify、Firebase、Platform API等）を抽象化するインターフェースを作成し、テスト可能性を向上させます。

インターフェースを導入することで、テスト時にモックを注入できるようになり、外部サービスに依存しない単体テストが可能になります。

## 使用方法

### 起動方法

```bash
/interface-create インターフェース名
```

例:
```bash
/interface-create IAuthService
/interface-create IClock
/interface-create ILocationProvider
```

### 前提条件

**重要**: インターフェース作成はリファクタリングであるため、対象クラスの特性テスト（Characterization Test）が作成済みであることが前提です。

特性テストが未作成の場合は、先に `/char-test クラス名` を実行してください。

```bash
# 1. 特性テストを作成
/char-test AuthViewModel

# 2. スナップショットを生成・承認
flutter test test/characterization/auth/
mv *.received.txt *.approved.txt

# 3. インターフェースを作成
/interface-create IAuthService

# 4. 特性テストを再実行して挙動保持を確認
flutter test test/characterization/auth/
```

## 出力先

| ファイル種別 | パス |
|-------------|------|
| インターフェース | `lib/service/interfaces/{interface_name}.dart` |
| 実装ラッパー | `lib/service/impl/{implementation_name}.dart` |
| 更新ファイル | `lib/locator.dart` |

## ファイル構成

```
lib/
├── locator.dart                    # DI設定（更新）
└── service/
    ├── interfaces/
    │   ├── i_auth_service.dart     # インターフェース定義
    │   ├── i_clock.dart
    │   └── i_location_provider.dart
    └── impl/
        ├── amplify_auth_service.dart  # 実装ラッパー
        ├── system_clock.dart
        └── geolocator_location_provider.dart
```

## ワークフロー

### ステップ 1: インターフェース名を指定

```bash
/interface-create IAuthService
```

### ステップ 2: 外部依存の特定

スキルが自動で以下を分析します：
- ラップ対象のAPIやライブラリ
- 必要なメソッドシグネチャ
- 依存元のクラス

### ステップ 3: ファイル生成

以下のファイルが生成されます：
1. インターフェース定義ファイル
2. 実装ラッパーファイル

### ステップ 4: locator.dart 更新

`lib/locator.dart` にインターフェースの登録を追加します。

### ステップ 5: 依存元クラスの更新

直接依存をインターフェース経由に変更します。

### ステップ 6: 特性テスト実行

挙動が保持されていることを確認します。

## インターフェース優先度

TEST_PLAN.md セクション 4.1 に基づく優先度：

### Phase 0: 特性テスト基盤（最初に作成）

| インターフェース | ラップ対象 | 目的 |
|-----------------|-----------|------|
| IClock | DateTime.now() | 時刻依存の排除 |
| IDioClient | Dio | ネットワーク依存の排除 |
| IPreferencesProvider | SharedPreferences | ローカルストレージのモック化 |

### Phase A: 最優先（テスト基盤）

| インターフェース | ラップ対象 | 影響範囲 |
|-----------------|-----------|---------|
| IAuthService | Amplify.Auth.* | AuthViewModel |
| IAuthSessionProvider | fetchAuthSession() | Interceptor |
| ISecureStorageProvider | FlutterSecureStorage | SecureRepository |

### Phase B: 高優先（コア機能）

| インターフェース | ラップ対象 |
|-----------------|-----------|
| IAnalyticsService | FirebaseAnalytics |
| ILocationProvider | Geolocator |
| IFileService | File, Directory |

### Phase C: 中優先（UI/UX）

| インターフェース | ラップ対象 |
|-----------------|-----------|
| INavigationService | Navigator |
| IDialogService | showDialog() |
| ISnackBarService | ScaffoldMessenger |

### Phase D: 低優先（補助機能）

| インターフェース | ラップ対象 |
|-----------------|-----------|
| IMapControllerFactory | GoogleMapController |
| IVideoPlayerFactory | VideoPlayerController |
| IPlatformProvider | Platform.isIOS/Android |

## コード例

### インターフェース定義

```dart
// lib/service/interfaces/i_auth_service.dart

/// 認証操作のインターフェース。
/// テスト容易性のためAmplify.Authをラップする。
abstract interface class IAuthService {
  Future<SignInResult> signIn({
    required String email,
    required String password,
  });

  Future<void> signOut();

  Future<AuthSession> fetchAuthSession();
}
```

### 実装ラッパー

```dart
// lib/service/impl/amplify_auth_service.dart

/// [IAuthService] の本番実装（Amplify使用）。
class AmplifyAuthService implements IAuthService {
  @override
  Future<SignInResult> signIn({
    required String email,
    required String password,
  }) async {
    return Amplify.Auth.signIn(username: email, password: password);
  }

  @override
  Future<void> signOut() async {
    await Amplify.Auth.signOut();
  }

  @override
  Future<AuthSession> fetchAuthSession() async {
    return Amplify.Auth.fetchAuthSession();
  }
}
```

### locator.dart への登録

```dart
// lib/locator.dart

import 'service/interfaces/i_auth_service.dart';
import 'service/impl/amplify_auth_service.dart';

Future<void> setupLocator() async {
  locator
    ..registerLazySingleton<IAuthService>(AmplifyAuthService.new)
    // 他の登録...
}
```

### 依存元クラスの更新

```dart
// 変更前
class AuthViewModel {
  Future<void> signIn(String email, String password) async {
    await Amplify.Auth.signIn(username: email, password: password);
  }
}

// 変更後
class AuthViewModel {
  final IAuthService _authService;

  AuthViewModel({IAuthService? authService})
      : _authService = authService ?? locator<IAuthService>();

  Future<void> signIn(String email, String password) async {
    await _authService.signIn(email: email, password: password);
  }
}
```

## テストでのモック使用例

```dart
@GenerateMocks([IAuthService])
import 'auth_view_model_test.mocks.dart';

void main() {
  late MockIAuthService mockAuthService;
  late AuthViewModel viewModel;

  setUp(() async {
    mockAuthService = MockIAuthService();
    await locator.reset();
    locator.registerLazySingleton<IAuthService>(() => mockAuthService);

    viewModel = AuthViewModel();
  });

  test('signIn_GivenSuccess_ShouldSetLoggedInTrue', () async {
    when(mockAuthService.signIn(
      email: anyNamed('email'),
      password: anyNamed('password'),
    )).thenAnswer((_) async => SignInResult(isSignedIn: true));

    await viewModel.signIn(email: 'test@example.com', password: 'pass');

    expect(viewModel.state.isLoggedIn, isTrue);
  });
}
```

## ベストプラクティス

### 命名規則

- インターフェース名: `I` プレフィックス + 機能名（例: `IAuthService`）
- 実装クラス名: 具体的なライブラリ名 + 機能名（例: `AmplifyAuthService`）

### インターフェース設計

1. **最小限のメソッド**: 必要なメソッドのみを定義
2. **戻り値の抽象化**: ライブラリ固有の型は可能な限り避ける
3. **ドキュメント**: 各メソッドにdocコメントを追加

### テスト可能性

1. コンストラクタインジェクション優先
2. デフォルトでlocatorから取得
3. テスト時はモックを注入

## 参考資料

- [docs/TEST_PLAN.md](../../../docs/TEST_PLAN.md) セクション 4.1: 作成が必要なインターフェース
- [docs/TEST_PLAN.md](../../../docs/TEST_PLAN.md) セクション 8.4: /interface-create の使い方
- [docs/TEST_PLAN.md](../../../docs/TEST_PLAN.md) 付録D: 必要なインターフェース全一覧（26個）

## 注意事項

- このスキルは `disable-model-invocation: false` に設定されています
- リファクタリング前に必ず特性テストを作成してください
- 特性テストが通らない場合、リファクタリングをやり直してください
