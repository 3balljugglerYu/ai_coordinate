# Phase B 実装サマリ: legacy画像メタデータ列のDROP

## ブランチ

- `refactor/drop-legacy-image-metadata-columns`

## 目的

Phase Aでアプリケーション・Edge Function・型・テストから `aspect_ratio` / `background_change` への依存を削除済みのため、Phase BではDB上に残っている legacy カラムと関連indexを削除する。

## 変更ファイル

| ファイル | 内容 |
| --- | --- |
| `supabase/migrations/20260426170000_drop_legacy_image_metadata_columns.sql` | legacy列と関連indexをDROPするmigrationを追加 |
| `.cursor/rules/database-design.mdc` | schema ledgerからDROP対象カラム・indexを削除し、現行source of truthを明記 |
| `docs/planning/remove-legacy-image-metadata-usage-plan.md` | Phase Bの実装migrationファイル名を追記 |
| `docs/planning/drop-legacy-image-metadata-columns-implementation-summary.md` | レビュー用の実装サマリと復旧方針を記載 |

## 追加migration

```sql
-- supabase/migrations/20260426170000_drop_legacy_image_metadata_columns.sql

-- Drop legacy image metadata columns after Phase A removed all runtime usage.
-- `background_mode` is the source of truth for background behavior.
-- `width` / `height` are the source of truth for image dimensions and orientation derivation.

DROP INDEX IF EXISTS public.idx_generated_images_aspect_ratio;

ALTER TABLE public.generated_images
  DROP COLUMN IF EXISTS aspect_ratio,
  DROP COLUMN IF EXISTS background_change;

ALTER TABLE public.image_jobs
  DROP COLUMN IF EXISTS background_change;
```

## DROP対象

| 対象 | 理由 |
| --- | --- |
| `public.idx_generated_images_aspect_ratio` | `generated_images.aspect_ratio` 削除に伴い不要 |
| `public.generated_images.aspect_ratio` | `width` / `height` から向き判定を派生するため不要 |
| `public.generated_images.background_change` | `background_mode` が背景設定のsource of truthになったため不要 |
| `public.image_jobs.background_change` | `background_mode` がjob側のsource of truthになったため不要 |

## schema ledger更新

`.cursor/rules/database-design.mdc` を更新。

### `image_jobs`

- `background_change` を主要カラム一覧から削除
- 備考に `background_mode` の値を明記
  - `keep`
  - `ai_auto`
  - `include_in_prompt`

### `generated_images`

- `background_change` を主要カラム一覧から削除
- `aspect_ratio` を主要カラム一覧から削除
- 備考に `background_mode` の値を明記
  - `keep`
  - `ai_auto`
  - `include_in_prompt`
- `width` / `height` の説明を「サイズ表示と画像向き判定用」に更新

### index一覧

- `idx_generated_images_aspect_ratio` を削除

## 計画書更新

`docs/planning/remove-legacy-image-metadata-usage-plan.md` の Phase B セクションに、実装migrationファイル名を追記。

```md
実装ファイル: `supabase/migrations/20260426170000_drop_legacy_image_metadata_columns.sql`
```

## 事前確認

### Supabase remote上のDROP対象存在確認

remote DB上で以下が存在することを確認済み。

| 対象 | 存在 |
| --- | --- |
| `generated_images.aspect_ratio` | true |
| `generated_images.background_change` | true |
| `image_jobs.background_change` | true |
| `idx_generated_images_aspect_ratio` | true |

### runtime参照ゼロ確認

以下のコマンドで、アプリ・Edge Function・テスト配下に legacy名の参照がないことを確認済み。

```bash
rg -n "background_change|aspect_ratio" app features supabase/functions tests -g '!node_modules'
```

結果: 0件

### schema ledger参照ゼロ確認

```bash
rg -n "background_change|aspect_ratio|idx_generated_images_aspect_ratio" .cursor/rules/database-design.mdc
```

結果: 0件

### migration dry-run

```bash
supabase db push --dry-run
```

結果:

```text
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 20260426170000_drop_legacy_image_metadata_columns.sql
Finished supabase db push.
```

実DBには未適用。

### Post詳細表示の確認

Phase A後の実生成で、生成結果が `generated_images.width` / `height` を保持していることを確認済み。
Post詳細は `width` / `height` 由来でモデル名・サイズ表示と画像レイアウトを維持する前提であり、`aspect_ratio` 列には依存しない。

## 期待する状態

Migration適用後:

- `generated_images.aspect_ratio` は存在しない
- `generated_images.background_change` は存在しない
- `image_jobs.background_change` は存在しない
- `idx_generated_images_aspect_ratio` は存在しない
- 生成背景のsource of truthは `background_mode`
- 画像サイズ・向き判定のsource of truthは `width` / `height`

## 注意点

- これは破壊的DB変更のため、Phase Aが本番deploy済みであることが前提。
- Phase A後の実生成で、`image_jobs` -> `image-gen-worker` -> `generated_images` の成功確認済み。
- 直近生成では `background_mode` が保存され、`width` / `height` も保存されていることを確認済み。
- 古い行では `generated_images.generation_metadata` JSONB 内に `{"background_change": ...}` が残る可能性がある。これは列DROP対象外の履歴メタデータであり、Phase A後のruntimeでは読み取らないため動作影響はない。
- `supabase db push --dry-run` のみ実行しており、migrationはまだremote DBへ適用していない。

## 復旧方針

`DROP COLUMN` は列データを削除するため、通常のrollback migrationでは元データを完全復元できない。問題が発生した場合は、まずPhase B migration適用前のバックアップまたはPoint-in-Time Recoveryで復旧する。

やむを得ず列だけを再作成する場合の復元方針:

- `generated_images.aspect_ratio`: `width` / `height` が揃う行は `height > width` なら `portrait`、それ以外は `landscape` として再計算する。
- `generated_images.background_change`: `background_mode = 'ai_auto'` の行を `true`、それ以外を `false` として再作成する。
- `image_jobs.background_change`: `background_mode = 'ai_auto'` の行を `true`、それ以外を `false` として再作成する。
