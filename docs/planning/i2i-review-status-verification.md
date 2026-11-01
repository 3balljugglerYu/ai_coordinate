# i2i Phase 6b-2 検証記録

- 日付: 2026-11-01
- 区分: critical（本人用の読み取りAPI・非公開プロンプトの引継ぎを追加）
- 作業ブランチ: `codex/i2i-review-status`、基点 `ccc62d0`
- 状態: PR提出前の最終検証。マージ・本番反映は未実施。

## 実装

- マイページの入口: `features/catalog-references/components/OwnCatalogReviewEntry.tsx:6`、接続 `app/(app)/my-page/page.tsx:72`。
- 本人の審査一覧: `app/(app)/my-page/catalog-reviews/page.tsx:5`、取得元 `features/catalog-references/lib/own-review-repository.ts:17`。通常のページ順と通知対象の個別取得を分ける。
- 結果通知の行き先: `features/notifications/hooks/useNotifications.ts:650`。通知の生成元は既存の `supabase/migrations/20261029100000_add_i2i_catalog_review.sql:528`（画像IDをentity_idに格納）。
- 作り直し: `features/catalog-references/lib/remake-repository.ts:8` で本人の差戻しを確認し、同:18で原作所有者も確認。同:24で文章と選択だけを取得し、同:32で返す。受け取りは `features/generation/components/GenerationForm.tsx:363`。古い見本は返さず、新しい見本を選ぶ。
- 投稿可否の共有: `features/catalog-references/lib/use-catalog-review-posting.ts:8`。未取得・取得失敗・未承認は保留。正常取得した審査対象外と区別する。
- DBマイグレーションとworkerの変更はない。

## テスト行列

| 分類 | 内容 | テスト | 結果 |
|---|---|---|---|
| 正常 | 申請→確認中、承認後は本人が投稿 | own-review-ui.test.tsx | 成功 |
| 正常 | 文章・まねるものの引継ぎ、新しい見本は未選択 | generation-form-catalog-reference.test.tsx | 成功 |
| 正常 | 審査通知→対象作品のある審査一覧 | use-notifications.test.tsx / own-review-ui.test.tsx | 成功 |
| 境界 | 空の文章、ページ境界、重複、一覧にない通知対象 | own-review-repository.test.ts / own-review-ui.test.tsx | 成功 |
| 権限 | 本人以外・他人の原作・未承認状態・資格除外 | own-review-repository.test.ts / own-reviews-route.test.ts | 成功 |
| 異常 | DB失敗・通信断・未取得・対象なし | own-review-ui.test.tsx / review-gallery.test.tsx | 成功 |
| 回帰 | 一覧・拡大画面・投稿詳細・画面を離れた後の復帰 | review-gallery.test.tsx / close-viewer-after-leaving-to-post.test.tsx 等 | 成功 |
| 翻訳 | 全15言語のクライアントへの配信 | client-messages.test.ts | 成功 |

実行: `npx jest --runInBand tests/unit/features/generation tests/unit/features/catalog-references tests/unit/app/api/catalog-references tests/unit/features/posts/post-detail-static.test.tsx tests/unit/features/posts/post-detail-static-follow-sync.test.tsx tests/unit/features/notifications/use-notifications.test.tsx`

結果: 123スイート・1,276件成功。既存の1スイート・7件はスキップ。通知テストの型指定修正後にも同テストを再実行。

## 網羅率

実行: `npx jest --runInBand tests/unit/features/catalog-references tests/unit/app/api/catalog-references tests/unit/features/notifications/use-notifications.test.tsx --coverage --collectCoverageFrom='features/catalog-references/components/{CatalogReviewCard,CatalogReviewProgress,OwnCatalogReviewEntry,OwnCatalogReviewList,OwnCatalogReviewPanel}.tsx' --collectCoverageFrom='features/catalog-references/lib/{own-review-repository,remake-repository,review-status,use-catalog-review-posting}.ts' --collectCoverageFrom='app/api/catalog-references/reviews/route.ts' --collectCoverageFrom='app/api/catalog-references/remake/*/route.ts' --coverageDirectory=/tmp/i2i-new-coverage`

対象は新規の審査部品・取得処理・API。既存GenerationForm全体などはこの数値の対象外（関連テストで検証）。行99.04%、分岐91.39%。目標の両方90%以上を満たす。20スイート・238件成功。

## 品質確認

- ビルド: `npm run build -- --webpack` が終了コード0。既存のlibheifの依存解析警告などは残る。
- lint: 21エラー・53警告。基点コミットを一時フォルダへ展開した比較でも同数。今回増加なし。
- 型: `npm run typecheck` は既存テストの110エラーで失敗。エラーはテスト側に限定。アプリ実装側のエラーなし。基点と異なる型エラー文面が既存の未変更テスト2箇所にあり、「新規エラーなし」とは判定しない。テストへjest-domの型を明示したため、基点の既存エラー1,144件の多くは解消されて見える。生成された.nextの比較用エラーは比較から除外。
- 差分の空白検査: `git diff --check` 成功。
- テスト自己点検: 同義反復なし（表示・送信・返却値を検査）。時刻依存なし。既存の画面復帰テストは本人確認の非同期完了を待つ形へ変更。異常テストは通信断・DBエラー・資格除外を実際に起こして検証する。

## 独立レビュー

外部レビュー用スキルにより別エージェントBanach（`01a19601-4280-7db3-90ac-2090c82e3318`）が未コミット差分・追加テストを読み取り確認。ソース変更なし。

初回指摘（原文）と対応:

- 「多言語ファイルが構文エラーです。」→ 翻訳を各言語のexportへ移動。
- 「新しい翻訳がクライアントに届きません。」→ クライアントへの配信対象へ追加。実物の全15言語テストを追加。
- 「取得し直したカード情報が反映されません。」→ propsをそのまま表示し、申請成功の印だけをローカル保持。同一状態での更新テストを追加。
- 「未承認作品にも既存の投稿導線が残ります。」→ Gallery・List・ImageModal・投稿詳細へ共通の投稿判定を接続。

再確認の指摘（原文）:

- 「審査情報が未取得・取得失敗でも投稿ボタンを表示します。」→ 未取得・失敗を正常な審査対象外と区別。両一覧を使う未取得・通信断のテストを追加。

最終確認（原文）:

> 前回の残件P2は解消しています。今回の確認範囲で、新たな重大な動作不備は見つかりませんでした。

レビュー担当が関連9スイート・130件も実行して成功。テストのみの事前レビューは未実施で、実装後の変更全体・テストを独立確認した。

## 横断確認と重複

Q: 審査パネルを追加しただけで、別の投稿操作が残らないか。

A: Gallery、List、拡大画面、投稿詳細の既存ボタンを読み、同じ判定へ接続した。`features/generation/components/ImageModal.tsx:187` と `features/posts/components/PostDetailStatic.tsx:618` も対象。最終的な投稿許可は既存のサーバー側審査制約を維持する。

状態表示・進捗・投稿判定を共通部品とフックへ分離。APIの認証・エラー応答の小さな重複は既存ルートの慣習に合わせる（認可の条件が異なるため、範囲外の共通化は行わない）。

## 未実施・後続

- 実アカウントによるブラウザ操作と実DBの権限確認は未実施。今回はDB変更なしで、取得境界をモックしたテストと既存RLSのコードを確認した。
- Phase 5の応答全体の漏洩テスト、Phase 7の本番実機確認、Flutterの審査通知対応確認は今回の範囲外。
- 行動に影響するレビュー指摘の見送りなし。


## 追記: My Catalogへの作り方チップ・審査バッジ（2026-11-01）

- マイページのMy Catalog内に「すべて・プロンプトから・イラストから」を追加。本人の原作に限定し、DBの審査行の有無で作り方を絞ってからページングする。既存の投稿済み/未投稿と組み合わせる。
- サムネイル内は審査前/審査中/非承認/承認の4状態のみ。投稿済みのバッジは追加しない。本人以外には審査バッジを表示しない。
- 非承認の作品詳細: 理由、投稿・再申請不可、既存の見本ガイド（閲覧モード）、新しい見本で作り直す導線と引継ぎの案内。非承認では進捗を隠す。
- 申請/判定成功時の画像一覧キャッシュ失効と、読取側のタグ一致をテスト。DB変更なし。

正常: チップ×投稿状態、4状態の表示、非承認のガイド。境界: 26件のイラスト/26件のプロンプトが混在するデータから20→26件、offset20、遅れた応答の非混入、別カタログ往復。異常: 申請/判定の400ではキャッシュを無効化しない。全て成功。

実行: `npx jest --runInBand tests/unit/features/my-page tests/unit/lib/my-page-server-api.test.ts tests/integration/api/my-page-images-get-route.test.ts tests/unit/features/catalog-references tests/unit/app/api/catalog-references tests/unit/app/api/admin/catalog-review-decision-route.test.ts tests/unit/features/generation tests/unit/features/posts/post-detail-static.test.tsx tests/unit/features/posts/post-detail-static-follow-sync.test.tsx`

結果: 136スイート・1,376件成功。既存1スイート・7件スキップ。本番ビルド `npm run build -- --webpack` 終了コード0。型チェックはテストの110件のエラーで未通過（アプリ実装側のエラーなし）。lintの既知エラーは残る。

独立レビュー担当Banachの追加指摘（原文）:

- 「キャッシュ無効化の追加が検証されていません。」→ 成功時のタグ/expire:0、400時の非実行、キャッシュ読取側の同一タグをテスト。
- 「新チップのページング・混入防止は未検証です。」→ 上記26件/遅延/往復を表示IDとoffsetで確認。実PostgRESTへのログイン接続は未検証。埋め込みへのis.null/not.is.nullは[PostgREST公式資料](https://docs.postgrest.org/en/v13/references/api/resource_embedding.html#null-filtering-on-embedded-resources)で仕様を確認。

最終確認（原文）:

> 前回のテスト不足2点は解消と判定します。今回の限定確認で追加指摘はありません。

画面確認: 実際のMyPageImageGalleryClient/MyImageCard/PostDetailStatic/CatalogReviewCardと共通ヘッダー・ナビを、ローカルのサンプルデータで表示。チップ操作→サムネイルの非承認→作品詳細→閲覧用の見本ガイドを確認。プロフィール・件数・残高はサンプル。画面画像は `.playwright-mcp/i2i-my-catalog-chips.png` / `i2i-rejected-detail.png`。実アカウント/実DBの操作確認とは区別する。撮影用ブラウザとサーバーは停止。

自己点検: 表示・操作結果を検証し、URLだけの確認に終わらせない。遅延応答を明示的に制御して競合を起こす。既存の長押しなどの操作は変更していない。審査情報は一覧でstatusだけを取り、非公開の見本や理由は結合しない。進捗/理由/作り直し/見本ガイドは既存部品を再利用。行動に影響するレビュー指摘の見送りなし。コミット・プッシュ・本番反映は未実施。


## 指定のcode-reviewスキルによる確認と修正（2026-11-01）

使用: `/Users/hidechika/ai_coordinate/.codex/skills/code-review/SKILL.md`。最新の `origin/main`（`ccc62d0`）と未コミット差分を比較。ローカルmainは古いため比較基準に使わなかった。

指摘と対応:

- Critical: 初期取得とfocus再取得の応答順で審査状態が戻る。Panelの取得世代番号（`features/catalog-references/components/OwnCatalogReviewPanel.tsx:18`）、Listの対象取得番号（`features/catalog-references/components/OwnCatalogReviewList.tsx:35`）で最新の成功/失敗のみを採用。
- Critical: 先頭更新の失敗を次ページとして再試行する。失敗したcursorを保存し同じ取得を再試行（`OwnCatalogReviewList.tsx:31`、同67行）。
- Critical: 古い通知対象が最新の一覧状態を隠す。対象取得の開始時に旧targetをクリア（`OwnCatalogReviewList.tsx:37`）。
- Warning: 審査一覧に詳細画像を使用。`own-review-repository.ts:3` をthumbへ変更し、`OwnCatalogReviewList.tsx:62` のImageへsizesとunoptimizedを設定。
- Warning: 新規ボタンの操作領域。Card・Listの主操作をmin-h-11へ。
- 全体テストで判明した翻訳配信契約の更新漏れ: `tests/unit/lib/translation-messages.test.ts` にcatalogReviewを追加。既存の完全一致検査は維持。

再現テスト: 古い成功/失敗の4条件が修正前に失敗、修正後に成功。再試行・最新一覧への復帰・対象変更の3条件も修正前に失敗、修正後に成功。

テスト事前レビュー（Banach、`01a19601-4280-7db3-90ac-2090c82e3318`）原文:

> Phase 5へ進めます

追加3件のテスト事前レビュー（Avicenna、`01a1967b-a32e-7af1-9675-15e5b7ebfa38`）で、更新前後データと応答前の検査の不足を指摘。修正後の原文:

> 末尾3テストを4軸で再確認し、指摘はありません。前回の2点も解消されています。

実装の限定再レビュー（Avicenna）原文:

> 限定再レビューで、追加の動作不具合は見つかりませんでした。

横断確認: 同じ競合は個別パネルと通知対象の両方に存在したため両方を修正。通常一覧は既存のrequestId検査（`OwnCatalogReviewList.tsx:28`）を維持。テスト自己点検は表示とコールバックの結果で検証、Promiseを明示制御し時刻依存なし。小さい取得番号の処理は各コンポーネントのライフサイクルに閉じ、範囲外の共通化はしない。動作不具合の見送りなし。

最新の画面確認画像は `.playwright-mcp/i2i-my-catalog-soft-badges.png` / `i2i-status-soft-badges-closeup.png`。サンプルデータによる確認であり、実アカウント・実DBの確認は別途必要。

### 最終検証結果

- `npm test -- --maxWorkers=2`: 698スイート・8,366件成功。既存1スイート・7件スキップ。スナップショット13件成功。
- テスト用Imageモックをネットワーク取得のないspanへ変更後、バッジ6件を再確認して成功。
- `npm run build -- --webpack`: 終了コード0。既存のlibheif依存解析・baseline-browser-mapping警告あり。
- `npm run lint`: 既存21エラー・53警告、終了コード1。新規の審査部品とテストは別途lint終了コード0。変更ファイル内に残るImageModalのset-state-in-effectと既存テストの未使用型はorigin/mainの同じ行にも存在する。
- `npm run typecheck`: 終了コード2、110件はすべてtests配下。アプリ実装側0件。変更ファイル内の既存エラーは通知テストのuseToastモック不足とmy-page-server-apiテストの自己参照builder（origin/mainの同じコードにも存在）。全チェック成功とは扱わない。
- 網羅率: 上記と同じ計測範囲・コマンド（出力先のみ `.local/i2i-pr-coverage`）で248件成功。行99.09%、分岐94.54%。双方90%以上。
- `git diff --check` と `git diff --cached --check`: 成功。
- 使用したレビュー基準は指定のcode-reviewスキル。コミット・プッシュ・PR作成はユーザーが承認した後続作業として行う。マージと本番での実アカウント確認は別途。
