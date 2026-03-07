# test-fixing スキル

## 概要

テスト失敗時に「ただテストを通すための修正」というアンチパターンを防ぎ、仕様に基づいた正しい修正を強制するスキルです。

## 使用方法

### 自動起動

テストが失敗したとき、またはテスト修正の話題になったときに自動的に起動します。

### 手動起動

```
/test-fixing
```

## ワークフロー

### 1. 失敗原因の分類（必須）

修正を始める前に、必ず以下のいずれかに分類：

| 分類 | 説明 | 修正対象 |
|------|------|----------|
| A. 実装のバグ | 実装が仕様に違反 | 実装コード（テストは修正しない） |
| B. テストの誤り | テストが仕様を正しく反映していない | テストコード |
| C. モック設定の問題 | 戻り値・型・メソッド名の不一致 | テストのモック設定 |
| D. テストインフラの問題 | Mockitoのダミー値、インポート等 | テストのセットアップ |
| E. 仕様の曖昧さ | 仕様書に記載がない・矛盾 | 仕様書を更新 |

### 2. 仕様書との照合（必須）

```
docs/specs/{feature}/{class}_spec.yaml
```

- テストタグから仕様ID（例: `LVREPO-001`）を特定
- 事前条件・事後条件を確認
- 実装と仕様の一致を検証

### 3. 修正理由の明示（必須）

```markdown
## テスト修正理由

**テスト**: methodName_GivenScenario_ShouldResult
**仕様ID**: SPEC-XXX
**分類**: B. テストの誤り

**問題**: [何が間違っているか]
**仕様確認**: [仕様書の記載]
**修正内容**: [何を変更するか]
**修正が正しい理由**: [仕様に基づく根拠]
```

### 4. Serenaへの記録（必須）

`.serena/memories/test_implementation_issues.md` に記録

## やってはいけないこと

- ❌ 期待値を実装に合わせて変更する
- ❌ モックを「とりあえず動く」ように修正する
- ❌ `skip` で失敗テストを無効化する
- ❌ エラーメッセージだけ見て修正する

## よくある問題と解決策

### MissingDummyValueError

```dart
setUpAll(() {
  provideDummy<Response<Account>>(
    Response(http.Response('', 200), null),
  );
});
```

### ArgumentMatcherエラー

```dart
// NG: anyNamed('param') を直接使用
// OK: param: anyNamed('param') または param: any
when(mockApi.method(param: any)).thenAnswer(...);
```

### HttpException のテスト

```dart
// HttpErrorHandlingInterceptor が 401 を HttpException に変換
final response = Response(http.Response('', 401), null);
when(mockApi.someMethod()).thenThrow(HttpException(response));
```

## ファイル構成

```
.agents/skills/test-fixing/
├── SKILL.md    # スキル定義（英語）
└── README.md   # ドキュメント（日本語）
```

## 参考資料

- EARS仕様書: `docs/specs/{feature}/{class}_spec.yaml`
- バグレポート: `docs/specs/{feature}/{class}_bugs.md`
- 問題記録: `.serena/memories/test_implementation_issues.md`
- テスト計画: `docs/TEST_PLAN.md`
