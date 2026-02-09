# モデレーション QA チェックリスト

## API テスト

### 1) 通報 API
- [ ] 正常な payload で `POST /api/reports/posts` が 200 を返す
- [ ] 不正な `categoryId/subcategoryId` で 400 を返す
- [ ] 同一ユーザー・同一投稿の重複通報で 400 を返す
- [ ] 未認証リクエストで 401 を返す
- [ ] レート制限超過で 429 を返す

### 2) ブロック API
- [ ] `POST /api/users/:userId/block` が 200 を返す
- [ ] `DELETE /api/users/:userId/block` が 200 を返す
- [ ] `GET /api/users/:userId/block-status` が期待する状態を返す
- [ ] 自分自身をブロックしようとすると 400 を返す
- [ ] 未認証リクエストで 401 を返す

### 3) 管理モデレーション API
- [ ] `GET /api/admin/moderation/posts` が管理者向け審査キューを返す
- [ ] `POST` 判定（approve）で `visible` に更新される
- [ ] `POST` 判定（reject）で `removed` に更新される
- [ ] 非管理者リクエストで 403 を返す

## E2E シナリオ

### 1) 通報者の即時非表示
- [x] ユーザー A が投稿 P を通報する
- [x] 投稿 P がユーザー A のフィードから即時に消える
- [x] 投稿 P は pending/審査判定まではユーザー B から見える

### 2) 自動 pending 化
- [x] しきい値を超える通報を発生させる
- [x] 投稿ステータスが `pending` に変わる
- [x] 投稿が公開フィードから除外される

### 3) ブロック時の表示制御
- [x] ユーザー A がユーザー B をブロックする
- [x] B の投稿が A のフィード/詳細から消える
- [x] ブロック解除で再表示される

### 4) 管理審査
- [x] pending 投稿が `/admin/moderation` に表示される
- [ ] 承認/却下操作で対象が審査キューから消える
- [ ] 対応する監査ログが記録される

## エッジケース
- [x] 未投稿画像への通報は 404 を返す
- [x] `pending/removed` 投稿の詳細は他ユーザーから見えない
- [x] 投稿者本人の非表示投稿アクセス可否が仕様どおりである（許可する場合のみ）

## デプロイ後確認
- [ ] `list_migrations` に moderation 用 migration が含まれている
- [ ] `get_advisors` の結果を確認した
- [ ] 通報/ブロック API の回帰エラーがログに出ていない
