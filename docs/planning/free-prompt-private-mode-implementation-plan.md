# じゆうモード プロンプト非公開モード 実装計画

作成日: 2026-07-29
最終更新: 2026-07-29（実装着手後の本番実測で前提誤りを訂正。ADR-013 / ADR-014 を撤回し、legacy_built 分類と不変template revisionを削除）
対象: `/free` 投稿のプロンプト非公開化、および**プロンプト保管の秘匿境界そのものの是正**

## 背景

`/free` の投稿は詳細画面でプロンプトが表示され、フォロワーはコピーして再利用できる。「プロンプトは自分の資産なので見せたくないが、使ってもらえるのは嬉しい」というニーズに対し、秘匿したまま「試せる」導線を用意する。

### 初版計画の重大な誤りと、判明した既存脆弱性

初版は「アプリ層の redaction（`prompt-visibility.ts`）が主要4経路に適用済みだから、列を1つ足せば足りる」としていた。**これは誤りだった。** RLS を見ずにアプリ層だけを見た結論である。

本番実測で確認した事実:

```sql
-- generated_images の SELECT ポリシー（実測）
USING ((is_posted = true AND moderation_status = 'visible') OR (user_id = auth.uid()))
-- roles: {public}

-- テーブル権限（実測）
anon:          SELECT を含む
authenticated: SELECT を含む
```

**RLS は行単位であり、列を絞らない。** したがって公開 anon キーで以下が通る。

```
GET {SUPABASE_URL}/rest/v1/generated_images
    ?is_posted=eq.true&moderation_status=eq.visible&select=prompt,generation_type
```

`redactSensitivePrompts` はサーバーコンポーネントの出力から消しているだけで、**この経路には一切関与しない**。

**本番で読み取れる件数（実測）:**

| generation_type | 読める行数 | ユニークなプロンプト数 |
| --- | --- | --- |
| **one_tap_style** | **689** | **263** |
| coordinate | 229 | 208 |

つまり **運営が作成した One-Tap Style プリセットのプロンプト 263 種が、現在この瞬間も公開 anon キーで取得できる**。「画像のみ公開・プロンプト非公開で moat を作る」という設計意図と正面から反する既存の脆弱性であり、新機能とは独立して存在する。

#### さらに、同じ構造の漏洩が `image_jobs` にもある

レビュー指摘の P0-2（派生者が自分のジョブから秘密を読める）と**まったく同じ構造が、One-Tap Style の既存機能にも存在する**ことを確認した。

```
app/(app)/style/generate-async/handler.ts:578-579
  user_id:     user.id      ← 生成した本人が所有者
  prompt_text: prompt       ← 組み立て済みのプリセット全文
```

`image_jobs` の SELECT RLS は `auth.uid() = user_id` である。したがって **One-Tap Style で生成したユーザーは、自分のジョブ行から運営プリセットのプロンプト全文を読める**。

本番実測: `generation_type = 'one_tap_style'` のジョブ **2,123件すべてに `prompt_text` が入っている**。

対象の投稿が公開されていなくても、**自分が一度生成しさえすればそのプリセットのプロンプトが手に入る**。`generated_images` 側を塞いでも、この経路が残れば moat は開いたままになる。Phase 0 の対象に含める。

**この RLS を是正しない限り、プロンプト非公開モードは成立しない。** 同じ経路から新機能の秘密も抜かれるためである。よって本計画は「新機能の追加」ではなく **「プロンプト保管の秘匿境界を作り直し、その上に新機能を載せる」** ものとして再設計する。

### ヒアリングで確定した仕様

| # | 決定 |
| --- | --- |
| ① | 派生投稿のクレジットは**原作者を表示**。連鎖しても常に原作を指す |
| ② | 元投稿が利用不可のときは生成不可。「現在、ご利用できません」と角の立たない表示 |
| ③ | フォロー判定は**原作者**に対して。カードから直接フォローできる |
| ④ | 派生投稿はプロンプトを表示しない |
| ⑤ | ペルコインは通常の `/free` 生成と同額。原作者への還元はなし |
| ⑥ | 既定は**公開**。投稿者が明示的に非公開を選ぶ。投稿後も切り替え可能 |
| ⑦ | 運営はプロンプト全文を閲覧可。非公開提供を示すバッジを admin に出す |
| ⑧ | 原作者の投稿に**利用数**を表示する（原作者自身の生成は除外） |

---

## コードベース調査結果

### プロンプトが漏れている経路（実測）

| 経路 | 状況 |
| --- | --- |
| PostgREST 直接 SELECT | **anon で `select=prompt` が通る**（上記） |
| `features/generation/lib/database.ts:123,155,342,362` | ブラウザクライアントから `select("*")` |
| `features/event/lib/database.ts:24` | 同上 |
| `image_jobs.prompt_text` | `app/api/generate-async/handler.ts:487` で保存。RLS は `auth.uid() = user_id` なので**所有者は全列を読める** |
| `image_jobs.prompt_text`（One-Tap Style） | `app/(app)/style/generate-async/handler.ts:578-579` で**生成者本人を所有者として運営プリセット全文を保存**。本番 2,123 件すべてに存在 |
| Worker | `supabase/functions/image-gen-worker/index.ts:2743` で `generated_images.prompt` へコピー |
| OpenAI バッチ完了 RPC | `20260517110000_complete_image_job_rpc_dimensions_and_inspire_overrides.sql:115-142` が `v_job.prompt_text` を `generated_images.prompt` へコピー |
| Wardrobe claim | `app/api/wardrobe/claim/save-wardrobe-image.ts:60-80` がクライアント保存値由来の `prompt` を直接 INSERT |
| ブラウザ汎用 INSERT | `features/generation/lib/database.ts:68-105` の `saveGeneratedImage(s)` が `prompt` を含む任意レコードを直接 INSERT 可能 |
| `features/generation/lib/prompt-builder.ts:39-45` | **最終プロンプト全文を `console.log` している** |

### 秘密の所有者と生成画像の所有者は一致しない

`generated_images.user_id` は「画像を生成した人」であり、「プロンプトを開示してよい相手」ではない。

| 生成種別 | 画像所有者 | ユーザー向け原作入力の所有者 | プロバイダ送信用最終プロンプト |
| --- | --- | --- | --- |
| free / coordinate の通常生成 | 生成者 | 生成者 | 本人入力 + 共通指示。本人入力部分のみ本人へ開示可 |
| private free の派生生成 | 派生者 | 原作者 | 派生者には一切開示不可 |
| One-Tap Style | 生成者 | なし | 運営プリセット。生成者には一切開示不可 |
| Inspire / Creator Looks | 生成者 | 入力の由来に依存 | hidden prompt・共通指示を含み、生成者所有とはみなさない |

したがって「全プロンプトを `generated_images.user_id` 所有の1テーブルへ移す」設計は採用しない。**ユーザーに表示し得る原作入力**と、**誰にも直接返さない生成実行入力**を分離する。

### 保存されているのは生入力である（本番実測で訂正）

**改訂 3〜5 で「保存されているのはビルド済み最終プロンプトであり、生入力は復元できない」としていたが、これは誤りだった。** `prompt-core.ts` の実装だけを見て保存内容を推論し、実データを確認していなかった。

実際の保存経路は次のとおりで、**組み立ては Worker が実行時に行う**。

- `app/api/generate-async/handler.ts:138` はリクエストボディから `prompt` を分割代入し、`:489` でそのまま `prompt_text` に入れる
- `supabase/functions/image-gen-worker/index.ts:2010-2012` が `buildSharedPrompt({ outfitDescription: job.prompt_text, ... })` で錨を付ける

本番実測（`generated_images`、全行）:

| generation_type | 全行 | 運営の錨を含む | 内容 |
| --- | --- | --- | --- |
| one_tap_style | 2,110 | **1,165** | 組み立て済みのプリセット全文。平均2,947字・最大19,259字 |
| coordinate | 1,307 | **0** | ユーザー入力。平均167字 |
| free | 21 | **0** | ユーザー入力。実物は「和風にしてください。」等 |
| inspire | 89 | **0** | `"inspire"` / `"creator-looks"` のマーカー文字列 |

したがって:

- **`legacy_built` 分類は不要**。coordinate / free の既存行は生入力そのものであり、そのまま `author_input` として author secret へ移せる
- **legacy と新規で表示・コピー内容が変わる問題は発生しない**。世代差は生じない
- **不変テンプレート revision も不要**。通常生成は現在も実行時に現行テンプレートで組み立てており、再試行時のバイト一致は元から保証されていない。派生 job だけ版を固定するのは既存より厳格で、かつ運営の錨を DB へ新たに書き出す副作用がある

一方、**One-Tap Style の漏洩は本物である**。2,110 件中 1,165 件が運営の錨を含む組み立て済み全文で、anon から読める。coordinate / free の露出はユーザー自身の入力であり、moat ではなくプライバシーの問題として扱う。

### job作成経路と終端failedの実態（コード・本番確認済み）

新規jobの作成経路は、次の2ハンドラから `features/generation/lib/async-generation-job-repository.ts:143` の `createImageJob` へ集約されている。

- `app/api/generate-async/handler.ts:524`
- `app/(app)/style/generate-async/handler.ts:619`

prompt execution recordを伴わないjobは生成入力を解決できず生成不能になるため、各ハンドラの注意事項ではなく `createImageJob(jobData, promptExecution)` の必須引数と原子的RPCで不変条件を強制する。通常jobは全文を持つ `materialized`、派生jobは本文を持たない `derived_reference` のdiscriminated unionとする。

また、現行Workerは `image-gen-worker/index.ts:1596` で `queued` と `failed` の両方をclaimする。本番のfailed jobは180件（attempts 0: 3件、1: 141件、2: 11件、3: 25件）であり、attempts 3の25件はfailed再claimが実際に起きている証拠である。claimをqueued限定へ変えるADR-012は、移行補助だけでなく既存再試行挙動の修正として扱う。

### freeテンプレートには不変revisionの保存先がない

`prompt_overrides` は `prompt_key` ごとの現行 `content` だけを持ち、更新前の全文は保持しない。`prompt_overrides_audit_logs` も本文を保存しない方針である。したがって、派生jobへrevision IDだけを固定してWorkerで決定的に再ビルドするには、`free.base_prefix` と `free.user_direction_label` の解決済み内容をcontent hashで重複排除するservice-onlyの不変revisionテーブルが必要である。

このrevisionはテンプレート版ごとに1行だけ保存し、派生jobごとにprovider prompt全文を複製しない。派生jobでは `image_jobs.origin_post_id` とprompt execution recordのrevision参照だけを組にして保持し、原作者入力・legacy全文・ビルド済み全文を保持しない。

### 公開系譜から列挙できる範囲

`generated_images.source_post_id` は投稿済み・visible行ではanonにも読めるため、特定原作に紐づく**投稿済み派生の件数**はPostgRESTから列挙可能である。これは参照カードで系譜を公開する仕様と整合する。一方、`prompt_usage_events` は未投稿・非公開を含む全成功生成を数えるためservice-onlyとし、anonが列挙できる部分集合とUIの利用数を同一視しない。

### エラー・Storage の二次経路

- `shared/generation/errors.ts:33-36` の `sanitizeProviderErrorMessage` は API キー形式しか除去しない
- Worker は provider 由来のメッセージを `image_jobs.error_message` と function logs に保存する（`image-gen-worker/index.ts:2931-2988`）
- Worker は provider から返った画像バイト列をそのまま公開 Storage に保存する（`:2614-2629`）。PNG text chunk / EXIF 等のメタデータは現状検査・除去していない

エラー本文と画像メタデータも秘匿境界に含める。

### 本番利用状況と検索影響（2026-07-29実測）

| 指標 | 実測値 |
| --- | --- |
| 公開・visible投稿 | 918件 |
| captionあり | 530件 |
| caption充足率 | **57.7%** |
| `generation_type = 'free'` | 全21件・2ユーザー・投稿0件 |
| `generation_type = 'coordinate'` | 全1,307件・投稿231件 |

検索をcaption + 作者表示名へ変更すると、caption未設定の約42.3%は本文ではヒットしなくなる。作者名検索は残るが、検索対象変更をUIとリリースノートで明示する。

### アプリ層 redaction（境界ではないが防御層として維持する）

`features/generation/lib/prompt-visibility.ts` が `one_tap_style` のみ伏せる実装。適用箇所は `server-api.ts:477,973` / `my-page/lib/server-api.ts:229` / `my-page/lib/api.ts:67`。

### 詳細画面のプロンプト表示

`PostDetailStatic.tsx:440-471` と `PostDetail.tsx`。`oneTapStylePreset ? カード : hasVisiblePrompt ? プロンプト欄 : null` の分岐がある。フォロー判定は `canViewPrompt = isOwner || isFollowingAuthor`（`:97`）。

### One-Tap Style の参照カード（流用元）

`features/style/components/OneTapStyleDetailCard.tsx`。「サムネイル → 確認ダイアログ → 生成画面へ」の構造。

### `/free` の生成フロー

`GenerationForm.tsx:335-350`。入力は画像・プロンプト・モデル・比率の4つのみ。生成 API は `app/api/generate-async/handler.ts`。

### 検索（初版の調査は誤りだった）

**`SearchBar` は `StickyHeader.tsx:289-305` で PC・モバイル双方に常時描画されている。** 初版で「アプリ内に導線が無い」としたのは、`/search` の文字列で grep したため `router.push` でパスを組み立てる `SearchBar.tsx` を取りこぼした結果である。**検索は現に使える機能である。**

- 検索クエリ: `server-api.ts:614,651` の `ilike("prompt", ...)`
- API: `app/api/posts/route.ts:35-38` の `q`
- キャッシュタグ: `search-posts`（`app/api/posts/post/route.ts:122` ほか）

### 削除・所有

- `features/generation/lib/database.ts:170` `deleteGeneratedImage` — **ブラウザから物理削除できる**
- `generated_images` の RLS: INSERT / UPDATE / DELETE いずれも所有者に開放（実測）

### i18n

`messages/` に15ロケール。`messages/ja.ts` が master で `satisfies DeepReplaceStrings<typeof jaMessages>`。**キー追加は15ファイル全てに必要**。

---

## 1. 概要図

### 秘匿境界の再設計（本計画の中核）

```mermaid
flowchart TB
    subgraph public["公開行 anon から読める"]
        GI["generated_images<br/>prompt は空にする"]
        J["image_jobs<br/>新規jobの prompt_text は全種別で空"]
    end
    subgraph authorsecret["原作者の秘密 authenticated は本人行のみ"]
        PS["generated_image_prompt_secrets<br/>ユーザー向け原作入力"]
    end
    subgraph servicesec["完全なサーバー専用領域"]
        GS["generation_prompt_snapshots<br/>通常jobは全文、派生jobは本文なし"]
    end
    subgraph server["サーバー経路のみ"]
        API["server-api と 生成API と Worker"]
    end
    GI -.->|"必要な生成種別だけ0対1"| PS
    J -->|"全新規jobが1対1"| GS
    API -->|"service role で解決"| PS
    API -->|"service role で解決"| GS
    API -->|"可視性ルールを適用して返す"| U["クライアント"]
    PS -.->|"本人以外の直接アクセスは失敗"| X["直接アクセスは失敗"]
    GS -.->|"anon と authenticated は全件失敗"| X
```

### 全体フロー

```mermaid
flowchart TD
    A["Aさんが /free で生成し投稿"] --> B{"プロンプトを公開するか"}
    B -->|公開| C["フォロワーには全文を表示"]
    B -->|非公開| D["プロンプト欄の代わりに参照カード"]
    D --> E{"閲覧者はAさんをフォロー済みか"}
    E -->|未フォロー| F["カード上でフォローを促す"]
    E -->|フォロー済み| G["このプロンプトで作る を押せる"]
    F --> G
    G --> H["ボトムシートが開く"]
    H --> I["プロンプト欄はグレーアウト。画像と比率とモデルを選ぶ"]
    I --> J["原作の投稿IDだけを送信"]
    J --> K["APIが原作の投稿IDだけでjobを作成"]
    K --> L["Workerが実行直前に認可と秘密を解決"]
    L --> M["メモリ上だけでprovider promptを再ビルド"]
    M --> N["Bのレコードに原作の秘密を永続化しない"]
```

### 生成のシーケンス（秘密が派生者の所有物にならないこと）

```mermaid
sequenceDiagram
    participant U as Viewer
    participant API as GenerateAsyncAPI
    participant J as ImageJobs
    participant W as Worker
    participant S as AuthorPromptSecrets
    U->>API: POST 原作の投稿IDと画像と比率とモデル
    API->>API: 対象条件とフォローとブロックを検証
    API->>J: jobと秘密を持たない参照recordを原子的に作成
    Note over J: originとrevisionだけ。prompt本文は空
    W->>J: ジョブ取得
    W->>S: service roleで再検証し秘密を実行時解決
    W->>R: jobに固定したrevisionを取得
    W->>W: pure builderでメモリ上だけに再ビルド
    Note over W: legacy builtは保存済み全文を直接使用
    W->>W: providerへ送信
    W->>J: 完了。prompt_text は空のまま
    Note over W: 派生した generated_images にも秘密を書かない
```

### 状態遷移

```mermaid
stateDiagram-v2
    [*] --> Public: "投稿時に既定で公開"
    Public --> Private: "編集モーダルで非公開にする"
    Private --> Public: "編集モーダルで公開にする"
    Private --> Unavailable: "削除 投稿取消 公開停止"
    Public --> Unavailable: "削除 投稿取消 公開停止"
    Unavailable --> Private: "公開停止が解除される"
```

### データモデル

```mermaid
erDiagram
    generated_images ||--o| generated_image_prompt_secrets : "原作者入力を持つ場合だけ"
    image_jobs ||--|| generation_prompt_snapshots : "実行入力recordを必ず持つ"
    generated_images ||--o{ prompt_usage_events : "原作として使われた記録"
    generated_image_prompt_secrets {
        uuid image_id PK
        text prompt "ユーザー向け原作入力"
        uuid prompt_owner_id "実際の原作者"
        text source_kind "author_input"
    }
    generation_prompt_snapshots {
        uuid image_job_id PK
        text snapshot_kind "materialized derived_reference"
        text provider_prompt "通常jobだけ nullable"
        text author_input "新規jobの生入力 nullable"
        uuid author_input_owner_id "入力者 nullable"
        text source_kind "free coordinate one_tap inspire"
        text source_revision "プリセット版"
    }
    image_jobs {
        uuid id PK
        text prompt_text "新規行は空"
        uuid origin_post_id "派生jobの原作 nullable"
    }
    generated_images {
        uuid id PK
        text prompt "空にする 公開行のため"
        text prompt_visibility "public または private"
        uuid source_post_id "原作 不変 service role のみ設定可"
        uuid source_author_id "原作者 削除後も残す"
    }
    prompt_usage_events {
        uuid id PK
        uuid image_job_id UK
        uuid origin_post_id "原作"
        uuid origin_author_id "原作者"
        uuid user_id "使った人"
        timestamptz created_at
    }
```

---

## 2. EARS 要件定義

### 秘匿境界

- **REQ-001**: The system shall separate user-disclosable author input from provider-ready prompt text by field and access policy, and `generated_images.prompt` shall not contain prompt text for any row.
  システムは、ユーザーへ開示し得る原作者入力とプロバイダ送信用の最終プロンプトをフィールドとアクセス方針の両方で分離し、`generated_images.prompt` にはいかなる行でもプロンプト本文を保持してはならない。

- **REQ-002**: The system shall deny `SELECT` on author prompt secrets to `anon`, allow direct authenticated access only to the actual prompt author, and deny all direct `anon` and `authenticated` access to prompt execution records.
  システムは原作者入力の秘密を `anon` に拒否し、`authenticated` の直接アクセスは実際の原作者本人の行だけに許可しなければならない。prompt execution recordは `anon` と `authenticated` の全件を拒否しなければならない。

- **REQ-003**: The system shall never infer prompt ownership from `generated_images.user_id`; it shall use `prompt_owner_id` and the disclosure policy of the prompt source.
  システムは `generated_images.user_id` からプロンプト所有権を推定してはならず、`prompt_owner_id` とプロンプト由来ごとの開示方針を使用しなければならない。

- **REQ-003a**: The system shall migrate existing `coordinate` and `free` prompts as author input without transformation, and shall not migrate platform-owned or marker values into author secrets.
  システムは既存の `coordinate` / `free` のプロンプトを加工せず原作者入力として移行し、運営所有の値やマーカー値を author secret へ移してはならない。

- **REQ-003b**: For every new generation job, the system shall create a service-only prompt execution record; a non-derived job shall persist its provider-ready prompt only in that record, while a derived job shall persist no prompt text and shall retain only its origin post id.
  すべての新規生成jobについて、システムはservice-onlyのprompt execution recordを作成しなければならない。通常jobはプロバイダ送信用全文をそのrecordだけに保存し、派生jobはプロンプト本文を一切保存せず、原作の投稿IDだけを保持しなければならない。

- **REQ-003c**: When the system creates a generation job, it shall atomically create its required prompt execution record, and the repository type shall not permit callers to omit the discriminated materialized or derived-reference input.
  システムが生成jobを作成するとき、必須のprompt execution recordを同一トランザクションで作成し、repositoryの型は `materialized` または `derived_reference` の判別可能な入力を呼び出し元が省略することを許してはならない。

- **REQ-003d**: The database shall independently reject prompt text or author input in a derived-reference record, shall reject an execution-record kind inconsistent with `image_jobs.origin_post_id`, and shall never create an author secret for a derived image regardless of nullable-field values.
  DBは、派生参照recordへのプロンプト本文・author input保存、`image_jobs.origin_post_id` と不整合なrecord種別を独立して拒否し、nullable列の値にかかわらず派生画像のauthor secretを作成してはならない。

- **REQ-004**: While a prompt is public, the system shall disclose it only to the author and the author's followers, preserving the existing follow gate.
  プロンプトが公開である間、システムは既存のフォローゲートを維持し、投稿者とそのフォロワーにのみ開示しなければならない。

### 既存機能の秘匿（One-Tap Style）

- **REQ-019**: The system shall not persist One-Tap Style or other platform-owned prompt text into user-readable rows; an immutable preset revision or service-only materialized prompt execution record shall be resolved by the worker.
  システムは One-Tap Style その他の運営所有プロンプトをユーザーが読める行に保存してはならない。Worker は不変のプリセット版、またはservice-onlyのmaterialized prompt execution recordを解決しなければならない。

### 派生生成

- **REQ-005**: When a viewer starts a derived generation, the system shall accept only the origin post id, source image, aspect ratio and model, and shall not accept prompt text.
  閲覧者が派生生成を開始したとき、システムは原作の投稿ID・元画像・比率・モデルのみを受け取り、プロンプト本文を受け取ってはならない。

- **REQ-006**: The system shall not persist the origin prompt into any record owned by the deriving user, including `image_jobs.prompt_text` and the derived `generated_images.prompt`.
  システムは、`image_jobs.prompt_text` と派生した `generated_images.prompt` を含め、派生した利用者が所有するいかなるレコードにも原作のプロンプトを保存してはならない。

- **REQ-007**: When the trusted server creates a derived job, it shall validate the source and atomically persist only the origin post id; it shall not resolve or persist the origin prompt.
  信頼されたサーバーが派生jobを作成するとき、原作を検証し、原作の投稿IDだけを原子的に保存しなければならない。この時点では原作プロンプトを解決または保存してはならない。

- **REQ-007a**: Immediately before a worker sends a derived request to the provider, it shall atomically re-verify availability, visibility, follow and block conditions and resolve the author secret with the service role, rebuild the provider prompt in memory with the same builder used for a normal free generation, and shall not persist the built prompt.
  Workerが派生リクエストをproviderへ送る直前に、利用可否・可視性・フォロー・ブロック条件を再検証した同じservice-only処理でauthor secretを解決し、通常のfree生成と同じbuilderでメモリ上だけにprovider promptを再ビルドし、ビルド済み全文を永続化してはならない。

- **REQ-007b**: If the required execution record is missing or inconsistent, then the worker shall terminate the job with an allowlisted internal code before calling the provider and shall not fall back to a user-readable prompt column.
  必須のprompt execution recordが欠落・不整合の場合、Workerはprovider呼び出し前にallowlist済み内部コードでjobを終端し、ユーザー可読prompt列へfallbackしてはならない。

- **REQ-008**: If the source is not a `free` root post with `prompt_visibility = 'private'` and an existing secret, or the origin author is unavailable, or a block relation exists in either direction, then the system shall reject the generation.
  参照先が `free` の根投稿でなく、`prompt_visibility = 'private'` でなく、秘密が存在せず、原作者が利用不可、または双方向いずれかにブロック関係がある場合、システムは生成を拒否しなければならない。

### 出所と改ざん防止

- **REQ-009**: The system shall set `generated_images.source_post_id`, `generated_images.source_author_id`, and `image_jobs.origin_post_id` only from a trusted server path, and shall reject any client-initiated insert or update of these columns.
  システムは `generated_images.source_post_id`、`generated_images.source_author_id`、`image_jobs.origin_post_id` を信頼されたサーバー経路からのみ設定し、クライアント起点のこれらの列の挿入・更新を拒否しなければならない。

- **REQ-010**: The system shall keep `source_post_id` immutable after creation.
  システムは作成後の `source_post_id` を不変にしなければならない。

- **REQ-011（改訂）**: While the origin post is unavailable, the system shall retain the lineage in the database, and the UI shall show only the section heading and a single unavailability message, omitting the thumbnail, credit, usage count and profile link.
  原作の投稿が利用できない間、システムは出所をデータベース上に保持しなければならない。UI は表題と利用不可の文言だけを表示し、サムネイル・クレジット・利用数・プロフィール導線を出してはならない。

  **改訂の理由（2026-07-30・実機確認後）**: 当初は「クレジットを無効状態で表示する」としていたが、実際に投稿取消を試すと、縦に大きな空のサムネイル枠が残り壊れて見えた。加えて、解消しようのない状態でクレジット・利用数・プロフィール導線を見せても閲覧者の次の行動につながらない。取り消した投稿へ注目を集めない方が原作者の意思にも沿う。`source_post_id` / `source_author_id` は DB に残り続けるため、系譜そのものは失われず、運営は admin から辿れる。

- **REQ-012**: When a derived generation completes successfully, the system shall record an immutable usage event, and the usage count shall be computed from those events.
  派生生成が成功したとき、システムは改ざんできない利用イベントを記録し、利用数はそのイベントから算出しなければならない。

### 表示

- **REQ-013**: While a post has a private prompt or a source reference, the system shall render the origin reference card in place of the prompt section.
  投稿のプロンプトが非公開、または出所参照を持つ間、システムはプロンプト欄の代わりに原作の参照カードを表示しなければならない。

- **REQ-014**: If the origin is unavailable for any reason, then the system shall return an identical response shape, status and error code for all causes, and shall not include the origin thumbnail.
  原作がいずれかの理由で利用不可の場合、システムはすべての原因に対して同一のレスポンス形状・ステータス・エラーコードを返し、原作のサムネイルを含めてはならない。

- **REQ-015**: When the author switches a prompt from public to private, the UI shall state that already disclosed content cannot be retracted.
  投稿者がプロンプトを公開から非公開へ切り替えるとき、UI は既に開示された内容を回収できない旨を明示しなければならない。

### 検索

- **REQ-016**: The system shall search `caption` and author display name, and shall not use prompt text as a search key.
  システムは `caption` と作者表示名を検索対象とし、プロンプト本文を検索キーに使ってはならない。

- **REQ-016a**: Before the system clears `generated_images.prompt`, it shall deploy the caption and author-name search path and verify that no production search query depends on the legacy prompt column.
  システムは `generated_images.prompt` を空化する前に、caption・作者名検索をデプロイし、本番検索が旧prompt列へ依存していないことを検証しなければならない。

### ログ

- **REQ-017**: The system shall not write prompt text to application logs, worker logs, APM, or provider error payloads.
  システムはプロンプト本文を、アプリログ・Worker ログ・APM・プロバイダのエラーペイロードに書き出してはならない。

- **REQ-017a**: After a worker resolves a derived secret, every exception path shall log and return only an allowlisted internal code and non-secret identifiers, and shall not serialize the resolved secret, template content, built prompt, caught object, or RPC payload.
  Workerが派生秘密を解決した後のすべての例外経路は、allowlist済み内部コードと非秘密の識別子だけをログ・返却し、解決済み秘密、テンプレート内容、ビルド済み全文、catchしたオブジェクト、RPC payloadをserializeしてはならない。

- **REQ-020**: After the contract migration, the database shall reject every insert or update that writes a non-empty value to `generated_images.prompt`.
  contract マイグレーション後、DB は `generated_images.prompt` に非空値を書き込むすべての INSERT / UPDATE を拒否しなければならない。

- **REQ-020a**: After the contract migration, `generated_images.prompt` shall have `DEFAULT ''` in addition to `NOT NULL` and `CHECK (prompt = '')`.
  contract マイグレーション後、`generated_images.prompt` は `NOT NULL` と `CHECK (prompt = '')` に加えて `DEFAULT ''` を持たなければならない。

- **REQ-021**: If a provider returns an error, the system shall store and return only an allowlisted internal error code and shall not persist or log the provider response body.
  プロバイダがエラーを返した場合、システムは allowlist 済みの内部エラーコードだけを保存・返却し、プロバイダのレスポンス本文を永続化またはログ出力してはならない。

- **REQ-022**: Before a provider-generated image is stored in a public bucket, the system shall remove non-pixel metadata or verify that no prompt-bearing metadata exists.
  プロバイダ生成画像を公開バケットへ保存する前に、システムは画素以外のメタデータを除去するか、プロンプトを含むメタデータが存在しないことを検証しなければならない。

- **REQ-023**: When a worker retries or receives the same queue message again, the system shall record at most one prompt usage event for the image job.
  Worker が再試行または同一キューメッセージを再受信したとき、システムは画像ジョブごとに高々1件の利用イベントだけを記録しなければならない。

- **REQ-024**: The system shall not clear a legacy prompt column until dual-write is active and row-level migration verification has succeeded.
  システムは dual-write が稼働し、行単位の移行検証が成功するまで、旧プロンプト列を空化してはならない。

- **REQ-025**: Once the worker has completed its final authorization check and started the provider request, later revocation may prevent delivery but cannot guarantee cancellation of the in-flight provider request.
  Worker が最終認可を終えてプロバイダリクエストを開始した後は、後続の取消によって成果物の提供を止められても、実行中の外部リクエスト自体の取消は保証しない。

- **REQ-026**: If source availability, follow, or block authorization becomes invalid before delivery, the system shall not deliver the generated result and shall refund any deducted Percoins through the existing idempotent `refund_percoins` path.
  成果物提供前に原作の利用可否・フォロー・ブロック認可が無効になった場合、システムは生成結果を提供せず、減算済みペルコインを既存の冪等な `refund_percoins` 経路で返金しなければならない。

- **REQ-027**: A terminal failed job shall not be re-executed in place; a user retry shall create a new job with a new prompt execution record.
  終端状態のfailed jobをその場で再実行してはならず、ユーザーの再試行は新しいprompt execution recordを持つ新規jobを作成しなければならない。

### 運営

- **REQ-018**: While an admin views a post, the system shall display the full prompt with a badge indicating whether it is provided privately.
  管理者が投稿を閲覧している間、システムはプロンプト全文と、非公開提供かどうかを示すバッジを表示しなければならない。

---

## 3. ADR

### ADR-001（再改訂）: 原作者入力とprompt execution recordを分離する

**初版の「別テーブル不要」は撤回する。**

- **Context**: `generated_images` の SELECT は行単位で `anon` に開放されているため、本文を同じ行へ置けない。一方、One-Tap Style では生成画像の所有者は利用者だが、最終プロンプトは運営資産である。画像所有者を秘密の所有者とみなすと、別テーブルへ移しても本人 RLS から再漏洩する。
- **Decision**:
  1. `generated_image_prompt_secrets(image_id PK, prompt, prompt_owner_id, source_kind, created_at)` は、投稿者へ表示・再利用し得る原作者入力を持つ。`source_kind` は `author_input` のみ。直接 SELECT は `auth.uid() = prompt_owner_id` のみ
  2. `generation_prompt_snapshots` は全新規jobに必須のservice-only prompt execution recordとする。`snapshot_kind = 'materialized'` の通常jobは `provider_prompt` と、開示可能な種別だけ `author_input` / ownerを持つ。`snapshot_kind = 'derived_reference'` の派生jobはprompt本文を一切持たない。`anon` / `authenticated` には一切の権限・ポリシーを与えない
  3. 派生画像と One-Tap Style 画像には、生成画像所有者が読める author secret を作らない
  4. 新規jobの `image_jobs.prompt_text` は全生成種別で空にする。通常jobはmaterialized record、派生jobはWorker実行時のauthor secretから生成する
  5. `generated_images.prompt` は全行空にし、contract 後は `DEFAULT ''` と CHECK 制約で非空値を拒否する
- **Reason**:
  1. RLS は列を絞れない。行が見える以上、列は取れる
  2. 「公開プロンプト」もフォロワー限定であり、公開行へ置いてよい本文はない
  3. ユーザー入力と共通 prefix・hidden prompt・プリセット全文では所有者と開示方針が異なる
  4. 完成済みプロンプトをユーザー所有の secrets にまとめると One-Tap Style / Inspire の moat を破る
- **Consequence**: 既存の coordinate / free は生入力そのものなので、加工せず `author_input` として author secret へ移す。表示・コピー内容は移行前後で変わらない。One-Tap Style の組み立て済み全文と Inspire のマーカー値は author secret へ入れない。派生jobごとのprovider prompt複製も作らない。将来 `image_jobs` に保持期限を導入して原作jobのrecordがCASCADE削除されても、完成したfree原作のauthor secretから派生生成を継続できる。

### ADR-002: 派生利用者が所有するレコードに秘密を一切書かない

- **Context**: 初版は「派生投稿の `prompt` 列に原作のプロンプトが入るが UI で隠す」としていた。しかし `image_jobs` の RLS は `auth.uid() = user_id` であり、**派生した利用者は自分のジョブの全列を読める**。Worker も `generated_images.prompt` へコピーする（`image-gen-worker/index.ts:2743`）。UI で隠しても2箇所から平文を取得できる。
- **Decision**: 新規jobでは生成種別を問わず `image_jobs.prompt_text` を空にする。派生job作成時のAPIはauthor secretを解決せず、原作IDだけを `image_jobs.origin_post_id` と本文を持たない `derived_reference` recordへ保存する。Workerはprovider呼び出し直前にservice role RPCで認可再検証とauthor secret解決を同時に行い、通常のfree生成とまったく同じbuilderでメモリ上だけに再ビルドする。ビルド済み全文はDB・ログ・APMへ永続化しない。原作jobのprovider snapshotは参照しない。
- **Reason**: 秘密を「派生者の所有物」に一瞬でも置いた時点で、RLS上はその人のものになる。service-onlyであっても派生jobごとに全文を複製すると、将来の権限事故時の被害量と取消後に残る秘密を増やす。原作画像に紐づくauthor secretはdurableなので、実行時解決でもF1の耐久性を満たす。
- **Consequence**: 秘密の永続コピーはauthor secretだけになり、フォロワー数に比例して増えない。派生生成は「通常のfree生成の入力を原作者のものに差し替えただけ」になり、経路が1本で済む。テンプレート更新後の再試行が更新後の錨を使う点は通常生成と同じ挙動であり、新たな不整合を持ち込まない。job投入後に原作が公開へ戻る・削除・ブロックされる場合はWorkerの実行時解決が失敗し、派生jobに残る秘密はない（REQ-007 / REQ-007a）。

### ADR-003: `source_post_id` は常に原作を指し、削除後も出所を保持する

- **Context**: A→B→C と派生したとき、根を指すか直前を指すかで意味が変わる。また `ON DELETE SET NULL` にすると、原作の削除で派生の出所が消える。派生投稿は「通常の投稿」に見えるようになり、非公開強制も外れる。
- **Decision**: 常に根を指す。`source_post_id` は **FK 制約を張らない素の UUID** とし、あわせて `source_author_id` を保存する。ただし作成 RPC / trigger は、作成時点で原作が実在すること、root であること、`source_author_id = origin.user_id` であることを検証し、両列を不変にする。原作が削除されても値は残り、解決に失敗したら「現在、ご利用できません」を表示する。
- **Reason**: 出所は削除後も残す必要がある（クレジット・非公開強制・利用数の根拠）。`ON DELETE SET NULL` はこれを破壊する。`RESTRICT` は原作者が自分の投稿を消せなくなるため不可。
- **Consequence**: 削除後は意図的な dangling UUID になるが、不正なUUIDを新規作成することはDBが拒否する。投稿だけが削除された場合は残存プロフィールから原作者を表示する。アカウント完全削除後はPIIの表示名スナップショットを保持せず「削除されたユーザー」と表示する。将来、非PIIの安定した出所レコードが必要になった場合は、削除されない `prompt_origins` tombstone テーブルへ昇格する。中間の投稿がどれだけ広めたかは記録しない。

### ADR-004: 派生投稿は投稿者の選択より優先して非公開にする

- **Context**: 派生した利用者はボトムシートでプロンプトを編集できないため、生成に使われたのは原作のプロンプトそのものである。
- **Decision**: `source_post_id` を持つ投稿は、投稿者が「公開」を選んでも非公開として扱う。投稿モーダルでトグルを出さない。DB trigger でも強制する。
- **Reason**: プロンプトは原作者の資産であり、派生者に公開の権限はない。
- **Consequence**: 派生者は自分の投稿のプロンプトを見られない（ADR-002 により、そもそも所有物として保存されない）。

### ADR-005: 利用不可の理由は開示せず、レスポンス形状も統一する

- **Context**: 元投稿が削除・投稿取消・公開停止・非公開解除のいずれでも生成できない。
- **Decision**: すべて「現在、ご利用できません」に丸める。**文言だけでなく、HTTP ステータス・エラーコード・レスポンスの形も同一にする。** 公開停止された投稿のサムネイルは返さない。
- **Reason**: 「削除時だけサムネイルが欠ける」「公開停止時だけ画像が残る」「ステータスが違う」といった差からも理由は推測できる。**文言を揃えただけでは秘匿にならない。**
- **Consequence**: 原作者が自分で消しただけのケースも同じ表示になる。閲覧者から区別できないが実害はない。

### ADR-006: 生成 API はプロンプトを受け取らず、対象条件を厳格に検証する

- **Context**: プロンプトをクライアント経由で渡すと devtools で見える。また `sourcePostId` の検証が緩いと、**One-Tap Style や Inspire の投稿 ID を渡して秘匿プロンプトを回収できる**。
- **Decision**: `sourcePostId` のみを受け取り、以下をすべて満たすときだけ実行する。
  - 対象が存在し `is_posted = true` かつ `moderation_status = 'visible'`
    - **改訂（2026-07-31）**: `is_posted` は本人が自分の生成物を使う場合だけ問わない。マイページから自分の未投稿の生成物を開くと「現在、ご利用できません」になっていたが、自分のプロンプトなので使えるべき。未投稿は「まだ公開していない自分の下書き」でしかなく第三者へ渡らない（他人が ID を渡しても `user_id <> requester` で従来どおり弾かれ、投稿詳細の取得も未投稿は本人と管理者にしか返さない）。`moderation_status` は本人でも緩めない。公開停止になった内容から作り直せると措置の意味がなくなる
  - `generation_type = 'free'`
  - 根投稿である（`source_post_id IS NULL`）。派生 ID が渡されたら根へ解決する
  - ~~`prompt_visibility = 'private'`~~ → **改訂（2026-07-31）**: 公開・非公開のどちらも原作にできる。公開設定でプロンプト欄の UI が変わるのは分かりにくく、「このプロンプトで作る」の入口はどちらでも同じであるべきという判断。公開のときはコピーボタンを併設し、シートの入力欄にも本文を表示する（編集は不可）。生成時に送るのは公開・非公開とも投稿 ID だけで、本文はサーバーが author secret から解決するため秘匿は緩まない
  - secrets 行が存在する
  - 原作者のアカウントが利用可能
  - リクエスト元が原作者をフォローしている、または本人
  - **双方向いずれにもブロック関係がない**
  - **派生リクエスト自身の `generationType` が `free`**（`generationType` には `default('coordinate')` があるため、`sourcePostId` だけを送ると別種の builder へ入る）
- **Reason**: 条件が1つでも欠けると別種の秘匿プロンプトの回収経路になる。
- **Consequence**: 検証が長くなるため、専用の SECURITY DEFINER RPC に集約して API と Worker の双方から呼ぶ。

Workerは課金前とprovider呼び出し直前に認可を検証する。課金前に無効なら減算せず終了する。課金後に無効なら成果物を提供せず、既存の `refundPercoinsFromGeneration` → `refund_percoins` RPCで冪等返金する。provider完了後・永続化前にも再検証し、その間に取消された場合は成果物を破棄して同じ返金経路を使う。外部API実行中にDBロックは保持せず、providerへ送信済みのリクエスト自体の取消は保証しない（REQ-025 / REQ-026）。

### ADR-007（改訂）: 検索は残し、対象を公開フィールドへ差し替える

**初版の「検索機能を廃止」は撤回する。**

- **Context**: 初版は「アプリ内に検索ボックスへの導線が無い」として廃止を提案した。**これは調査ミスだった。** `SearchBar` は `StickyHeader.tsx:289-305` で PC・モバイル双方に常時描画されている。`/search` の文字列で grep したため、`router.push` でパスを組み立てる `SearchBar.tsx` を取りこぼした。
- **Decision**: `/search` と検索バーは維持する。`ilike("prompt", ...)` を **`caption` と作者表示名の検索へ差し替える**。作者表示名は公開プロフィールから候補 `user_id` を先に解決するか、既存のblock・report・moderation条件を同じSQL内で維持できる専用RPC/viewで結合する。
- **Reason**:
  1. 現に使える機能であり、廃止は実質的なユーザー機能削除にあたる。秘匿の手段としては過剰
  2. そもそも**プロンプトを検索キーにしている現状自体が是正対象**である。ADR-001 でプロンプトを公開行から外す以上、検索キーにはできない
  3. `caption` は公開が前提のフィールドであり、検索対象として自然
- **Consequence**: 本番のcaption充足率は57.7%（公開visible 918件中530件）で、約42.3%はcaption本文ではヒットしない。プレースホルダとリリースノートで「作品説明・作者名検索」へ変わることを示す。検索差し替えは `generated_images.prompt` 空化の前提なのでPhase 0Bへ前倒しする。ページネーション・並び順・ワイルドカードのエスケープを維持する。

### ADR-008: 利用数は改ざん不可のイベントから算出する

- **Context**: `generated_images` を数える案だったが、同テーブルは所有者が INSERT / UPDATE / DELETE でき、`source_post_id` も書き換えられる。任意の原作 ID を自分の行に設定すれば利用数を水増しできる。派生画像を削除すると利用数が減る問題もある。
- **Decision**: `prompt_usage_events(id, image_job_id UNIQUE, origin_post_id, origin_author_id, user_id, created_at)` を新設し、**生成成功時に service role で冪等記録**する。`record_prompt_usage(p_image_job_id)` は成功済みジョブから origin・原作者・利用者をDB内で導出し、`ON CONFLICT DO NOTHING` とする。利用数は `COUNT(DISTINCT user_id)` で算出し、保存済み `origin_author_id` により原作者自身を除外する。クライアントからの書き込みは不可。
- **Reason**: 表示する数値は改ざんできてはならない。生成画像の削除で数が減るのも実態に合わない（使った事実は消えない）。
- **Consequence**: テーブルが1つ増える。`image_job_id` にFKは張らない（`image_jobs` には本人が自分の行を削除できるポリシーがあり、CASCADEにすると派生者がジョブを消すだけで利用数を減らせる）。イベントは削除しないため単調増加するが、Worker再試行では増えない。集計RPCはservice-onlyとし、Server APIが原作の閲覧可否を適用してから結果だけをレスポンスへ載せる。クライアントへ任意UUIDで呼べるEXECUTE権限は与えない。ただし公開・visibleな派生投稿の `source_post_id` は系譜表示の仕様としてanon可読であり、PostgRESTから**投稿済み派生だけの件数**は部分的に列挙できる。未投稿・非公開を含む全成功生成数とユニーク利用者数は `prompt_usage_events` 側にだけ存在し、直接列挙できない。

### ADR-009: Phase 0 は expand・backfill・contract の複数デプロイに分ける

- **Context**: Vercel デプロイと `supabase db push`、Edge Function deploy は別操作である。単一PRに additive migration と空化 migration を同梱すると、旧コード停止・テーブル未作成・backfill後の新規行取りこぼしのいずれかが起こる。
- **Decision**: 既存漏洩修正は3段階に分ける。Phase 0A で additive schema、Phase 0B で互換コード・dual-write・backfill・検証、Phase 0C で旧fallback撤去・空化・DB invariantを適用する。各段階を別PR・別デプロイとし、新機能UIより先に完了させる。さらに Phase 0C で必要になった完了RPCの6引数化は、contractと同じ未適用migration群へ入れず、**先行expand PRとして単独でマージ・適用**する。`supabase db push` は特定migrationで停止できないため、expandとcontractの間へWorkerデプロイを挟むにはPR自体を分ける。
- **Reason**: 時間ではなく、dual-write 稼働中の行単位検証を contract の前提にする必要がある。未使用の additive table が一時的に残ることは、データ欠損や漏洩より安全である。
- **Consequence**: 当初の「Phase 0〜5を単一PR」は撤回する。移行中だけ新→旧の dual-read を許すが、secret取得エラー時の無条件fallbackは禁止する。fallbackには期限・観測・撤去PRを必須とする。Phase 0C expand適用後はPostgRESTのschema cacheを明示reloadし、旧4引数・新6引数の両呼び出しが解決できることを確認してからWorkerを切り替える。

### ADR-010: provider error と公開画像メタデータを秘密の出口として扱う

- **Context**: 現在の sanitizer はAPIキーしか除去せず、provider本文を `error_message` とログへ保存し得る。また provider の画像バイト列をそのまま公開Storageへ置いている。
- **Decision**: クライアント可視のエラーはallowlist済み内部コードへ正規化し、provider response body・request body・promptをDB、ログ、APMへ残さない。providerの生バイトが保存されるoriginalを優先調査し、prompt-bearing metadataがあれば公開保存前に除去・再エンコードする。display / thumbnailはSharp再エンコード済みだが、テストでmetadataがないことを確認する。
- **Reason**: UIとDB列を塞いでも、エラー本文やPNG text chunkから本文が出れば機能価値が失われる。
- **Consequence**: 運用デバッグ情報はステータス、内部コード、request id、provider、モデル、所要時間に限定する。元画像の画素としてモデルが文字を描画するケースは技術的に防げないため、秘匿保証は非画素メタデータとシステム出力経路を対象とする。

### ADR-011: 非公開モードの対象は今回 `/free` に限定する

- **Context**: 2026-07-29時点で `free` は全21件・投稿0件、`coordinate` は全1,307件・投稿231件である。coordinateへ広げれば利用面は大きいが、ヒアリングで確定した本機能の対象は `/free` であり、投稿UI・派生生成・互換性の追加検討が必要になる。
- **Decision**: Phase 0の秘匿境界修正と新規jobのauthor input分離は全生成種別へ適用するが、`prompt_visibility = 'private'` を選べるroot投稿は今回 `generation_type = 'free'` に限定する。
- **Reason**: セキュリティ境界は利用数に関係なく全種別で直す。一方、製品機能の対象拡大は実測利用数だけを理由に既存合意を変更せず、別の要件確認を経る。
- **Consequence**: coordinate対応を後から追加する場合は、guard制約・投稿UI・派生可否・legacy built表示を扱う別ADRとforward migrationが必要になる。この後戻りコストを明示的に受け入れる。

### ADR-012: 終端failed jobは再利用せず、新規jobとして再試行する

- **Context**: 現在のWorker claimは `queued` と `failed` の両方を許すが、終端失敗時はqueue messageを削除しており、管理API/UIに既存failed jobの手動再実行経路は見つからない。contractでlegacy `prompt_text` を空化すると、execution recordのないfailed jobは同一行で再生成できない。本番にはfailed jobが180件あり、attempts別に0: 3件、1: 141件、2: 11件、3: 25件である。attempts 3の存在から、failed再claimは実際に発生している。
- **Decision**: Workerが処理開始できるのは `queued` のみとする。内部リトライはstatusを `queued` に戻す。終端 `failed` は不変とし、ユーザーの「再試行」は入力を再送して新しいjobとprompt execution recordを作る。
- **Reason**: 終端jobの監査状態を保ち、空化済み秘密へ依存する隠れた再実行経路をなくす。
- **Consequence**: これは移行支援だけでなく既存180件に関係する再試行挙動の修正である。Phase 0C前にユーザー向け再試行導線がfailed再claimへ依存せず、新規job作成になっていることを確認する。legacy failed jobを同一IDで手動再実行する運用は廃止する。将来admin再実行を作る場合も、旧jobを複製せず認可・課金・prompt execution recordを再作成する専用RPCを設計する。

### ADR-013（撤回）: legacy built prompt の世代差は発生しない

- **撤回理由**: 前提が誤っていた。本番実測で `coordinate` / `free` の既存 `prompt` はビルド済み全文ではなく生入力であることを確認した（運営の錨を含む行は 0 件）。したがって legacy と新規で author secret の中身が変わらず、表示・コピーの世代差も生じない。
- **現在の方針**: 既存行は加工せず `author_input` として移行する。prefix 剥離・推測抽出は不要であり、そもそも剥離すべき prefix が入っていない。

### ADR-014（撤回）: freeテンプレートの不変revisionは導入しない

- **撤回理由**: ADR-013 と同じ前提誤りに依存していた。通常生成は現在も Worker 実行時に現行テンプレートで組み立てており、**再試行時のバイト一致は元から保証されていない**。派生 job だけ版を固定するのは既存挙動より厳格で、整合しない。
- **副次的な利点**: revision テーブルは運営の錨（`free.base_prefix`）を DB へ新たに書き出す必要があった。実測では現在 `prompt_overrides` に `free.*` の行が 0 件で、錨はコード定数にのみ存在する。導入しないことで、秘密の保管場所を増やさずに済む。
- **現在の方針**: 派生 job は原作 ID だけを保持し、Worker が通常の free 生成と同じ builder で実行時に組み立てる。

---

## 4. 実装計画

### フェーズ間の依存関係

```mermaid
flowchart LR
    P0A["Phase 0A PR1: Expand"] --> P0B["Phase 0B PR2: Dual write と検索と Backfill"]
    P0B --> P0CE["Phase 0C PR3a: 完了RPC Expand"]
    P0CE --> P0CC["Phase 0C PR3b: Contract"]
    P0CC --> P1["Phase 1 PR4: 非公開モードDBとAPI"]
    P1 --> P2["Phase 2 PR5: 投稿と閲覧UI"]
    P2 --> P3["Phase 3 PR6: Adminと仕上げ"]
```

### 本番適用ランブック

| 順序 | デプロイ単位 | 必須確認 |
| --- | --- | --- |
| 1 | PR1のadditive migrationを `supabase db push` | 旧Next.js / 旧Workerが正常、secret権限マトリクスが期待どおり |
| 2 | PR2のbackward-compatible Worker | legacy jobは従来どおり、materialized execution recordを持つjobも処理可能 |
| 3 | PR2のNext.js | `createImageJob(jobData, promptExecution)` が必須で、新規jobの `prompt_text` が全種別で空。検索がcaption + 作者名へ移行済み |
| 4 | backfill + 検証SQL | 種別件数・行digest・owner・orphan・dual-write後の差分がすべて0 |
| 5 | Phase 0C先行expand PR | `20260730090000` **だけ**を含むPRをマージする。`supabase db push --dry-run` が1本だけを示すことを確認して適用 |
| 6 | PostgREST互換ゲート | schema reload後、旧4引数・新6引数の双方がPGRST202ではなく関数本体の応答へ到達することをservice roleで確認 |
| 7 | Phase 0C contract PRのNext.js / Worker | 先行expandを含むmainと同期してからデプロイ。secret読み取りエラーがfail closedで、Gemini / OpenAI双方の生成・表示が正常 |
| 8 | contract直前のdrain | 生成受付を止め、Worker cronを動かしたまま`queued / processing = 0`までdrain。その後cronを止め、active=0を再確認 |
| 9 | Phase 0C contract migration | `supabase db push --dry-run` が`20260730100000`だけを示すことを確認。公開列と**全job**を空化し、DB invariantを追加 |
| 10 | 再開・受け入れ確認 | Worker cronを戻して生成受付を再開。Gemini / OpenAI生成、表示、anon公開列、Storage孤児、課金reconciliationを確認 |
| 11 | PR4以降 | private prompt新機能を初めて有効化 |

expand適用後のPostgREST疎通は、実在しないjob IDを使って関数解決だけを確認する。
service role keyはシェル履歴・ログへ出さず、次の旧4引数 / 新6引数リクエストが
どちらも `PGRST202` ではなく関数本体の `image job not found` へ到達することを確認する。

```bash
curl -sS "${SUPABASE_URL}/rest/v1/rpc/complete_image_job_with_prompt_secrets" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"p_job_id":"00000000-0000-4000-8000-000000000000","p_images":[],"p_generation_metadata":null,"p_result_image_url":null}'

curl -sS "${SUPABASE_URL}/rest/v1/rpc/complete_image_job_with_prompt_secrets" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"p_job_id":"00000000-0000-4000-8000-000000000000","p_images":[],"p_generation_metadata":null,"p_result_image_url":null,"p_model":null,"p_background_mode":null}'
```

生成受付を一時停止する運用手段が用意できない場合はcontractを適用しない。
受付を止めずにactive=0の瞬間を狙う運用は、migration内部ゲートによりfail closedには
なるが、再試行回数と停止時間を予測できず、本ランブックの正式手順とはしない。

各段階でロールバック先は「直前の互換バージョン」とする。順序を飛ばさず、Vercel・DB・Workerのどれが現在の本番バージョンかをリリース記録へ残す。

### Phase 0A: Expand（PR1・マイグレーション先行）

**目的**: 既存コードを壊さず秘密の保存先と原子的書き込み口を追加する
**適用順序**: PR1マージ → `supabase db push` → スキーマ確認。未使用テーブルが先行しても既存挙動は変わらない

- [x] `generated_image_prompt_secrets`
  - `image_id UUID PK REFERENCES generated_images(id) ON DELETE CASCADE`
  - `prompt TEXT NOT NULL`
  - `prompt_owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
  - `source_kind TEXT NOT NULL CHECK (source_kind IN ('author_input'))`
  - RLSは本人SELECTのみ。`anon`拒否。DMLはservice role /専用RPCのみ
- [x] `generation_prompt_snapshots`
  - `image_job_id UUID PK REFERENCES image_jobs(id) ON DELETE CASCADE`
  - `snapshot_kind TEXT NOT NULL CHECK (snapshot_kind IN ('materialized','derived_reference'))`
  - `provider_prompt TEXT`, `author_input TEXT`, `author_input_owner_id UUID`, `source_kind`, `source_revision`, `created_at`
  - `source_kind` は `free / coordinate / one_tap_style / inspire` 等の生成由来を表す
  - `materialized` は `provider_prompt` 必須。`author_input` はユーザー向け表示対象のfree / coordinateだけに許可し、入力の有無・ownerをCHECK制約で整合させる
  - `derived_reference` は `provider_prompt` / `author_input` / `author_input_owner_id` / `source_revision` がすべてNULL、`source_kind = 'free'` であることをローカルCHECKで強制する
  - `image_jobs.origin_post_id` とのcross-table triggerは、origin列を追加するPhase 1で有効化する
  - RLS有効・公開ポリシーなし・`PUBLIC, anon, authenticated` から全権限REVOKE
- [x] 通常生成の完了を原子的に行うRPCを追加し、画像行・author secret・job成功更新を同一トランザクションに閉じる
- [x] `complete_image_job_with_generated_images` の新しい定義を追加し、将来のdual-writeに対応できる形にする
- [x] One-Tap用の「ジョブ + service-only materialized execution record」作成RPCを追加する。`source_revision` は実行時に変更されないプリセット版または内容ハッシュ
- [x] SECURITY DEFINER関数は `SET search_path = public, pg_temp`、所有者固定、`PUBLIC / anon / authenticated` のEXECUTEをREVOKEし、必要なservice role経路だけに限定する
- [x] Supabaseの契約・バックアップ機能を確認（2026-07-29 実測）
  - Proプランの日次物理バックアップが7日分あり、すべて `COMPLETED`（`supabase backups list` で確認）
  - PITRアドオンは未契約。**Phase 0C の前提条件から外す**
  - 本命の保険は author secret 側に本文が残っていること。DBを巻き戻すのではなく
    secret から `generated_images.prompt` へ書き戻せば復旧できる。
    実際に `20260729150000` / `20260729160000` で2回実証済み
- [x] マイグレーション後に `anon` / authenticated他人 / owner / service role の権限マトリクスをPreviewで検証

### Phase 0B: Dual-write・読み取り移行・Backfill（PR2）

**目的**: 新規行の取りこぼしを止めた状態で、既存値を安全に移行する
**デプロイ順序**: backward-compatible Worker → Next.js → backfill・検証

- [x] Worker を先にデプロイ
  - 全生成種別でmaterialized execution recordがあれば使用し、移行前の既存jobだけ `prompt_text` fallbackを許す
  - 新規jobでexecution recordが欠落・不整合なら `GENERATION_PROMPT_EXECUTION_MISSING` の固定内部コードでprovider呼び出し前に終端失敗とし、`prompt_text` へfallbackしない
  - Gemini/OpenAI双方の画像永続化を新RPCへ統一する
  - `generated_images.prompt` への直接コピーをやめ、新規jobはmaterialized execution recordの `author_input` がある場合だけ同一トランザクションでauthor secretを作る
- [x] Next.jsをデプロイ
  - `ImageJobCreateInput` とは別に `MaterializedPromptExecutionInput | DerivedPromptReferenceInput` のdiscriminated unionを定義し、repositoryを `createImageJob(jobData, promptExecution)` の2引数に変更する。第2引数はoptionalにしない
  - 2つの既存呼び出し元を同じ型へ移し、全生成種別で `prompt_text = ''` としたjob・provider prompt・生のauthor inputを専用RPCで原子的に保存する
  - jobだけ、またはexecution recordだけが残る部分成功を許さず、3つ目の生成経路がprompt execution入力なしでコンパイルできないことを型で保証する（REQ-003c）
  - `saveGeneratedImage(s)` の汎用ブラウザINSERTを削除またはpromptを書けないAPIへ縮小
  - Wardrobe claimの `prompt` を公開列へ保存しない。必要ならtrusted RPCで分類済みsecretへ保存
  - `features/generation/lib/prompt-builder.ts` の最終プロンプトログを削除
- [x] **検索対象をcontract前に差し替える**（REQ-016 / REQ-016a）
  - `server-api.ts:614,651` のprompt検索をcaption + 公開プロフィール表示名へ変更
  - `caption` と `profiles.nickname` の `%term%` 検索について、`pg_trgm` indexを追加するかPreviewの `EXPLAIN` で不要と判断した根拠を残す
  - 既存のmoderation・block・report・sort・pagination条件を維持し、wildcardをエスケープ
  - `SearchBar` / `StickyHeader` を「作品説明・作者名」に変更
  - caption充足率57.7%と検索対象変更をリリースノートに記載
  - 本番同等データで検索が0件固定にならないことを確認
- [x] 読み取りを `features/generation/lib/prompt-secrets.ts` へ移行
  - `features/posts/lib/server-api.ts`、`features/my-page/lib/server-api.ts` / `api.ts`
  - ブラウザの `select("*")` を明示列へ変更し `prompt` を除外
  - 移行中のfallbackは「対応するlegacy行でsecretが未作成」の場合だけ。DB障害・権限エラー時はfail closed
- [x] providerエラーを固定内部コードへ正規化し、response body・prompt・stackをDB/ログへ保存しない
- [x] 公開Storageへ保存する生成画像の非画素メタデータを除去または形式別に検証
- [x] idempotent backfill
  - `INSERT ... ON CONFLICT ...` とし、`generation_type` /由来ごとに分類
  - `coordinate`（非空1,302件）と `free`（21件）は生入力そのものなので、加工せず `author_input` として author secret へ移す。`prompt_owner_id` は `generated_images.user_id`
  - `one_tap_style`（非空2,069件・運営の組み立て済み全文）と `inspire`（89件・`"inspire"` / `"creator-looks"` のマーカー値）は author secret へ入れない
  - prefix剥離・テンプレート文字列一致による加工は行わない（そもそも剥離すべきprefixが入っていない）
  - 移行対象外は `generation_type` 別件数とhashを検証し、平文をログへ出さない
  - backfill中もdual-writeを継続
- [x] 平文を出力しない検証SQLを実行
  - legacy非空行と移行先の件数を種別ごとに比較
  - 行ごとの `digest(prompt)` を比較
  - owner/source_kind不整合、orphan、移行漏れが0件
  - dual-write開始後に作られた行も差分0件

### Phase 0C: Contract・既存漏洩の閉鎖（先行expand PR + contract PR3）

**目的**: 公開列・ユーザー所有ジョブ・fallbackを完全に閉じ、再発をDBで拒否する
**開始条件**: Phase 0Bが本番稼働し、検索がprompt列へ依存せず、検証SQLが連続して差分0件。Phase 0C先行expand PRの `20260730090000` が本番migration historyに存在し、PostgREST経由で旧4引数・新6引数の両呼び出しが解決できる。ユーザー向け再試行が新規job作成であることを確認。日次物理バックアップが直近分まで `COMPLETED` であることを確認（PITRは不要）。contract適用直前は生成受付を止め、Workerでdrainした後にcronを止め、**全queued / processing jobが0件**であることをSQLとmigration内部ゲートの両方で確認する。
あわせて author secret 側の完全性を再検証する（件数・行ごとのmd5・所有者・運営資産の非混入）

- [ ] `20260730090000_expand_complete_rpc_model_params.sql` をcontractとは別の先行PRとしてマージ・適用
  - `supabase db push --dry-run` で対象がこの1本だけであることを確認
  - `NOTIFY pgrst, 'reload schema'` 後、旧4引数・新6引数の双方が解決できることを確認
  - contract PRを更新後のmainと同期し、同migrationがcontract PRの差分から消えたことを確認
- [ ] secret→legacyの読み取りfallbackを削除してデプロイし、読み取りエラー率を監視
- [ ] `generated_images.prompt` を空文字へ更新
- [ ] `ALTER COLUMN prompt SET DEFAULT ''` を適用
- [ ] `CHECK (prompt = '')` を `NOT VALID` →検証→VALIDATEの順で追加
- [ ] `idx_generated_images_prompt_trgm` を削除
  - 検索は無効化済みで、有効化しても caption / nickname の trigram index を使う
    （`20260729170000` で追加済み）。prompt の index は空化後に不要になる
- [ ] 最新の `complete_image_job_with_generated_images` を含む全永続化経路が空文字しか書かないことを確認
- [ ] 全生成種別・全statusの `image_jobs.prompt_text` を同一transactionで空化
  - 生成受付を一時停止し、Worker cronを動かしたまま全queued / processingをdrainする
  - active=0になってからWorker cronを止め、直後に件数を再確認する
  - migrationは最初に`image_jobs EXCLUSIVE → generated_images ACCESS EXCLUSIVE`の順でロックし、activeが1件でもあれば中断する
  - 全件空化後に`DEFAULT ''`と`CHECK (prompt_text = '')`を追加し、再発をDBで拒否する
  - legacy failedは同一jobで再実行せず、ユーザー再試行は新規jobを作る
  - Workerのclaim条件を `queued` のみに変更し、終端failedを再取得しない
  - 固定件数ではなく実行時クエリ結果をgeneration_type・status別に記録
- [ ] ~~contract前後に同じ既知のcaption・nickname検索を本番で実行する~~
  - **検索は PR #466 で一時的に無効化した**ため、この確認は不要になった。
    復帰させるときに `PostList` のループ修正とあわせて行う（後述の未解決事項）
- [ ] anonで `generated_images.prompt` が全件空、One-Tap生成者で自分のjob/execution recordから全文を取得できないことを本番同等キーで検証
- [ ] 秘匿境界修正を新機能から独立してリリース完了とする

### Phase 1: 非公開モードのDB・API・Worker（PR4）

**目的**: 可視性・出所・派生生成・冪等利用イベントを実装する

- [ ] `supabase/migrations/2026xxxx_add_free_prompt_visibility.sql`
  - `generated_images` に追加
    - `prompt_visibility TEXT NOT NULL DEFAULT 'public' CHECK (prompt_visibility IN ('public','private'))`
    - `source_post_id UUID`（**FK なし**。ADR-003）
    - `source_author_id UUID`
  - `image_jobs` に `origin_post_id UUID` を追加（FKなし）。jobはクレジット表示の正本ではなく運用レコードであり、FKを付けない理由はADR-003の系譜保持ではなく、queued / processing jobが原作投稿の削除を `RESTRICT` で阻害しないため
  - `source_post_id` に部分インデックス（`WHERE source_post_id IS NOT NULL`）
  - **guard trigger**（DB 層で強制）
    - `source_post_id` が自分自身を指さない
    - `source_post_id` が NOT NULL のとき `prompt_visibility` を `'private'` に強制
    - rootで `prompt_visibility = 'private'` を選べるのは `generation_type = 'free'` のみ
    - **`source_post_id` / `source_author_id` は service role からの書き込みのときのみ設定・変更可**。それ以外の INSERT / UPDATE では拒否（REQ-009）
    - 作成時にoriginの実在・root・free・`source_author_id = origin.user_id` を検証
    - 作成後の `source_post_id` / `source_author_id` 変更を拒否
    - `image_jobs.origin_post_id` はservice-onlyのjob作成RPCだけが設定でき、作成後は変更を拒否
- [ ] 派生recordとauthor secretのDB二重防御（REQ-003d）
  - `generation_prompt_snapshots` のlocal CHECKに加え、BEFORE INSERT / UPDATE triggerで対応する `image_jobs.origin_post_id` を参照し、originありなら `snapshot_kind = 'derived_reference'`、originなしなら `materialized` を強制する
  - 派生recordでは `provider_prompt` / `author_input` / `author_input_owner_id` / `source_revision` がNULL、`source_kind = 'free'` でなければ、RPC経由か直接書き込みかを問わず拒否する
  - `complete_image_job_with_generated_images` は `source_post_id` / `source_author_id` を呼び出し引数から信用せず、検証済み `v_job.origin_post_id` と原作行から導出する
  - 同RPCは `v_job.origin_post_id IS NOT NULL` のときnullable列の状態と無関係にauthor secret作成分岐へ入らない。不正にauthor inputが存在すれば固定内部コードでtransactionを失敗させる
  - `generated_image_prompt_secrets` のBEFORE INSERT / UPDATE triggerは、対象 `generated_images.source_post_id IS NOT NULL` ならservice roleの直接書き込みでも拒否する
- [ ] `supabase/migrations/2026xxxx_add_prompt_usage_events.sql`
  - `prompt_usage_events(id UUID PK, image_job_id UUID UNIQUE NOT NULL, origin_post_id UUID NOT NULL, origin_author_id UUID NOT NULL, user_id UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`
  - RLS 有効化・公開ポリシーなし・`REVOKE ALL FROM PUBLIC, anon, authenticated`
  - `(origin_post_id)` にインデックス
- [ ] `supabase/migrations/2026xxxx_add_derived_generation_rpcs.sql`
  - `validate_derived_prompt_source(p_source_post_id, p_requester_id)` — APIのjob作成前、Workerの課金前、provider完了後の検証用。本文を返さず可否・根の投稿ID・原作者IDだけを返すservice-only RPC
  - `resolve_derived_prompt_source(p_source_post_id, p_requester_id)` — Workerがprovider送信直前に使用。ADR-006の全条件を同一statement / transaction snapshotで再検証し、author secretの `source_kind` と秘密値を返すservice-only RPC。原作jobのexecution recordは参照しない
  - `record_prompt_usage(p_image_job_id)` — 成功済みjobから値を導出し `ON CONFLICT DO NOTHING`
  - `get_prompt_usage_count(p_origin_post_id)` — service-only。Server APIが原作の閲覧可否を適用した後に `COUNT(DISTINCT user_id)` を取得し、クライアントから任意UUIDを列挙できる直接GRANTはしない
- [ ] `app/api/generate-async/handler.ts`
  - `sourcePostId` と `prompt` の同時指定は400
  - `sourcePostId` 指定時に `generationType <> 'free'` は400（fail closed）
  - requester idはbodyではなく認証セッションから取得
  - 利用不可は同一の409 + `FREE_SOURCE_UNAVAILABLE`
  - 派生job作成時は `validate_derived_prompt_source` で認可するがauthor secretを取得しない
  - ここでは author secret を解決せず、builder も呼ばない
  - jobのユーザー可読列には `origin_post_id` と `prompt_text = ''` を保存し、service-only `derived_reference` recordは本文を一切持たない
  - job + derived reference RPCの失敗時は、入力オブジェクト・resolved template・Supabase error objectを丸ごとログ出力せず、job idが未採番ならrequest id、固定内部コード、処理段階だけを記録・返却する
- [ ] Worker
  - 課金前に `validate_derived_prompt_source` と derived reference recordの存在を確認する
  - provider呼び出し直前に `resolve_derived_prompt_source` で認可再検証とauthor secret解決を同時に行い、通常のfree生成と同じ `buildSharedPrompt` へ原作者の入力を渡してメモリ上だけで組み立てる。ログを持つ `features/generation/lib/prompt-builder.ts` はimportしない
  - ビルド済み全文はprovider requestのメモリ内だけに置き、derived reference、job、生成画像、ログ、APMへ書かない
  - provider完了後・永続化前は本文を返さない `validate_derived_prompt_source` で再検証する
  - execution record欠落・kind不整合は `prompt_text` へfallbackせず、provider呼び出し前に固定内部コードで終端失敗（既存の `GENERATION_PROMPT_EXECUTION_MISSING` を再利用する）
  - 秘密解決後のcatchではerror object・RPC result・prompt・templateをserializeせず、allowlist済み内部コード、job id、request id、stageだけを記録する（REQ-017a）
  - 課金前の認可失敗は減算せず終了。課金後の認可失敗は成果物を破棄し、`refundPercoinsFromGeneration` → `refund_percoins` で冪等返金
  - 外部呼び出し開始後の取消意味論をREQ-025 / REQ-026としてテスト・文書化
  - 派生画像にはauthor secretを作らない。完了RPCは `origin_post_id IS NOT NULL` を独立条件として無条件にsecret作成を抑止し、DB triggerでも直接INSERTを拒否する
  - 成功トランザクション内で `record_prompt_usage(p_image_job_id)`

### Phase 2: 投稿・閲覧UI（PR5）

**目的**: ユーザー向け投稿・閲覧・派生生成操作を提供する
**ビルド確認**: `npm run lint` / `npm run typecheck` / `npm run build -- --webpack`

- [ ] `features/generation/lib/prompt-visibility.ts` を拡張
  - `getPostPromptDisplayMode(record)` を追加し `"source_reference" | "one_tap_style" | "prompt" | "none"` を返す
  - `prompt_visibility === 'private'` と `source_post_id != null` を非公開条件に加える
- [ ] `features/posts/types.ts` / `features/generation/lib/database.ts` に新列を追加
- [ ] `features/posts/lib/server-api.ts` に `source_reference` の解決を追加
  - 原作の利用可否判定をここに集約。**利用不可なら同一形状で `is_available: false` を返し、サムネイルも含めない**（ADR-005 / REQ-014）
  - 利用数は `get_prompt_usage_count` から取得
  - prompt表示値は author secret から解決する。クライアントへ prompt execution record を渡さない
- [ ] `app/api/posts/post/route.ts` / `update/route.ts` に `promptVisibility` を追加
- [ ] `PostModal.tsx` に「プロンプトを公開する」トグル（既定 ON）。派生投稿では出さない
- [ ] 「非公開 かつ 生成前の画像も非表示」のときの注意文
- [ ] `EditPostModal.tsx` に同トグル。**公開→非公開の切替時に「すでに閲覧・コピーされた内容は回収できません」と明示**（REQ-015）
- [ ] `features/posts/components/SourcePromptReferenceCard.tsx` を新規作成
  - `OneTapStyleDetailCard.tsx` の構造を踏襲。原作者名・アバター・サムネイル
  - 未フォローならカード内にフォローボタン
  - 利用数を表示
  - `is_available === false` は無効化して「現在、ご利用できません」
- [ ] `features/generation/components/PromptLockedGenerationSheet.tsx` を新規作成
  - プロンプト欄は disabled + グレーアウトで「プロンプトは非公開です」
  - 入力は画像・比率・モデルの3つ
- [ ] `PostDetailStatic.tsx` / `PostDetail.tsx` を `getPostPromptDisplayMode` の4分岐へ
- [ ] 15ロケールに文言追加

### Phase 3: Admin・文書・統合検証（PR6）

- [ ] 投稿詳細の admin 閲覧時にプロンプト全文と「プロンプト非公開」バッジ（REQ-018）
- [ ] `ModerationQueueClient.tsx` に同バッジ。審査キュー API に `prompt_visibility` を追加
- [ ] `.cursor/rules/database-design.mdc` / `docs/API.md` / `docs/architecture/data.ja.md` / `data.en.md` を同期
- [ ] `/test-flow` に沿ってテストを実施
- [ ] 各PRは目的別コミットを維持し、PRタイトル・本文を日本語で作成

---

## 5. 修正対象ファイル一覧

| ファイル | 操作 | 変更内容 |
| --- | --- | --- |
| `supabase/migrations/2026xxxx_expand_prompt_secret_boundary.sql` | 新規 | author secret + service-only prompt execution record + RLS / local CHECK |
| `supabase/migrations/2026xxxx_add_atomic_generation_persistence_rpcs.sql` | 新規 | 画像・秘密・job完了の原子的RPC、既存完了RPC再定義 |
| `supabase/migrations/2026xxxx_backfill_prompt_secrets.sql` | 新規 | 種別分類・冪等backfill・検証SQL |
| `supabase/migrations/2026xxxx_replace_prompt_search_indexes.sql` | 新規 | caption・nickname検索index。旧prompt trigramはcontractで削除 |
| `supabase/migrations/2026xxxx_contract_generated_images_prompt.sql` | 新規 | 公開列の空化 + `DEFAULT ''` + `CHECK (prompt = '')` |
| `supabase/migrations/2026xxxx_add_free_prompt_visibility.sql` | 新規 | generated imageの列3つ、image jobのorigin列、guard trigger |
| `supabase/migrations/2026xxxx_add_prompt_usage_events.sql` | 新規 | 利用イベント |
| `supabase/migrations/2026xxxx_add_derived_generation_rpcs.sql` | 新規 | 検証・記録・集計 RPC |
| `features/generation/lib/prompt-secrets.ts` | 新規 | 秘密の解決 |
| `features/generation/lib/prompt-visibility.ts` | 修正 | 表示モード判定 |
| `features/generation/lib/prompt-builder.ts` | 修正 | **ログ出力の削除** |
| `features/generation/lib/job-types.ts` | 修正 | materialized / derived-referenceのdiscriminated unionを追加し、execution record省略を型で防止 |
| `features/generation/lib/async-generation-job-repository.ts` | 修正 | `createImageJob(jobData, promptExecution)` を必須化し、原子的作成RPCへ統一 |
| `features/generation/lib/database.ts` | 修正 | `select("*")` を明示列へ。promptを受け取る汎用ブラウザINSERTを削除・縮小 |
| `features/event/lib/database.ts` | 修正 | 同上 |
| `app/api/wardrobe/claim/save-wardrobe-image.ts` | 修正 | `generated_images.prompt` への直接書き込みを廃止 |
| `features/posts/lib/server-api.ts` | 修正 | 出所解決・検索対象の差し替え |
| `features/my-page/lib/server-api.ts` / `api.ts` | 修正 | 読み取り経路の移行 |
| `app/api/generate-async/handler.ts` | 修正 | 通常jobのmaterialized record、派生jobのorigin経路 |
| `app/(app)/style/generate-async/handler.ts` | 修正 | `prompt_text` を空にし、job + service-only materialized recordを原子的に作成 |
| `supabase/migrations/2026xxxx_contract_image_jobs_prompt_text.sql` | 新規 | generation type・status別に既存job全文を安全に空化 |
| `supabase/functions/image-gen-worker/index.ts` | 修正 | materialized/derived解決・実行時再ビルド・例外redaction・原子的保存・固定エラー・利用記録・画像metadata対策 |
| `supabase/functions/image-gen-worker/derived-prompt.ts` | 新規 | 派生元secret・固定revisionの実行時解決とpure builder呼び出しを隔離 |
| `supabase/functions/image-gen-worker/openai-image.ts` | 修正 | provider本文を外へ伝播しない固定エラー化 |
| `shared/generation/errors.ts` | 修正 | allowlist済み内部エラーコードと正規化 |
| `app/api/posts/route.ts` | 修正 | 検索パラメータの意味変更 |
| `app/api/posts/post/route.ts` / `update/route.ts` | 修正 | `promptVisibility` |
| `features/posts/components/SearchBar.tsx` | 修正 | プレースホルダ文言 |
| `features/posts/components/StickyHeader.tsx` | 修正 | 同上（必要なら） |
| `features/posts/components/PostModal.tsx` / `EditPostModal.tsx` | 修正 | 公開トグル |
| `features/posts/components/SourcePromptReferenceCard.tsx` | 新規 | 参照カード |
| `features/generation/components/PromptLockedGenerationSheet.tsx` | 新規 | ボトムシート |
| `features/posts/components/PostDetailStatic.tsx` / `PostDetail.tsx` | 修正 | 4分岐化 |
| `app/(app)/admin/moderation/ModerationQueueClient.tsx` | 修正 | 非公開バッジ |
| `app/api/admin/moderation/posts/route.ts` | 修正 | `prompt_visibility` を返す |
| `messages/ja.ts` ほか14ファイル | 修正 | 文言追加（15ロケール） |
| `.cursor/rules/database-design.mdc` / `docs/API.md` / `docs/architecture/data.ja.md` / `data.en.md` / `docs/TEST_PLAN.md` | 修正 | 台帳同期 |

---

## 6. 品質・テスト観点

### 秘匿の検証（最重要。すべて実データ経路で確認する）

| # | テスト内容 |
| --- | --- |
| 1 | **anon キーで `generated_images?select=prompt` を叩いても秘密が返らない** |
| 2 | **anon キーでauthor secret・prompt execution recordを叩くと拒否される** |
| 3 | authenticated本人は自分が原作者のauthor secretだけ読め、他人行・prompt execution recordは全件読めない |
| 4 | **派生者の認証トークンで `image_jobs.prompt_text` を取得しても秘密が無い** |
| 4b | **One-Tap Style で生成したユーザーが、自分の `image_jobs.prompt_text` からプリセット全文を読めない** |
| 4c | One-Tap Style生成者が `generation_prompt_snapshots` を直接SELECTできない |
| 4d | free / coordinate生成者も、自分のjobから運営prefixを含むprovider promptを直接取得できない |
| 5 | **派生者の認証トークンで派生 `generated_images.prompt` を取得しても秘密が無い** |
| 5b | Wardrobe claim・Gemini単枚・OpenAI複数枚・ブラウザhelperの全保存経路で公開列が空 |
| 5c | contract後に非空 `generated_images.prompt` のINSERT / UPDATEがDB制約で拒否される |
| 5d | collection完走投稿RPCがcontract後も空文字で行を作成できる |
| 5e | contract後に `prompt` を省略したINSERTは `DEFAULT ''` で成功し、公開列は空になる |
| 6 | event gallery・生成一覧・無限スクロール・RSC ペイロードに秘密が無い |
| 7 | OGP・JSON-LD・alt・通知・APIレスポンス・`image_jobs.error_message`・function logsに秘密が無い |
| 7b | Gemini/OpenAIのエラー本文に既知の秘密文字列を含めても、固定内部コード以外が保存・返却・ログ出力されない |
| 7c | provider生バイトのoriginalにprompt-bearing metadataがなく、display・thumbもSharp再エンコード後にmetadataがない |
| 7d | 派生秘密解決後にrevision取得・pure build・provider呼び出し・永続化を各々失敗させても、catchしたobject・RPC payload・秘密・template・built全文がVercel / Workerログ、APM、レスポンスへ出ない |
| 8 | 検索が prompt を対象にしていない（プロンプト固有語でヒットしない） |
| 8c | contract後に旧prompt trigram indexがなく、caption・nickname検索の `EXPLAIN` が許容計画である |
| 9 | public→private 切替後、全キャッシュ経路から即座に消える |

### 改ざん・権限

| # | テスト内容 |
| --- | --- |
| 10 | `source_post_id` / `source_author_id` / `image_jobs.origin_post_id` の直接 INSERT / UPDATE が拒否される |
| 10b | 存在しないorigin、非root、原作者不一致で派生行作成がDBで拒否される |
| 10c | RPCを経由しないservice-role直接書き込みでも、derived referenceへの本文・author input、originとrecord kindの不整合、派生画像へのauthor secret INSERTがDB trigger / CHECKで拒否される |
| 10d | 完了RPCは `source_post_id` / `source_author_id` を引数から信用せずjobと原作から導出し、execution recordのnullable列の値と無関係に `origin_post_id IS NOT NULL` を独立条件としてauthor secretを作らず、不正なauthor inputがあればtransaction全体を固定内部コードで拒否する |
| 11 | 作成後の `source_post_id` / `source_author_id` 変更が拒否される |
| 12 | One-Tap Style / Inspire / coordinate の投稿 ID を `sourcePostId` に渡すと拒否される |
| 13 | 派生投稿の ID を渡すと根へ解決される |
| 14 | 未フォローの閲覧者が生成 API を直接叩くと拒否される |
| 15 | ブロック関係があると拒否される（双方向とも） |
| 16 | 他人の投稿の `promptVisibility` を更新できない |
| 16b | `free` 以外のroot投稿をprivateへ変更しようとするとDBで拒否される |
| 17 | 利用数がクライアント操作で水増しできない |
| 17b | 同一jobを再実行・再配送しても利用イベントが1件だけである |
| 17c | authenticatedクライアントが集計RPCを直接実行できず、未投稿・非公開を含む全成功生成数やユニーク利用者数を任意origin UUIDで列挙できない |
| 17d | anonは公開・visibleな `source_post_id` から投稿済み派生の部分集合を列挙できるが、非投稿分を含むUI利用数とは一致せず、秘密・利用者ID・非公開生成数を取得できない |

### 利用不可の一貫性

| # | テスト内容 |
| --- | --- |
| 18 | 削除・投稿取消・公開停止・非公開解除の**すべてで同一のレスポンス形状・ステータス・エラーコード**になる |
| 19 | いずれの場合もサムネイルが含まれない |
| 20 | 原作削除後もクレジットと「現在、ご利用できません」が維持される |
| 20b | 原作者のアカウント完全削除後は表示名等のPIIを残さず「削除されたユーザー」と表示する |

### 正常系

| # | テスト内容 |
| --- | --- |
| 21 | フォロー済みの閲覧者がボトムシートから生成でき、`source_post_id` が根に解決される |
| 22 | A→B→C と派生しても C の `source_post_id` は A を指す |
| 23 | 利用数がユニークユーザー数で、原作者自身を除外している |
| 24 | 派生画像を削除しても利用数が減らない |
| 25 | Worker がジョブ投入後に条件が変わったケースを検出して中断する |
| 25b | 最終検証後に取消されたin-flightジョブの成果物提供・返金ポリシーがREQ-025どおりである |
| 25c | One-Tapのpreset更新後もqueued jobは保存済みrevision/materialized recordと同じ入力で再試行される |
| 25d | 課金前の認可失敗では減算されず、課金後・provider完了後の認可失敗では成果物を破棄して `refund_percoins` が1回だけ適用される |
| 25e | 終端failed jobをWorkerがclaimせず、ユーザー再試行で新しいjob・execution recordが作られる |
| 25f | 原作job/execution record削除後も、新しい派生jobを作成できる。derived referenceは本文を持たず、Workerが実行時にauthor input + job固定revisionから同じ全文を決定的に再ビルドし、legacyだけ保存済みbuilt全文をメモリ上で使用する |
| 25g | execution record欠落・kind不整合では `prompt_text` へfallbackせず、provider未呼び出しのまま固定内部コードで終端する |
| 25h | 同一free template内容はrevision 1行へ重複排除され、更新後は新revisionになり、既存jobは旧revisionで再試行される。revisionのUPDATE / DELETEは拒否される |

### 移行（Phase 0）

| # | テスト内容 |
| --- | --- |
| 26 | 実行時のlegacy非空件数と移行先件数を `generation_type` / `source_kind` 別に比較し差分0 |
| 26b | 既存 coordinate / free が加工されずに行ごとdigest一致で移行され、owner不整合0、orphan0。one_tap_style / inspire は author secret へ入らない |
| 26c | dual-write開始後に作成された行を含め、contract直前の再検証で差分0 |
| 26d | 新規free / coordinateの通常jobはauthor secretに生入力だけを持ち、materialized provider promptとの分離が保たれる |
| 26e | `createImageJob` はprompt execution入力なしで型チェックを通らず、RPC失敗時にjobまたはexecution recordだけが残らない |
| 27 | 移行後も原作者・許可されたフォロワー向け表示が動き、legacyはbuilt全文、新規はauthor inputだけが表示・コピーされる |
| 28 | `one_tap_style` / Inspire / platform promptが admin/service role 以外に返らない |
| 29 | PR2以前の全生成種別のqueued / processing jobを壊さずmaterialized execution recordへ移行し、終端後に `prompt_text` が空化される |
| 30 | 各デプロイ段階で旧Next.js・新Next.js・旧Worker・新Workerの許容組合せをrunbookどおり確認する |

---

## 7. ロールバック方針

| 対象 | 方針 |
| --- | --- |
| Phase 0A Expand | additive table / RPC は未使用なら残しても既存挙動へ影響しない。削除せず次の修正版で前進する |
| Phase 0B dual-write | contract前は新規書き込みを旧経路へ戻せる。ただしOne-Tapの公開漏洩を再開するrevertは行わず、機能停止または固定エラーで閉じる |
| `generated_images.prompt` の空化 | 列はDROPしないが、公開列への書き戻しは行わない。表示障害はsecret対応コードへのrollbackで復旧する。author secretへ移行しないplatform/未分類値はcanonical preset・信頼できるmaterialized execution record・DBバックアップの有無を確認してから消去する |
| `CHECK (prompt = '')` | アプリを戻す必要がある場合も制約を先に外さず、旧コードが非空値を書かない互換版へ戻す |
| `image_jobs.prompt_text` 空化 | contract適用前に生成受付停止・drain・cron停止で全activeを0にする。終端failedは再利用せず、空化後の平文は復元しない |
| ログ削除 | 単独で安全。revert する理由が無い |
| 検索対象の差し替え | 独立コミット。`caption` 検索で不評なら調整できるが、**prompt 検索へ戻してはならない**（ADR-001 と矛盾する） |
| Phase 1 の列追加 | 既定が `public` / NULL なので、適用しても挙動は変わらない |
| guard trigger | `DROP TRIGGER` で戻せるが、戻すと改ざん防止が失われる |
| 利用イベント | 追記のみ。表示側を先に外せば安全に止められる |
| Worker | backward-compatible版を先に出す。rollback時もmaterialized execution recordとlegacy active jobの両方を読める直前版へ戻す。派生実行時解決をprovider全文の永続化へ戻さない |
| UI | PR5をrevertまたは機能導線を隠しても、DBの秘匿境界は維持する |

**適用順序**: Phase 0A → 0B → 検証 → Phase 0C先行expand PR → PostgREST互換確認 → Phase 0C contract PR を厳守する。`supabase db push --dry-run` と `supabase migration list` の両方で各PRの対象migrationが1本だけであることを確認する。Phase 0C完了前にprivate prompt新機能を公開しない。

---

## 8. 使用スキル

| スキル | 用途 | フェーズ |
| --- | --- | --- |
| `/project-database-context` | DB 設計・RLS・原子的RPC方針の参照 | Phase 0, 1 |
| `/git-create-branch` | ブランチ作成 | 実装開始時 |
| `/test-flow` `/spec-extract` `/spec-write` | テスト設計 | Phase 0B以降 |
| `/test-generate` `/test-reviewing` `/spec-verify` | テスト生成・レビュー | 各PR |
| `/codex-webpack-build` | 本番ビルド検証 | 各フェーズ末 |
| `/git-create-pr` | PR 作成（タイトル・本文は日本語必須） | 実装完了時 |

---

## 実装で判明した未解決事項（2026-07-29）

Phase 0A / 0B を本番へ適用する過程で見つかった、この計画の外にある問題。
Phase 0C より先に片付ける必要はないが、忘れないよう記録する。

### 検索を一時的に無効化している（PR #466）

`PostList` の初回ロード `useEffect` が `loadedSearchQuery` / `loadedSortType` を
依存に持ちながら `loadPosts` 内でそれらを更新するため、検索クエリがあると
ループする。本番で同一リクエストが953回投げられ、Vercel が 503 を返していた。

この不具合は今回の変更とは無関係（最終変更は #407）だが、検索対象を
prompt から caption + 作者名へ変えたことで顕在化した。旧 prompt 検索は
全投稿に運営の錨が入っていて多くの語が大量にヒットしていたのに対し、
ヒット 0 件ならループは即終了するため長く表に出ていなかった。

利用実績が乏しいため、導線ごと閉じて先送りした。復帰させるときは
`PostList` のループ修正が前提になる。`StickyHeader` の `SEARCH_ENABLED` と
`app/search/page.tsx` の `redirect` を戻せば復帰する。

### 同じ性質のミスを3度繰り返した

いずれも「対の片方を忘れる」型で、目視レビューでは繰り返し漏れた。

1. 列を削除したが、その列を参照する RPC を直し忘れた（生成が全件失敗）
2. 新しい完了 RPC を作ったが、Worker の呼び出しを切り替え忘れた（プロンプトが保存されない）
3. 読み取り経路を移行したが、生成一覧の経路を見落とした（Phase 0C で全画面から消えるところだった）

再発防止として、`prompt` を返すクエリを持つファイルが author secret の解決を
通しているかを機械的に検査するテストを入れた
（`tests/unit/features/generation/prompt-read-paths.test.ts`）。
新しい読み取り経路が増えたら落ちる。

plpgsql は CREATE 時に関数本体の SQL を検査しないため、列を削除しても
実行時まで露見しない。列を消すときは `pg_get_functiondef` の全文検索で
参照元を潰すこと（`20260729140000` に実装）。

---

## 前提・未確定事項

- **公開→非公開の切替は「以後の表示を止める」機能であり、過去の秘密化ではない。** すでに閲覧・コピー・キャッシュ・検索エンジンに保存された内容は回収できない。UI と仕様に明記する（REQ-015）
- `generated_images.prompt` は互換のため列を残すが、Phase 0C後は常に空であることをDBが強制する。将来DROPする場合は別ADR・別PRとする
- 移行完了条件は経過日数ではなく、dual-write稼働後の行単位digest・件数・ownership検証が差分0であること
- 通常jobのmaterialized execution recordは当該jobの監査・再試行用。派生jobは本文を持たないderived referenceだけを保存し、author secretを正本としてWorker実行時にメモリ上で再ビルドする。派生件数に比例する秘密全文の永続コピーは作らない
- 既存行と新規行でプロンプト表示・コピー結果は変わらない。どちらも原作者の生入力であり、移行は加工なしで行う（ADR-013 撤回）
- provider呼び出し開始後の取消は外部送信そのものを巻き戻せない。成果物は永続化・提供せず、減算済みなら既存 `refund_percoins` 経路で返金する（REQ-025 / REQ-026）
- 非公開モードは今回 `/free` のみを対象とし、coordinateへの拡張は別ADR・別forward migrationとする（ADR-011）
- この環境では Docker が使えずローカル Supabase を起動できない。SQL の実挙動は PR の Supabase Preview で検証する
- マイグレーションは main マージで自動適用されない。本番反映は `supabase db push` を手動実行する
- Worker（Edge Function）の変更は `supabase functions deploy image-gen-worker` が別途必要
- **Phase 0〜5を単一PRにする方針は、秘匿境界とデプロイ順序を安全に保証できないため撤回する**。最低でもPhase 0A / 0B / 0Cは別PRとする
- 他14ロケールの翻訳は暫定（英語流用）
- 新規 Markdown はグローバル `.gitignore` の `*.md` に該当するため `git add -f` が必要
