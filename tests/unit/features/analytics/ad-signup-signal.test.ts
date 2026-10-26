/**
 * 「登録した」を今送るべきか(1人1回・アカウントを作ってから、かつ確認から24時間以内)。
 */

import { AD_SIGNUP_COOKIE_DELETE, shouldReportAdSignup } from "@/features/analytics/lib/ad-signup-signal";

const NOW = Date.parse("2026-10-26T09:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60 * 1000).toISOString();

describe("shouldReportAdSignup", () => {
  test("Google・X で今登録した(確認の時刻=登録の時刻)", () => {
    expect(shouldReportAdSignup({ created_at: minutesAgo(0), email_confirmed_at: minutesAgo(0) }, NOW)).toBe(true);
  });

  test("メールで登録して、3時間後に確認のメールを押した", () => {
    expect(shouldReportAdSignup({ created_at: minutesAgo(180), email_confirmed_at: minutesAgo(0) }, NOW)).toBe(true);
  });

  test("ちょうど24時間前までは送り、それより前は送らない", () => {
    expect(shouldReportAdSignup({ created_at: minutesAgo(24 * 60), email_confirmed_at: minutesAgo(24 * 60) }, NOW)).toBe(true);
    expect(shouldReportAdSignup({ created_at: minutesAgo(24 * 60 + 1), email_confirmed_at: minutesAgo(1) }, NOW)).toBe(false);
  });

  test("前からあるアカウントが、今になって初めてメールを確認しても送らない(パスワードの再設定・Google でのつなぎ)", () => {
    expect(shouldReportAdSignup({ created_at: minutesAgo(60 * 24 * 90), email_confirmed_at: minutesAgo(1) }, NOW)).toBe(false);
  });

  test("前から使っている人のログインし直しは送らない", () => {
    expect(shouldReportAdSignup({ created_at: minutesAgo(60 * 24 * 30), email_confirmed_at: minutesAgo(60 * 24 * 30) }, NOW)).toBe(false);
  });

  test("もう送った人(送った印がある)には、登録の直後でも送らない(ログインし直し・別の端末)", () => {
    expect(
      shouldReportAdSignup(
        { created_at: minutesAgo(2), email_confirmed_at: minutesAgo(1), user_metadata: { ad_signup_reported_at: minutesAgo(0.5) } },
        NOW,
      ),
    ).toBe(false);
  });

  test("サーバーの時計が1分まで遅れていても送り、それより先の時刻は送らない", () => {
    const soon = new Date(NOW + 30_000).toISOString();
    const tooSoon = new Date(NOW + 61_000).toISOString();
    expect(shouldReportAdSignup({ created_at: soon, email_confirmed_at: soon }, NOW)).toBe(true);
    expect(shouldReportAdSignup({ created_at: tooSoon, email_confirmed_at: tooSoon }, NOW)).toBe(false);
  });

  test("確認の時刻が無ければ登録の時刻で見る。時刻が無い・読めなければ送らない", () => {
    expect(shouldReportAdSignup({ created_at: minutesAgo(2), email_confirmed_at: null }, NOW)).toBe(true);
    expect(shouldReportAdSignup({}, NOW)).toBe(false);
    expect(shouldReportAdSignup({ created_at: "not-a-date" }, NOW)).toBe(false);
  });
});

test("Cookie を消す文は、付けたときと同じ Path・SameSite", () => {
  expect(AD_SIGNUP_COOKIE_DELETE).toBe("persta_ad_signup=; Max-Age=0; Path=/; SameSite=Lax; Secure");
});
