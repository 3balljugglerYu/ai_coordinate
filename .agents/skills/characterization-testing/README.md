# 特性テスト（Characterization Testing）スキル

## 概要

このスキルは、リファクタリング前に既存コードの現在の挙動をキャプチャする特性テスト（Characterization Test）を作成します。

特性テストは「正しい挙動」ではなく「現在の挙動」を記録するテストです。仕様が不明なレガシーコードでは、現在の挙動が仕様となります。

**参考**: `docs/TEST_PLAN.md` セクション 4.3 および 8.3

## 使用方法

### 起動方法

```bash
# ViewModel/Repository/Service 用（ApprovalTests）
/char-test AuthViewModel

# Widget 用（Golden テスト）
/char-test EventPage --widget
```

### 起動後の流れ

1. 対象クラスの読み込みと分析
2. パブリックメソッドの列挙
3. 入力パターンの特定（正常系、異常系、境界値）
4. テストコードの生成
5. スナップショット生成手順の案内
6. **進捗トラッカーの更新**（`docs/test-progress.yaml`）

## 出力先

| 対象タイプ | 出力パス |
|-----------|---------|
| ViewModel | `test/characterization/{feature}/{class}_char_test.dart` |
| Repository | `test/characterization/domain/repository/{class}_char_test.dart` |
| Service | `test/characterization/service/{class}_char_test.dart` |
| Widget | `test/characterization/widgets/{widget}_char_test.dart` |
| Golden ファイル | `test/characterization/goldens/{widget}_{state}.png` |
| Approval ファイル | `test/characterization/{feature}/{class}_char_test.{ID}.approved.txt` |

## ワークフロー

### ApprovalTests（ViewModel/Repository/Service）

```bash
# 1. テスト実行（初回は .received ファイルが生成される）
flutter test test/characterization/{feature}/

# 2. .received ファイルを確認し、正しければ .approved にリネーム
mv test/characterization/{feature}/{class}_char_test.CHAR-XXX-001.received.txt \
   test/characterization/{feature}/{class}_char_test.CHAR-XXX-001.approved.txt

# 3. .approved ファイルをコミット
git add test/characterization/{feature}/*.approved.txt
```

### Golden テスト（Widget）

```bash
# 1. ゴールデンファイル生成
flutter test --update-goldens test/characterization/widgets/

# 2. 生成された PNG を確認
ls test/characterization/goldens/

# 3. ゴールデンファイルをコミット
git add test/characterization/goldens/*.png
```

## 目的

### リファクタリングのジレンマを解決

```
「テストを追加してからリファクタリングすべき」
    ↓ しかし ↓
「リファクタリングしないとテストが追加できない」
    ↓ 解決策 ↓
「特性テストで現在の挙動を記録してからリファクタリング」
```

### 使用タイミング

1. `/interface-create` でインターフェースを作成する**前に**実行
2. レガシーコードの挙動を理解したいとき
3. 大規模リファクタリングの前

## 決定論的テストのためのテクニック

特性テストは同じ入力に対して同じ出力を返す必要があります：

| 非決定的要素 | 対策 |
|-------------|------|
| `DateTime.now()` | `IClock` インターフェースでモック化 |
| ランダム値 | シード固定、またはモック化 |
| ネットワークレスポンス | `IDioClient` で録画済み応答を返す |
| ファイルパス | 相対パスまたはテスト用ディレクトリ使用 |
| プラットフォーム差異 | CI 環境（ubuntu-latest）基準で実行 |

## リファクタリング後の検証

```bash
# 特性テストを実行
flutter test test/characterization/{feature}/

# 結果の解釈:
# - 差分なし → リファクタリング成功
# - 差分あり → 挙動が変わっている
#   → リファクタリングをやり直す、または意図的な変更として承認
```

## テスト構造の例

### ApprovalTests（ViewModel）

```dart
@Tags(['characterization'])
void main() {
  group('Characterization: AuthViewModel', () {
    test('CHAR-AUTH-001: signIn states snapshot', () async {
      final results = <String>[];

      // 正常系
      try {
        final result = await viewModel.signIn(
          email: 'test@example.com',
          password: 'password123',
        );
        results.add('signIn(valid): $result');
      } catch (e) {
        results.add('signIn(valid): threw $e');
      }

      // 異常系
      try {
        final result = await viewModel.signIn(email: '', password: '');
        results.add('signIn(empty): $result');
      } catch (e) {
        results.add('signIn(empty): threw $e');
      }

      // スナップショットと比較
      Approvals.verify(results.join('\n'));
    });
  });
}
```

### Golden テスト（Widget）

```dart
@Tags(['characterization', 'golden'])
void main() {
  testWidgets('CHAR-WIDGET-001: EventPage loading state', (tester) async {
    await tester.pumpWidget(
      TestApp(child: EventPage()),
    );

    await expectLater(
      find.byType(EventPage),
      matchesGoldenFile('goldens/event_page_loading.png'),
    );
  });
}
```

## ファイル構成

```
test/
├── characterization/
│   ├── auth/
│   │   ├── auth_view_model_char_test.dart
│   │   └── auth_view_model_char_test.CHAR-AUTH-001.approved.txt
│   ├── event/
│   │   └── event_view_model_char_test.dart
│   ├── widgets/
│   │   └── event_page_char_test.dart
│   └── goldens/
│       ├── event_page_loading.png
│       └── event_page_loaded.png
```

## 他エージェントでの利用

### Codex CLI

```bash
$characterization-testing AuthViewModel
```

### Cursor

`@characterization-testing` でルールを適用

## 参考資料

- `docs/TEST_PLAN.md` - セクション 4.3（特性テスト実装）
- `docs/TEST_PLAN.md` - セクション 8.3（/char-test スキル使用方法）
- [Characterization test - Wikipedia](https://en.wikipedia.org/wiki/Characterization_test)
- [ApprovalTests.Dart](https://github.com/approvals/ApprovalTests.Dart)
- [Flutter Golden Tests](https://api.flutter.dev/flutter/flutter_test/matchesGoldenFile.html)

## 進捗トラッカーの更新（必須）

テストファイル作成後、**必ず** `docs/test-progress.yaml` を更新してください：

```yaml
# 更新前
LiveViewRepository:
  status: pending
  char_test: null

# 更新後
LiveViewRepository:
  status: char_test_created
  char_test: test/characterization/domain/repository/live_view_repository_char_test.dart
```

この手順をスキップしないでください。

## 注意事項

- このスキルは `disable-model-invocation: false` に設定されています
- 副作用がないため、自然言語でも起動可能です
- Phase 0 インターフェース（IClock, IDioClient, IPreferencesProvider）が作成されていることが前提です
- **テスト作成後は必ず `docs/test-progress.yaml` を更新すること**
