/** @jest-environment node */

/**
 * ページを開いた最初の通信で、最初に来た場所の cookie を付ける(proxy.ts から呼ぶ・P3-3)。
 *
 * ここで守ること:
 *  - 画面の読み込み(document)だけで付ける。API・画面の裏の通信(RSC)・先読み(アドレスバーの先読みも)では付けない
 *  - ログインの途中(/auth/ の下)では付けない(OAuth の参照元と /auth/... を残さない)
 *  - 読める cookie があれば何もしない。読めない値は付け直す
 *  - パスは言語の部分(/ja など)を外してそろえる
 *  - URL の first_visit(アプリの中のブラウザからの引き継ぎ)は、URL から消したアドレスへ移し直し、
 *    読める cookie が無ければその値で付ける
 *  - サーバーの応答で付け(Safari のスクリプト cookie の上限を受けない)、画面からは読める(HttpOnly にしない)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  attachFirstVisitCookie,
  decideFirstVisit,
  handleFirstVisitHandoff,
} from "@/features/auth/lib/first-visit-proxy";

function request(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    headers: { "sec-fetch-dest": "document", "user-agent": "Mozilla/5.0 Safari/604.1", ...headers },
  });
}

describe("decideFirstVisit", () => {
  it("はじめての画面の読み込みなら、参照元と URL から決め、パスはクエリと言語の部分を除く", () => {
    expect(
      decideFirstVisit(
        request("https://www.persta.ai/ja/posts/1?utm_source=x", { referer: "https://www.google.co.jp/" }),
      ),
    ).toEqual({ channel: "search", landingPath: "/posts/1" });
    expect(decideFirstVisit(request("https://www.persta.ai/?fbclid=abc"))).toEqual({
      channel: "meta",
      landingPath: "/",
    });
  });

  it("読める cookie があれば何もしない。読めない値なら付け直す", () => {
    expect(
      decideFirstVisit(request("https://www.persta.ai/ja/style", { cookie: "persta_first_visit=direct%7C%2F" })),
    ).toBeNull();
    expect(
      decideFirstVisit(request("https://www.persta.ai/ja/style", { cookie: "persta_first_visit=facebook%7C%2F" })),
    ).toEqual({ channel: "direct", landingPath: "/style" });
  });

  it.each([
    ["API", "https://www.persta.ai/api/posts", {}],
    ["ログインの途中(OAuth の戻り先)", "https://www.persta.ai/auth/callback?code=1", { referer: "https://accounts.google.com/" }],
    ["ログインの途中(X の完了画面)", "https://www.persta.ai/auth/x-complete", { referer: "https://x.com/" }],
    ["画面の裏の通信(RSC)", "https://www.persta.ai/ja/style", { rsc: "1", "sec-fetch-dest": "empty" }],
    ["Next の先読み", "https://www.persta.ai/ja/style", { "next-router-prefetch": "1" }],
    ["アドレスバーの先読み", "https://www.persta.ai/ja", { "sec-purpose": "prefetch;prerender" }],
    ["画像など(document でない)", "https://www.persta.ai/ja/style", { "sec-fetch-dest": "image" }],
  ])("%s では付けない", (_label, url, headers) => {
    expect(decideFirstVisit(request(url, headers as Record<string, string>))).toBeNull();
  });

  it("sec-fetch-dest が無い古いブラウザでも、HTML を求める通信なら付ける", () => {
    const req = new NextRequest("https://www.persta.ai/ja", { headers: { accept: "text/html,application/xhtml+xml" } });
    expect(decideFirstVisit(req)).toEqual({ channel: "direct", landingPath: "/" });
  });
});

describe("attachFirstVisitCookie", () => {
  it("30日・Lax・画面から読める cookie を付ける", () => {
    const response = NextResponse.next();

    attachFirstVisitCookie(request("https://www.persta.ai/ja/style", { referer: "https://t.co/x" }), response);

    const cookie = response.cookies.get("persta_first_visit");
    expect(cookie?.value).toBe("x|/style");
    expect(cookie).toMatchObject({ path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30, httpOnly: false });
  });

  it("付けないときは、応答に何も足さない", () => {
    const response = NextResponse.next();

    attachFirstVisitCookie(request("https://www.persta.ai/api/posts"), response);

    expect(response.cookies.get("persta_first_visit")).toBeUndefined();
  });
});

describe("handleFirstVisitHandoff", () => {
  it("URL に first_visit が無ければ何もしない", () => {
    expect(handleFirstVisitHandoff(request("https://www.persta.ai/ja/login?signup_source=tag"))).toBeNull();
  });

  it("first_visit を消したアドレスへ移し直し(ほかのパラメータは残す)、その値で cookie を付ける", () => {
    const response = handleFirstVisitHandoff(
      request("https://www.persta.ai/ja/login?signup_source=tag&first_visit=meta%7C%2Fcollections%2Fhalloween&openExternalBrowser=1"),
    )!;

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/ja/login");
    expect(location.searchParams.has("first_visit")).toBe(false);
    expect(location.searchParams.get("signup_source")).toBe("tag");
    expect(location.searchParams.get("openExternalBrowser")).toBe("1");
    expect(response.cookies.get("persta_first_visit")?.value).toBe("meta|/collections/halloween");
  });

  it("読める cookie がすでにあれば、URL から消すだけで cookie は付け直さない", () => {
    const response = handleFirstVisitHandoff(
      request("https://www.persta.ai/ja/login?first_visit=x_ad%7C%2F", { cookie: "persta_first_visit=search%7C%2Fstyle" }),
    )!;

    expect(response.status).toBe(307);
    expect(response.cookies.get("persta_first_visit")).toBeUndefined();
  });

  it("おかしな値なら、URL から消すだけで cookie は付けない(次の画面で自分で決める)", () => {
    const response = handleFirstVisitHandoff(request("https://www.persta.ai/ja/login?first_visit=facebook%7C%2F"))!;

    expect(new URL(response.headers.get("location")!).searchParams.has("first_visit")).toBe(false);
    expect(response.cookies.get("persta_first_visit")).toBeUndefined();
  });
});
