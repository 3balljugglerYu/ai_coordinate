// proxy（middleware）で /posts/[id] は /<locale>/posts/[id] にリダイレクトされるため、
// 実際に表示されるルートはこちら。詳細ページ用スケルトンを即時表示してから
// サーバーレンダリングのストリームを待つ。
export { default } from "../../posts/loading";
