# 複数枚生成（1回で最大4枚）の廃止

作成日: 2026-08-15
関連: `features/generation/components/GenerationFormContainer.tsx` / `features/subscription/subscription-config.ts`

## 背景と判断

coordinate 画面と inspire 画面にあった「1回の生成で最大4枚」を廃止する。

### 使われていなかった

| 枚数 | ジョブ数 | ユーザー数 | 最終利用 |
|---|---:|---:|---|
| 1枚 | 4,559 | 133人 | 2026-08-14 |
| 2枚 | 11 | 2人 | 2026-06-07 |
| 4枚 | 3 | 1人 | 2026-05-01 |

複数枚は全 4,573 ジョブ中 **14件（0.31%）**。2人のうち片方は `ADMIN_USER_IDS` に含まれる
運営アカウントなので、**実ユーザーは1人だけ**（light プラン・8件・最終利用 2026-06-07）。

### コスト削減が理由ではない

入力画像とプロンプトの課金は**リクエストにつき1回**（[[ai-cost-accuracy-and-medium-unlock-plan]]）。
4枚まとめて生成すると入力ぶん ¥1.86 は1回で済むが、廃止して4回に分ければ ¥1.86 × 4 かかる。
消費ペルコインは `cost × 枚数` で変わらないので、**廃止するとこちらの持ち出しは微増**する。
利用者が1人なので実害はないが、「コスト削減のため」という理由付けは成り立たない。

### 廃止する理由は複雑さ

「1ジョブ = 複数画像」という構造が、生成というアプリで最も重要な経路に
分岐を持ち込んでいた。実際にこの構造は原価集計のバグを生んでいる
（入力ぶんを画像行ごとに重複計上。PR #518 のレビューで発覚）。

- クライアント: OpenAI はバッチ1回投稿 / Gemini は N 回ループ投稿の2経路
- 進捗表示: 「ジョブ数」と「画像数」がずれるため `progressUnitsByJobId` の Map で換算
- リロード復旧: 復旧時にも同じ換算が必要
- API: 枚数を決めるためだけにサブスクプラン取得 RPC を1回追加で叩いていた

## ADR

### ADR-009: 有料プランの訴求から「1回の最大生成枚数」を外す

- **Context**: この機能は料金ページのプランカードで **✓付き特典5項目のうち1つ**として
  宣伝していた（Free=1 / Light=2 / Standard=4 / Premium=4）。廃止は
  「宣伝している有料特典を消す」ことになる。
- **Decision**: 特典行ごと削除し、15言語の文言と `monetization.md` のプラン表からも外す。
- **Reason**: 実ユーザーが1人で、その1人も2か月以上使っていない。
  Standard と Premium は同値（4枚）なので上位プランの差別化には効いておらず、
  効いていたのは Free と Light の差だけ。残る訴求4項目（全モデル解放 /
  月次ペルコイン / ストック画像上限 / 投稿・ログイン特典倍率）は維持される。
- **Consequence**: **Light プランの訴求が5項目→4項目に減る。**
  過去に利用していた1人には事実上の機能縮小になる。

### ADR-010: DBカラムは残す

- **Context**: `image_jobs.requested_image_count` と
  `generated_images.image_job_result_index` を DROP するか。
- **Decision**: **残す。** 新規ジョブは常に `requested_image_count = 1` を書く。
- **Reason**: マイページの累計生成数 `get_user_generated_count` が
  `sum(coalesce(requested_image_count, 1))` に依存している
  （`20260518130000_add_my_page_stats_rpcs.sql:9-25`）。DROP すると
  **過去に複数枚生成したユーザーの累計生成数が減る**。
  また完了RPC `complete_image_job_with_prompt_secrets` は13本の migration で
  再定義されており、書き換えの手間とリスクに見合わない。
- **Consequence**: 使われないカラムが残る。migration は1本も不要。

### ADR-011: OpenAI クライアントの `n` は残す

- **Context**: `callOpenAIImageEditBatch` / `callOpenAIImageEditMultiInputBatch` の
  `n` パラメータを消すか。
- **Decision**: 呼び出し側を `n: 1` に固定し、パラメータ自体は残す。
- **Reason**: この2関数の使い分けは「出力枚数」ではなく
  **入力画像が1枚か複数枚か**（inspire のテンプレ画像 / One-Tap dual）で決まる。
  Batch 関数そのものは削除できない。`n` はプロバイダAPIの引数であって
  プロダクト機能ではない。
- **Consequence**: Deno版・Node版の2ファイルに `n` が残るが、常に 1 で呼ばれる。

## 変更点

| ファイル | 変更内容 |
|---|---|
| `GenerationForm.tsx` | 枚数選択UI・state・handler・クランプ effect・`onSubmit` の `count` を削除 |
| `InspirePageClient.tsx` | `CountSelector` とラベル・`count` を削除 |
| `GenerationFormContainer.tsx` | バッチ vs ループの2経路を単発送信に統一。`progressUnitsByJobId` と換算ヘルパ3つ、`isOpenAIBatchGeneration` を削除 |
| `schema.ts` | `count` フィールドを削除（旧クライアントが送っても無視される） |
| `generate-async/handler.ts` | `acceptedImageCount` 算出とサブスクプラン取得RPCを削除。`requested_image_count: 1` 固定 |
| `generation-status` 2経路 | `requestedImageCount` / `batchMode` をレスポンスから削除 |
| `image-gen-worker/index.ts` | `getRequestedImageCount` を削除。`n: 1` 固定。課金の掛け算を削除 |
| `subscription-config.ts` | `maxGenerationCount` と `getMaxGenerationCount()` を削除 |
| `PricingPlans.tsx` | 特典行を削除 |
| `messages/*.ts` × 15 | 枚数関連7キーと、説明文2件の「生成枚数」表現を削除 |
| ドキュメント3件 | `monetization.md` のプラン表から列を削除、`TECHNICAL.md`、`API.md` |

**マイグレーションなし。**

## 副次的に塞がった穴

1. **inspire の枚数セレクタがプラン上限を見ていなかった** — 無課金でも1〜4が押せた
   （サーバー側の `Math.min` で実害はなかったが、押せてしまっていた）
2. **Gemini 経路のプラン上限がサーバーで検証されていなかった** — クライアントの
   `Math.min` だけだった。`count` 自体が無くなったので検証対象も消えた

## 残タスク

1. **過去に利用していた1人への告知の要否** — light プラン・最終利用 2026-08-15 時点で
   2か月以上前。事実上の機能縮小にあたるため、運営判断が要る
2. `resultImages` は配列のまま残している（要素は常に1つ）。結果表示の配線であり、
   inspire 側の表示にも波及するため今回は触っていない
