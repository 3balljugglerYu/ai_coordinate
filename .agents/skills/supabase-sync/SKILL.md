---
name: supabase-migration-sync
description: Verify and apply Supabase migrations between the local repository and the linked remote project for `ai_coordinate`. Use this skill when the user asks to apply pending migrations, check if local and remote are in sync, troubleshoot migration history drift, or confirm DB state before/after a deploy. Triggers include "マイグレーション適用", "マイグレーション同期", "リモートと一致してる？", "drift チェック", "db push", "supabase migration apply", "次の開発が始められる状態か確認して".
---

# Supabase Migration Sync

このリポジトリの本番 Supabase プロジェクトは **AI coordinate**（ref: `hnrccaxrvhtbuihfvitc`, Sydney）。
`supabase/migrations/*.sql` がローカル正本で、リモートと **同じ timestamp 一覧** になっていることが「次の開発に支障が出ない」最低条件。

このスキルは、その同期状態の確認・差分の安全な解消・適用後の検証を一連の手順で整える。

## トリガー

- 「マイグレーション適用して」「db push して」「リモートと一致してる？」
- 「次の開発に進める状態か確認して」「supabase 周り整えて」
- Edge Function / API デプロイの前後で DB 状態確認を求められたとき
- 開発開始時の起点確認（「データベース最新？」など）

## プロジェクトガードレール

- Active プロジェクトは **必ず `AI coordinate`（ref: hnrccaxrvhtbuihfvitc）** であること。
  - 同じ Supabase アカウントに `katakanahanashi`（ref: dqdjabblnuvkblqjwwbg, Tokyo）が存在する。Active がそちらになっていたら **即停止**してユーザー確認。
- CLAUDE.md の規約に従う：
  - **破壊的操作**（`DROP TABLE`, `TRUNCATE`, `DELETE without WHERE` 等）は事前にユーザー承認を得ること
  - **rollback / down マイグレーション**はユーザー承認なしに実行しない
  - 認証情報をチャット出力やコミットメッセージに残さない
- `.env.local` の Supabase 以外の秘密情報（OpenAI / Gemini / Stripe / Resend）には触れない
- main / master ブランチへの直接 push は行わない（マイグレーション適用と git 操作は別物として扱う）

## ワークフロー

### 1. 事前確認（必須）

```bash
supabase projects list
```

- Active 行（`●`）が **AI coordinate** か確認
- 別プロジェクトが Active なら以下のいずれかで対処してユーザーに報告：
  ```bash
  supabase link --project-ref hnrccaxrvhtbuihfvitc
  ```

### 2. Drift チェック

```bash
supabase migration list
```

出力フォーマット：
```
   Local          | Remote         | Time (UTC)
   20260517110000 | 20260517110000 | 2026-05-17 11:00:00
```

加えてローカルファイル数も比較：
```bash
ls supabase/migrations/*.sql | wc -l
supabase migration list | grep -cE "^[[:space:]]+[0-9]"
```

### 3. ケース別の対応

#### 3a. 完全同期（Local == Remote 全行）
正常。ユーザーに「N 件すべて一致」と報告して終了。

#### 3b. Local-only（未適用マイグレーションあり）
1. 未適用ファイルの SQL を `cat supabase/migrations/<timestamp>_*.sql` で確認
2. **破壊的キーワードの検査**：
   ```bash
   grep -iE "DROP TABLE|TRUNCATE|DELETE FROM [^;]+;|ALTER .+ DROP COLUMN" supabase/migrations/<timestamp>_*.sql
   ```
   何かヒットしたらユーザー承認を得るまで進めない。
3. ユーザーに SQL 内容と影響範囲を見せて承認を得る
4. 適用：
   ```bash
   supabase db push
   ```
5. 適用後再度 `supabase migration list` で同期確認

#### 3c. Remote-only（ローカルに無いマイグレーションがリモートで適用済み）
**勝手に `migration repair` で履歴を書き換えない**。以下のいずれかをユーザーに提案：

- **推奨**: `supabase db pull` でローカルにマイグレーションファイルを取り込む（履歴を破壊しない）
- **必要時**: `supabase migration repair --status reverted <timestamp>`（履歴書き換え、承認必須）

#### 3d. 順序の不整合（履歴のあいだに割り込み）
危険な状態。即停止し、ユーザーに状況報告。

例：local に `20260101_a.sql`, `20260201_b.sql` があるが、remote では `20260101_a` のみ適用されていて、`20260115_c` という別のリモート専用が間に挟まっている。
→ `supabase migration repair` を慎重に使う必要があり、ユーザー判断必須。

### 4. 適用後の検証

```bash
supabase migration list
ls supabase/migrations/*.sql | wc -l
supabase migration list | grep -cE "^[[:space:]]+[0-9]"
```

数が一致し、Local 列と Remote 列が全行同じ timestamp を持っていれば OK。

スキーマ依存のテーブル名が分かっている場合は念のため確認：
```bash
supabase db remote query "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='<table>' ORDER BY ordinal_position;"
```

### 5. 影響範囲の連動チェック

DB スキーマが変わった場合、以下の場所にも影響が出る可能性がある。タスクに応じて該当部分を確認すること。

- **Edge Function（`supabase/functions/*/index.ts`）**: 列名や RPC 名を直接参照していないか
  - 変更があれば `supabase functions deploy <function-name>` を提案
- **型定義（`features/**/types.ts` など）**: 列名・enum を反映
- **RPC / トリガー**: マイグレーションで関数定義が更新されている場合、依存関数も同マイグレーションで `CREATE OR REPLACE` 済みか確認
- **RLS ポリシー**: 列追加でポリシー漏れが起きていないか

### 6. レポート（必須）

- ✅ 同期済みなら：適用件数と最終 timestamp
- 🔧 適用したなら：適用したマイグレーションの一覧と各々の意図、SQL の主要変更点
- ⚠️ Drift を見つけて未解消なら：状態と推奨対処、ユーザー判断待ちであること
- 📌 連動が必要な箇所（Edge Function 再デプロイ、型再生成など）

## 危険シグナル（即停止してユーザーに確認）

| シグナル | 対処 |
|---|---|
| Active プロジェクトが `AI coordinate` 以外 | リンク切り替えをユーザーに確認 |
| Remote にあるが Local に無い | `supabase db pull` か `migration repair` のどちらかをユーザーに選択させる |
| マイグレーション timestamp が現在時刻より未来 | 入力ミス疑い。ユーザーに確認 |
| SQL に `DROP TABLE` / `TRUNCATE` / `DELETE FROM x;`（WHERE なし） / `ALTER … DROP COLUMN` | 影響範囲をユーザーに見せて承認待ち |
| `down.sql` や `revert` 系のファイル / コメント | rollback はユーザー承認なしに実行しない |
| 同じ timestamp のマイグレーションが複数 | 衝突。ファイル名 rename をユーザーに提案 |

## 参考コマンド一覧

| 用途 | コマンド |
|---|---|
| プロジェクト一覧（Active 確認） | `supabase projects list` |
| プロジェクト切り替え | `supabase link --project-ref hnrccaxrvhtbuihfvitc` |
| マイグレーション差分 | `supabase migration list` |
| 未適用を適用 | `supabase db push` |
| リモートから取り込み | `supabase db pull` |
| 履歴修復（要承認） | `supabase migration repair --status [applied\|reverted] <timestamp>` |
| 新規マイグレーション作成 | `supabase migration new <name>` |
| ローカル schema diff（参考） | `supabase db diff` |
| リモートクエリ（読取） | `supabase db remote query "<SQL>"` |

## 「次の開発に支障を出さない」ための運用チェックリスト

開発を始める前 / 機能ブランチを切る前に：

1. `supabase projects list` で Active が AI coordinate か
2. `supabase migration list` で Local == Remote 全件
3. ローカル `supabase/migrations/*.sql` の件数と remote 件数が一致
4. 直近 5 件の timestamp が連続して見える（飛び番がない）
5. 未コミットの `supabase/migrations/*.sql` が残っていない（`git status supabase/migrations`）

すべて OK なら、新規マイグレーション作成 → 適用 → コミットの順で進められる状態。

## 失敗時の戻し方

- `supabase db push` が中断した場合：再実行で続行（Supabase 側で per-file トランザクション）
- 適用済みマイグレーションを取り消したい場合：**手動で `migration repair --status reverted <ts>` を実行する前に必ずユーザーに状況と意図を確認**
- リモート側でしか reflect されていない変更がある場合は `supabase db pull` で履歴を取り込む
