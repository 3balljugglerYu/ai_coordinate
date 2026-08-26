# 公開前のページを、ログインせずに確認する

## 何のための仕組みか

公開前のページは運営アカウントでしか開けないように塞いである。ところが
**ログインできない立場**（自動でブラウザを動かして確認する側）からは、
そのページを一度も見られない。

実際に困った。確認のたびに使い捨ての入口ページ（`app/preview-XXXX/page.tsx`）
を作って、props を手で書いて、確認したら消す、という手順を踏んでいた。
これには2つ問題がある。

1. **本物とは別物しか見られない。** props を手で渡すので、実データの取得も
   認証判定も通っていない。「ページが正しいか」の確認になっていない
2. 毎回作って消すので、消し忘れれば公開されてしまう

そこで、**開発サーバーでだけ**塞ぎを通り抜けられるようにした。

## 使い方

`next dev` で立てたサーバーに、合図となるクエリを付けて開く。

```
http://localhost:3000/use-prompts?amount=20
```

`?amount=` は「停止中の額を仮置きして下見する」ためのもので、これが付いて
いるときだけ開発サーバーで塞ぎを通る。付けずに開けば **一般ユーザーと同じ
404** になるので、塞がっている側の見え方も確認できる。

```
http://localhost:3000/use-prompts        → 404（一般ユーザーの見え方）
http://localhost:3000/use-prompts?amount=20 → ページが開く
```

## 漏れない理由

判定は `isLocalPreviewAllowed()`（`lib/env.ts`）1か所で、中身は

```ts
process.env.NODE_ENV === "development"
```

だけ。`development` になるのは `next dev` のときだけで、本番ビルドも
**Vercel のプレビューデプロイも `production`** なので、デプロイ先でこの
逃げ道が開くことはない。同じ手を `lib/api-docs-auth.ts` が API ドキュメントの
保護に使っている。

`tests/unit/lib/admin-viewer-env.test.ts` で、production / test では必ず
false になることを固定している。

## 他のページにも足すとき

```ts
import { isAdminViewer, isLocalPreviewAllowed } from "@/lib/env";

const localPreview = isLocalPreviewAllowed() && Boolean(params.<合図>);
const canPreview = isAdminViewer(user?.id) || localPreview;
```

**合図を必ず要求すること。** 開発サーバーで無条件に開くようにすると、
「一般ユーザーには見えていない」という状態をこちらで確認できなくなる。
塞がっている側の見え方も、確認したいものの一つ。
