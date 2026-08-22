/** @jest-environment jsdom */

/**
 * 完走モーダルの「ホームに投稿する」ボタン。
 *
 * ⭐ **取得中も同じ高さの場所を確保すること。**
 *
 * かつては投稿済みかの取得が終わるまで `null` を返していた。その結果、
 * 完走モーダルでは**このボタンだけ数百ms遅れて出現し、下にある
 * 「シェアする」「カードを更新する」を1個ぶん押し下げていた**。
 * ちょうどボタンの高さぶんずれるので、押した瞬間に別のボタンが滑り込み、
 * **意図しない方が押される**(実機で報告された不具合)。
 *
 * 画面上は「少し遅れて出るだけ」に見えて原因が分かりにくいので、
 * 場所を確保していることをここで固定する。
 */

import React from "react";
import { render, screen, act } from "@testing-library/react";

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

/*
  ENABLED はモジュール読み込み時に env を1回だけ読む定数。
  `import` は巻き上げられて env 設定より先に走るので、**env を先に立ててから
  読み込ませる**必要がある。jest.mock のファクトリは import より先に走るため、
  ここで設定しておく(モック自体は素通し)。
*/
jest.mock("@/features/collections/components/CompletionFeedPostButton", () => {
  process.env.NEXT_PUBLIC_COLLECTION_FEED_POST_ENABLED = "true";
  return jest.requireActual(
    "@/features/collections/components/CompletionFeedPostButton"
  );
});

import { CompletionFeedPostButton } from "@/features/collections/components/CompletionFeedPostButton";

/** 解決タイミングを手元で握れる fetch。 */
function deferredFetch() {
  let resolveFn: (value: { posted: boolean }) => void = () => {};
  const promise = new Promise<{ posted: boolean }>((resolve) => {
    resolveFn = resolve;
  });
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => promise,
    })
  ) as unknown as typeof fetch;
  return {
    resolve: async (posted: boolean) => {
      await act(async () => {
        resolveFn({ posted });
        await promise;
      });
    },
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("CompletionFeedPostButton", () => {
  test("⭐取得中でも場所を確保する（null を返さない）", () => {
    deferredFetch();

    const { container } = render(
      <CompletionFeedPostButton completionId="c-1" variant="cta" />
    );

    // 何も描かないと下のボタンが押し上がる。必ず箱を残すこと
    expect(container.firstChild).not.toBeNull();
  });

  test("⭐取得中の箱は、本番のボタンと同じ寸法クラスを持つ", async () => {
    const deferred = deferredFetch();

    const { container } = render(
      <CompletionFeedPostButton completionId="c-1" variant="cta" />
    );
    const placeholderClass = (container.firstChild as HTMLElement).className;

    // 高さを決める指定が本番と一致していないと、差し替わった瞬間に動く
    for (const cls of ["w-full", "px-6", "py-3", "text-base", "border-2"]) {
      expect(placeholderClass).toContain(cls);
    }

    await deferred.resolve(false);

    const realClass = screen.getByRole("button", {
      name: /ホームに投稿する/,
    }).className;
    for (const cls of ["w-full", "px-6", "py-3", "text-base", "border-2"]) {
      expect(realClass).toContain(cls);
    }
  });

  test("取得中は押せない（押せると誤解させない）", () => {
    deferredFetch();

    render(<CompletionFeedPostButton completionId="c-1" variant="cta" />);

    // ボタンではなくスケルトンとして描く
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  test("取得が終わると本物のボタンに差し替わる（未投稿）", async () => {
    const deferred = deferredFetch();

    render(<CompletionFeedPostButton completionId="c-1" variant="cta" />);
    await deferred.resolve(false);

    expect(
      screen.getByRole("button", { name: /ホームに投稿する/ })
    ).toBeInTheDocument();
  });

  test("投稿済みなら「ホームに投稿済み」を出す", async () => {
    const deferred = deferredFetch();

    render(<CompletionFeedPostButton completionId="c-1" variant="cta" />);
    await deferred.resolve(true);

    expect(screen.getByText(/ホームに投稿済み/)).toBeInTheDocument();
  });

  test("chrome variant でも取得中に場所を確保する", () => {
    deferredFetch();

    const { container } = render(
      <CompletionFeedPostButton completionId="c-1" variant="chrome" />
    );
    const cls = (container.firstChild as HTMLElement).className;

    expect(container.firstChild).not.toBeNull();
    // 小型版の寸法指定に揃える
    for (const c of ["px-3", "py-2", "text-sm"]) {
      expect(cls).toContain(c);
    }
  });
});
