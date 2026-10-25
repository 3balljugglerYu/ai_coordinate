import {
  STYLE_SIGNUP_SOURCE,
  WARDROBE_SIGNUP_SOURCE,
  appendSignupChannel,
  detectSignupChannel,
  parseSignupSource,
  withSignupSourceParam,
} from "@/features/auth/lib/signup-source";

describe("parseSignupSource", () => {
  test("代表値(style / wardrobe)はそのまま返す", () => {
    expect(parseSignupSource("style")).toBe(STYLE_SIGNUP_SOURCE);
    expect(parseSignupSource("wardrobe")).toBe(WARDROBE_SIGNUP_SOURCE);
  });

  test("外部チャネル等の自由形式タグも受理する(書式を満たす場合)", () => {
    expect(parseSignupSource("x_profile")).toBe("x_profile");
    expect(parseSignupSource("x_post_20260627")).toBe("x_post_20260627");
    expect(parseSignupSource("instagram")).toBe("instagram");
  });

  test("トリム・小文字化してサニタイズする", () => {
    expect(parseSignupSource("  X_Profile  ")).toBe("x_profile");
    expect(parseSignupSource("INSTAGRAM")).toBe("instagram");
  });

  test("null / undefined / 空文字は null", () => {
    expect(parseSignupSource("")).toBeNull();
    expect(parseSignupSource(null)).toBeNull();
    expect(parseSignupSource(undefined)).toBeNull();
  });

  test("書式違反(許可外文字 / 40字超)は null", () => {
    expect(parseSignupSource("has space")).toBeNull();
    expect(parseSignupSource("bad!char")).toBeNull();
    expect(parseSignupSource("日本語タグ")).toBeNull();
    expect(parseSignupSource("a".repeat(41))).toBeNull();
  });
});

/*
  X・メタの広告を目印(utm)なしのリンクで出したあと(2026-10-16)、どこから来て登録したかを分けるための見分け方。
  広告のクリック ID → アプリの中のブラウザ → 参照元 の順に見る。
*/
describe("detectSignupChannel", () => {
  const SAFARI_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const INSTAGRAM_UA = `${SAFARI_UA.replace(" Version/18.0", "")} Instagram 350.0.0.0.0 (iPhone16,2; iOS 18_0; ja_JP; ja)`;
  const FACEBOOK_UA = `${SAFARI_UA} [FBAN/FBIOS;FBAV/480.0.0.0.0;FBBV/1]`;
  const X_ANDROID_UA =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 TwitterAndroid";

  function detect(input: Partial<{ search: string; userAgent: string; referrer: string }>) {
    return detectSignupChannel({ search: "", userAgent: SAFARI_UA, referrer: "", ...input });
  }

  test("⭐X の広告のクリック ID(twclid)があれば x_ad", () => {
    expect(detect({ search: "?twclid=abc123" })).toBe("x_ad");
  });

  test("⭐メタのクリック ID(fbclid)があれば meta", () => {
    expect(detect({ search: "?fbclid=IwAR0abc" })).toBe("meta");
  });

  test("twclid は、X のアプリや参照元より先に見る(広告であることが分かる方を残す)", () => {
    expect(detect({ search: "?twclid=abc", userAgent: X_ANDROID_UA, referrer: "https://t.co/xyz" })).toBe("x_ad");
  });

  test("Instagram・Facebook のアプリの中で開いたら meta(クリック ID が無くても)", () => {
    expect(detect({ userAgent: INSTAGRAM_UA })).toBe("meta");
    expect(detect({ userAgent: FACEBOOK_UA })).toBe("meta");
  });

  test("X のアプリの中で開いたら x", () => {
    expect(detect({ userAgent: X_ANDROID_UA })).toBe("x");
  });

  test("参照元が X(t.co・x.com・twitter.com とその下)なら x", () => {
    expect(detect({ referrer: "https://t.co/AbCdEf" })).toBe("x");
    expect(detect({ referrer: "https://x.com/persta_ai/status/1" })).toBe("x");
    expect(detect({ referrer: "https://mobile.twitter.com/" })).toBe("x");
  });

  test("参照元がメタ(l.instagram.com・m.facebook.com など)なら meta", () => {
    expect(detect({ referrer: "https://l.instagram.com/" })).toBe("meta");
    expect(detect({ referrer: "http://m.facebook.com/" })).toBe("meta");
  });

  test("ドメインの終わりが似ているだけのサイトは数えない", () => {
    expect(detect({ referrer: "https://notx.com/" })).toBeNull();
    expect(detect({ referrer: "https://fakefacebook.com/" })).toBeNull();
  });

  test("どれにも当てはまらなければ null(検索・直接・ほかのサイト)", () => {
    expect(detect({})).toBeNull();
    expect(detect({ referrer: "https://www.google.com/" })).toBeNull();
    expect(detect({ referrer: "https://www.persta.ai/ja" })).toBeNull();
  });

  test("参照元が URL として読めなくても落ちない", () => {
    expect(detect({ referrer: "not a url" })).toBeNull();
  });
});

describe("appendSignupChannel", () => {
  test("来た場所を _ でつなぐ", () => {
    expect(appendSignupChannel("halloween-best-shot", "x_ad")).toBe("halloween-best-shot_x_ad");
    expect(appendSignupChannel("halloween-best-shot", "meta")).toBe("halloween-best-shot_meta");
    expect(appendSignupChannel("halloween-best-shot", "x")).toBe("halloween-best-shot_x");
  });

  test("来た場所が分からなければ、元のまま", () => {
    expect(appendSignupChannel("halloween-best-shot", null)).toBe("halloween-best-shot");
  });

  test("つなぐと40字を超えるときは、元のまま(DB の書式に合わない値を作らない)", () => {
    const long = "a".repeat(38);
    expect(appendSignupChannel(long, "meta")).toBe(long);
  });
});

describe("withSignupSourceParam", () => {
  test("流入元があれば signup_source を付ける(ほかのクエリと # は残す)", () => {
    expect(
      withSignupSourceParam(
        "https://www.persta.ai/campaigns/halloween-best-shot?utm_source=meta#hbs-works",
        "halloween-best-shot_meta_ig"
      )
    ).toBe(
      "https://www.persta.ai/campaigns/halloween-best-shot?utm_source=meta&signup_source=halloween-best-shot_meta_ig#hbs-works"
    );
  });

  test("URL に別の signup_source があれば、渡された値に置き換える", () => {
    expect(
      withSignupSourceParam("https://www.persta.ai/login?signup_source=style", "halloween-best-shot")
    ).toBe("https://www.persta.ai/login?signup_source=halloween-best-shot");
  });

  test("URL の signup_source が空や不正な値でも、渡された値に置き換える", () => {
    expect(
      withSignupSourceParam("https://www.persta.ai/c?signup_source=", "halloween-best-shot_meta_ig")
    ).toBe("https://www.persta.ai/c?signup_source=halloween-best-shot_meta_ig");
    expect(
      withSignupSourceParam("https://www.persta.ai/c?signup_source=Bad%20Value!", "halloween-best-shot_meta_ig")
    ).toBe("https://www.persta.ai/c?signup_source=halloween-best-shot_meta_ig");
  });

  test("URL の signup_source が同じ値なら、URL を書き直さない", () => {
    const href = "https://www.persta.ai/login?q=a%20b&signup_source=style";
    expect(withSignupSourceParam(href, "style")).toBe(href);
  });

  test("流入元が無ければ URL をそのまま返す", () => {
    const href = "https://www.persta.ai/login?next=%2Fstyle";
    expect(withSignupSourceParam(href, null)).toBe(href);
  });

  test("URL として読めない値はそのまま返す", () => {
    expect(withSignupSourceParam("not a url", "style")).toBe("not a url");
  });
});
