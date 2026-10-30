/** @jest-environment node */

/**
 * ページを開いた最初の通信で、最初に来た場所の cookie を付ける(proxy.ts から呼ぶ・P3-3)。
 *
 * ここで守ること:
 *  - 画面の読み込み(document)だけで付ける。API・画面の裏の通信(RSC)・先読みでは付けない
 *  - すでにあれば何もしない(最初の訪問を残す)
 *  - URL の first_visit(アプリの中のブラウザからの引き継ぎ)があれば、それを使う
 *  - サーバーの応答で付け(Safari のスクリプト cookie の上限を受けない)、画面からは読める(HttpOnly にしない)
 */

import { NextRequest, NextResponse } from "next/server";
import { attachFirstVisitCookie, decideFirstVisit } from "@/features/auth/lib/first-visit-proxy";

function request(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    headers: { "sec-fetch-dest": "document", "user-agent": "Mozilla/5.0 Safari/604.1", ...headers },
  });
}

describe("decideFirstVisit", () => {
  it("はじめての画面の読み込みなら、参照元と URL から決め、パスはクエリを除く", () => {
    expect(
      decideFirstVisit(
        request("https://www.persta.ai/ja/posts/1?utm_source=x", { referer: "https://www.google.co.jp/" }),
      ),
    ).toEqual({ channel: "search", landingPath: "/ja/posts/1" });
    expect(decideFirstVisit(request("https://www.persta.ai/?fbclid=abc"))).toEqual({
      channel: "meta",
      landingPath: "/",
    });
  });

  it("すでに cookie があれば何もしない", () => {
    expect(
      decideFirstVisit(request("https://www.persta.ai/ja/style", { cookie: "persta_first_visit=direct%7C%2F" })),
    ).toBeNull();
  });

  it.each([
    ["API", "https://www.persta.ai/api/posts", {}],
    ["画面の裏の通信(RSC)", "https://www.persta.ai/ja/style", { rsc: "1", "sec-fetch-dest": "empty" }],
    ["先読み", "https://www.persta.ai/ja/style", { "next-router-prefetch": "1" }],
    ["画像など(document でない)", "https://www.persta.ai/ja/style", { "sec-fetch-dest": "image" }],
  ])("%s では付けない", (_label, url, headers) => {
    expect(decideFirstVisit(request(url, headers as Record<string, string>))).toBeNull();
  });

  it("sec-fetch-dest が無い古いブラウザでも、HTML を求める通信なら付ける", () => {
    const req = new NextRequest("https://www.persta.ai/ja", { headers: { accept: "text/html,application/xhtml+xml" } });
    expect(decideFirstVisit(req)).toEqual({ channel: "direct", landingPath: "/ja" });
  });

  it("URL の first_visit(アプリの中のブラウザからの引き継ぎ)があれば、それを使う。おかしな値なら自分で決める", () => {
    expect(
      decideFirstVisit(request("https://www.persta.ai/ja/login?first_visit=meta%7C%2Fja%2Fcollections%2Fhalloween")),
    ).toEqual({ channel: "meta", landingPath: "/ja/collections/halloween" });
    expect(decideFirstVisit(request("https://www.persta.ai/ja/login?first_visit=facebook%7C%2F"))).toEqual({
      channel: "direct",
      landingPath: "/ja/login",
    });
  });
});

describe("attachFirstVisitCookie", () => {
  it("30日・Lax・画面から読める cookie を付ける", () => {
    const response = NextResponse.next();

    attachFirstVisitCookie(request("https://www.persta.ai/ja/style", { referer: "https://t.co/x" }), response);

    const cookie = response.cookies.get("persta_first_visit");
    expect(cookie?.value).toBe("x|/ja/style");
    expect(cookie).toMatchObject({ path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30, httpOnly: false });
  });

  it("付けないときは、応答に何も足さない", () => {
    const response = NextResponse.next();

    attachFirstVisitCookie(request("https://www.persta.ai/api/posts"), response);

    expect(response.cookies.get("persta_first_visit")).toBeUndefined();
  });
});
