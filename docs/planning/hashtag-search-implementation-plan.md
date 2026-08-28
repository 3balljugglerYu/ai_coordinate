# ハッシュタグと統合検索の実装計画書

作成: 2026-08-28。対象は「説明欄のハッシュタグ化」と「検索の段階公開」。

## 背景と決定事項（ヒアリング済み）

- MVP は**ユーザーが書いたハッシュタグのみ**。AI による自動タグ付け（スタイル由来・画像由来）は**入れない**が、後から足せる器にする
- 検索は**段階公開**する。まず運営権限のみで確認し、問題なければ一般公開（/use-prompts の isAdminViewer 方式と同じ）
- 検索フィールドは X と同じ**統合型**: `#〜` ならタグ検索、それ以外はフリーワード（caption + 作者名。実装済み・#566 でループ修正済み）
- ハッシュタグのリンク先は専用ページではなく `/search?q=%23タグ`（検索を公開する以上、ページを分けない）
- 過去投稿からの遡り抽出を行う（実測: `#` を含む公開キャプションは 1 件のみ。処理は軽い）
- 投稿時のタグ候補（サジェスト）は**計画に含めるが最初のフェーズにしない**。表記ゆれ対策として MVP 直後に足す

### タグの規則（X の実機検証で確定。テストケースの正本）

| 入力 | 結果 |
|---|---|
| `#冬服_みきふく` | 1つのタグ（`_` はタグの一部） |
| `#冬服#みきふく` | **タグなし**（`#` が続くと前のタグごと無効） |
| `#冬服 #みきふく` | 2つのタグ |
| `#冬服、かわいい` | タグ「冬服」（使える文字以外はすべて終端） |
| `#AI` と `#ai` | **同じタグ**（大文字小文字を区別しない。X のサジェスト実測） |

- 使える文字: **Unicode の文字・結合文字・数字**（`\p{L}\p{M}\p{Nd}`）+ `_`。
  日本語限定にしない — アプリは **15 ロケール**（ko/th/hi/ar 含む）で、日本語+英数に
  限定すると他言語の利用者が母語のタグを作れない（レビュー指摘）。長音「ー」は `\p{L}` に含まれる
- **全数字のタグ（`#123`）は無効**（twitter-text の公開仕様と同じ）
- 開始: `#`（全角 `＃` も可）の直前がタグ文字でも `#` でもないこと
- 正規化: NFKC + 小文字化した `name_normalized` で同一視。表示は書かれた原文
- 受け入れテストに追加: 韓国語・タイ語・ヒンディー語・アラビア語・結合文字・半角カナ・全数字・全角 `＃`
- 日本語のゆれ（`#冬服` と `#ふゆふく`）は別タグのまま（サジェストで自然収束を狙う）

## コードベース調査結果（2026-08-28）

| 領域 | 現状 | 主要ファイル |
|---|---|---|
| キャプション表示 | **全箇所が `lib/linkify` を通る**（URL 自動リンク化のトークナイザ）。フィードは `FeedCaption`、詳細は `CollapsibleText linkify` | `lib/linkify.ts`, `features/posts/components/FeedCaption.tsx`, `CollapsibleText.tsx` |
| フリーワード検索 | 実装済み（caption ilike + nickname → user_id.in）。無限ループは #566 で修正済み | `features/posts/lib/search-filters.ts`, `server-api.ts:381` |
| 検索の入口 | 閉じている。`SEARCH_ENABLED = false`（クライアント定数）と `/search` の redirect | `features/posts/components/StickyHeader.tsx:46`, `app/search/page.tsx` |
| 検索 index | caption / nickname の trigram index 導入済み（`pg_trgm` は extensions スキーマ） | `20260729170000_add_search_indexes.sql` |
| 投稿 API | `POST /api/posts/post` → `postImageServer`。編集は `PUT /api/posts/update` | `app/api/posts/post/route.ts`, `update/route.ts` |
| 段階公開の前例 | `isAdminViewer(user?.id)` でサーバー側ゲート | `lib/env.ts:351`, `app/use-prompts/page.tsx` |
| RPC 方針 | 複数テーブル跨り・冪等が必要な処理は RPC に寄せる | `docs/architecture/data.ja.md` |
| 投稿の规模 | 公開 visible 1,459 件 / caption あり 801 件 / `#` 含み 1 件 | 本番実測 |

## 概要図

### データモデル

```mermaid
erDiagram
    generated_images ||--o{ post_hashtags : "has"
    hashtags ||--o{ post_hashtags : "tagged"
    hashtags {
        uuid id PK
        text name "表示用の原文 初出の表記"
        text name_normalized UK "NFKC小文字 同一視キー"
        timestamptz created_at
    }
    post_hashtags {
        uuid post_id FK "generated_images.id"
        uuid hashtag_id FK
        text source "user 将来 style ai を追加"
        timestamptz created_at
    }
```

### 投稿時のタグ同期

```mermaid
sequenceDiagram
    participant U as User
    participant PM as PostModal
    participant API as POST api posts post
    participant TS as extractHashtags TS正本
    participant RPC as sync_post_hashtags
    U->>PM: キャプション入力して投稿
    PM->>API: id caption ほか
    API->>API: postImageServer 投稿確定
    API->>TS: caption からタグ抽出
    API->>RPC: post_id と tags 配列
    RPC->>RPC: hashtags を upsert し post_hashtags を洗い替え
    API-->>PM: 応答 タグ同期の失敗は投稿を失敗させない
```

### 検索の分岐

```mermaid
flowchart TD
    A["検索フィールドに入力"] --> B{"先頭が # か"}
    B -->|はい| C["タグ検索 post_hashtags から post_id を引き id.in で絞る"]
    B -->|いいえ| D["フリーワード caption ilike + 作者名"]
    C --> E["PostList で一覧表示"]
    D --> E
```

## ユーザーストーリー

### ① タグを付けて投稿する人

冬服のコーデができたので、キャプションに書く。

> うちの子の冬コーデ☃️ #冬服 #ニット

**入力しているそばから、#冬服 が青くなる。** タグとして成立している、と
書きながら分かる。投稿するとフィードでも同じ場所が青いリンクになっている。

`#冬服#` と続けて打った瞬間、**青が消えて普通の文字に戻る**。
「あ、スペースが要るんだ」と、その場で気づいて直せる。X と同じ挙動。

### ② タグから作品を探す人（この機能の本命）

ホームを眺めていて、誰かの投稿の **#冬服** が目に入る。
「冬服って他にどんなのがあるんだろう」とタップすると、
#冬服 の付いた作品だけが並ぶ一覧に移動する。

気に入った作品が Free Style なら、そこから「フォローして生成する」へ
つながる。**タグが、プロンプト利用の入口にもなる。**

### ③ 検索フィールドから探す人

検索バーに「星空」と入れると、キャプションに星空を含む作品と、
名前に星空を含む作者が出る（フリーワード検索）。
「#星空」と入れると、タグ #星空 の付いた作品だけに絞られる。

X と同じ使い分けなので、説明は要らない。

### ④ 段階公開中の一般ユーザー（何も変わらない人）

検索バーは出ない。キャプションの #冬服 も**ただの文字**のまま。
リンクだけ見えて押したら 404、という中途半端な状態には決してならない。

運営が確認を終えてフラグを倒した日から、③の体験がそのまま届く。

### ⑤ タグ検索で自分の投稿が「出ない」人（守られる人）

投稿を取り消した、または公開停止になった作品は、タグ検索の結果からも
消えている。タグの行が残っていても、検索側の可視性フィルタが効く。
「取り消したのにタグから辿れる」は起きない。

## EARS 要件

- REQ-01: When 投稿・キャプション編集・**完走フィード投稿**が成立したとき, the system shall キャプションからタグを抽出し `post_hashtags` を洗い替える（投稿を作る経路は 3 つ: `POST /api/posts/post`・`PUT /api/posts/update`・`POST /api/collections/completions/[id]/post`。どれも同じ同期 helper を通す）
- REQ-02: If タグ同期に失敗したとき, then the system shall 投稿自体は成功させ、エラーはログに残す（非致命）
- REQ-03: While キャプションを表示しているとき, the system shall `#タグ` をリンクとして描画し、タップで `/search?q=%23タグ` へ遷移させる
- REQ-04: When 検索クエリが `#` で始まるとき, the system shall `name_normalized` の完全一致でタグ検索する
- REQ-05: When 検索クエリが `#` で始まらないとき, the system shall 既存のフリーワード検索（caption + 作者名）を行う
- REQ-06: While 段階公開中, the system shall 検索の入口（ヘッダーの検索バーと `/search`）を運営権限のみに表示する。一般ユーザーには従来どおり閉じたまま
- REQ-06b: While 段階公開中, the system shall **API 層でも**検索を認可する。`GET /api/posts` は認証不要で `q` を受けるため、UI を閉じても直接呼べば検索できてしまう（レビュー指摘）。サーバー共通の `isSearchAvailable(userId)`（公開 env OR isAdminViewer）を `q` 付きリクエストに適用し、不許可なら `q` を無視する
- REQ-07: 権限: `hashtags` は誰でも読める。**`post_hashtags` の SELECT は「対応する投稿がいま公開されている場合」に限定**する（`EXISTS ... is_posted AND moderation_status='visible'`）。無条件公開だと、取消・公開停止した投稿のタグ対応を Data API から列挙できてしまう（レビュー指摘）。書き込みは service_role の RPC のみ
- REQ-08: If 投稿が非公開・削除・公開停止になったとき, then タグ検索の結果に**出ない**こと（既存の可視性フィルタが効く設計にする。post_hashtags の行削除には依存しない）
- REQ-09: タグ抽出の規則は TS の 1 箇所を正本とし、**入力中の着色・表示リンク化・抽出**の3つが同じ関数を使う
- REQ-10: While キャプションを入力しているとき, the system shall タグとして成立している範囲を即座に青く表示し、成立しなくなったら（例: `#冬服#`）即座に通常表示へ戻す（**MVP 必須**）

## ADR

### ADR-001: タグは正規化テーブル 2 本（hashtags + post_hashtags）

- Context: キャプションから毎回抽出する案もあった
- Decision: 投稿時に抽出して保存する。`hashtags`（名寄せ）+ `post_hashtags`（関連）
- Reason: タグ検索のたびに全キャプション走査は規模とともに破綻する。サジェスト（使用回数順）にも集計が要る。`source` 列で将来の AI/スタイル由来タグを同じ器に入れる
- Consequence: キャプション編集時の再同期が必要（REQ-01 でカバー）。usage_count の実体化は見送り、`count(*)` を都度取る（1,500 件規模では十分）

### ADR-002: 抽出規則の正本は TypeScript、書き込みは RPC

- Context: リポジトリ方針は「複数テーブル跨りは RPC」。しかし抽出規則を SQL に書き写すと表示側（linkify）とズレる
- Decision: 抽出・リンク化は TS の `lib/hashtag.ts` に集約。API がタグ配列まで作り、RPC `sync_post_hashtags(post_id, tags[])` が原子的に洗い替える
- Reason: 規則の二重管理を避ける（`#冬服#` 無効などの細則は正規表現1本に閉じる）。原子性は RPC が担保
- Consequence: RPC 単体ではタグの妥当性を検証しない（長さ・件数上限のみ検証）。呼び出し元は service_role のみ
- 追記（レビュー反映）:
  - **世代照合**: caption 更新とタグ同期は別トランザクションのため、編集 A→B→B同期→A同期の順で
    本文とタグが食い違い得る。RPC に `p_expected_caption` を渡し、行ロック後に現在の caption と
    一致しない要求は no-op にする。非致命方針の取りこぼしは、遡りスクリプトを再実行すれば
    現在の caption から再同期できる（reconciliation を兼ねる）
  - **source の扱い**: 洗い替えは `source='user'` の行だけに限定すると RPC に明記する。
    将来 style/ai 由来を足したときに user の再同期が他 source の行を消さないため。
    unique は `(post_id, hashtag_id, source)` にする

### ADR-003: リンク先は /search に統一（専用ページを作らない）

- Context: 当初 `/tags/[tag]` 案があった
- Decision: `/search?q=%23タグ` に飛ばす
- Reason: 検索を公開する以上、入口を分けると「タグは動くのに検索は閉じている」という不整合が消え、ページも 1 枚減る
- Consequence: 検索の段階公開が終わるまで、一般ユーザーにはタグリンクを**表示しない**（リンクだけ出て 404 は最悪の体験）。表示も同じフラグでゲートする

### ADR-004: 段階公開はサーバー判定を props で配る

- Context: `SEARCH_ENABLED` はクライアント定数。admin 判定（env の ID リスト）はサーバー秘匿
- Decision: サーバーレイアウト/ページで `isAdminViewer` を判定し、`searchEnabled` として StickyHeader / キャプション表示へ props で渡す。一般公開時はこの値を全員 true にする（env フラグ）
- Consequence: props の通り道が数ファイルに渡る。実装時にレイアウト構成を確認して最短経路を選ぶ（Phase 4 の最初の TODO）

### ADR-005: 入力中の着色はオーバーレイ方式。実装は `rich-textarea` を第一候補にする

- Context: `<textarea>` は文字単位の色付けができない。入力中の青色表示（REQ-10）には
  (a) contenteditable で自前エディタ化、(b) 透明文字の textarea の背後に同じテキストを
  着色描画するオーバーレイ、の2方式がある。(b) は自作もできるが、既存ライブラリがある
- Decision: **(b) オーバーレイ方式**とし、自作せず **`rich-textarea`**（inokawa 作）を
  第一候補に採用する。renderer に `tokenizeWithHashtags` を渡すだけで着色できる
- Reason:
  - contenteditable は日本語 IME・undo・ペースト・モバイルで既知の地雷が多い。
    オーバーレイは入力が素の textarea のままなので、これらを壊さない
  - `rich-textarea` は方式(b)の実装として **IME の composition 処理を内蔵**し、
    位置合わせ（フォント・折返し・スクロール同期）という自作時の最難部を引き受ける
  - 健全性を確認済み（2026-08-28 時点）: 最新 0.27.1 が **2026-07-13 公開**（活発）、
    **週 6.6 万 DL**、**依存ゼロ**（peer は react >=16.14 のみ）、gzip 約 3kB
  - 比較した `react-highlight-within-textarea` は **draft-js 依存**（Meta がアーカイブ
    した旧エディタ）で 2024 年から更新なし。除外
- Consequence: 外部依存が 1 つ増える。React 19 での動作と iOS 実機（IME 変換中・
  折返し・スクロール）の検証を Phase 4 の最初に行い、**問題があれば同方式の自作へ
  フォールバック**する（トークナイザは共有なので差し替えは局所）

## 実装フェーズ

```mermaid
flowchart LR
    P1["Phase 1 タグ規則ライブラリ"] --> P2["Phase 2 DB"]
    P2 --> P3["Phase 3 投稿APIの同期と遡り"]
    P1 --> P4["Phase 4 表示リンク化"]
    P3 --> P5["Phase 5 検索と段階公開"]
    P4 --> P5
    P5 --> P6["Phase 6 サジェスト MVP後"]
    P5 --> P7["Phase 7 一般公開"]
```

### Phase 1: タグ規則ライブラリ（正本）
目的: 抽出・リンク化が共有する規則を 1 箇所に確定する
ビルド確認: 新規 lib のみ。既存に触れない

- [ ] `lib/hashtag.ts` — `extractHashtags(text)` と `tokenizeWithHashtags(text)`（`lib/linkify.ts` のトークン形式に合わせる）
- [ ] 正規化 `normalizeHashtag`（NFKC + toLowerCase）
- [ ] X 実測 5 例（上表）を必須テストケースにする。特に「`#` が続くと前のタグごと無効」
- [ ] 上限を決める: タグ長 50 文字・1 投稿 10 個まで（超過は無視。エラーにしない）

### Phase 2: DB
目的: 保存の器。既存 `20260813100000_add_post_bonus_by_generation_type.sql` の RLS/GRANT パターンを参考
ビルド確認: migration のみ。アプリは未参照

- [ ] `hashtags` / `post_hashtags` テーブル + unique 制約（name_normalized / **post_id×hashtag_id×source**）
- [ ] **FK は `post_id REFERENCES generated_images(id) ON DELETE CASCADE`（Critical 指摘）**。
      無指定(NO ACTION)だと、タグ付き投稿の物理削除と退会 purge（`auth.users` CASCADE 連鎖）が FK 違反で止まる。
      投稿単体の DELETE と auth user DELETE の両方で cascade を検証する
- [ ] RLS: `hashtags` の SELECT は公開。**`post_hashtags` の SELECT は対応投稿が公開中の場合のみ**
      （`EXISTS (SELECT 1 FROM generated_images g WHERE g.id = post_id AND g.is_posted AND g.moderation_status = 'visible')`）。書き込みポリシーなし
- [ ] RPC `sync_post_hashtags(p_post_id uuid, p_tags text[], p_expected_caption text)` —
      行ロック後に caption 一致を確認（不一致は no-op）→ hashtags upsert → `source='user'` の行だけ洗い替え。SECURITY DEFINER
- [ ] **`REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated` → service_role へ GRANT**（レビュー指摘:
      PostgreSQL は新規関数の EXECUTE を PUBLIC に既定付与するため、GRANT だけでは閉じない。
      既存 `20260818120000` と同じ作法）。anon/authenticated からの RPC 拒否テストを追加
- [ ] index: `post_hashtags(hashtag_id, post_id)`（タグ→投稿の逆引き）
- [ ] 本番適用前に Supabase Preview で検証（マイグレーションは main マージで自動適用されない。手動 `supabase db push`）

### Phase 3: 投稿 API の同期と遡り
目的: 新規投稿・編集でタグが貯まる
ビルド確認: lint / typecheck / test / build

- [ ] 同期 helper を 1 つ作り、**投稿を作る 3 経路すべて**から呼ぶ（レビュー指摘: 完走フィード投稿が漏れていた）
  - `POST /api/posts/post`（`grantDailyPostBonus` と同じ「失敗しても投稿は成功」パターン）
  - `PUT /api/posts/update`（キャプション編集）
  - `POST /api/collections/completions/[id]/post`（完走フィード投稿。caption を受けて投稿を作る）
- [ ] 3 経路すべてで同期されることをテストで固定（作成・再投稿・編集）
- [ ] 遡りスクリプト: 公開 visible の caption 全件に `extractHashtags` → `sync_post_hashtags`（実測 1 件だが全件を通す。以後の運用にも使える）
- [ ] 投稿取消/削除時は触らない（REQ-08: 検索側の可視性フィルタで消えるため）

### Phase 4: 表示リンク化と入力中の着色
目的: キャプションの `#タグ` がリンクになる。入力中もその場で青くなる
ビルド確認: lint / typecheck / test / build + **iOS 実機（IME・折返し・スクロール）**

- [ ] props の通り道を確認（ADR-004。`searchEnabled` をどこから渡すか）
- [ ] `lib/linkify.ts` にハッシュタグトークンを追加（URL トークンとは type を分ける）
- [ ] **リンク化は opt-in にする**（レビュー指摘: `CollapsibleText` はキャプションだけでなく
      **プロフィール bio（ProfileHeader）とコメント（EditableComment）でも使われている**。
      一律で効かせると、保存も検索もされない bio/コメントの `#タグ` がリンクになり、押しても
      対応投稿が無い）。`linkifyHashtags` プロップを追加し、キャプション呼び出しだけ有効化
- [ ] `searchEnabled=false` のときはリンク化しない（プレーン表示。リンクだけ出て 404 を防ぐ）
- [ ] リンクは `next/link` で `/search?q=%23タグ`。フィードカード内はカード遷移と競合しないよう `stopPropagation`（`FeedCaption` の既存作法に合わせる）
- [ ] **最初に `rich-textarea` の検証**（ADR-005）: React 19 で動くか・iOS 実機で IME とズレが出ないか。NG なら同方式を自作へ切替
- [ ] 入力ハイライト部品 `HashtagHighlightTextarea`（`rich-textarea` を包み、renderer に `tokenizeWithHashtags` を渡す）
- [ ] `PostModal` と `EditPostModal` のキャプション欄を差し替え（見た目・挙動は textarea のまま）
- [ ] 入力中の着色も `searchEnabled` でゲート（段階公開中、一般ユーザーには青を見せない。フィード表示と一貫させる）
- [ ] iOS 実機で IME 変換中・改行折返し・長文スクロールの位置ズレがないことを確認

### Phase 5: 検索と段階公開
目的: 運営だけが統合検索を使える状態
ビルド確認: lint / typecheck / test / build + 実機（運営アカウント / 一般アカウントの両方）

- [ ] `search-filters.ts` に `#` 分岐: タグ ID の解決だけを 1 件で行い、
      **絞り込みは DB 側に残す**（PostgREST の `post_hashtags!inner` 埋め込み、または可視性・sort・
      pagination まで含む参照 RPC）。**post_id を先取りして上限で切らない**（レビュー指摘:
      50 件で切ると 51 件目以降がページングしても永久に出ない。`matchedAuthorIds` の上限は
      「作者 50 人」であって投稿数の上限ではない — 同型に見えて意味が違う）
- [ ] `GET /api/posts` に `isSearchAvailable(userId)` を適用（REQ-06b）。
      不許可なら `q` を無視。一般 / preview admin / full admin / 一般公開後の 4 ケースを Route テストに追加
- [ ] `app/search/page.tsx` の redirect を「一般のみ」に変更（運営は旧ページを表示。c1fc058^ から復元）
- [ ] `StickyHeader` の `SEARCH_ENABLED` を props 化（サーバー判定を受ける）
- [ ] sitemap は一般公開まで `/search` を載せない（現状のまま）
- [ ] 実機確認: 運営=検索バー表示・タグ検索・フリーワード検索 / 一般=従来どおり何も見えない

### Phase 6: 投稿時サジェスト（MVP 後。別 PR）
目的: 表記ゆれの自然収束

- [ ] `GET /api/hashtags/suggest?prefix=` — name_normalized 前方一致、使用回数順、上位 8 件
- [ ] `PostModal` のキャプション欄で `#` 入力中に候補表示
- [ ] 表示は原文表記（`#AI` と入力しても既存タグ `#ai` を候補に出す）

### Phase 7: 一般公開
目的: フラグを倒すだけで公開できる状態から、実際に公開する

- [ ] 運営確認の結果を受けて判断
- [ ] `searchEnabled` を全員 true に（env フラグ 1 つ）
- [ ] sitemap へ `/search` を戻す・検索メモリ（persta-search-disabled）の更新

## 修正対象ファイル一覧

| ファイル | 操作 | 変更内容 |
|---|---|---|
| `lib/hashtag.ts` | 新規 | 抽出・正規化・トークナイズ（規則の正本） |
| `supabase/migrations/xxx_add_hashtags.sql` | 新規 | テーブル 2 本 + RLS + sync RPC + index |
| `app/api/posts/post/route.ts` | 修正 | 投稿後にタグ同期（非致命） |
| `app/api/posts/update/route.ts` | 修正 | 編集後にタグ同期 |
| `app/api/collections/completions/[id]/post/route.ts` | 修正 | 完走フィード投稿でもタグ同期 |
| `app/api/posts/route.ts` | 修正 | `q` 付きリクエストのサーバー認可（REQ-06b） |
| `scripts/backfill-hashtags.ts`（相当） | 新規 | 遡り抽出 |
| `lib/linkify.ts` | 修正 | ハッシュタグトークン追加（URL と type 分離） |
| `package.json` | 修正 | `rich-textarea` 追加（依存ゼロ・3kB。ADR-005） |
| `features/posts/components/HashtagHighlightTextarea.tsx` | 新規 | 入力中の着色（rich-textarea + 共有トークナイザ） |
| `features/posts/components/PostModal.tsx` | 修正 | キャプション欄を差し替え |
| `features/posts/components/EditPostModal.tsx` | 修正 | 同上 |
| `features/posts/components/FeedCaption.tsx` | 修正 | タグリンク描画 + searchEnabled |
| `features/posts/components/CollapsibleText.tsx` | 修正 | 同上 |
| `features/posts/lib/search-filters.ts` | 修正 | `#` 分岐 |
| `features/posts/lib/server-api.ts` | 修正 | タグ→post_id 解決 |
| `app/search/page.tsx` | 修正 | 運営のみ表示（redirect を条件付きに） |
| `features/posts/components/StickyHeader.tsx` | 修正 | SEARCH_ENABLED の props 化 |
| `messages/ja.ts` ほか全ロケール | 修正 | 文言（必要分） |
| `tests/unit/lib/hashtag.test.ts` ほか | 新規 | X 実測 5 例を含む |

## 品質・テスト観点

- [ ] X 実測 5 例がすべてテストで固定されている（特に `#冬服#みきふく` → タグなし）
- [ ] 入力中の着色: IME 変換中に崩れない・折返しやスクロールで青の位置がズレない（iOS 実機）
- [ ] 入力中の着色と投稿後のリンク位置が一致する（トークナイザ共有の確認）
- [ ] タグ同期失敗で投稿が失敗しない（REQ-02）
- [ ] 非公開・削除・公開停止の投稿がタグ検索に出ない（REQ-08）
- [ ] 一般ユーザーに検索バー・タグリンクが一切見えない（段階公開中）
- [ ] RLS: クライアントから post_hashtags へ INSERT できない・非公開投稿の行を SELECT できない
- [ ] RPC: anon/authenticated から実行できない（REVOKE の確認。`has_function_privilege` で assert）
- [ ] タグ付き投稿の物理削除と退会 purge が FK 違反にならない（CASCADE の確認）
- [ ] `/api/posts?q=` が段階公開中の一般ユーザーに効かない
- [ ] bio・コメントの `#タグ` はリンクにならない（キャプションのみ）
- [ ] 多言語タグ（ko/th/hi/ar・結合文字・半角カナ）が成立し、全数字タグが無効
- [ ] 全ロケールの文言が揃っている（postSuccessViewAction のとき 14 言語必須だった）

## ロールバック方針

- migration は追加のみ（既存テーブル無変更）。テーブル 2 本と RPC の DROP で完全に戻せる
- 表示・検索は `searchEnabled` フラグで一般ユーザーから隔離されており、公開前の revert はユーザー影響ゼロ
- タグ同期は非致命設計のため、RPC を落としても投稿機能は無傷

## 使用スキル

| スキル | 用途 | フェーズ |
|---|---|---|
| `/git-create-branch` | ブランチ作成 | 各 Phase |
| `/test-flow` 系 | テスト整備 | Phase 1, 3, 5 |
| `/git-create-pr` | PR 作成 | 各 Phase |

## 未決事項

1. サジェスト（Phase 6）の発火 UI 詳細（カーソル追従かフッター固定か）は実装時に決める
2. 一般公開（Phase 7)の判断基準は運営確認の結果次第
