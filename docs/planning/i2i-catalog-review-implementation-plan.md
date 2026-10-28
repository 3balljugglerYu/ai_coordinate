# 参照画像つきのカタログ（i2i・審査あり）実装計画

作成: 2026-10-28 / 対象: `main` @ a35a388

## 0. この計画で作るもの

「カタログをつくる」（CREATE・`/free`）で、うちの子の画像（image_0）に加えて **参照画像（image_1）** を入れて生成できるようにする。
参照画像からは、衣装・ポーズ・カメラアングル・背景の4つから取り入れるものを選べる（組み合わせ可）。

参照画像を使った作品は、**運営の審査で承認されるまで投稿できない**。承認されると作者に通知が届き、投稿ボタンが押せるようになる。
投稿されたあとは、ほかの人も「このカタログで生成する」から使える。そのとき、隠したプロンプトと参照画像が一緒にモデルへ送られるが、**参照画像はほかの人には見せない**。

### ユーザーが決めたこと（2026-10-27〜28・変えない前提）

| 論点 | 決定 |
|---|---|
| 進め方 | パターン1（審査あり）を先に作る。パターン2（メタイラスト経由・審査なし）はあと |
| 置き場所 | 「カタログをつくる」に「参照画像（任意）」の欄を足す（別の画面にしない） |
| 使える人 | **運営が選んだ人だけ**（管理画面で足す・外す） |
| 審査中の作者 | 作者本人はそのカタログを使える |
| 承認後 | 承認の通知が届き、詳細画面などで投稿ボタンが押せるようになる（自動では公開しない）。承認までは「審査中」 |
| 取り入れるもの | 最初から4つ全部（衣装・ポーズ・アングル・背景） |
| 審査に出す | 作者が選んで押す（完成のたびには回さない） |
| 差し戻し | 同じ画像は出し直せない。作り直して新しく申請する |
| ペルコイン | 今のまま（参照画像を足しても上乗せしない） |
| 参照画像 | ほかの人には見せない（公開するのは今と同じ After と Before） |

### 含めないもの

- パターン2（メタイラスト・自動チェック）
- アプリ（Flutter）での参照画像の入力（アプリは今の投稿 API の応答が変わるだけ。§6）
- 参照画像つきのカタログのペルコインの上乗せ（ADR-006）
- One-Tap Style・コーデ画面への参照画像の追加

## 1. コードベース調査結果

### 1.1 今の CREATE の生成

- 画面は `features/generation/components/FreePageBody.tsx:66-80` → `GenerationFormContainer mode="free"`。
- クライアントは画像を縮めて（長辺2048px・2MB超は1024px/JPEG 0.7、`features/generation/lib/normalize-source-image.ts:8-12`）、**base64 を JSON に入れて** `POST /api/generate-async` へ送る（`features/generation/lib/async-api.ts:136-174`）。
- サーバーは `generated-images` バケット（**公開**、`20250109000001_initial_setup.sql:74`）の `temp/{uid}/…` に上げ、`image_jobs.input_image_url` に入れる（`app/api/generate-async/handler.ts:467-518`）。
- プロンプトは `image_jobs` には残さず、RPC `create_image_job_with_prompt_execution` で別の表に入れる（`handler.ts:723-730`）。

### 1.2 2枚目の画像を送る仕組みは、すでにある

- worker は `image_jobs.style_reference_image_url`（＋`style_reference_image_bucket`）から2枚目を読む（`supabase/functions/image-gen-worker/index.ts:2383-2433`）。いまは `inspire` と `one_tap_style` だけ。
- Gemini は `parts=[image_0, image_1, text]`（`index.ts:2580`）、OpenAI は `callOpenAIImageEditMultiInputBatch`（`openai-image.ts:397`）で2枚送る（`index.ts:2706-2775`）。
- 「何を取り入れるか」の選択は Inspire の `features/inspire/components/InspireOverrideCheckbox.tsx:38-44`、指示文は `shared/generation/prompt-registry.ts:381-436`（`inspire.*_on/_off`）、組み立ては `prompt-core.ts:323`。
- 著作権の同意は Inspire の `copyright_consent_at`（`20260502124531_add_user_style_templates.sql:17,24-25`）。

### 1.3 ほかの人が使うとき（派生生成）

- API は `validate_derived_prompt_source` で使ってよいかを確かめ、`origin_post_id` だけを入れる（`handler.ts:606-645,705`）。
- worker は課金の前にもう一度確かめ（`index.ts:1939,1963-1990`）、`resolve_derived_prompt_source` で隠したプロンプトを取り出して、メモリの中だけで使う（`index.ts:2213-2244`）。
- 作者のプロンプトは、完成時に `generated_image_prompt_secrets`（service_role 専用、`20260729100000_add_prompt_secret_tables.sql:41`）に入る（`complete_image_job_with_prompt_secrets`）。
- 本人は**未投稿の自分の画像からも**派生生成できる（`20260731110000_allow_own_unposted_origin.sql`）。→「審査中も作者は使える」は、この決まりのまま満たせる。

### 1.4 投稿

- `POST /api/posts/post`（`app/api/posts/post/route.ts`）→ `postImageServer`（`features/generation/lib/server-database.ts:129-162`）が `is_posted=true` にする。
- **ブラウザから直接 UPDATE する道もある**（`features/generation/lib/database.ts:154-177`）。`generated_images` は「本人は自分の行を更新できる」RLS（本番で確認）。
- だから止めるのは DB のトリガー。前例は `enforce_no_publish_while_removed`（`20260728160000_unpost_on_suspension.sql:25-65`）で、ルートは 409 に変える（`route.ts:270-281`）。
- 投稿ボタンがある画面: 投稿詳細（本人・未投稿、`PostDetailStatic.tsx:614-618` → `PostActions.tsx:78-87`）、生成結果の一覧（`GeneratedImageGallery.tsx:234-258,287-298`、`GeneratedImageList.tsx:365,461-472`）。どれも `/posts/new/[imageId]` へ移る（`app/posts/new/[imageId]/page.tsx`）。マイページのカードには投稿ボタンがなく、詳細へ移る（`MyImageCard.tsx:63`）。

### 1.5 マイページ

- タブは `features/my-page/components/ImageTabs.tsx:7`（`all|posted|unposted`）、取得は `getMyImagesServer`（`features/my-page/lib/server-api.ts:274-331`）、API は `app/api/my-page/images/route.ts:32`。
- カードにしるしはまだない（`MyImageCard.tsx`）。

### 1.6 審査・通知・使える人の管理

- 「承認・差し戻し（理由）→ 監査ログ → 通知」の前例: カタログ申請の判定（`app/api/admin/catalog/entries/[id]/decision/route.ts`: zod `{action, reason≤500}` :19-22、RPC :94、`logAdminAction` :118、通知 :170-181）。
- 通知は `public.notifications` に service_role で入れる。`type`（最新は `20261018120000_add_personal_notices.sql:31-61`）と `entity_type`（`20260602100400_extend_notifications_for_creator_looks.sql:43-52`）の CHECK を広げる。プッシュは `push_category_for_notification_type`（`20261013120100_add_push_outbox.sql:124-157`）に足すと届く。画面の種類は `features/notifications/types.ts:5-17`・`presentation.ts`。
- 「運営が特定の人に機能を開く」前例: `creator_looks_allowlist`（`20260602100200_create_creator_looks_allowlist.sql:16-60`）＋ `/admin/creator-allowlist`（API は `requireAdmin`＋`ensureSameOrigin`＋監査）、判定は fail-closed の `isInCreatorLooksAllowlist`（`lib/auth/creator-looks.ts:45-72`）。⚠️ Inspire の `isInspireSubmitterAllowed` は環境変数で、空だと全員に開く（`lib/auth.ts:93-100`）ので使わない。
- 管理画面の認可: ページは `ensureAdminPage`（`lib/admin-page-guard.ts`）、API は `requireAdmin`（`lib/auth.ts:62-81`）、監査は `logAdminAction`（`lib/admin-audit.ts`・アクション名の union に足す）。

### 1.7 料金

ペルコインはモデルと品質・サイズだけで決まり、入力画像の枚数は関係しない（`shared/generation/percoin-costs.ts:44-89`、worker `index.ts:780`）。

## 2. 概要図

### 2.1 作者が作って審査に出すまで

```mermaid
sequenceDiagram
    participant A as Author
    participant W as WebApp
    participant API as API
    participant DB as Supabase
    participant WK as Worker
    A->>W: 参照画像を選ぶ 取り入れるものを選ぶ 同意にチェック
    W->>API: POST api catalog-references 画像だけ
    API->>DB: 使える人か確認 非公開バケットへ保存 行を作る
    API-->>W: referenceId
    A->>W: 生成する
    W->>API: POST api generate-async referenceId と取り入れるもの
    API->>DB: 本人の参照画像か確認 image_jobs を作る
    WK->>DB: 参照画像を service_role で読む
    WK->>WK: image_0 と image_1 と指示でモデルへ
    WK->>DB: 完成 参照の秘密の表に保存 状態は未申請
    A->>W: 審査に出す
    W->>API: POST api catalog-references review
    API->>DB: 状態を審査中へ
```

### 2.2 審査と投稿

```mermaid
stateDiagram-v2
    [*] --> NotSubmitted: 参照画像つきで生成
    NotSubmitted --> Pending: 作者が審査に出す
    Pending --> Approved: 運営が承認 通知
    Pending --> Rejected: 運営が差し戻し 理由つき通知
    Approved --> Posted: 作者が投稿
    Posted --> Approved: 作者が投稿を取り消す
```

- `NotSubmitted`・`Pending`・`Rejected` のあいだは投稿できない（DB で止める）。
- どの状態でも、作者本人はその画像から生成できる（§1.3）。
- `Rejected` は同じ画像で出し直せない（ADR-004）。

### 2.3 ほかの人が使うとき

```mermaid
sequenceDiagram
    participant U as OtherUser
    participant API as API
    participant WK as Worker
    participant DB as Supabase
    U->>API: このカタログで生成する origin_post_id
    API->>DB: validate_derived_prompt_source 今と同じ
    WK->>DB: resolve_derived_prompt_source プロンプトと参照画像の場所と取り入れるもの
    WK->>WK: 使う人の image_0 と 参照画像 と指示でモデルへ
    WK-->>U: できた画像 参照画像とプロンプトは見えない
```

## 3. EARS（要件）

| ID | 要件 |
|---|---|
| REQ-001 | While the user is not on the i2i allowlist, the system shall not show the reference image field and shall reject reference uploads and jobs with 403. ／ 使える人の一覧にいない人には参照画像の欄を出さず、API も 403 で断る。 |
| REQ-002 | When an allowed user uploads a reference image with copyright consent, the system shall store it in a private bucket and return its id. ／ 同意つきで上げた参照画像を非公開の置き場所に保存し、id を返す。 |
| REQ-003 | If a job names a reference id that the requester does not own, then the system shall reject the job (API) and fail it without charging (worker). ／ 他人の参照画像の id を指定した生成は、API で断り、worker でも課金前に失敗させる。 |
| REQ-004 | When a job with a reference image completes, the system shall save the reference link and the take flags in a service_role-only table and set the image's review status to not_submitted. ／ 完成時に参照の情報を service_role 専用の表に残し、審査の状態を「未申請」にする。 |
| REQ-005 | While an image's review status is not approved, the system shall refuse to set is_posted to true (DB trigger), and the post API shall return 409 `POSTS_REVIEW_PENDING`. ／ 承認されるまで投稿できない。 |
| REQ-006 | When the author submits a not_submitted image, the system shall set it to pending. ／ 作者が審査に出すと「審査中」になる。 |
| REQ-007 | When an admin approves or rejects (reason up to 500 chars), the system shall record the decision, write an audit log, and notify the author (push included). ／ 運営の判定を記録し、監査ログを残し、作者に通知する。 |
| REQ-008 | When anyone uses a posted catalog with a reference image, the worker shall send the hidden reference image as image_1 and the take instructions, and no API response shall include the reference image or its location to anyone but the author and admins. ／ ほかの人の生成では参照画像をモデルに送るが、作者と運営以外には場所も画像も返さない。 |
| REQ-009 | While the image is not posted, the author shall be able to generate from it (existing own-unposted rule). ／ 審査中・差し戻し後も、作者本人は使える。 |
| REQ-010 | Users shall not be able to change review columns of their own images. ／ 審査の列は本人でも書き換えられない。 |
| REQ-011 | When the author opens the detail of their reference image work, the system shall show its review state (未申請／審査中／差し戻しと理由／承認済み) and the matching button. ／ 詳細画面に状態と、それに合ったボタンを出す。 |
| REQ-012 | The my-page gallery shall have a 「審査中」 tab and status badges. ／ マイページに「審査中」のタブとしるし。 |

## 4. ADR

### ADR-001: 使える人は専用の表で管理する（`i2i_catalog_allowlist`）
- Context: 運営が人を選んで開きたい。Inspire の環境変数は空だと全員に開く。
- Decision: `creator_looks_allowlist` と同じ形の表と管理画面 `/admin/i2i-allowlist` を作る。判定は fail-closed。
- Consequence: 表と画面が1つずつ増える。あとで広く開くときは、判定を「全員」に変える旗を足す。

### ADR-002: 参照画像は先に別の API で上げ、生成には id だけを渡す
- Context: 今の生成は base64 を JSON で送る。2枚だと送れる大きさの上限（4.5MB）に近い。`generated-images` は公開バケット。
- Decision: `POST /api/catalog-references`（multipart、縮めた画像1枚）で、非公開の新しいバケット `catalog-references/{uid}/{uuid}` に入れ、表 `catalog_reference_images` に行を作る。生成には `referenceImageId` だけを渡す。
- Consequence: 往復が1回増える。参照画像は公開の置き場所に一度も置かれない。

### ADR-003: worker は参照画像を自分で引き、`image_jobs` に場所を書かない
- Context: 本人は自分の `image_jobs` 行を更新・閲覧できる。派生生成で作者の参照画像の場所を使う人の行に書くと漏れるうえ、書き換えで別の画像を指せてしまう。
- Decision: `image_jobs` には参照の id だけを入れ、worker が service_role で「その id の持ち主＝ジョブの持ち主か」を確かめてから読む。派生生成では `image_jobs` に何も足さず、`resolve_derived_prompt_source` を広げて、元の投稿の参照の場所と取り入れるものをプロンプトと一緒に返す。
- Consequence: RPC の戻り値が増える（呼んでいるのは worker だけ）。

### ADR-004: 審査の状態は `generated_images` の列に持ち、本人には書き換えさせない
- Context: 審査するのは「できた画像1枚」。投稿の止め方は DB トリガーの前例がある。
- Decision: `catalog_review_status`（null=参照画像なし｜not_submitted｜pending｜approved｜rejected）、`catalog_review_reason`、`catalog_reviewed_at`、`catalog_reviewed_by` を足す。BEFORE UPDATE トリガーで (1) service_role 以外がこの4列を変えるのを止め、(2) `approved` 以外で `is_posted` を true にするのを止める。状態を変えるのは RPC（申請は本人だけ、判定は service_role だけ）。差し戻した画像は出し直せない。作り直して新しく申請してもらう（2026-10-28 ユーザー決定）。
- Consequence: 投稿を取り消すと `approved` に戻る（もう一度投稿できる）。

### ADR-005: 「審査に出す」は作者が押す
- Context: 作者は何度も生成して、その中から選ぶ。完成のたびに審査へ回すと、運営の手間が増える。
- Decision: 完成時は「未申請」。投稿ボタンの代わりに「審査に出す」を出す（2026-10-28 ユーザー決定）。

### ADR-006: ペルコインは変えない
- 入力画像が増えても、料金表は枚数を見ていない。原価の増え方は ChatGPT Images で1回あたり約1〜2円、Nano Banana はほぼ0。今の料金のまま出す（2026-10-28 ユーザー決定）。使われ方を見てから考える。

### ADR-007: 取り入れる指示は Inspire の文を流用し、「人物は移さない」を足す
- `inspire.*_on/_off` を使い、共通で「image_1 の人物の顔・髪型・体型は使わない」を入れる。作者のうちの子が写った参照画像でも、使う人のうちの子に混ざらないようにする。

## 5. 実装計画

```mermaid
flowchart LR
    P1["Phase 1 DB"] --> P2["Phase 2 使える人の管理"]
    P1 --> P3["Phase 3 作者の生成"]
    P3 --> P4["Phase 4 審査と通知"]
    P3 --> P5["Phase 5 ほかの人の生成"]
    P4 --> P6["Phase 6 画面"]
    P5 --> P6
    P6 --> P7["Phase 7 本番で確認と公開"]
```

### Phase 1: データベース
目的: 表・列・トリガー・RPC を足す。既存の動きは変えない。
ビルド確認: `npm run build`・migration のテスト（ローカル）。本番への適用はユーザー承認のあと。

- [ ] `i2i_catalog_allowlist`（`creator_looks_allowlist` と同じ形・本人 SELECT の RLS）
- [ ] バケット `catalog-references`（非公開・10MB・jpeg/png/webp・本人のフォルダにだけ insert）
- [ ] `catalog_reference_images`（id, user_id, storage_path, copyright_consent_at NOT NULL, created_at。本人 SELECT）
- [ ] `image_jobs.catalog_reference_id`・`image_jobs.catalog_reference_takes`（outfit/pose/angle/background の旗）
- [ ] `generated_image_reference_secrets`（image_id PK, reference_id, takes。service_role 専用）
- [ ] `generated_images` に審査の4列＋トリガー（ADR-004）。エラーは `post_review_pending`
- [ ] RPC: `submit_catalog_review`（本人・not_submitted→pending）、`apply_catalog_review_decision`（service_role）
- [ ] `complete_image_job_with_prompt_secrets` を広げ、参照つきのとき秘密の表と状態を書く
- [ ] `resolve_derived_prompt_source` を広げ、参照の場所と旗を返す
- [ ] 通知の `type` に `catalog_review_approved`・`catalog_review_rejected`、プッシュの分類に足す
- [ ] `.cursor/rules/database-design.mdc` を更新

### Phase 2: 使える人の管理画面
- [ ] `/admin/i2i-allowlist`（`app/(app)/admin/creator-allowlist/` を参考）と API（`requireAdmin`・`ensureSameOrigin`・監査）
- [ ] 判定 `isInI2iCatalogAllowlist`（`lib/auth/creator-looks.ts` を参考・fail-closed）
- [ ] 管理画面のサイドバーに足す

### Phase 3: 作者の生成
- [ ] `POST /api/catalog-references`（使える人か・同意・形式・大きさ。`features/inspire` の検査を参考）
- [ ] `generate-async` に `referenceImageId`・`referenceTakes`（free だけ・使える人か・本人の参照か・派生生成とは同時に使えない）
- [ ] worker: 参照の持ち主を確かめて image_1 にし、取り入れる指示を足す（`index.ts:2383-2433` と同じ分岐に free を足す）。OpenAI は2枚の経路へ
- [ ] 5つのモデルすべてで2枚の入力が通ることを、本番の運営アカウントで確かめる（Phase 7）

### Phase 4: 審査と通知
- [ ] `POST /api/catalog-references/review`（作者が審査に出す）
- [ ] 管理画面の審査ページ（参照画像・Before・After・取り入れたもの・プロンプトを並べる。`/admin/catalog/entries` を参考）と判定 API（`app/api/admin/catalog/entries/[id]/decision/route.ts` を参考）
- [ ] 通知の表示（`features/notifications/types.ts`・`presentation.ts`）。押すと投稿詳細へ

### Phase 5: ほかの人の生成
- [ ] worker の派生生成で、RPC が返した参照画像を image_1 にする
- [ ] 元の投稿が削除・非公開になったら、参照画像も使わない（今のプロンプトの決まりと同じ）
- [ ] 応答・投稿詳細・カタログの一覧に、参照画像や場所が入っていないことをテストで確かめる

### Phase 6: 画面と文言
- [ ] CREATE: 「参照画像（任意）」の欄・取り入れるもの4つ・同意のチェック・「ほかの人には見えません」「運営の確認のあとで投稿できます」（使える人にだけ出す）
- [ ] 生成結果・投稿詳細: 状態に合わせて「審査に出す／審査中／差し戻し（理由）／投稿」
- [ ] マイページ: 「審査中」のタブとしるし
- [ ] 投稿 API の 409 `POSTS_REVIEW_PENDING` の文言
- [ ] 15言語の文言（`messages/*.ts`）。⚠️ 有料化をほのめかす表現は書かない

### Phase 7: 本番で確認と公開
- [ ] migration を本番に適用（承認のあと）・worker をデプロイ
- [ ] 運営アカウントを一覧に足し、作る→審査→承認→投稿→別アカウントで使う、を通す
- [ ] 選んだ作者を一覧に足す

## 6. 修正対象ファイル（主なもの）

| ファイル | 操作 | 内容 |
|---|---|---|
| `supabase/migrations/2026…_add_i2i_catalog_review.sql` | 新規 | Phase 1 の全部 |
| `app/api/catalog-references/route.ts`・`review/route.ts` | 新規 | 参照画像の保存・審査に出す |
| `app/api/admin/i2i-allowlist/**`・`app/(app)/admin/i2i-allowlist/**` | 新規 | 使える人の管理 |
| `app/api/admin/catalog-reviews/**`・`app/(app)/admin/catalog-reviews/**` | 新規 | 審査 |
| `lib/auth/i2i-catalog.ts` | 新規 | 使える人の判定 |
| `app/api/generate-async/handler.ts`・`features/generation/lib/schema.ts` | 修正 | 参照の id と旗 |
| `supabase/functions/image-gen-worker/index.ts`・`shared/generation/prompt-*.ts` | 修正 | image_1 と指示 |
| `features/generation/components/GenerationFormContainer.tsx` ほか | 修正 | 参照画像の欄 |
| `features/posts/components/PostDetailStatic.tsx`・`PostActions.tsx`・`GeneratedImageGallery.tsx`・`GeneratedImageList.tsx` | 修正 | 状態とボタン |
| `app/api/posts/post/route.ts` | 修正 | 409 の対応づけ |
| `features/my-page/**`・`app/api/my-page/images/route.ts` | 修正 | 「審査中」のタブ・しるし |
| `features/notifications/**` | 修正 | 通知の表示 |
| `lib/admin-audit.ts` | 修正 | 監査のアクション名 |
| `messages/*.ts`（15言語） | 修正 | 文言 |

**アプリ（Flutter）**: 投稿 API が 409 `POSTS_REVIEW_PENDING` を返すことがある。今の `{error, errorCode}` の形なので、古いアプリでも文言は出る。`GET /api/my-page/images` の `filter` に新しい値を足しても、既存の値の動きは変わらない。

## 7. 品質・テスト観点

| カテゴリ | テスト |
|---|---|
| 正常系 | 使える人が参照画像つきで生成→審査に出す→承認→投稿→別の人が使うと image_1 が送られる |
| 権限 | 一覧にいない人の API は 403／他人の参照 id は API と worker の両方で断る／本人が審査の列を UPDATE できない／承認前の投稿は route とブラウザ直の UPDATE の両方で止まる |
| 漏れ | 派生生成の `image_jobs`・投稿詳細・カタログ一覧・my-page の応答に参照の場所が入らない |
| 異常系 | 参照画像が消えていたら課金前に失敗して返金／差し戻しは出し直せない |
| 実機 | 5モデルで2枚の入力・スマホ幅の CREATE の欄 |

## 8. ロールバック

- 表と列は足すだけ。使える人の一覧を空にすれば、だれも使えなくなる（デプロイ不要）。
- 投稿を止めるトリガーは `catalog_review_status IS NULL` の画像（今あるすべて）には効かない。

## 9. 決まったこと（2026-10-28）

1. 「審査に出す」は作者が押す（ADR-005）。
2. 差し戻した画像は出し直せない。作り直して新しく申請する（ADR-004）。
3. ペルコインは今のまま（ADR-006）。

まだ決めていないこと: 運営が1日に審査できる件数、使う人が取り入れるものを選べるか（最初は作者が選んだものをそのまま使う）。
