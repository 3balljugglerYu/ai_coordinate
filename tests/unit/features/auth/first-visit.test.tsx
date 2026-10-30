/**
 * 最初に来た場所と、最初に開いた画面(管理ダッシュボード P3-3)。
 *
 * ここで守ること:
 *  - X・X の広告・メタは今の見分け方(detectSignupChannel)のまま。それ以外を、検索・ほかのサイト・直接に分ける
 *  - 「検索」は検索の画面だけ(Gmail・Google ドキュメント・Yahoo! ニュースなどは入れない)
 *  - 参照元がペルスタの中(www の有無を問わない)なら直接
 *  - 最初に開いた画面のパスは、DB の決まり(/ で始まる・? と # を含まない・200文字まで)にそろえ、
 *    日本語などを途中で切って壊れた形を残さない
 *  - アプリの中のブラウザから外へ移るとき、URL に載せて引き継ぐ
 *  - メールで登録するとき、cookie の値を user_metadata に入れ(トリガーが写す)、入れたら cookie を消す
 */

import { createClient } from "@/lib/supabase/client";
import { signUp } from "@/features/auth/lib/auth-client";
import {
  FIRST_VISIT_COOKIE,
  FIRST_VISIT_PARAM,
  detectFirstVisitChannel,
  normalizeLandingPath,
  parseFirstVisit,
  readFirstVisitFromCookieHeader,
  buildExternalBrowserHref,
  serializeFirstVisit,
  withFirstVisitParam,
  withFirstVisitParamFromDocument,
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
    ["Yahoo! の地域ごとの検索", "https://jp.search.yahoo.com/search?p=persta", "", "search"],
    ["Bing", "https://www.bing.com/search?q=persta", "", "search"],
    ["NAVER の検索", "https://search.naver.com/search.naver?query=persta", "", "search"],
    ["Gmail(検索ではない)", "https://mail.google.com/", "", "other"],
    ["Google ドキュメント(検索ではない)", "https://docs.google.com/document/d/1", "", "other"],
    ["Yahoo! のニュース(検索ではない)", "https://news.yahoo.co.jp/articles/1", "", "other"],
    ["NAVER のブログ(検索ではない)", "https://blog.naver.com/someone", "", "other"],
    ["ほかのサイト", "https://note.com/someone/n/abc", "", "other"],
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

  it.each([
    ["%X の途中", `/${"a".repeat(197)}%E3%83%8F`, `/${"a".repeat(197)}`],
    // 200文字で切ると「%E3%83」まで残る(ハ=%E3%83%8F の途中)。その2つを削る
    ["1文字(%XX 3つ)の途中", `/${"a".repeat(193)}%E3%83%8F`, `/${"a".repeat(193)}`],
  ])("日本語の%sで切れたら、その文字の分だけ削る", (_label, input, expected) => {
    const path = normalizeLandingPath(input)!;

    expect(path).toBe(expected);
    expect(() => decodeURIComponent(path)).not.toThrow();
  });

  it("切った所より前が壊れていたら、違う短いパスを返さずに null", () => {
    expect(normalizeLandingPath(`/bad%ZZ/${"a".repeat(250)}`)).toBeNull();
  });

  it("/ で始まらない・? や # を含む・読めないものは null", () => {
    expect(normalizeLandingPath("style")).toBeNull();
    expect(normalizeLandingPath("/style?x=1")).toBeNull();
    expect(normalizeLandingPath("/style#top")).toBeNull();
    expect(normalizeLandingPath("/bad%E3%83")).toBeNull();
    expect(normalizeLandingPath("")).toBeNull();
  });
});

describe("cookie と URL の値", () => {
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

function clearCookie() {
  document.cookie = `${FIRST_VISIT_COOKIE}=; path=/; max-age=0`;
}

describe("外のブラウザへの引き継ぎ", () => {
  beforeEach(clearCookie);

  it("URL に first_visit を載せ、ほかのパラメータは残す", () => {
    const url = new URL(
      withFirstVisitParam("https://www.persta.ai/ja/login?signup_source=tag", {
        channel: "meta",
        landingPath: "/ja/collections/halloween",
      }),
    );

    expect(url.searchParams.get(FIRST_VISIT_PARAM)).toBe("meta|/ja/collections/halloween");
    expect(url.searchParams.get("signup_source")).toBe("tag");
  });

  it("外のブラウザ用の URL には、流入元と最初に来た場所の両方を載せる", () => {
    document.cookie = `${FIRST_VISIT_COOKIE}=${encodeURIComponent("meta|/collections/halloween")}; path=/`;

    const url = new URL(buildExternalBrowserHref("https://www.persta.ai/ja/login", "halloween-best-shot_meta"));

    expect(url.searchParams.get("signup_source")).toBe("halloween-best-shot_meta");
    expect(url.searchParams.get(FIRST_VISIT_PARAM)).toBe("meta|/collections/halloween");
  });

  it("ブラウザの cookie の値を載せる。cookie が無ければ URL はそのまま", () => {
    expect(withFirstVisitParamFromDocument("https://www.persta.ai/ja/login")).toBe("https://www.persta.ai/ja/login");

    document.cookie = `${FIRST_VISIT_COOKIE}=${encodeURIComponent("x_ad|/ja")}; path=/`;

    expect(new URL(withFirstVisitParamFromDocument("https://www.persta.ai/ja/login")).searchParams.get(FIRST_VISIT_PARAM)).toBe(
      "x_ad|/ja",
    );
  });
});

describe("signUp(メールでの登録)", () => {
  const NEW_USER = { user: { id: "u1", identities: [{ id: "i1" }], email_confirmed_at: null } };
  const supabaseSignUp = jest.fn(async () => ({
    data: NEW_USER as unknown,
    error: null as { message: string } | null,
  }));

  beforeEach(() => {
    clearCookie();
    supabaseSignUp.mockClear();
    (createClient as jest.Mock).mockReturnValue({ auth: { signUp: supabaseSignUp } });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("最初に来た場所を user_metadata に入れ(流入元と並べて)、入れたら cookie を消す", async () => {
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
    expect(readFirstVisitFromCookieHeader(document.cookie)).toBeNull();
  });

  it("登録済みのメールで見せかけの成功(identities が空)が返ったら、何も記録されていないので cookie は残す", async () => {
    document.cookie = `${FIRST_VISIT_COOKIE}=${encodeURIComponent("search|/ja/style")}; path=/`;
    supabaseSignUp.mockResolvedValueOnce({ data: { user: { id: "fake", identities: [] } }, error: null });

    await signUp("used@example.com", "Aa1!aaaa");

    expect(readFirstVisitFromCookieHeader(document.cookie)).toEqual({ channel: "search", landingPath: "/ja/style" });
  });

  it("登録に失敗したら cookie は残す(やり直しで使う)", async () => {
    document.cookie = `${FIRST_VISIT_COOKIE}=${encodeURIComponent("search|/ja/style")}; path=/`;
    supabaseSignUp.mockResolvedValueOnce({ data: {}, error: { message: "Password should be at least 8 characters" } });
    jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(signUp("user@example.com", "short")).rejects.toThrow();

    expect(readFirstVisitFromCookieHeader(document.cookie)).toEqual({ channel: "search", landingPath: "/ja/style" });
  });

  it("cookie が無ければ、今までどおり何も足さない", async () => {
    await signUp("user@example.com", "Aa1!aaaa");

    expect(supabaseSignUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: { emailRedirectTo: "https://www.persta.ai/auth/callback" } }),
    );
  });
});
