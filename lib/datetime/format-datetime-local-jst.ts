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

/**
 * `datetime-local` input の値 (`YYYY-MM-DDTHH:mm`) を JST として解釈し、
 * ISO 8601 文字列へ戻す。{@link formatDatetimeLocalJst} の逆変換。
 *
 * input はタイムゾーンを持たないため、`new Date(value)` で素直に解釈すると
 * **実行環境のタイムゾーン**で読まれる。admin が JST で入れた時刻が
 * サーバーでは別の時刻になり、切替が9時間ずれる。明示的に +09:00 を付ける。
 *
 * 空/不正は null を返す。
 */
export function parseDatetimeLocalJst(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
