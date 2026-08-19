/**
 * SignupSourceCapture の first-touch 保存。
 *
 * `profiles.signup_source` は全期間で `style` / `wardrobe` の8件しか記録が無く、
 * 企画キーは1件も入っていなかった。仕組み自体は動いていたが、**タグの付いた URL が
 * ほとんど存在しなかった**のが原因(運営が X に出すリンクは素の URL)。
 *
 * そこで企画ページ側から既定値(fallbackSource)を渡せるようにした。
 * ここで守りたいのは3点。
 *  - URL の明示指定が既定値より優先されること
 *  - first-touch を壊さないこと(既存 cookie を上書きしない)
 *  - AppShell の常駐インスタンスと同時に走っても結果が変わらないこと
 */

import { render } from "@testing-library/react";
import {
  SIGNUP_SOURCE_COOKIE,
  SignupSourceCapture,
} from "@/features/auth/components/SignupSourceCapture";

function setSearch(search: string) {
  window.history.replaceState({}, "", `/collections/fashion-magazine${search}`);
}

function readCookie(): string | null {
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${SIGNUP_SOURCE_COOKIE}=`));
  return match
    ? decodeURIComponent(match.slice(SIGNUP_SOURCE_COOKIE.length + 1))
    : null;
}

function clearCookie() {
  document.cookie = `${SIGNUP_SOURCE_COOKIE}=; path=/; max-age=0`;
}

describe("SignupSourceCapture", () => {
  beforeEach(() => {
    clearCookie();
    setSearch("");
  });

  afterAll(() => {
    clearCookie();
  });

  test("URL にタグが無く既定値も無ければ何も保存しない(従来どおり)", () => {
    render(<SignupSourceCapture />);

    expect(readCookie()).toBeNull();
  });

  test("⭐URL にタグが無ければ既定値を保存する(素のリンクからの着地を拾う)", () => {
    render(<SignupSourceCapture fallbackSource="fashion_magazine_summer" />);

    expect(readCookie()).toBe("fashion_magazine_summer");
  });

  test("⭐URL の明示タグは既定値より優先される", () => {
    setSearch("?signup_source=x_post_20260819");

    render(<SignupSourceCapture fallbackSource="fashion_magazine_summer" />);

    expect(readCookie()).toBe("x_post_20260819");
  });

  test("utm_source も既定値より優先される", () => {
    setSearch("?utm_source=x_profile");

    render(<SignupSourceCapture fallbackSource="fashion_magazine_summer" />);

    expect(readCookie()).toBe("x_profile");
  });

  test("⭐既に cookie があれば既定値で上書きしない(first-touch を尊重)", () => {
    document.cookie = `${SIGNUP_SOURCE_COOKIE}=travel_to_italy; path=/`;

    render(<SignupSourceCapture fallbackSource="fashion_magazine_summer" />);

    expect(readCookie()).toBe("travel_to_italy");
  });

  /*
    AppShell が常駐インスタンスを描くため、企画ページでは2つ同時に走る。
    先に走った方が cookie を書き、後発は既存 cookie を尊重して何もしない。
    どちらの順序でも結果が同じであることを、両方の順序で確かめる。
  */
  test("⭐常駐インスタンスと同時に走っても結果が変わらない(既定値が先)", () => {
    render(
      <>
        <SignupSourceCapture fallbackSource="fashion_magazine_summer" />
        <SignupSourceCapture />
      </>,
    );

    expect(readCookie()).toBe("fashion_magazine_summer");
  });

  test("⭐常駐インスタンスと同時に走っても結果が変わらない(常駐が先)", () => {
    render(
      <>
        <SignupSourceCapture />
        <SignupSourceCapture fallbackSource="fashion_magazine_summer" />
      </>,
    );

    expect(readCookie()).toBe("fashion_magazine_summer");
  });

  test("書式に合わない既定値は保存しない(不正な値を cookie に載せない)", () => {
    render(<SignupSourceCapture fallbackSource="Fashion Magazine!!" />);

    expect(readCookie()).toBeNull();
  });

  test("既定値が null でも落ちない", () => {
    expect(() => render(<SignupSourceCapture fallbackSource={null} />)).not.toThrow();
    expect(readCookie()).toBeNull();
  });
});
