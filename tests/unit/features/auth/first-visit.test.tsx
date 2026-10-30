/**
 * 最初に来た場所と、最初に開いた画面(管理ダッシュボード P3-3)。
 *
 * ここで守ること:
 *  - X・X の広告・メタは今の見分け方(detectSignupChannel)のまま。それ以外を、検索・ほかのサイト・直接に分ける
 *  - 参照元がペルスタの中(www の有無を問わない)なら直接
 *  - 最初に開いた画面のパスは、DB の決まり(/ で始まる・? と # を含まない・200文字まで)にそろえる
 *  - cookie は最初の訪問だけ書き、すでにあれば書き直さない
 *  - 流入元の cookie(persta_signup_source)には触らない(企画ページの既定値が書けなくならないように)
 *  - メールで登録するとき、cookie の値を user_metadata に入れる(トリガーが写す)
 */

import { render } from "@testing-library/react";
import { createClient } from "@/lib/supabase/client";
import { FirstVisitCapture } from "@/features/auth/components/FirstVisitCapture";
import { SIGNUP_SOURCE_COOKIE } from "@/features/auth/components/SignupSourceCapture";
import { signUp } from "@/features/auth/lib/auth-client";
import {
  FIRST_VISIT_COOKIE,
  detectFirstVisitChannel,
  normalizeLandingPath,
  parseFirstVisit,
  readFirstVisitFromCookieHeader,
  serializeFirstVisit,
} from "@/features/auth/lib/first-visit";

jest.mock("@/lib/supabase/client", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/public-env", () => ({ getSiteUrlForClient: jest.fn(() => "https://www.persta.ai") }));

const BROWSER_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1";

function channel(referrer: string, search = "", userAgent = BROWSER_UA) {
  return detectFirstVisitChannel({ search, userAgent, referrer, siteHost: "www.persta.ai" });
}

describe("detectFirstVisitChannel", () => {
  it.each([
    ["X の広告(twclid)", "", "?twclid=abc", "x_ad"],
    ["メタ(fbclid)", "", "?fbclid=abc", "meta"],
    ["X から(t.co)", "https://t.co/xyz", "", "x"],
    ["Google", "https://www.google.com/", "", "search"],
    ["Google(日本)", "https://www.google.co.jp/", "", "search"],
    ["Android の Google アプリ", "android-app://com.google.android.googlequicksearchbox/", "", "search"],
    ["Yahoo! JAPAN の検索", "https://search.yahoo.co.jp/search?p=persta", "", "search"],
    ["Bing", "https://www.bing.com/search?q=persta", "", "search"],
    ["ほかのサイト", "https://note.com/someone/n/abc", "", "other"],
    ["Yahoo! のニュース(検索ではない)", "https://news.yahoo.co.jp/articles/1", "", "other"],
    ["参照元なし", "", "", "direct"],
    ["ペルスタの中(www なし)", "https://persta.ai/style", "", "direct"],
    ["読めない参照元", "not a url", "", "direct"],
  ])("%s → %s", (_label, referrer, search, expected) => {
    expect(channel(referrer, search)).toBe(expected);
  });

  it("Instagram のアプリの中で開いたら、参照元が無くてもメタ", () => {
    expect(channel("", "", "Mozilla/5.0 Instagram 300.0")).toBe("meta");
  });
});

describe("normalizeLandingPath", () => {
  it("/ で始まるパスはそのまま、200文字を超えたら切る", () => {
    expect(normalizeLandingPath("/ja/style")).toBe("/ja/style");
    expect(normalizeLandingPath(`/${"a".repeat(300)}`)).toHaveLength(200);
  });

  it("/ で始まらない・? や # を含むものは null", () => {
    expect(normalizeLandingPath("style")).toBeNull();
    expect(normalizeLandingPath("/style?x=1")).toBeNull();
    expect(normalizeLandingPath("/style#top")).toBeNull();
    expect(normalizeLandingPath("")).toBeNull();
  });
});

describe("cookie の値", () => {
  it("書いた値を読み戻せる。パスが無くても来た場所だけ読める", () => {
    expect(parseFirstVisit(serializeFirstVisit({ channel: "search", landingPath: "/posts/1" }))).toEqual({
      channel: "search",
      landingPath: "/posts/1",
    });
    expect(parseFirstVisit("direct|")).toEqual({ channel: "direct", landingPath: null });
    expect(parseFirstVisit("direct")).toEqual({ channel: "direct", landingPath: null });
  });

  it("来た場所が決まりに無い値なら null。パスだけおかしければパスを null", () => {
    expect(parseFirstVisit("facebook|/style")).toBeNull();
    expect(parseFirstVisit("meta|style?x")).toEqual({ channel: "meta", landingPath: null });
  });

  it("ほかの cookie と並んでいても読み、壊れたエンコードは null", () => {
    expect(
      readFirstVisitFromCookieHeader(`a=1; ${FIRST_VISIT_COOKIE}=${encodeURIComponent("x|/ja")}; b=2`),
    ).toEqual({ channel: "x", landingPath: "/ja" });
    expect(readFirstVisitFromCookieHeader(`${FIRST_VISIT_COOKIE}=%E0%A4%A`)).toBeNull();
    expect(readFirstVisitFromCookieHeader("a=1")).toBeNull();
  });
});

function clearCookies() {
  for (const name of [FIRST_VISIT_COOKIE, SIGNUP_SOURCE_COOKIE]) {
    document.cookie = `${name}=; path=/; max-age=0`;
  }
}

describe("FirstVisitCapture", () => {
  beforeEach(() => {
    clearCookies();
    window.history.replaceState({}, "", "/ja/posts/123?fbclid=abc");
  });

  it("最初の訪問で、来た場所とパス(クエリなし)を残す。流入元の cookie には触らない", () => {
    render(<FirstVisitCapture />);

    expect(readFirstVisitFromCookieHeader(document.cookie)).toEqual({
      channel: "meta",
      landingPath: "/ja/posts/123",
    });
    expect(document.cookie).not.toContain(`${SIGNUP_SOURCE_COOKIE}=`);
  });

  it("すでに残っていれば書き直さない", () => {
    document.cookie = `${FIRST_VISIT_COOKIE}=${encodeURIComponent("search|/style")}; path=/`;

    render(<FirstVisitCapture />);

    expect(readFirstVisitFromCookieHeader(document.cookie)).toEqual({
      channel: "search",
      landingPath: "/style",
    });
  });
});

describe("signUp(メールでの登録)", () => {
  const supabaseSignUp = jest.fn(async () => ({ data: {}, error: null }));

  beforeEach(() => {
    clearCookies();
    supabaseSignUp.mockClear();
    (createClient as jest.Mock).mockReturnValue({ auth: { signUp: supabaseSignUp } });
  });

  it("最初に来た場所を user_metadata に入れる(流入元と並べて)", async () => {
    document.cookie = `${FIRST_VISIT_COOKIE}=${encodeURIComponent("search|/ja/style")}; path=/`;

    await signUp("user@example.com", "Aa1!aaaa", undefined, "halloween-best-shot");

    expect(supabaseSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: {
            signup_source: "halloween-best-shot",
            first_visit_channel: "search",
            first_landing_path: "/ja/style",
          },
        }),
      }),
    );
  });

  it("cookie が無ければ、今までどおり何も足さない", async () => {
    await signUp("user@example.com", "Aa1!aaaa");

    expect(supabaseSignUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: { emailRedirectTo: "https://www.persta.ai/auth/callback" } }),
    );
  });
});
