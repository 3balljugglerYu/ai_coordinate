/**
 * ISO 8601 文字列を `datetime-local` input の value 形式 (JST)
 * `YYYY-MM-DDTHH:mm` に変換する。
 *
 * 設計意図:
 *  - サービスは日本国内向けで admin はすべて JST タイムゾーン。
 *    `datetime-local` input はタイムゾーン非依存なので、サーバー側で JST に
 *    決め打ち変換した文字列を出してクライアントへ渡せば、SSR と CSR で
 *    同一の HTML が得られ Hydration Mismatch を起こさない。
 *  - サーバー実行環境 (Vercel など) のタイムゾーンに依存しないよう、UTC から
 *    手動で +09:00 する。`getUTC*` を使うので OS の TZ 設定の影響を受けない。
 *  - 空/不正は空文字を返す。
 */
export function formatDatetimeLocalJst(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // UTC ms に JST オフセット(+9h)を足し、その後 getUTC* で読むことで JST を表す
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}` +
    `T${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}`
  );
}
