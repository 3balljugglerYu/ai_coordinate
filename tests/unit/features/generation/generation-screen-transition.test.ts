/** @jest-environment jsdom */

/**
 * スマホの生成画面の開閉(View Transitions)。
 * ⭐ 対応していないブラウザでは、アニメーションなしでそのまま移る。
 * ⭐ アプリの中から開いたときだけ「戻る」。直接 URL で来たときは元の画面へ置き換える。
 */

// モジュールにする(グローバルの宣言が、ほかのテストの同名の関数とぶつからないように)
export {};

type Transition = { finished: Promise<void> };

// 開いたかどうかをモジュールが覚えるので、テストごとに読み直す
async function loadModule() {
  jest.resetModules();
  return import("@/features/generation/lib/generation-screen-transition");
}

const router = () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() });

afterEach(() => {
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-generation-screen-transition");
});

describe("generation-screen-transition", () => {
  test("対応していないブラウザでは、アニメーションなしで移る", async () => {
    const mod = await loadModule();
    const r = router();
    mod.openGenerationScreen(r, "/generate/post/a");
    expect(r.push).toHaveBeenCalledWith("/generate/post/a");
    expect(document.documentElement.hasAttribute("data-generation-screen-transition")).toBe(false);
  });

  test("開く: 画面が描かれた合図で切り替えを終え、印を外す", async () => {
    const mod = await loadModule();
    let update!: () => Promise<void>;
    let finish!: () => void;
    (document as unknown as { startViewTransition: (cb: () => Promise<void>) => Transition }).startViewTransition =
      (cb) => {
        update = cb;
        return { finished: new Promise<void>((resolve) => (finish = resolve)) };
      };
    const r = router();
    mod.openGenerationScreen(r, "/generate/style/p1");
    expect(document.documentElement.getAttribute("data-generation-screen-transition")).toBe("open");

    let settled = false;
    const done = update().then(() => {
      settled = true;
    });
    expect(r.push).toHaveBeenCalledWith("/generate/style/p1");
    await Promise.resolve();
    expect(settled).toBe(false);
    mod.notifyGenerationScreenShown();
    await done;
    expect(settled).toBe(true);

    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.documentElement.hasAttribute("data-generation-screen-transition")).toBe(false);
  });

  test("閉じる: アプリの中から開いたときは戻り、生成画面が消えたら終える", async () => {
    const mod = await loadModule();
    const r = router();
    mod.openGenerationScreen(r, "/generate/post/a");
    let update!: () => Promise<void>;
    (document as unknown as { startViewTransition: (cb: () => Promise<void>) => Transition }).startViewTransition =
      (cb) => {
        update = cb;
        return { finished: Promise.resolve() };
      };
    const screen = document.createElement("div");
    screen.setAttribute("data-generation-screen", "");
    document.body.appendChild(screen);

    mod.closeGenerationScreen(r, "/posts/a");
    expect(document.documentElement.getAttribute("data-generation-screen-transition")).toBe("close");
    let settled = false;
    const done = update().then(() => {
      settled = true;
    });
    expect(r.back).toHaveBeenCalled();
    expect(r.replace).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(settled).toBe(false);
    screen.remove();
    await done;
    expect(settled).toBe(true);
  });

  test("閉じる: 直接 URL で来たときは、元の画面へ置き換える", async () => {
    const mod = await loadModule();
    const r = router();
    mod.closeGenerationScreen(r, "/posts/a");
    expect(r.replace).toHaveBeenCalledWith("/posts/a");
    expect(r.back).not.toHaveBeenCalled();
  });

  test("動きを減らす設定では、アニメーションしない", async () => {
    const mod = await loadModule();
    const start = jest.fn();
    (document as unknown as { startViewTransition: unknown }).startViewTransition = start;
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes("reduce") })) as unknown as typeof window.matchMedia;
    const r = router();
    mod.openGenerationScreen(r, "/generate/post/a");
    expect(start).not.toHaveBeenCalled();
    expect(r.push).toHaveBeenCalled();
    window.matchMedia = original;
  });

  test("画面幅は開く瞬間に測る", async () => {
    const mod = await loadModule();
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes("768") })) as unknown as typeof window.matchMedia;
    expect(mod.isDesktopViewportNow()).toBe(true);
    window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
    expect(mod.isDesktopViewportNow()).toBe(false);
    window.matchMedia = original;
  });
});
