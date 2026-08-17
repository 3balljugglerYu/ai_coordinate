import { parseSignupSource } from "@/features/auth/lib/signup-source";

/**
 * 台紙ストレージURLから「mount-{timestamp}」のタイムスタンプ部分だけ抜く。
 * 古い台紙(タイムスタンプ前の固定パス)は null を返す。
 *
 * 例: ".../mount-1717999999999.png?v=..." → "1717999999999"
 */
export function extractMountVersionFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/mount-(\d+)\.png/);
  return m ? m[1] : null;
}

/**
 * シェアURLに付ける流入元タグを作る。
 *
 * カテゴリ key をそのまま使う(例: `travel_to_australia`)。接頭辞は付けない。
 * `parseSignupSource` の書式は 1..40 文字なので、接頭辞を足すと
 * 長い key(現状の最長は `collectible_wafer_sticker_god_petit_6p` = 38文字)で
 * 上限に張り付き、将来の企画で無言で欠落する。
 *
 * 書式に合わない場合は null を返し、呼び出し側はパラメータごと省略する。
 */
function buildCollectionSignupSource(
  categoryKey: string | null | undefined,
): string | null {
  return parseSignupSource(categoryKey);
}

/**
 * 台紙の公開ページURL(/m/{completionId}?v={ts})を組み立てる(client 用)。
 *
 * mountImageUrl を渡すと、台紙更新ごとに ?v=...が付き、SNS(X/Facebook 等)の
 * カードキャッシュが新しい URL として扱われ即時に新しい OGP が反映される。
 * 引数省略時はバージョン無しの旧形式 URL を出す(後方互換)。
 *
 * categoryKey を渡すと `?signup_source=<key>` が付く。着地時に
 * SignupSourceCapture が first-touch で cookie に保存し、登録まで到達すると
 * profiles.signup_source に残る = 「どの企画のシェア経由で登録したか」が取れる。
 */
export function buildPublicMountUrl(
  completionId: string,
  mountImageUrl?: string | null,
  categoryKey?: string | null,
): string {
  const version = extractMountVersionFromUrl(mountImageUrl);
  const params = new URLSearchParams();
  if (version) params.set("v", version);
  const source = buildCollectionSignupSource(categoryKey);
  if (source) params.set("signup_source", source);
  const query = params.toString();
  const path = query ? `/m/${completionId}?${query}` : `/m/${completionId}`;
  return `${window.location.origin}${path}`;
}

/**
 * book(めくれる完走ビュー)の公開URL。
 * mount と違い、OGP画像は book ページの metadata がバージョン付きURLで返すため
 * キャッシュバスターのクエリは持たない。
 */
export function buildPublicBookUrl(
  completionId: string,
  categoryKey?: string | null,
): string {
  const source = buildCollectionSignupSource(categoryKey);
  const query = source ? `?signup_source=${encodeURIComponent(source)}` : "";
  return `${window.location.origin}/m/${completionId}/book${query}`;
}

/**
 * mount_shared を記録する(best-effort)。失敗は握りつぶす。
 * 共有/コピーの成功時(ShareLinkButton の onShared)から呼ぶ。
 */
export function trackMountShareEvent(completionId: string): void {
  void fetch("/api/collections/share-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completionId }),
  }).catch(() => {});
}
