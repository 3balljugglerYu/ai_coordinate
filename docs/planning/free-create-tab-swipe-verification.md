# /freeの作り方タブの横切替 検証記録

- 日付: 2026-11-01
- 区分: standard / bug-fix
- ブランチ: `codex/free-tab-swipe`、基点 `39b3745`
- 対象: /free内の「プロンプトから／イラストから」。上部の画面間タブは対象外。

## 原因と修正

`GenerationForm.tsx:920` のCatalogTabBarは押したときのonSelectだけを接続していた。`UserStylesFeedClient.tsx:499` は一覧用CatalogSwipePanelを使うが、隣の一覧も描く方式なので、そのままフォームを置くと入力欄と副作用を複製する。

`features/generation/components/CreateModeSwipePanel.tsx:33` を追加し、同じフォームを1つだけ保ったままpointerで横操作を処理する。GenerationFormのCardを包む接続は `GenerationForm.tsx:937`。有効化は既存のreferenceAccessがある場合だけ。i2i招待やサーバーの認可は変更しない。

- 左でイラスト、右でプロンプト。RTLは反転。タッチ・マウスに対応。
- 横判定後に指へ追従。距離が幅20%（上限96px）を超えたら切替。
- 入力、ボタン、リンク、ダイアログの操作、縦スクロール、タッチの画面端、2本指は横切替に使わない。
- フォームのマウントを保ち、本文・見本・画像のstateを保持する。画像/見本の操作自体は既存処理を利用する。
- タブのクリック・キーボード操作は既存CatalogTabBarを維持する。

## テスト行列

| 分類 | シナリオ | テスト | 結果 |
|---|---|---|---|
| 正常 | タッチ・マウスの左右切替 | create-mode-swipe-panel | 成功 |
| 正常 | 本文・見本・入力DOM・pickerマウントを保持 | 同上 / generation-form-catalog-reference | 成功 |
| 境界 | 短距離、幅400/1000で距離の前後、外側へ操作、RTL | create-mode-swipe-panel | 成功 |
| 境界 | 縦優勢、最初に縦へ動いた後の横移動、入力・リンク・ボタン | 同上 | 成功 |
| 異常・回帰 | 未招待、pointerキャンセル、別ID、2本指、capture移譲 | 同上 | 成功 |
| 回帰 | スワイプ直後の誤クリックだけを捨て、次のクリックは通す | 同上 | 成功 |

最初は9件失敗・38件成功を確認してから実装した。capture移譲の追加テストも修正前の2件失敗・1件成功を確認した。

## 独立レビュー

担当Avicenna（`01a1967b-a32e-7af1-9675-15e5b7ebfa38`）、ソース編集なし。テスト事前レビューで縦方向判定・2本指・defaultPrevented・距離境界の不足を指摘し、追加した。最終原文:

> 追加指摘はありません。編集・テスト実行は行っていません。Phase 5へ進めます。

実装レビューでP1「touchのcapture移譲でスワイプが中断される」を検出。実ブラウザで子要素got→lost→panel got→lostとなり切替しないことを再現。子からのcapture喪失がバブルしても中止しないよう、panel自身かつ追跡中pointerの喪失だけresetする（`CreateModeSwipePanel.tsx:143`）。追加3件のテスト事前レビュー原文:

> 末尾3件を4軸で確認し、指摘はありません。

修正後の限定再レビュー原文:

> 限定再レビューで追加指摘はありません。前回のP1の原因は解消されています。

指定のcode-reviewスキルでも、origin/mainとの差分（新規ファイルを含む）を型・副作用・既存タブ・認可境界・責務で確認。解消していない動作指摘なし。

## ブラウザ確認

実際のCreateModeSwipePanelとCatalogTabBarをサンプル入力で表示した一時プレビューをChromiumで操作。実アカウントの/free全体確認とは区別する。

- マウスの左右ドラッグ: prompt→reference→prompt、本文保持。
- CDPの実touchイベント: 修正後は左右とも成功。子要素の暗黙captureを伴う経路も確認。
- textarea内の横操作: モードを変更せず本文保持。
- 縦操作: scrollYが102へ進み、モードはpromptのまま。
- 操作前にWeb Animationsを停止し、安定した位置で操作した。HMRのない静的バンドルを修正後にURL付きで開き直した。
- 確認用ブラウザ・一時サーバーは終了。実機iOS Safari/Androidは未実施。

## 検証と自己点検

- 関連: `npx jest --runInBand tests/unit/features/generation tests/unit/features/catalog-references tests/unit/features/style-presets/catalog-swipe-panel.test.tsx` → 118スイート・1,247件成功。既存7件スキップ。
- 網羅率: `npx jest --runInBand tests/unit/features/generation/create-mode-swipe-panel.test.tsx tests/unit/features/generation/generation-form-catalog-reference.test.tsx --coverage --collectCoverageFrom='features/generation/components/CreateModeSwipePanel.tsx' --coverageDirectory=.local/free-swipe-coverage` → 50件成功、行92%、分岐90.32%。双方90%以上。未計測のWeb Animations/実capture解放経路は上記ブラウザ操作で確認。
- ビルド: `npm run build -- --webpack` → 終了コード0。既存のlibheif依存解析・baseline-browser-mapping等の警告あり。
- 変更4ファイルのeslint → 終了コード0。
- 型チェック: `npm run typecheck` → tests配下の既存110件で未通過。アプリ実装側・今回変更ファイルのエラーは0。
- 同義反復: callback・実フォームの選択状態・本文と見本・DOM同一性・click到達を検証。
- 不安定性: 時刻依存なし。座標と幅を明示し、縦判定と距離判定を別々に検出する。テストPolyfillは実PointerEventではないため、ブラウザでも操作した。
- 不完全性: 初期の縦・2本指・境界の不足を修正。captureのようなjsdomで自動再現しないイベント列を追加し、実ブラウザの再現と照合した。

横断確認: 同じタブ列でもUserStylesFeedClientはすでに一覧用のスワイプへ接続済み。共通部品に変更を加えず、既存スワイプテストも回帰確認した。

重複: 方向判定6px・画面端24px・幅20%/96pxは一覧用の操作感に合わせた小さい重複。フォームは入力保持と操作除外が必要なので、一覧コンポーネント全体の共通化は行わない。動作に関わる指摘の見送りなし。

## 全体の最終結果

- `npm test -- --maxWorkers=2`: 700スイート・8,401件成功。既存1スイート・7件スキップ、スナップショット13件成功。
- `npm run lint -- --ignore-pattern '.local/**'`: 21エラー・52警告で終了コード1。`.local`の静的プレビュー生成物だけを除外。今回変更4ファイルのlintは成功している。
- `git diff --check` と `git diff --cached --check`: 成功。
- DB・worker・依存関係・package.json scriptsの変更なし。マージ・本番での実アカウント確認は別途。
