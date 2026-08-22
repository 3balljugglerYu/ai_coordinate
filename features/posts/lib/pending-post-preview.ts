/**
 * 一覧から詳細へ飛ぶときに、**タップした作品の見た目だけを先に渡す**ための受け渡し箱。
 *
 * ## なぜ要るか
 *
 * 詳細の `<img>` はサーバー応答に含まれて届くので、**要素が生まれるのは
 * 約0.8秒後**。サムネイルはブラウザのキャッシュに既にあるのに、
 * それまで描きようがなく、グレーの骨組みを見せていた。
 *
 * 一覧は「どの作品か」も「サムネイルのURL」も**タップした瞬間に知っている**。
 * それをここに置いておき、`loading.tsx` のスケルトンが読んで描く。
 * こうするとサーバー応答を待たずに、**遷移が確定した瞬間に実物のサムネイルが出る**。
 *
 * ## なぜ module 変数なのか
 *
 * クライアント側ナビゲーションでは JS の実行コンテキストが保たれるので、
 * module 変数はそのまま生き残る。Context にすると Provider を跨ぐ配線が要り、
 * sessionStorage にすると書き込み・読み出しの同期コストが乗る。
 * **表示のためだけの一時値**なので、これで足りる。
 *
 * ## 読み出しは useSyncExternalStore で行うこと
 *
 * effect で読んで `setState` すると `react-hooks/set-state-in-effect` に
 * 引っかかるうえ、1フレーム遅れて「グレー → 画像」とちらつく。
 * `getServerSnapshot` が `null` を返すので SSR とも食い違わない。
 * そのため `getSnapshot` は**副作用を持たない**（読んでも消さない）。
 *
 * ## 必ず ID を突き合わせること
 *
 * 別の作品のサムネイルを出すと、開いた瞬間に違う絵が見えて差し替わる。
 * 直リンクやリロードでは値が無い（＝従来どおりグレー）。
 */

export interface PendingPostPreview {
  /** 遷移先の投稿 ID。これが一致しないときは使わない。 */
  postId: string;
  /** 一覧で表示していたサムネイル URL（`unoptimized` の生 URL）。 */
  thumbnailUrl: string;
  /** 画像枠の縦横比。無いと正方形の枠に収まって縦長が上下に余る。 */
  aspectRatio?: "portrait" | "landscape" | null;
}

let pending: PendingPostPreview | null = null;
const listeners = new Set<() => void>();

/** 一覧のカードをタップしたときに置く。 */
export function setPendingPostPreview(preview: PendingPostPreview | null): void {
  pending = preview;
  for (const listener of listeners) {
    listener();
  }
}

/** `useSyncExternalStore` の購読。 */
export function subscribePendingPostPreview(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 現在の値。**副作用を持たせないこと**（`useSyncExternalStore` の
 * `getSnapshot` は同じ入力に対して同じ参照を返す必要がある）。
 */
export function getPendingPostPreview(): PendingPostPreview | null {
  return pending;
}

/** SSR 時は常に無し。サーバーには「どこから来たか」の情報が無い。 */
export function getPendingPostPreviewServerSnapshot(): PendingPostPreview | null {
  return null;
}

/**
 * ID が一致したときだけ返す純関数。表示側の判定をここに閉じ込める。
 */
export function matchPendingPostPreview(
  preview: PendingPostPreview | null,
  postId: string | null
): PendingPostPreview | null {
  if (!preview || !postId || preview.postId !== postId) {
    return null;
  }
  return preview;
}

/** テスト用。 */
export function clearPendingPostPreview(): void {
  setPendingPostPreview(null);
}
