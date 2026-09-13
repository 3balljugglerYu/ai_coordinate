import { render, screen } from "@testing-library/react";

import { ResponsiveFormDialog } from "@/components/ui/responsive-form-dialog";

/**
 * モバイルはボトムシート(vaul)、PC は従来ダイアログ。
 *
 * モバイルで中央固定モーダルに戻ると、仮想キーボードが出たときに Chrome が
 * visual viewport をパンしてダイアログが滑って見える不具合が再発するため、
 * 出し分けが壊れていないことを固定する。
 */
function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

describe("ResponsiveFormDialog", () => {
  let originalMatchMedia: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
  });

  afterEach(() => {
    jest.clearAllMocks();
    // モックを残すと同ランナー内の他テストを汚染するため元の状態へ復元する
    if (originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", originalMatchMedia);
    } else {
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });

  function renderDialog(open: boolean) {
    return render(
      <ResponsiveFormDialog
        open={open}
        onOpenChange={() => {}}
        title="スタイルを追加"
        desktopClassName="max-w-2xl"
      >
        <p>フォーム本体</p>
      </ResponsiveFormDialog>,
    );
  }

  it("モバイル幅ではボトムシートとして開く", () => {
    mockMatchMedia(true);
    renderDialog(true);

    expect(screen.getByText("フォーム本体")).toBeInTheDocument();
    expect(document.querySelector("[data-vaul-drawer]")).not.toBeNull();
    expect(
      document.querySelector('[data-slot="dialog-content"]'),
    ).toBeNull();
  });

  it("PC 幅では従来のダイアログとして開く", () => {
    mockMatchMedia(false);
    renderDialog(true);

    expect(screen.getByText("フォーム本体")).toBeInTheDocument();
    expect(document.querySelector("[data-vaul-drawer]")).toBeNull();
    expect(
      document.querySelector('[data-slot="dialog-content"]'),
    ).not.toBeNull();
  });

  it("閉じているときはどちらも描画しない", () => {
    mockMatchMedia(true);
    renderDialog(false);

    expect(screen.queryByText("フォーム本体")).not.toBeInTheDocument();
    expect(document.querySelector("[data-vaul-drawer]")).toBeNull();
    expect(
      document.querySelector('[data-slot="dialog-content"]'),
    ).toBeNull();
  });

  describe("キーボードで隠れた入力欄の寄せ直し", () => {
    let listeners: Record<string, Array<() => void>>;
    let originalVisualViewport: PropertyDescriptor | undefined;

    beforeEach(() => {
      jest.useFakeTimers();
      listeners = {};
      originalVisualViewport = Object.getOwnPropertyDescriptor(
        window,
        "visualViewport",
      );
      Object.defineProperty(window, "visualViewport", {
        configurable: true,
        writable: true,
        value: {
          height: 400,
          addEventListener: (type: string, fn: () => void) => {
            (listeners[type] ??= []).push(fn);
          },
          removeEventListener: (type: string, fn: () => void) => {
            listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
          },
        },
      });
    });

    afterEach(() => {
      jest.useRealTimers();
      if (originalVisualViewport) {
        Object.defineProperty(
          window,
          "visualViewport",
          originalVisualViewport,
        );
      } else {
        delete (window as { visualViewport?: unknown }).visualViewport;
      }
    });

    function renderWithInput() {
      return render(
        <ResponsiveFormDialog
          open
          onOpenChange={() => {}}
          title="スタイルを追加"
        >
          <input aria-label="タイトル" />
        </ResponsiveFormDialog>,
      );
    }

    /** jsdom は矩形を全て 0 で返すので、可視判定用に差し込む。 */
    function setRect(el: HTMLElement, top: number, bottom: number) {
      el.getBoundingClientRect = () =>
        ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top,
           x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    }

    it("キーボードに隠れている入力欄を見える位置へ寄せる", () => {
      mockMatchMedia(true);
      renderWithInput();

      const input = screen.getByLabelText("タイトル");
      // visualViewport.height=400 に対し下端 520 = キーボードの裏
      setRect(input, 480, 520);
      const scrollIntoView = jest.fn();
      input.scrollIntoView = scrollIntoView;
      input.focus();

      // フォーカスした時点ではまだ呼ばれない(遅延させている)
      expect(scrollIntoView).not.toHaveBeenCalled();

      listeners.resize?.forEach((fn) => fn());
      jest.runAllTimers();

      expect(scrollIntoView).toHaveBeenCalledWith({
        block: "center",
        // globals.css の scroll-behavior: smooth に引きずられないこと
        behavior: "instant",
      });
    });

    it("既に全体が見えている入力欄は動かさない", () => {
      mockMatchMedia(true);
      renderWithInput();

      const input = screen.getByLabelText("タイトル");
      // visualViewport.height=400 の内側に収まっている
      setRect(input, 100, 140);
      const scrollIntoView = jest.fn();
      input.scrollIntoView = scrollIntoView;
      input.focus();

      listeners.resize?.forEach((fn) => fn());
      jest.runAllTimers();

      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it("シートの外の要素にフォーカスがあるときは寄せない", () => {
      mockMatchMedia(true);
      renderWithInput();

      const outside = document.createElement("input");
      document.body.appendChild(outside);
      setRect(outside, 480, 520);
      const scrollIntoView = jest.fn();
      outside.scrollIntoView = scrollIntoView;
      outside.focus();

      listeners.resize?.forEach((fn) => fn());
      jest.runAllTimers();

      expect(scrollIntoView).not.toHaveBeenCalled();
      outside.remove();
    });

    it("PC 幅では寄せ直しをしない", () => {
      mockMatchMedia(false);
      renderWithInput();

      const input = screen.getByLabelText("タイトル");
      setRect(input, 480, 520);
      const scrollIntoView = jest.fn();
      input.scrollIntoView = scrollIntoView;
      input.focus();

      listeners.resize?.forEach((fn) => fn());
      jest.runAllTimers();

      expect(scrollIntoView).not.toHaveBeenCalled();
    });
  });
});
