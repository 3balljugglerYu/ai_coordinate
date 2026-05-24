/** @jest-environment node */

import {
  parseTweetUrl,
  parseXAccountUrl,
} from "@/features/catalog/lib/tweet-url";

describe("parseTweetUrl", () => {
  test("x.com 正規 URL", () => {
    expect(parseTweetUrl("https://x.com/foo/status/123")).toEqual({
      normalized: "https://x.com/foo/status/123",
      handle: "foo",
      statusId: "123",
    });
  });

  test("twitter.com を x.com に正規化", () => {
    expect(parseTweetUrl("https://twitter.com/foo/status/456"))
      .toEqual({
        normalized: "https://x.com/foo/status/456",
        handle: "foo",
        statusId: "456",
      });
  });

  test("mobile.twitter.com のサブドメインも受け入れる", () => {
    expect(
      parseTweetUrl("https://mobile.twitter.com/foo/status/789?lang=ja"),
    ).toEqual({
      normalized: "https://x.com/foo/status/789",
      handle: "foo",
      statusId: "789",
    });
  });

  test("URL に末尾のクエリやフラグメントがあっても statusId だけ取る", () => {
    expect(parseTweetUrl("https://x.com/foo/status/123/photo/1")).toEqual({
      normalized: "https://x.com/foo/status/123",
      handle: "foo",
      statusId: "123",
    });
  });

  test("ハンドルの大文字小文字は小文字に正規化する", () => {
    expect(parseTweetUrl("https://x.com/Foo_Bar/status/123")).toEqual({
      normalized: "https://x.com/foo_bar/status/123",
      handle: "foo_bar",
      statusId: "123",
    });
  });

  test("ホストが別ドメインだと null", () => {
    expect(parseTweetUrl("https://example.com/foo/status/123")).toBeNull();
  });

  test("status パスでない場合は null", () => {
    expect(parseTweetUrl("https://x.com/foo")).toBeNull();
  });

  test("status id の直後に英字が続く URL は null", () => {
    expect(parseTweetUrl("https://x.com/foo/status/123abc")).toBeNull();
  });

  test("空文字や null も null", () => {
    expect(parseTweetUrl("")).toBeNull();
    expect(parseTweetUrl(null)).toBeNull();
    expect(parseTweetUrl(undefined)).toBeNull();
  });

  test("不正な URL は null", () => {
    expect(parseTweetUrl("not a url")).toBeNull();
  });

  test("空白だけの文字列は null", () => {
    expect(parseTweetUrl("   ")).toBeNull();
  });

  test("非文字列入力は null", () => {
    expect(parseTweetUrl(123 as unknown as string)).toBeNull();
  });

  test("https / http 以外のプロトコルは null", () => {
    expect(parseTweetUrl("ftp://x.com/foo/status/123")).toBeNull();
  });
});

describe("parseXAccountUrl", () => {
  test("シンプルな X プロフィール URL", () => {
    expect(parseXAccountUrl("https://x.com/foo")).toEqual({
      normalized: "https://x.com/foo",
      handle: "foo",
    });
  });

  test("twitter.com を x.com に正規化", () => {
    expect(parseXAccountUrl("https://twitter.com/Foo/?lang=ja")).toEqual({
      normalized: "https://x.com/foo",
      handle: "foo",
    });
  });

  test("status パスを含む URL はアカウント URL ではないため null", () => {
    expect(parseXAccountUrl("https://x.com/foo/status/123")).toBeNull();
  });

  test("ハンドル長が 15 超は null", () => {
    expect(
      parseXAccountUrl("https://x.com/abcdefghijklmnopqrst"),
    ).toBeNull();
  });

  test("空文字 / null / undefined / 非文字列は null", () => {
    expect(parseXAccountUrl("")).toBeNull();
    expect(parseXAccountUrl(null)).toBeNull();
    expect(parseXAccountUrl(undefined)).toBeNull();
    expect(
      parseXAccountUrl(123 as unknown as string),
    ).toBeNull();
  });

  test("空白だけの文字列は null", () => {
    expect(parseXAccountUrl("   ")).toBeNull();
  });

  test("URL としてパースできない文字列は null", () => {
    expect(parseXAccountUrl("not a url")).toBeNull();
  });

  test("https / http 以外のプロトコルは null", () => {
    expect(parseXAccountUrl("ftp://x.com/foo")).toBeNull();
  });

  test("ホストが別ドメインだと null", () => {
    expect(parseXAccountUrl("https://example.com/foo")).toBeNull();
  });
});
