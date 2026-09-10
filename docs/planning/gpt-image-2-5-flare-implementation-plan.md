# GPT Images 2.5 (flare) 導入 実装計画

作成日: 2026-09-10
対象: `gpt-image-2.5-flare` を Persta.AI の生成エンジンとして選べるようにする(第一段階は運営限定)

---

## 0. ヒアリング結果(合意事項)

| 項目 | 決定 |
|------|------|
| 移行方針 | **まず運営だけで 2.5 を使えるようにして検証**。既存 `gpt-image-2` は残す |
| 導入モデル | **`gpt-image-2.5-flare` のみ**(`sunburst` は今回見送り) |
| 品質段数 | **既存と同じ low / medium / high の3段**(2.5 の `xhigh` / `max` は出さない) |
| ペルコイン | **2.0 と同額に揃える** |
| セレクター | **「ChatGPT Images 2.5」を1行追加(計4行)**。2.0 と並べて見比べられる形 |
| 検証の合格ライン | ①うちの子の同一性が 2.0 以上 ②生成時間が短い ③実原価が 2.0 と同等以下 ④エラー・保存の事故がない |
| 検証環境 | **本番で運営アカウントだけに開ける** |

---

## 1. コードベース調査結果

### 1-0. Supabase 接続確認(B-1)

**接続できる。** CLI v2.117.0 では macOS Keychain の承認ダイアログ待ちでハングしたため、**v2.95.4 へ戻して `brew pin` した**(2026-09-10)。旧バイナリは既に Keychain の許可を持っており、ダイアログなしで通る。

### 1-0b. 本番の実測ベースライン(2026-09-10 取得)

検証の合格ラインを数字で判定できるよう、2.0 側の現状を先に測っておいた。

**`generated_images.model` の分布(OpenAI 系のみ・全期間)**

| model | 件数 |
|---|---:|
| `gpt-image-2-low-1k` | 3,806 |
| `gpt-image-2-medium-1k` | 375 |
| `gpt-image-2-low`(legacy) | 350 |
| `gpt-image-2-medium-2k` | 10 |
| `gpt-image-2-high-4k` | 6 |
| `gpt-image-2-medium-4k` | 5 |
| `gpt-image-2-high-1k` | 4 |
| `gpt-image-2-low-4k` | 3 |
| `gpt-image-2-low-2k` | 1 |
| `gpt-image-2-high-2k` | **0** |

⭐ **`low-1k` だけで OpenAI 生成の 83%。** 比較は必ず `low-1k` を基準にすること。他の SKU は件数が1桁で、そこで比べても差がノイズに埋もれる。

**生成時間(`image_jobs` の `started_at` → `completed_at`・succeeded のみ・直近90日)**

| model | 件数 | 平均 | 中央値 | p90 |
|---|---:|---:|---:|---:|
| `gpt-image-2-low-1k` | 3,642 | 35.0s | **32.4s** | 50.4s |
| `gpt-image-2-medium-1k` | 387 | 48.7s | 46.5s | 59.2s |
| `gpt-image-2-medium-2k` | 8 | 50.4s | 48.9s | 62.3s |
| `gpt-image-2-medium-4k` | 3 | 55.0s | 51.3s | 60.7s |
| `gpt-image-2-high-4k` | 1 | 95.9s | 95.9s | 95.9s |

⭐ **合格ライン②(生成時間)の判定基準**: `low-1k` の中央値 **32.4 秒**が基準。公称「レイテンシ約50%減」が本当なら 2.5 は **16秒台**に入るはず。ただし `image_jobs` の所要時間には入力画像の取得と Storage への保存も含まれるので、OpenAI 単体の時間ではない点に注意(**差が半分にならなくても即失格ではない**)。

**CHECK 制約の現況**: `generated_images_model_check` / `image_jobs_model_check` はいずれも本番に存在し、16値(canonical 15 + legacy `gpt-image-2-low`)を列挙している(定義長 553 文字・両者同一)。

### 1-1. モデル ID の型体系

`shared/generation/openai-image-model.ts` が OpenAI 系すべての正本。

```
canonical model = `gpt-image-2-{low|medium|high}-{1k|2k|4k}`   … 9通り
```

この 9 値が **型・ペルコイン単価・原価表・UI ラベル・ゲスト/無課金の許可リスト・DB の CHECK 制約** すべての起点になっている。

Gemini 側には**すでに family の先例がある**(`shared/generation/gemini-banana-model.ts`)。`GEMINI_BANANA_FAMILIES = ["nano-2", "nano-pro"]` + `composeGeminiBananaModel(family, sizeTier)` + `parseGeminiBananaModel()` が `{canonical, family, sizeTier}` を返す形。**OpenAI 側にも同じ形を持ち込むのが最小の変更**になる。

### 1-2. API に投げるモデル名はハードコード4箇所

| ファイル | 行 | ランタイム |
|---|---|---|
| `features/generation/lib/openai-image.ts` | 322, 433 | Node(ゲスト同期経路) |
| `supabase/functions/image-gen-worker/openai-image.ts` | 274, 393 | Deno(非同期 worker・本流) |

いずれも `form.append("model", "gpt-image-2")`。この2ファイルは**ビット同等を保つ規約**がコメントで明示されている(変更時は両方を同期させること)。

送信フィールドは `model / prompt / image[] / size / quality / moderation / output_format / n`。

### 1-3. プロバイダ判定とプレフィックス判定の落とし穴

```
"gpt-image-2.5-flare-low-1k".startsWith("gpt-image-")   → true   ✅ OpenAI ルーティングはそのまま通る
"gpt-image-2.5-flare-low-1k".startsWith("gpt-image-2-") → false  ✅ 2.0 用の判定には誤爆しない
```

| 箇所 | 現状 | 2.5 追加時 |
|---|---|---|
| `features/generation/types.ts:210` `isOpenAIImageModel` | `startsWith("gpt-image-")` | **変更不要**(2.5 も OpenAI 経路へ乗る) |
| `supabase/functions/image-gen-worker/index.ts:616` 同上 | 同上 | **変更不要** |
| `features/generation/lib/model-display.ts:17` | `startsWith("gpt-image-")` → `"ChatGPT Images 2.0"` | ⚠️ **2.5 を 2.0 と誤表示する。2.5 の分岐を先に置く** |
| `features/generation/lib/model-tags.ts:78-84` | `startsWith("gpt-image-2-low")` 等 | ⚠️ 2.5 は**どれにも当たらず tier チップが消える**。分岐追加が必要 |

### 1-4. UI(モデル選択)

```
GenerationModelControls (共通・4導線から呼ばれる)
 ├─ LockableModelSelect        … 1段目: ChatGPT Images 2.0 / Nano Banana 2 / Nano Banana Pro
 ├─ GptImage2QualitySelector   … OpenAI 選択時のみ描画(parseGptImage2Model が null なら非表示)
 ├─ GptImage2SizeSelector      … 同上
 └─ GeminiBananaSizeSelector   … Gemini 選択時のみ描画
```

呼び出し元は4つ。**共通コンポーネントなので1箇所直せば4導線すべてに反映される。**

| 呼び出し元 | 画面 |
|---|---|
| `features/style/components/StylePageClient.tsx:2269` | `/style`(ワンタップ) |
| `features/generation/components/GenerationForm.tsx:786` | coordinate / じゆうモード |
| `features/inspire/components/InspirePageClient.tsx:339` | inspire |
| `features/inspire/components/CreatorLooksDetailClient.tsx:250` | Creator Looks 詳細 |

4箇所とも `subscriptionPlan` を props で受け取り、`isModelSelectable={subscriptionPlan === "free" ? isFreePlanAllowedModel : undefined}` を渡している。

### 1-5. 段階公開(運営限定)の確立パターン

`lib/env.ts` に判定を1本化する形が定着している。

```ts
export function isXxxPubliclyEnabled(): boolean { return env.NEXT_PUBLIC_XXX_ENABLED === "true"; }
export function isXxxAvailable(userId: string | null | undefined): boolean {
  return isXxxPubliclyEnabled() || isAdminViewer(userId);
}
```

クライアントへは **Provider(初期値=フラグ) + Suspense 隔離した Loader が true へ昇格** の2段構え(`PopularPromptsAvailabilityProvider` / `PopularPromptsAvailabilityLoader`、`components/LocaleShell.tsx:53,69`)。`ADMIN_USER_IDS` は `NEXT_PUBLIC_` を持たないサーバー専用値なので、クライアント単独では判定できない。

Loader は「一般公開後は即 return null」「`sb-` cookie が無ければ即 return null」で、大半の閲覧者に認証往復を発生させない作りになっている。

### 1-6. サーバー側のモデル検証

| ルート | 検証 |
|---|---|
| `app/api/generate-async/handler.ts:154-165` | `model \|\| DEFAULT_GENERATION_MODEL` → `isModelAvailableForGeneration()` |
| `app/(app)/style/generate-async/handler.ts:161-165, 288-296` | `isKnownModelInput()` → `normalizeModelName()` → `isModelAvailableForGeneration()` |
| `features/generation/lib/schema.ts:103` | `z.enum(KNOWN_MODEL_INPUTS)` |

`isModelAvailableForGeneration()` は **userId を取らない**ので、運営限定ゲートは別途この2ハンドラに足す必要がある(いずれも `user.id` は手元にある)。

### 1-7. 原価表

`features/admin-dashboard/lib/ai-cost-rates.ts`

- `basis: "measured" | "published" | "derived"` を持ち、admin ダッシュボードのカードに表示される(`AdminAiCostCard.tsx:201`)
- ⚠️ **`MODEL_COST_RATES` に未登録のキーは `getModelRate()` が null を返し、そのモデルの原価が丸ごと 0 円として消える**(ファイル内コメントに明記)
- gpt-image-2 の実測値: 入力画像 1,496 tok(品質・サイズ非依存の固定費)、出力 1k tier で low 172 / medium 1,587 / high 6,345 tok

### 1-8. 既に解決済みだった懸念

`supabase/migrations/20260821100000_raise_generated_images_size_limit.sql` で **`generated-images` バケットの上限は 10MB → 25MB に引き上げ済み**(2026-08-21)。4K 出力が保存で落ちる問題は解消されている。2.5 の 4K でも同じ受け皿が使える。

### 1-9. i18n

`messages/` は **16言語**。`messages/ja.ts` が正本で、他15ファイルが `satisfies DeepReplaceStrings<typeof jaMessages>` を持つ。**ja.ts にキーを足すと残り15ファイルすべてで typecheck が落ちる**ため、16ファイル同時に追加する必要がある。モデル名はブランド名なので全言語同一の値でよい(既存 `modelChatGptImages: "ChatGPT Images 2.0"` が16ファイルとも同じ)。

### 1-10. DB の CHECK 制約

`generated_images_model_check` / `image_jobs_model_check` の2本が canonical 値を列挙している。直近の更新は `supabase/migrations/20260510120000_extend_gpt_image_2_models.sql`(DROP → ADD で全列挙し直す形式)。

---

## 2. 概要図

### 2-1. モデル ID の構造(新旧)

```mermaid
flowchart TD
    A["canonical model ID"] --> B["family"]
    A --> C["quality"]
    A --> D["sizeTier"]
    B --> B1["gpt-image-2 : 既存"]
    B --> B2["gpt-image-2.5-flare : 新規"]
    C --> C1["low / medium / high"]
    D --> D1["1k / 2k / 4k"]
    B2 --> E["例: gpt-image-2.5-flare-low-1k"]
    E --> F["API へは family をそのまま model として送る"]
```

### 2-2. 生成リクエストのシーケンス

```mermaid
sequenceDiagram
    participant U as AdminUser
    participant C as LockableModelSelect
    participant A as GenerateAsyncHandler
    participant DB as ImageJobs
    participant W as ImageGenWorker
    participant O as OpenAI

    U->>C: ChatGPT Images 2.5 を選ぶ
    C->>C: useGptImage25Available が true のときだけ行を出す
    U->>A: POST 生成リクエスト model=gpt-image-2.5-flare-low-1k
    A->>A: isKnownModelInput で受理
    A->>A: isGptImage25Available で運営か判定
    A->>DB: INSERT image_jobs model=gpt-image-2.5-flare-low-1k
    W->>DB: ジョブ取得
    W->>W: parseOpenAIImageModel で family/quality/sizeTier を復元
    W->>O: POST images/edits model=gpt-image-2.5-flare
    O-->>W: 画像 と usage
    W->>DB: complete_image_job_with_prompt_secrets
```

### 2-3. 運営限定ゲートの二重化

```mermaid
flowchart TD
    S["NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED"] --> P["Provider 初期値"]
    P --> V{"available"}
    L["Loader がサーバーで isAdminViewer を判定"] -->|true へ昇格のみ| V
    V -->|true| UI["セレクターに 2.5 の行を出す"]
    V -->|false| HIDE["行を出さない"]
    UI --> REQ["生成リクエスト"]
    HIDE -.->|直叩き| REQ
    REQ --> G{"サーバー側 isGptImage25Available"}
    G -->|true| JOB["ジョブ作成"]
    G -->|false| ERR["400 で拒否"]
```

### 2-4. 検証から一般公開までの状態遷移

```mermaid
stateDiagram-v2
    [*] --> 未実装
    未実装 --> 運営のみ: フラグ未登録 かつ isAdminViewer で通す
    運営のみ --> 実測済み: 品質と時間と原価を計測して原価表を measured へ
    実測済み --> 一般公開: NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED を true にして再デプロイ
    実測済み --> 撤退: 合格ラインに届かなければ行を消す
    一般公開 --> 二系統併存: 2.0 と 2.5 を両方残す
    一般公開 --> 二五へ統一: 2.0 の行を落とす 別PR
```

---

## 3. EARS(要件定義)

### 3-1. モデル選択

- **REQ-001** (状態駆動) — While the viewer is an admin viewer, the system shall display a "ChatGPT Images 2.5" row in the generation model selector on all four generation surfaces.
  運営プレビュー権限を持つ利用者に対し、4つの生成導線すべてのモデルセレクターに「ChatGPT Images 2.5」の行を表示すること。

- **REQ-002** (状態駆動) — While `NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED` is not `"true"` and the viewer is not an admin viewer, the system shall not display the "ChatGPT Images 2.5" row.
  フラグが未設定で運営でもない利用者には、2.5 の行を表示しないこと。

- **REQ-003** (イベント駆動) — When the user switches to the ChatGPT Images 2.5 row, the system shall preserve the currently selected quality and size tier if valid, and otherwise fall back to `low` / `1k`.
  2.5 の行へ切り替えたとき、現在の品質とサイズが有効ならそれを維持し、無効なら low / 1k へ落とすこと。

- **REQ-004** (オプション) — Where the selected model family is `gpt-image-2.5-flare`, the system shall offer only `low` / `medium` / `high` as quality options.
  2.5 を選択中の品質選択肢は low / medium / high の3つに限ること(`xhigh` / `max` は提示しない)。

### 3-2. 生成の実行

- **REQ-005** (イベント駆動) — When a generation job whose model family is `gpt-image-2.5-flare` is dispatched, the system shall send `model=gpt-image-2.5-flare` to the OpenAI images API.
  family が 2.5 のジョブを実行するとき、OpenAI へ `model=gpt-image-2.5-flare` を送ること。

- **REQ-006** (異常系) — If a generation request specifies a `gpt-image-2.5-flare-*` model and the requester is not an admin viewer while the public flag is off, then the system shall reject the request with HTTP 400 and not create an image job.
  段階公開中に運営以外が 2.5 を指定して直接リクエストした場合、400 で拒否しジョブを作らないこと。

- **REQ-007** (イベント駆動) — When a 2.5 job completes, the system shall persist `generated_images.model` and `image_jobs.model` as the full canonical ID including the family.
  2.5 のジョブ完了時、family を含む canonical ID をそのまま DB へ保存すること(あとから 2.0 と区別して集計できるようにするため)。

- **REQ-008** (状態駆動) — While the model family is `gpt-image-2.5-flare`, the system shall apply the same per-quality request timeouts as `gpt-image-2` (low 90s / medium 180s / high 300s) until measured otherwise.
  実測するまでは、2.5 のリクエストタイムアウトは 2.0 と同じ値を使うこと。

### 3-3. 課金と原価

- **REQ-009** (状態駆動) — While a 2.5 model is selected, the system shall charge the same percoin amount as the corresponding 2.0 model.
  2.5 選択時のペルコイン消費量は、対応する 2.0 のモデルと同額とすること。

- **REQ-010** — The system shall register every `gpt-image-2.5-flare-*` canonical value in `MODEL_COST_RATES`.
  9つの canonical 値すべてを原価表に登録すること(未登録は原価 0 円として黙って消えるため)。

- **REQ-011** (状態駆動) — While the 2.5 rates have not been measured, the system shall label them `basis: "derived"` in the admin cost dashboard.
  実測前の 2.5 の単価は `derived` として表示し、実測値でないことが読み取れるようにすること。

### 3-4. 表示

- **REQ-012** (イベント駆動) — When a post or generation history entry was generated with a 2.5 model, the system shall display the brand name "ChatGPT Images 2.5".
  2.5 で生成された画像には「ChatGPT Images 2.5」と表示すること(2.0 と混同させない)。

### 3-5. 既存への非干渉

- **REQ-013** — The system shall keep every existing `gpt-image-2-*` behavior unchanged, including the API model name sent to OpenAI, percoin costs, allowed-model lists, and displayed brand name.
  既存 `gpt-image-2-*` の挙動(API へ送るモデル名・ペルコイン・許可リスト・表示名)を一切変えないこと。

- **REQ-014** (異常系) — If a stored preference in `localStorage` names a 2.5 model but the viewer may not use it, then the system shall clamp the effective model to `DEFAULT_GENERATION_MODEL` without rewriting the stored value.
  localStorage に 2.5 が残っている利用者が権限を失った場合、保存値は書き換えず実効値だけ既定モデルへ丸めること。

---

## 4. ADR(設計判断記録)

### ADR-001: family を canonical model ID に含める(env フラグで worker の投げ先を切り替えない)

- **Context**: 「2.0 と 2.5 のどちらを OpenAI へ投げるか」の情報をどこに持つか。worker の環境変数で切り替える案もある。
- **Decision**: canonical model ID に family を含め(`gpt-image-2.5-flare-low-1k`)、DB に保存する。
- **Reason**: 合格ラインに「実原価が 2.0 と同等以下」「生成時間が短い」が含まれる。env で切り替えると **DB のどの行が 2.5 で生成されたか判別できず、検証そのものが成立しない**。原価表・生成時間の集計・投稿詳細の表示はすべて `model` 値を起点にしている。
- **Consequence**: CHECK 制約に9値の追加が要る。UI・型・原価表の変更点が増えるが、いずれも既存の列挙に足すだけで済む。

### ADR-002: Gemini 側と同じ family 型体系を OpenAI 側にも持ち込む

- **Context**: `parseGptImage2Model()` は quality と sizeTier だけを返し、family の概念がない。UI・worker・ゲスト経路の計8箇所がこれに依存している。
- **Decision**: `shared/generation/openai-image-model.ts` に `OPENAI_IMAGE_FAMILIES` / `composeOpenAIImageModel(family, quality, sizeTier)` / `parseOpenAIImageModel()` を追加し、8箇所を移行する。`parseGptImage2Model` は削除する。
- **Reason**: `shared/generation/gemini-banana-model.ts` が全く同じ形(`GEMINI_BANANA_FAMILIES` / `composeGeminiBananaModel` / `parseGeminiBananaModel`)で既に動いており、Gemini 側の selector もこれで書かれている。**新しいパターンを持ち込まずに済む。**
- **Consequence**: `parseGptImage2Model` を残して並存させる案より初期の変更点は多いが、「2.0 用と汎用の2つのパーサ」が並ぶ状態を作らない。片方だけ直して事故る型を潰す。

### ADR-003: 運営限定は Provider + Loader パターンで配る(props を引き回さない)

- **Context**: セレクターの行を出す判定はクライアント側で要る。`ADMIN_USER_IDS` はサーバー専用値なのでクライアント単独では判定できない。4つの呼び出し元はいずれも `subscriptionPlan` を props で受けており、そこに1つ足す案もある。
- **Decision**: `PopularPromptsAvailabilityProvider` / `Loader` と同じ形の `GptImage25AvailabilityProvider` / `Loader` を作り、`LocaleShell` に1組だけ置く。`LockableModelSelect` が hook で読む。
- **Reason**: props 案は「4つのクライアント + その4つを描くサーバーページ」の計8ファイルに触る。Provider 案は provider / loader / LocaleShell / LockableModelSelect の4ファイルで済み、しかも**検索・人気タブと同じ形**になる。
- **Consequence**: Provider の外では `false`(閉じる側)に倒れる。`LocaleShell` の内側で描かれないツリーがあれば行が出ない。既存2つと同じ注意点。

### ADR-004: 原価は `derived` で登録し、実測後に `measured` へ更新する

- **Context**: 単価(per 1M tokens)は 2.0 と同額だが、**出力画像のトークン数が同じとは限らない**。実測は Phase 4 で行う。
- **Decision**: Phase 1 の時点で 2.0 の実測値をそのまま流用し、`basis: "derived"` で9値すべて登録する。
- **Reason**: 未登録のキーは `getModelRate()` が null を返し、原価が丸ごと 0 円として消える(2026-08-14 以前に実際に起きている)。「暫定値でも入れておく」ほうが「黙って 0 円」より安全で、`derived` ラベルが admin カード上で不確かさを明示する。
- **Consequence**: 実測前のダッシュボードは 2.5 の原価を 2.0 と同額として表示する。Phase 4 で実測して置き換える。

### ADR-005: デプロイ順序は マイグレーション → worker → Next.js

- **Context**: 3つのデプロイ先(DB / Edge Function / Vercel)がある。
- **Decision**: 必ず この順で適用する。
- **Reason**:
  - Next.js を先に出すと、運営が 2.5 を選んだ瞬間 `image_jobs` の INSERT が CHECK 制約違反で落ちる
  - worker が古いまま 2.5 のジョブが積まれると、worker の `normalizeModelName()` が `Invalid GPT Image 2 model` を投げてジョブが全部 failed になる
  - 逆順(migration → worker)は**どちらも既存の挙動を1ミリも変えない**ので、間に人間の確認時間を挟んでよい
- **Consequence**: 3ステップの手動デプロイになる。Phase 5 の手順に明記する。

### ADR-006: 品質は 3段のまま。`xhigh` / `max` は入れない

- **Context**: 2.5 は `low / medium / high / xhigh / max / auto` をサポートする。
- **Decision**: `low / medium / high` の3段に限る。
- **Reason**: 検証の目的は「同じ設定で 2.0 と 2.5 を見比べる」こと。段数が違うと比較にならない。加えて `xhigh` / `max` は出力トークン数が未知で、原価とタイムアウトの両方を実測しないと出せない。
- **Consequence**: quality と sizeTier の軸を 2.0 とそのまま共有できる(`GPT_IMAGE_2_QUALITIES` / `GPT_IMAGE_2_SIZE_TIERS` を使い回す)。将来 `xhigh` を足すときは family ごとに許可 quality を持つ形へ拡張する。

---

## 5. 実装計画(フェーズ + TODO)

### フェーズ間の依存関係

```mermaid
flowchart LR
    P1["Phase 1: 型体系と原価表"] --> P2["Phase 2: DB と worker"]
    P2 --> P3["Phase 3: 段階公開ゲート"]
    P3 --> P4["Phase 4: UI と表示"]
    P4 --> P5["Phase 5: デプロイと実測"]
    P5 --> P6["Phase 6: 一般公開の判断"]
```

---

### Phase 1: 型体系の family 化と原価表(UI 変更なし)

**目的**: canonical model ID に family の概念を導入し、既存 9 値の挙動を1ミリも変えないまま 2.5 の 9 値を型として受け入れられる状態にする。
**ビルド確認**: `npm run lint` / `npm run typecheck` / `npm run test` / `npm run build -- --webpack` がすべて通る。UI 上は何も変わらない(2.5 はどこにも出ない)。

- [ ] `shared/generation/openai-image-model.ts` に family 型体系を追加(既存 `shared/generation/gemini-banana-model.ts` の構造をそのまま写す)
  - `OPENAI_IMAGE_FAMILIES = ["gpt-image-2", "gpt-image-2.5-flare"]`
  - `GptImage25FlareCanonicalModel` / `OpenAIImageCanonicalModel`
  - `OPENAI_IMAGE_CANONICAL_MODELS`(18値)
  - `composeOpenAIImageModel(family, quality, sizeTier)`
  - `parseOpenAIImageModel(value) -> {canonical, family, quality, sizeTier} | null`(legacy `gpt-image-2-low` の正規化もここに含める)
  - `toOpenAIApiModelName(family)`(family 文字列がそのまま API モデル名)
  - `OPENAI_IMAGE_PERCOIN_COSTS`(2.5 は 2.0 と同額の9値を追加)
- [ ] `parseGptImage2Model` / `composeGptImage2Model` / `GPT_IMAGE_2_PERCOIN_COSTS` の呼び出し元を新 API へ移行し、旧 API を削除(ADR-002)
  - `features/generation/components/GptImage2QualitySelector.tsx:76,86,124`
  - `features/generation/components/GptImage2SizeSelector.tsx:55,65,108`
  - `features/generation/components/LockableModelSelect.tsx:120,128,147`
  - `features/generation/lib/guest-generate.ts:287`
  - `features/generation/lib/model-config.ts:63`
  - `supabase/functions/image-gen-worker/index.ts:94,1097,2595,727`
- [ ] `features/generation/types.ts` の `GeminiModel` union と `KNOWN_MODEL_INPUTS` に 2.5 の9値を追加(既存 `GPT_IMAGE_2_CANONICAL_MODELS` の展開を `OPENAI_IMAGE_CANONICAL_MODELS` へ差し替え)
- [ ] `features/generation/lib/model-config.ts` の `MODEL_PERCOIN_COSTS` を `OPENAI_IMAGE_PERCOIN_COSTS` 起点に変更(REQ-009)
- [ ] `features/generation/lib/form-preferences.ts:60` の `PERSISTABLE_MODELS` に 2.5 を追加
- [ ] `features/admin-dashboard/lib/ai-cost-rates.ts` の `MODEL_COST_RATES` に 2.5 の9値を `basis: "derived"` で追加(REQ-010 / REQ-011 / ADR-004)
- [ ] ⭐ 回帰ガード: 既存 `gpt-image-2-*` の canonical / percoin / API モデル名 / 原価が 1つも変わらないことをテストで固定(REQ-013)

**注意**: この時点では **`GUEST_ALLOWED_MODELS` と `FREE_PLAN_ALLOWED_MODELS` に 2.5 を追加しない**。運営限定の段階では不要で、追加すると一般公開前に穴が開く。

---

### Phase 2: DB の CHECK 制約と worker の実行経路

**目的**: 2.5 の canonical 値を DB が受け入れ、worker が正しい API モデル名で OpenAI を呼べるようにする。
**ビルド確認**: worker の `deno check` が通る。マイグレーションは `supabase db push --dry-run` で本ファイル1本だけが出る。

- [ ] `supabase/migrations/<ts>_allow_gpt_image_2_5_flare_models.sql` を作成(既存 `supabase/migrations/20260510120000_extend_gpt_image_2_models.sql` と同じ DROP → ADD 全列挙形式)
  - `generated_images_model_check` に 2.5 の9値を追加
  - `image_jobs_model_check` に同じ9値を追加
  - 適用後の検証ブロック(`DO $$` で制約の存在を確認)を付ける
- [ ] `supabase/functions/image-gen-worker/index.ts` の `normalizeModelName()`(657-690行)を、2.5 canonical を通すよう更新
  - 現状 `isOpenAIImageModel(model)` かつ 2.0 canonical でない場合に `Invalid GPT Image 2 model` を投げる。ここを `parseOpenAIImageModel()` 起点に置き換える
- [ ] `supabase/functions/image-gen-worker/openai-image.ts:274,393` の `form.append("model", "gpt-image-2")` を、呼び出し側から渡された family へ差し替え(REQ-005)
  - `CallOpenAIImageEditBatchParams` / `CallOpenAIImageEditMultiInputParams` に `family` を必須で追加
- [ ] `features/generation/lib/openai-image.ts:322,433` に**同じ変更**を入れる(2ファイルはビット同等を保つ規約)
- [ ] `supabase/functions/image-gen-worker/index.ts` の呼び出し2箇所(1101, 2595 付近)で `family` を渡す
- [ ] `features/generation/lib/guest-generate.ts:287` の OpenAI dispatch で `family` を渡す
- [ ] `resolveOpenAIRequestTimeoutMs()`(94-103行)の引数型を新パーサの戻り値へ更新(REQ-008: タイムアウト値そのものは 2.0 と同じまま)
- [ ] `.cursor/rules/database-design.mdc` の `model` 許容値リスト(133行 / 142行付近)を更新

**⚠️ このフェーズのマイグレーションと worker は、Next.js より先にデプロイする(ADR-005)。**

---

### Phase 3: 運営限定ゲート

**目的**: 2.5 を「運営だけが選べて、運営だけが実行できる」状態にする。UI にはまだ出さない。
**ビルド確認**: 4検証コマンドが通る。フラグ未設定・非運営で `isGptImage25Available()` が false を返すテストが通る。

- [ ] `lib/env.ts` に判定を追加(既存 `isPopularPromptsPubliclyEnabled` / `isPopularPromptsAvailable`(`lib/env.ts:465,476`)と同じ形)
  - `NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED` を `envSchema` と `env` に登録(91-98行 / 209-213行付近)
  - `isGptImage25PubliclyEnabled()` / `isGptImage25Available(userId)`
- [ ] `features/generation/components/GptImage25AvailabilityProvider.tsx` を新規作成(既存 `features/posts/components/PopularPromptsAvailabilityProvider.tsx` を写す)
- [ ] `features/generation/components/GptImage25AvailabilityLoader.tsx` を新規作成(既存 `features/posts/components/PopularPromptsAvailabilityLoader.tsx` を写す。一般公開後の早期 return と `sb-` cookie チェックも含める)
- [ ] `components/LocaleShell.tsx` に Provider と、独立した `<Suspense>` 内の Loader を追加(既存 53行 / 69行の並びに足す)
- [ ] ⭐ サーバー側の実行ゲート(REQ-006)。UI を閉じるだけでは足りない
  - `app/api/generate-async/handler.ts:158-165` の `isModelAvailableForGeneration` チェックの直後に、2.5 なら `isGptImage25Available(user.id)` を要求する分岐を追加
  - `app/(app)/style/generate-async/handler.ts:288-296` に同じ分岐を追加
- [ ] `features/generation/lib/model-config.ts` の `resolveEffectiveModelForAuthState()` に 2.5 の clamp を追加(REQ-014)
- [ ] 権限テスト: 非運営 + フラグ OFF で 2.5 を直接 POST すると 400 になり `image_jobs` が作られないこと

---

### Phase 4: UI と表示

**目的**: 運営に「ChatGPT Images 2.5」の行が見え、生成結果に正しいブランド名が出る。
**ビルド確認**: 4検証コマンドが通る。ローカルで運営アカウントに行が出て、非運営に出ないことを確認。

- [ ] `features/generation/components/LockableModelSelect.tsx`
  - `MODEL_OPTIONS` に `gpt-image-2.5-flare-row`(`labelKey: "modelChatGptImages25"`, `engineTag: "engineOpenai"`)を追加
  - `useGptImage25Available()` が false のとき、その行を出さない(REQ-001 / REQ-002)
  - `toOptionCanonicalValue()` の family 切り替えロジックを 2.5 に対応(REQ-003: size を維持、無効なら 1k、quality は low)
  - `getCurrentRowValue()`(146-152行)を `parseOpenAIImageModel().family` 起点に変更
- [ ] `features/generation/components/GptImage2QualitySelector.tsx` / `GptImage2SizeSelector.tsx` を family 対応
  - `parseOpenAIImageModel()` に差し替え、`composeOpenAIImageModel(parsed.family, ...)` で組み立てる
  - 品質選択肢は 3段のまま(REQ-004 / ADR-006)
- [ ] `features/generation/lib/model-display.ts`
  - ⚠️ `getModelBrandName()`: **`startsWith("gpt-image-2.5-")` の分岐を `startsWith("gpt-image-")` より前に置く**(順序を誤ると 2.5 が 2.0 と表示される。REQ-012)
  - `MODEL_LIST_DISPLAY_MAP` に 2.5 の9値を追加(`"ChatGPT Images 2.5 | Low"` 等)
- [ ] `features/generation/lib/model-tags.ts` の `getModelTagsForCanonicalModel()` に 2.5 の3分岐を追加(`gpt-image-2.5-flare-low` / `-medium` / `-high`)
- [ ] i18n: `modelChatGptImages25: "ChatGPT Images 2.5"` を **16ファイルすべて**に追加(`messages/ja.ts` が正本。他15ファイルは `satisfies` により同時追加が必須)
- [ ] ⭐ 回帰ガード: 2.0 のブランド名・tier チップ・表示名が変わらないことをテストで固定

---

### Phase 5: デプロイと実測

**目的**: 本番で運営だけが 2.5 を使える状態にし、合格ライン4項目を計測する。
**ビルド確認**: 本番で運営アカウントの生成が成功し、`generated_images.model` に 2.5 の canonical 値が入る。

- [ ] **手順1**: `supabase db push --dry-run` で Phase 2 のマイグレーション1本だけが出ることを確認してから適用
- [ ] **手順2**: `supabase functions deploy image-gen-worker` で worker をデプロイ。**この時点で既存 2.0 の生成が従来どおり動くことを1件確認する**
- [ ] **手順3**: Next.js を本番デプロイ。`NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED` は**登録しない**(運営だけが `isAdminViewer` で通る状態)
- [ ] 一般アカウント(または未ログイン)で 2.5 の行が出ないことを実機確認
- [ ] 運営アカウントで、同じうちの子・同じプロンプト・**`low` × `1k`**(実データの83%を占める SKU。§1-0b)で 2.0 と 2.5 を各1件生成し比較
  - ①同一性: 目視で見比べる
  - ②生成時間: `image_jobs` の `started_at` → `completed_at` の差。**基準は `low-1k` の中央値 32.4 秒**(§1-0b)
  - ③実原価: OpenAI レスポンスの `usage` を Edge ログ(`function_logs`)から読む
  - ④事故: `processing_stage` が `uploading` / `persisting` で落ちていないか、`error_message` の有無
- [ ] 実測値で `features/admin-dashboard/lib/ai-cost-rates.ts` の 2.5 の単価を更新し、`basis` を `"measured"` へ(1k のみ。2k/4k は `"derived"` のまま)
- [ ] 実測した生成時間に応じて `resolveOpenAIRequestTimeoutMs()` の 2.5 側を調整(短縮できるなら別 family の表へ分ける)

---

### Phase 6: 一般公開の判断(別 PR)

**目的**: 合格ライン4項目の結果をもって、公開するか撤退するかを決める。
**ビルド確認**: 該当なし(判断フェーズ)。

- [ ] 合格ラインの結果をまとめてユーザーに提示
- [ ] 公開する場合:
  - `GUEST_ALLOWED_MODELS` / `FREE_PLAN_ALLOWED_MODELS` に 2.5 を入れるか決める
  - `NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED=true` を Vercel env に登録して再デプロイ
  - `DEFAULT_GENERATION_MODEL` を 2.5 へ移すか決める(移す場合は既存ユーザーの localStorage の扱いも決める)
- [ ] 撤退する場合: `LockableModelSelect` の行を落とす(型・DB 制約・原価表は残す。既存データの表示に必要)

---

## 6. 修正対象ファイル一覧

| ファイル | 操作 | 変更内容 | Phase |
|---|---|---|---|
| `shared/generation/openai-image-model.ts` | 修正 | family 型体系・18値の canonical・compose/parse・percoin | 1 |
| `features/generation/types.ts` | 修正 | union と `KNOWN_MODEL_INPUTS` に 2.5 の9値 | 1 |
| `features/generation/lib/model-config.ts` | 修正 | percoin 表の起点差し替え・`resolveEffectiveModelForAuthState` の clamp | 1,3 |
| `features/generation/lib/form-preferences.ts` | 修正 | `PERSISTABLE_MODELS` に 2.5 | 1 |
| `features/admin-dashboard/lib/ai-cost-rates.ts` | 修正 | `MODEL_COST_RATES` に 2.5 の9値(`derived`)。Phase 5 で `measured` へ | 1,5 |
| `supabase/migrations/<ts>_allow_gpt_image_2_5_flare_models.sql` | 新規 | 2テーブルの CHECK 制約に9値追加 | 2 |
| `supabase/functions/image-gen-worker/index.ts` | 修正 | `normalizeModelName` / パーサ移行 / family を client へ渡す | 2 |
| `supabase/functions/image-gen-worker/openai-image.ts` | 修正 | `model` を family から送る(274, 393) | 2 |
| `features/generation/lib/openai-image.ts` | 修正 | 同上(322, 433)。Deno 版とビット同等を保つ | 2 |
| `features/generation/lib/guest-generate.ts` | 修正 | パーサ移行・family を渡す | 1,2 |
| `.cursor/rules/database-design.mdc` | 修正 | `model` 許容値の記述を更新 | 2 |
| `lib/env.ts` | 修正 | フラグ登録 + `isGptImage25PubliclyEnabled` / `isGptImage25Available` | 3 |
| `features/generation/components/GptImage25AvailabilityProvider.tsx` | 新規 | context + 昇格 | 3 |
| `features/generation/components/GptImage25AvailabilityLoader.tsx` | 新規 | サーバーで運営判定して昇格 | 3 |
| `components/LocaleShell.tsx` | 修正 | Provider と Suspense 隔離の Loader を追加 | 3 |
| `app/api/generate-async/handler.ts` | 修正 | 2.5 のサーバー側実行ゲート | 3 |
| `app/(app)/style/generate-async/handler.ts` | 修正 | 同上 | 3 |
| `features/generation/components/LockableModelSelect.tsx` | 修正 | 4行目の追加・可否 hook・family 切替 | 4 |
| `features/generation/components/GptImage2QualitySelector.tsx` | 修正 | family 対応 | 1,4 |
| `features/generation/components/GptImage2SizeSelector.tsx` | 修正 | family 対応 | 1,4 |
| `features/generation/lib/model-display.ts` | 修正 | ⚠️ 2.5 分岐を先に置く・表示名9値 | 4 |
| `features/generation/lib/model-tags.ts` | 修正 | 2.5 の tier チップ3分岐 | 4 |
| `messages/{ja,en,ar,de,es,fr,hi,id,it,ko,pt,th,vi,zh-CN,zh-TW}.ts` | 修正 | `modelChatGptImages25` を16ファイルに追加 | 4 |
| `tests/unit/features/generation/*.test.ts(x)` | 修正 | 既存の 2.0 テストを新 API へ・2.5 のケース追加 | 1-4 |

---

## 7. 品質・テスト観点

### 品質チェックリスト

- [ ] **エラーハンドリング**: 2.5 で `content_policy_violation` が返ったとき、既存の `SAFETY_POLICY_BLOCKED_ERROR` → 返金経路にそのまま乗るか
- [ ] **権限制御**: フラグ OFF + 非運営で、UI に出ないこと **と** API が 400 で拒否すること の両方(片方だけでは REQ-06b で踏んだ事故と同型)
- [ ] **データ整合性**: CHECK 制約が Next.js デプロイより先に入っていること(ADR-005)
- [ ] **セキュリティ**: `model` はクライアントから来る値。`isKnownModelInput()` の whitelist を必ず通すこと
- [ ] **i18n**: 16ファイルすべてにキーがあること(1つ欠けると typecheck が落ちる)
- [ ] **既存への非干渉**: 2.0 の canonical / percoin / API モデル名 / 表示名 / 原価が1つも変わらないこと

⭐ **DB 層で強制できないもの**: 「2.5 は運営だけ」は model 値そのものが不正ではないため、CHECK 制約では表せない。**API ハンドラ2箇所が唯一の砦**になる(`app/api/generate-async/handler.ts` と `app/(app)/style/generate-async/handler.ts`)。片方だけに入れると、もう片方の導線から抜ける。Phase 3 で両方に入れること。

### テスト観点

| カテゴリ | テスト内容 |
|---|---|
| 正常系 | 2.5 の canonical が parse でき、family/quality/sizeTier が復元される。API へ `gpt-image-2.5-flare` が送られる |
| 正常系 | 品質/サイズを変えても family が維持される。family を切り替えても size が維持される |
| 異常系 | `gpt-image-2.5-sunburst-low-1k` のような未サポート値は `isKnownModelInput` で弾かれる |
| 異常系 | 原価表に9値すべて登録済み(未登録なら 0 円で消えるため、テーブル全走査でテストする) |
| 権限テスト | フラグ OFF + 非運営で 2.5 を POST → 400、`image_jobs` が作られない |
| 権限テスト | フラグ OFF + 運営で 2.5 を POST → ジョブ作成成功 |
| 回帰 | 2.0 の canonical 9値の percoin / 表示名 / tier チップ / API モデル名がスナップショットと一致 |
| 実機確認 | 本番・運営アカウントで 2.0 と 2.5 を同条件生成し4項目を計測 |
| 実機確認 | 一般アカウントで 2.5 の行が出ないこと |

### テスト実装手順

実装完了後、`/test-flow` スキルに沿って実施する。

1. `/test-flow GptImage25` — 依存関係とスペックの状態を確認
2. `/spec-extract GptImage25` — EARS スペックを抽出
3. `/spec-write GptImage25` — スペックを対話的に精査
4. `/test-generate GptImage25` — テストコード生成
5. `/test-reviewing GptImage25` — テストレビュー
6. `/spec-verify GptImage25` — カバレッジ確認

---

## 8. ロールバック方針

| 対象 | 戻し方 |
|---|---|
| **UI(最速)** | `LockableModelSelect` の `MODEL_OPTIONS` から 2.5 の行を消して再デプロイ。既存データの表示は壊れない |
| **フラグ** | 一般公開後の緊急停止は `NEXT_PUBLIC_GPT_IMAGE_2_5_ENABLED` を消して再デプロイ(検索・人気タブと同じ手) |
| **worker** | 直前のバージョンを `supabase functions deploy` で再デプロイ。ただし **2.5 のジョブがキューに残っていると全 failed になる**ので、キューが空なことを確認してから |
| **マイグレーション** | **戻さない。** CHECK 制約から値を消すと、既に 2.5 で生成された行が制約違反になり `generated_images` への以後の書き込みが全部落ちる。追加した値は残す |
| **原価表** | 2.5 のエントリは残す(消すと既存 2.5 データの原価が 0 円で消える) |
| **Git** | Phase ごとにコミットする。Phase 1(型体系)は UI 変更を含まないので単独 revert 可能 |

⭐ **戻せないもの**: DB の CHECK 制約と原価表のエントリ。どちらも「値を足す」だけで既存を壊さないので、残しても害はない。

---

## 9. 使用スキル

| スキル | 用途 | フェーズ |
|---|---|---|
| `/project-database-context` | CHECK 制約と既存 model 値の確認 | Phase 2 |
| `/git-create-branch` | ブランチ作成 | 実装開始時 |
| `/git-create-pr` | PR 作成(タイトル・本文は日本語) | 各 Phase 完了時 |
| `/test-flow` `/spec-extract` `/spec-write` `/test-generate` `/test-reviewing` `/spec-verify` | テスト一式 | テスト |

---

## 10. 前提と未確認事項

計画作成時点で**確認できていない**もの。実装中に確かめること。

| # | 前提 | 確かめ方 | リスク |
|---|---|---|---|
| 1 | 2.5 が `moderation: "low"` と `output_format: "png"` を受理する | Phase 5 の初回リクエストで確認 | 400 が返る。その場合はフィールドを family ごとに出し分ける |
| 2 | 2.5 の出力サイズ制約(長辺 3840 / 総ピクセル 8,294,400 / 16の倍数)が 2.0 と同じ | 同上 | `GPT_IMAGE_2_TIER_LIMITS` を family ごとに分ける必要が出る |
| 3 | 2.5 が `image[]` の多入力(inspire / Creator Looks / dual モード)に対応する | Phase 5 で Creator Looks を1件試す | 単入力経路だけに 2.5 を出す形へ縮める |
| 4 | 2.5 の入力画像トークン数が 2.0 と同じ 1,496 tok | Edge ログの `usage` を読む | 原価表の `inputImageUsd` を分ける |
| 5 | ~~Supabase DB へコマンドで接続できる~~ | ✅ **解決済み**。CLI を v2.95.4 へ戻し `brew pin` した(2026-09-10) | — |
| 6 | 2.5 も streaming 非対応(2.0 と同じ) | Phase 5 で 90秒超のケースが出たら確認 | タイムアウト設計を見直す |

⭐ **`gpt-image-2.5-flare` は生成時間が短い**とされているため、前提6 は 2.0 より起きにくいはず。ただし `high` × `4k` は要注意。
