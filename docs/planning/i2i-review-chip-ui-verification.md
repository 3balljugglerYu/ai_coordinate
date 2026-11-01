# 審査状態チップの表示統一

- 2026-11-01、standard / behavior-change。
- ユーザー指摘: マイページは淡色チップなのに、生成結果と作品詳細に大きな4段階の審査パネルが残っている。
- PR #842へ、先行したタブの横切替修正とともに含める。

## 変更

`CatalogReviewStatusChip.tsx:16`へMyImageCardの4状態の配色・ドット・輪郭を抽出し、本人用のマイページ、生成結果、作品詳細、審査一覧で共有する。

`OwnCatalogReviewPanel.tsx:34`にthumbnail表示を追加。取得・世代番号・onReviewLoadedは既存処理を共有し、画像内のチップから/posts/画像IDへ移る。利用不可の作品はリンクにせず、通信失敗は審査一覧の入口を残す。生成グリッドは画像枠内、リストは画像ボタンの外のrelative枠内へ配置。リンク内ボタンの入れ子を避ける。

`CatalogReviewCard.tsx:28`は4段階進捗と大きな外枠を外し、共通チップ＋outlineの操作行へ変更。申請、承認後の投稿、非承認理由、閲覧用ガイド、作り直し、申請失敗の再試行は維持する。本人限定・未承認時の投稿制限・DB/API・招待範囲は変更しない。

## テスト行列

| 分類 | 確認 | 結果 |
|---|---|---|
| 正常 | 4状態がoutlineの淡色チップ、4段階進捗なし | 成功 |
| 正常 | グリッド/リストは画像内チップ、詳細へ移動 | 成功 |
| 正常 | 申請成功→審査中、承認後の手動投稿 | 成功 |
| 境界 | チップクリックでプレビューを開かない、button内anchorなし | 成功 |
| 境界 | マイページは既存の本人限定・位置・配色を維持 | 成功 |
| 異常 | 取得失敗・未取得は投稿保留、申請失敗は再試行 | 成功 |
| 回帰 | 非承認理由・投稿/再申請不可・ガイド・作り直し | 成功 |

新しい7件が修正前に失敗・既存26件が成功することを確認してから実装した。修正後はマイページも含む39件成功。

## レビュー

事前テストレビュー: Avicenna（01a1967b-a32e-7af1-9675-15e5b7ebfa38）。soft色とvariant、画像内位置、button祖先なしの検査不足を修正。最終原文:

> 前回の2点は解消されています。追加指摘はありません。

実装レビュー原文:

> 限定レビューで、不具合の指摘はありません。

申請・投稿条件、取得/callback共用、Listのbutton外リンク、PCのoverlayとチップz-indexを独立確認。指定code-reviewスキルでも認可と取得のwriter/reader、既存UI、未使用コード、画像表示を確認。未解決の動作指摘なし。

## 確認結果

- 関連: `npx jest --runInBand tests/unit/features/catalog-references tests/unit/features/my-page tests/unit/features/generation tests/unit/features/posts/post-detail-static.test.tsx tests/unit/features/posts/post-detail-static-follow-sync.test.tsx` → 131スイート・1,314件成功、既存7件スキップ。
- 全体: `npm test -- --maxWorkers=2` → 700スイート・8,408件成功、既存7件スキップ、スナップショット13件成功。
- `npm run build -- --webpack`: 終了コード0。
- 変更8ファイルのeslint: 終了コード0。リポジトリ全体には前回確認した既存21エラーが残る。
- 網羅率: `npx jest --runInBand tests/unit/features/catalog-references/own-review-ui.test.tsx tests/unit/features/catalog-references/review-gallery.test.tsx tests/unit/features/my-page/my-image-review-badge.test.tsx --coverage --collectCoverageFrom='features/catalog-references/components/{CatalogReviewCard,OwnCatalogReviewPanel,CatalogReviewStatusChip}.tsx' --coverageDirectory=.local/review-chip-coverage` → 対象3部品の行96.96%、分岐96.77%。
- `git diff --check`: 成功。

ブラウザ確認は実GeneratedImageGallery・審査部品とサンプル画像/通信応答を使う一時プレビュー。390pxと1280pxで横はみ出しなし。グリッドの審査カード0・チップ4を確認。PCでelementFromPointによりチップへの到達を確認。サンプル詳細では申請で審査中チップへ切り替わり、申請ボタンが消えることも確認した。実アカウントの本番画面全体とは区別する。

画像: `.playwright-mcp/review-chip-gallery-mobile.png` / `review-chip-detail-mobile.png`。確認用ブラウザ・サーバーは停止済み。

自己点検: 型の名前や実装呼出だけでなく、表示・取得回数・リンク先・通常操作とfailclosedを確認。時刻依存なし。CSSの位置・色の検査は、今回の明示的な見た目の要件を守るために限定。画像ボタンの入れ子とクリック伝播も検査する。

横断確認: Grid/List/作品詳細/審査一覧/MyImageCardの全接続先を確認し、配色の複製を共通部品へ集約。状態取得を二重にせず既存Panelを移動。動作に関わる見送りなし。実機iOS/Androidと本番ログイン操作は未実施。

型チェックの最終結果: `npm run typecheck` は既存tests配下110件で終了コード2。アプリ実装側と今回変更したファイルの型エラーは0件。全チェック成功とは扱わない。
