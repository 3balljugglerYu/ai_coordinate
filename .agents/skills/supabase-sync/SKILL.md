---
name: supabase-sync
description: Verify and synchronize Supabase resources (migrations + Edge Functions) between the local repository and the linked remote project for `ai_coordinate`. Use this skill when the user wants to apply pending migrations, deploy an Edge Function, check drift between local and remote state, or confirm DB / Function readiness before/after a release. Triggers include "マイグレーション適用", "マイグレーション同期", "リモートと一致してる？", "drift チェック", "db push", "supabase migration apply", "Edge Function デプロイ", "supabase functions deploy", "image-gen-worker デプロイ", "supabase 周り整えて", "次の開発に進める状態か確認して".
---

# Supabase Sync

このリポジトリの本番 Supabase プロジェクトは **AI coordinate**（ref: `hnrccaxrvhtbuihfvitc`, Sydney）。
`supabase/migrations/*.sql`（DB スキーマ）と `supabase/functions/*/`（Edge Function コード）が
ローカル正本で、リモートとの整合性を保つことが「次の開発に支障が出ない」最低条件。

このスキルは、マイグレーション同期と Edge Function デプロイの両方を一つのチェック動線で扱う。

## トリガー

- **マイグレーション系**: 「マイグレーション適用して」「db push」「drift チェック」「リモートとローカル揃ってる？」
- **Edge Function 系**: 「functions deploy」「image-gen-worker デプロイ」「Edge Function 反映」
- **総合**: 「supabase 周り整えて」「次の開発に進める状態か確認して」「リリース前にチェック」
- 開発開始時の起点確認（「データベースと関数最新？」など）

## プロジェクトガードレール

- Active プロジェクトは **必ず `AI coordinate`（ref: hnrccaxrvhtbuihfvitc）** であること。
  - 同じ Supabase アカウントに `katakanahanashi`（ref: dqdjabblnuvkblqjwwbg, Tokyo）が存在する。Active がそちらになっていたら **即停止**してユーザー確認。
- CLAUDE.md の規約に従う：
  - **破壊的操作**（`DROP TABLE`, `TRUNCATE`, `DELETE without WHERE` 等）は事前にユーザー承認を得ること
  - **rollback / down マイグレーション**はユーザー承認なしに実行しない
  - **Edge Function の削除**はユーザー承認なしに実行しない
  - 認証情報をチャット出力やコミットメッセージに残さない
- `.env.local` の Supabase 以外の秘密情報（OpenAI / Gemini / Stripe / Resend）には触れない
- main / master ブランチへの直接 push は行わない（git 操作は別物として扱う）

## 0. 事前確認（必須、両ワークフロー共通）

```bash
supabase projects list
```

- Active 行（`●`）が **AI coordinate** か確認
- 別プロジェクトが Active なら以下で対処してユーザーに報告：
  ```bash
  supabase link --project-ref hnrccaxrvhtbuihfvitc
  ```

---

## Part 1: マイグレーション同期

### 1.1. Drift チェック

```bash
supabase migration list
```

出力フォーマット：
```
   Local          | Remote         | Time (UTC)
   20260517110000 | 20260517110000 | 2026-05-17 11:00:00
```

ローカルファイル数も比較：
```bash
ls supabase/migrations/*.sql | wc -l
supabase migration list | grep -cE "^[[:space:]]+[0-9]"
```

drift の機械的判定：
```bash
supabase migration list 2>&1 | awk -F'|' '/^[[:space:]]+[0-9]/ {
  local=$1; remote=$2;
  gsub(/ /,"",local); gsub(/ /,"",remote);
  if (local != remote) print "MISMATCH: local=["local"] remote=["remote"]"
}'
```

### 1.2. ケース別の対応

#### 1.2a. 完全同期（Local == Remote 全行）
正常。次のステップ（Edge Function チェック等）に進む。

#### 1.2b. Local-only（未適用マイグレーションあり）
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

#### 1.2c. Remote-only（ローカルに無いマイグレーションがリモートで適用済み）
**勝手に `migration repair` で履歴を書き換えない**。以下のいずれかをユーザーに提案：

- **推奨**: `supabase db pull` でローカルにマイグレーションファイルを取り込む（履歴を破壊しない）
- **必要時**: `supabase migration repair --status reverted <timestamp>`（履歴書き換え、承認必須）

#### 1.2d. 順序の不整合（履歴のあいだに割り込み）
危険な状態。即停止し、ユーザーに状況報告。

### 1.3. 適用後の検証

- `supabase migration list` 全件で local == remote を確認
- 重要テーブルに変更が入った場合は `supabase db remote query "SELECT ... FROM information_schema.columns WHERE table_name='...'"` で列を確認

---

## Part 2: Edge Function デプロイ

このリポジトリには複数の Edge Function があり、変更内容によって必要な再デプロイ対象が変わる。

### 2.1. デプロイ対象の特定

#### 自明なケース
- `supabase/functions/<name>/*` を直接変更 → その関数を再デプロイ

#### shared/ 配下を変更した場合
`shared/` 配下のファイルは複数の Edge Function から import されている。変更時は**依存関数すべてを再デプロイ**する必要がある。

```bash
# 例: shared/generation/openai-image-model.ts を変更した場合
grep -rln "shared/generation/openai-image-model" supabase/functions/
```

主な共有モジュールと依存関数の対応（変更時の参考）：

| 共有ファイル | 影響する Edge Function |
|---|---|
| `shared/generation/openai-image-model.ts` | `image-gen-worker` |
| `shared/generation/prompt-core.ts` | `image-gen-worker` |
| `shared/generation/errors.ts` | `image-gen-worker` |
| `shared/generation/style-prompts.ts` | `image-gen-worker` |
| `shared/generation/one-tap-style-metadata.ts` | `image-gen-worker` |

迷ったら `grep -rln "<shared-file-path>" supabase/functions/` で確認する。

### 2.2. デプロイ実行

```bash
supabase functions deploy <function-name>
```

例：
```bash
supabase functions deploy image-gen-worker
```

#### 出力の読み方

- `Uploading asset (...)` 行：アップロードされたファイル群（shared/ 配下も含まれる）
- `Deployed Functions on project hnrccaxrvhtbuihfvitc: <name>` → 成功
- `WARNING: Docker is not running` → **ローカル開発専用の警告で、リモートデプロイには影響しない**。無視して可

#### 失敗時

- 認証エラー → `supabase login` を再実行
- ファイルが見つからない → カレントディレクトリがリポジトリルートか確認
- 関数名タイポ → `supabase functions list` で正式名を確認

### 2.3. デプロイ後の検証

```bash
supabase functions list 2>&1 | grep -E "<function-name>|NAME"
```

確認項目：
- `STATUS = ACTIVE`
- `VERSION` が前回より +1（または +N）増えていること
- `UPDATED_AT` が現在時刻に近いこと

### 2.4. デプロイしないと起きる問題

- マイグレーションは適用済み・コードは push 済みでも、**Edge Function を再デプロイしないと挙動が変わらない**
- 例：`shared/generation/openai-image-model.ts` の出力サイズ計算ロジックを変更しても、関数を再デプロイするまで実行時には旧ロジックが使われる
- リリース前にこの乖離を必ず潰す

---

## Part 3: 影響範囲の連動チェック（DB 変更時）

DB スキーマが変わった場合、以下の場所にも影響が出る可能性がある。タスクに応じて該当部分を確認する。

- **Edge Function（`supabase/functions/*/index.ts`）**: 列名や RPC 名を直接参照していないか
  - 変更があれば Part 2 のフローで `supabase functions deploy <function-name>` を実施
- **型定義（`features/**/types.ts` など）**: 列名・enum を反映
- **RPC / トリガー**: マイグレーションで関数定義が更新されている場合、依存関数も同マイグレーションで `CREATE OR REPLACE` 済みか確認
- **RLS ポリシー**: 列追加でポリシー漏れが起きていないか

---

## レポート（必須）

実行内容に応じて以下を報告：

| 状態 | 報告内容 |
|---|---|
| ✅ 同期済み・デプロイ済み | 適用件数、最終 timestamp、最新 function バージョン |
| 🔧 マイグレーション適用済み | 適用したファイル一覧、SQL の主要変更点 |
| 🚀 関数デプロイ済み | 関数名、新バージョン、ダッシュボード URL |
| ⚠️ Drift / 未デプロイ残あり | 状態と推奨対処、ユーザー判断待ちであること |
| 📌 連動が必要な箇所 | 残りの関数再デプロイ、型再生成など |

## 危険シグナル（即停止してユーザーに確認）

| シグナル | 対処 |
|---|---|
| Active プロジェクトが `AI coordinate` 以外 | リンク切り替えをユーザーに確認 |
| Remote にあるが Local に無いマイグレーション | `supabase db pull` か `migration repair` のどちらかをユーザーに選択させる |
| マイグレーション timestamp が現在時刻より未来 | 入力ミス疑い。ユーザーに確認 |
| SQL に `DROP TABLE` / `TRUNCATE` / `DELETE FROM x;`（WHERE なし） / `ALTER … DROP COLUMN` | 影響範囲をユーザーに見せて承認待ち |
| `down.sql` や `revert` 系のファイル / コメント | rollback はユーザー承認なしに実行しない |
| 同じ timestamp のマイグレーションが複数 | 衝突。ファイル名 rename をユーザーに提案 |
| 関数デプロイで `STATUS != ACTIVE` | エラーログを取得しユーザーに報告 |
| 関数の **削除** 操作 | ユーザー承認必須 |

## 参考コマンド一覧

| 用途 | コマンド |
|---|---|
| プロジェクト一覧（Active 確認） | `supabase projects list` |
| プロジェクト切り替え | `supabase link --project-ref hnrccaxrvhtbuihfvitc` |
| マイグレーション差分 | `supabase migration list` |
| 未適用マイグレーションを適用 | `supabase db push` |
| リモートから取り込み | `supabase db pull` |
| 履歴修復（要承認） | `supabase migration repair --status [applied\|reverted] <timestamp>` |
| 新規マイグレーション作成 | `supabase migration new <name>` |
| ローカル schema diff（参考） | `supabase db diff` |
| リモートクエリ（読取） | `supabase db remote query "<SQL>"` |
| 関数一覧 | `supabase functions list` |
| 関数デプロイ | `supabase functions deploy <function-name>` |
| 関数ログ参照 | `supabase functions logs <function-name>` |

## 「次の開発に支障を出さない」運用チェックリスト

開発開始時 / リリース前 / 機能ブランチを切る前に：

1. `supabase projects list` で Active が AI coordinate か
2. `supabase migration list` で Local == Remote 全件
3. ローカル `supabase/migrations/*.sql` の件数と remote 件数が一致
4. 直近 5 件の timestamp が連続して見える（飛び番がない）
5. 未コミットの `supabase/migrations/*.sql` が残っていない（`git status supabase/migrations`）
6. `shared/` 配下の最近の変更があるなら、依存する Edge Function を再デプロイ済みか
7. `supabase functions list` で全関数 STATUS=ACTIVE、最終更新時刻が想定どおり

すべて OK なら、新規開発を始められる状態。

## 失敗時の戻し方

- `supabase db push` が中断した場合：再実行で続行（Supabase 側で per-file トランザクション）
- 適用済みマイグレーションを取り消したい場合：**手動で `migration repair --status reverted <ts>` を実行する前に必ずユーザーに状況と意図を確認**
- リモート側でしか reflect されていない変更がある場合は `supabase db pull` で履歴を取り込む
- Edge Function デプロイで意図しない挙動になった場合：前バージョンを再デプロイするか、ダッシュボードの旧バージョンに切り替え（ユーザー承認のうえで）
