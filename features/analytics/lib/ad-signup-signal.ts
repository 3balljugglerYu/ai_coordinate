/**
 * 「登録が終わった」を広告の Pixel に知らせるための決まり。
 *
 * 登録のあとの処理(app/auth/callback/route.ts。Google・X での登録と、メールの確認のリンク)で、
 * 新しく登録した人の user_metadata に送った印(AD_SIGNUP_REPORTED_METADATA_KEY)を残し、
 * 残せたときだけ、移る先への応答に短い Cookie を付ける。次に読み込んだページで Pixel
 * (features/analytics/components/XPixelScript.tsx)が「登録した」を送り、Cookie を消す。
 * - 1人につき1回だけ(ログインし直し・別の端末・登録の直後のやり直しで、もう一度送らない)。
 * - Cookie の中身は "1" だけ(だれが登録したかは入れない)。
 * ⚠️ 確認のメールを別のブラウザで開き、パスワードでログインした人は、この処理を通らないので数えない
 *    (ログインの処理と取り合わないように、ログインの側では送らないと決めた・#811)。
 */

export const AD_SIGNUP_COOKIE = "persta_ad_signup";

/** 印を残しておく長さ。登録のあとのページで Pixel が読み込まれるまでの余裕。 */
export const AD_SIGNUP_COOKIE_MAX_AGE_SECONDS = 10 * 60;

/** Cookie を付けるときの決まり。消す文(AD_SIGNUP_COOKIE_DELETE)もここから作る。 */
export const AD_SIGNUP_COOKIE_PATH = "/";
export const AD_SIGNUP_COOKIE_SAME_SITE = "lax" as const;

const SAME_SITE_ATTRIBUTE = { lax: "Lax", strict: "Strict", none: "None" } as const;

/**
 * ブラウザで Cookie を消す文(付けたときと同じ Path・SameSite にする)。
 * Pixel は本番(https)でしか読み込まないので、Secure を付ける。
 */
export const AD_SIGNUP_COOKIE_DELETE = `${AD_SIGNUP_COOKIE}=; Max-Age=0; Path=${AD_SIGNUP_COOKIE_PATH}; SameSite=${SAME_SITE_ATTRIBUTE[AD_SIGNUP_COOKIE_SAME_SITE]}; Secure`;

/** 送った印の user_metadata のキー(値は送った日時)。 */
export const AD_SIGNUP_REPORTED_METADATA_KEY = "ad_signup_reported_at";

/**
 * 登録が終わったとみなす長さ。
 * アカウントを作ってから、かつ、メールの確認(Google・X で登録した人は登録と同じ時刻)から、この長さの中。
 * 確認のメールを、数時間たってから同じブラウザで押す人も入るように、長めにとる
 * (送るのは1人1回なので、長くしても二重には数えない)。
 */
const SIGNUP_REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** サーバーの時計が、Supabase の時計より少し遅れていても数えるための余裕。 */
const CLOCK_SKEW_ALLOWANCE_MS = 60 * 1000;

type SignupUser = {
  email_confirmed_at?: string | null;
  created_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function isWithinWindow(timestamp: string | null | undefined, nowMs: number): boolean {
  if (!timestamp) return false;
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) return false;
  const elapsed = nowMs - ms;
  return elapsed >= -CLOCK_SKEW_ALLOWANCE_MS && elapsed <= SIGNUP_REPORT_WINDOW_MS;
}

/**
 * 「登録した」を、今送るべきか。
 * - まだ送っていない(user_metadata に送った印が無い)。
 * - アカウントを作ってから24時間以内(前からあるアカウントが、今になって初めてメールを確認しても数えない)。
 * - メールの確認から24時間以内(前から使っている人のログインし直しは、確認の時刻が昔なので数えない)。
 */
export function shouldReportAdSignup(user: SignupUser, nowMs: number): boolean {
  if (user.user_metadata?.[AD_SIGNUP_REPORTED_METADATA_KEY]) return false;
  if (!isWithinWindow(user.created_at, nowMs)) return false;
  return isWithinWindow(user.email_confirmed_at ?? user.created_at, nowMs);
}
