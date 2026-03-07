# test-reviewing スキル

## 概要

生成されたテストをレビューし、実行結果の分析とLondon Schoolパターンの検証を行うスキルです。テスト生成（`/test-generate`）とカバレッジ検証（`/spec-verify`）の間の品質ゲートとして機能します。

## ワークフロー上の位置

```
Step 6: テスト生成 (/test-generate)
    │
    ▼
Step 6.5: テストレビュー (/test-reviewing)  ← このスキル
    │
    ├── 全テスト成功 → Step 8: /spec-verify
    └── 失敗あり → Step 7: /test-fixing
            │
            └── Step 6.5 へ戻る
```

## 使用方法

### 基本的な使い方

```bash
# 特定クラスのテストをレビュー
/test-reviewing LiveViewRepository

# 詳細出力でレビュー
/test-reviewing AuthViewModel --verbose

# 複数クラスを同時にレビュー（サブエージェントで並列処理）
/test-reviewing LiveViewRepository AuthViewModel SecureRepository
```

### 大規模レビューの自動分割

対象が多い場合、自動的にサブエージェントで分割処理されます：

| 条件 | 処理方法 |
|------|----------|
| 単一対象、テスト50件未満 | 直接処理 |
| 単一対象、テスト50件以上 | テストグループ別に分割、サブエージェント使用 |
| 複数対象（2-5件） | 対象ごとにサブエージェント、並列実行 |
| 多数対象（6件以上） | 3件ずつバッチ化、順次実行 |

**重要: サブエージェント呼び出し時のスキル指定**

サブエージェントを使用する際は、必ず `/test-reviewing` スキルを明示的に使用するよう指示してください。ワークフローを説明するのではなく、スキル自体を呼び出させます。

**並列処理の例:**

`LiveViewRepository`, `AuthViewModel`, `SecureRepository` を同時レビューする場合：
1. 3つのサブエージェントを並列起動（各サブエージェントが `/test-reviewing` を呼び出す）
2. 各サブエージェントが独立してレビュー実行
3. メインエージェントが結果を集約してレポート生成

**集約レポート例:**

```markdown
## Combined Test Review Report

| Class | Tests | Passed | Failed | Status |
|-------|-------|--------|--------|--------|
| LiveViewRepository | 135 | 130 | 5 | ⚠️ Issues |
| AuthViewModel | 24 | 24 | 0 | ✓ Pass |
| SecureRepository | 18 | 18 | 0 | ✓ Pass |

Total: 177 tests, Passed: 172 (97.2%), Failed: 5 (2.8%)
```

### 自動起動

以下のような文脈で自動的に起動します：
- テストをレビューしたいとき
- テスト品質をチェックしたいとき
- spec検証の前段階として

## レビュー内容

### 1. テスト実行

```bash
flutter test <test_file> --no-pub
```

### 2. 構造分析（London School準拠）

| チェック項目 | 基準 |
|------------|------|
| モック使用 | 全依存関係がモック化されている |
| I/Oなし | ネットワーク・ファイル・DB呼び出しなし |
| 独立性 | 各テストが独立している |
| 命名規則 | `method_GivenScenario_ShouldResult` に従う |
| 仕様タグ | `@Tags(['SPEC-XXX'])` が付与されている |

### 3. モック設定検証

| チェック項目 | 基準 |
|------------|------|
| スタブ完備 | 使用メソッドが全てスタブ化 |
| 型の一致 | 戻り値の型が実装と一致 |
| 名前付き引数 | `anyNamed()` が正しく使用されている |
| ダミー値 | 複雑な型に `provideDummy` が設定されている |

### 4. 失敗の分類

| コード | カテゴリ | 説明 |
|--------|----------|------|
| S | Structural | テスト構造の問題（セットアップ不足等） |
| M | Mock | モック設定の問題 |
| A | Assertion | アサーション失敗（期待値と実際値の不一致） |
| R | Runtime | ランタイムエラー（null、型、import等） |

## 出力フォーマット

```markdown
## Test Review Report: {ClassName}

### Summary
| Metric | Value |
|--------|-------|
| Test File | `test/unit_tests/.../{class}_test.dart` |
| Total Tests | {count} |
| Passed | {count} |
| Failed | {count} |

### London School Compliance
| Check | Status |
|-------|--------|
| Mock Usage | ✓ All dependencies mocked |
| No Real I/O | ✓ No external calls |
| Isolation | ✓ Tests are independent |

### Issues Found
| # | Category | Test | Issue |
|---|----------|------|-------|
| 1 | M | fetchAccount_WhenSuccess | Wrong mock return type |

### Next Action
- **All tests pass**: Run `/spec-verify {ClassName}`
- **Issues found**: Run `/test-fixing` to resolve issues
```

## クロスエージェントコンセンサス（Step 8）

レビュー完了後、Codex CLIに同等のレビューを実行させ、結果を比較してコンセンサスを取ります。

### 8.1 Codexレビューの実行

```bash
codex exec "Use the /test-reviewing skill to review {ClassName} tests.
Follow the complete workflow and return a detailed review report."
```

### 8.2 結果の比較

| 観点 | 自分のレビュー | Codexのレビュー | 一致 |
|------|---------------|-----------------|------|
| テスト結果 | X pass, Y fail | ... | ✓/✗ |
| London School | ... | ... | ✓/✗ |
| 検出Issue | ... | ... | ✓/✗ |
| 次のアクション | ... | ... | ✓/✗ |

### 8.3 不一致の解決

不一致がある場合は議論してコンセンサスを取ります：

1. **具体的な不一致点を特定** - 何が異なるか
2. **自分の根拠を提示** - なぜその評価が正しいと考えるか
3. **Codexに説明を求める** - Codexの根拠を確認
4. **必要に応じて反論** - コンセンサスに達するまで繰り返す

### 8.4 コンセンサスの文書化

```markdown
### Cross-Agent Consensus

| Reviewer | Agreement |
|----------|-----------|
| Claude Code | ✓ |
| Codex CLI | ✓ |

**合意点:**
- テスト実行: {合意結果}
- London School準拠: {合意評価}
- Issue: {合意リスト}

**解決した不一致:**
- {トピック}: Claudeは X、Codexは Y、{理由}により Z で合意
```

## 連携するスキル

| スキル | 関係 |
|--------|------|
| `/test-generate` | 前段階：テスト生成 |
| `/test-fixing` | 失敗時：テスト修正 |
| `/spec-verify` | 後段階：カバレッジ検証 |
| Codex CLI | クロスエージェント検証 |

## ファイル構成

```
.agents/skills/test-reviewing/
├── SKILL.md    # スキル定義（英語）
└── README.md   # ドキュメント（日本語）
```

## 参考資料

- テスト計画: `docs/TEST_PLAN.md`
- 仕様書: `docs/specs/{feature}/{class}_spec.yaml`
- テスト修正スキル: `.agents/skills/test-fixing/SKILL.md`
- 仕様検証スキル: `.agents/skills/spec-verifying/SKILL.md`
