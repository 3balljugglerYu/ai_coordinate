/**
 * 画像分割ツールの UI。
 *
 * 切り出しロジック(splitImageFile)は jsdom に Canvas が無いためモックし、
 * ここでは**ファイル選択 → 分割 → 保存の流れと、モバイル/PC の分岐**を固定する。
 *
 * 保存動線は既存の生成画像(shareOrDownloadGeneratedImage)と同じ分け方:
 * モバイル(UA判定)= Web Share / PC = <a download>。
 * この分岐を誤ると実機で壊れる。iOS Safari は連続ダウンロードで
 * 「現在進行中のダウンロードは停止します」と前のダウンロードを潰すため、
 * **モバイルに連続ダウンロードを出してはいけない**(実機で発生した不具合)。
 */

jest.mock("@/features/tools/lib/split-image", () => {
  const actual = jest.requireActual("@/features/tools/lib/split-image");
  return {
    ...actual,
    splitImageFile: jest.fn(),
  };
});

import { act, fireEvent, render, screen } from "@testing-library/react";
import { ImageSplitTool } from "@/features/tools/components/ImageSplitTool";
import { splitImageFile } from "@/features/tools/lib/split-image";

const mockSplit = splitImageFile as jest.MockedFunction<typeof splitImageFile>;

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

function makePieces(count = 4) {
  return Array.from({ length: count }, (_, i) => ({
    blob: new Blob([`piece-${i + 1}`], { type: "image/png" }),
    index: i + 1,
    width: 418,
    height: 941,
  }));
}

function imageFile(name = "fireworks.png") {
  return new File(["dummy"], name, { type: "image/png" });
}

async function selectFile(file: File) {
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

/** <a download> の発火を横取りして、落とされたファイル名を記録する。 */
function captureAnchorClicks(): { clicks: string[]; restore: () => void } {
  const clicks: string[] = [];
  const original = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    clicks.push(this.download);
  };
  return {
    clicks,
    restore: () => {
      HTMLAnchorElement.prototype.click = original;
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSplit.mockResolvedValue(makePieces());
  // jsdom に無い API をモックする
  URL.createObjectURL = jest.fn(() => `blob:mock-${Math.random()}`);
  URL.revokeObjectURL = jest.fn();
  Object.assign(navigator, {
    canShare: jest.fn(() => true),
    share: jest.fn().mockResolvedValue(undefined),
  });
});

describe("共通(端末に依らない)", () => {
  beforeEach(() => setUserAgent(DESKTOP_UA));

  test("初期表示: アップロード領域と分割方法の表が出る", () => {
    render(<ImageSplitTool />);

    expect(screen.getByText("画像を選ぶ / ドラッグ&ドロップ")).toBeInTheDocument();
    expect(
      screen.getByText("画像はブラウザ内で処理され、サーバーにはアップロードされません"),
    ).toBeInTheDocument();
    // 軸は2行、枚数は 2/3/4 の3つずつ。合わせて 2×2 の1つ
    expect(screen.getByText("縦に分割")).toBeInTheDocument();
    expect(screen.getByText("横に分割")).toBeInTheDocument();
    expect(screen.getAllByText("2分割")).toHaveLength(2);
    expect(screen.getAllByText("3分割")).toHaveLength(2);
    expect(screen.getAllByText("4分割")).toHaveLength(2);
    expect(screen.getByText("2×2に4分割")).toBeInTheDocument();
  });

  test("⭐既定は縦4分割で、選択中の枚数だけが押された状態になる", () => {
    render(<ImageSplitTool />);

    const pressed = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true");

    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toBe("4分割");
  });

  test("画像を選ぶと4枚のプレビューが出る", async () => {
    render(<ImageSplitTool />);

    await selectFile(imageFile());

    expect(mockSplit).toHaveBeenCalledWith(expect.any(File), "vertical4");
    expect(screen.getAllByRole("img")).toHaveLength(4);
    expect(screen.getAllByText("保存")).toHaveLength(4);
  });

  test("⭐画像以外のファイルは弾いて分割を走らせない", async () => {
    render(<ImageSplitTool />);

    await selectFile(new File(["x"], "note.txt", { type: "text/plain" }));

    expect(screen.getByText("画像ファイルを選んでください。")).toBeInTheDocument();
    expect(mockSplit).not.toHaveBeenCalled();
  });

  test("⭐モードを切り替えると同じ画像で再分割される", async () => {
    render(<ImageSplitTool />);
    await selectFile(imageFile());

    await act(async () => {
      // 「横に分割」行の 4分割(= 2行目・3つ目のピル)
      fireEvent.click(screen.getAllByText("4分割")[1]);
    });

    expect(mockSplit).toHaveBeenCalledTimes(2);
    expect(mockSplit).toHaveBeenLastCalledWith(expect.any(File), "horizontal4");
  });

  test("⭐枚数のピルは軸ごとに独立している(縦の2分割と横の2分割)", async () => {
    render(<ImageSplitTool />);
    await selectFile(imageFile());

    await act(async () => {
      fireEvent.click(screen.getAllByText("2分割")[0]);
    });
    expect(mockSplit).toHaveBeenLastCalledWith(expect.any(File), "vertical2");

    await act(async () => {
      fireEvent.click(screen.getAllByText("2分割")[1]);
    });
    expect(mockSplit).toHaveBeenLastCalledWith(expect.any(File), "horizontal2");
  });

  test("3分割を選ぶと縦3分割で切り直す", async () => {
    render(<ImageSplitTool />);
    await selectFile(imageFile());

    await act(async () => {
      fireEvent.click(screen.getAllByText("3分割")[0]);
    });

    expect(mockSplit).toHaveBeenLastCalledWith(expect.any(File), "vertical3");
  });

  test("画像を選ぶ前のモード切り替えは分割を走らせない", async () => {
    render(<ImageSplitTool />);

    await act(async () => {
      fireEvent.click(screen.getByText("2×2に4分割"));
    });

    expect(mockSplit).not.toHaveBeenCalled();
  });

  test("分割に失敗したらエラー文言を出してプレビューを消す", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockSplit.mockRejectedValueOnce(new Error("decode failed"));
    render(<ImageSplitTool />);

    await selectFile(imageFile());

    expect(
      screen.getByText(/この画像を読み込めませんでした/),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    errorSpy.mockRestore();
  });

  test("ドラッグ&ドロップでも分割が走る", async () => {
    render(<ImageSplitTool />);
    const dropZone = screen
      .getByText("画像を選ぶ / ドラッグ&ドロップ")
      .closest("label") as HTMLLabelElement;

    fireEvent.dragOver(dropZone);
    await act(async () => {
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [imageFile("dropped.png")] },
      });
    });

    expect(mockSplit).toHaveBeenCalledWith(expect.any(File), "vertical4");
    expect(screen.getAllByRole("img")).toHaveLength(4);
  });

  test("ドラッグが外れたらハイライトが戻る", () => {
    render(<ImageSplitTool />);
    const dropZone = screen
      .getByText("画像を選ぶ / ドラッグ&ドロップ")
      .closest("label") as HTMLLabelElement;

    fireEvent.dragOver(dropZone);
    expect(dropZone.className).toContain("border-pink-400");
    fireEvent.dragLeave(dropZone);
    expect(dropZone.className).not.toContain("border-pink-400");
  });
});

describe("PC(<a download> が保存の正本)", () => {
  beforeEach(() => setUserAgent(DESKTOP_UA));

  test("⭐canShare が true でも共有ボタンは出さない(既存の生成画像と同じ分け方)", async () => {
    render(<ImageSplitTool />);
    await selectFile(imageFile());

    expect(screen.queryByText(/まとめて保存・共有/)).not.toBeInTheDocument();
    expect(screen.getByText("4枚まとめて保存")).toBeInTheDocument();
    expect(navigator.share).not.toHaveBeenCalled();
  });

  test("まとめて保存は4枚を時間差で落とす(同時発火だと2枚目以降が落ちない)", async () => {
    jest.useFakeTimers();
    const { clicks, restore } = captureAnchorClicks();
    try {
      render(<ImageSplitTool />);
      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { files: [imageFile("photo.jpg")] } });
      });

      fireEvent.click(screen.getByText("4枚まとめて保存"));
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(clicks).toEqual([
        "photo_1.png",
        "photo_2.png",
        "photo_3.png",
        "photo_4.png",
      ]);
    } finally {
      restore();
      jest.useRealTimers();
    }
  });

  test("1枚ずつの保存はダウンロード(共有シートは開かない)", async () => {
    const { clicks, restore } = captureAnchorClicks();
    try {
      render(<ImageSplitTool />);
      await selectFile(imageFile("photo.jpg"));

      await act(async () => {
        fireEvent.click(screen.getAllByText("保存")[2]);
      });

      expect(clicks).toEqual(["photo_3.png"]);
      expect(navigator.share).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});

describe("モバイル(共有シートが保存の正本)", () => {
  beforeEach(() => setUserAgent(IPHONE_UA));

  test("⭐まとめてボタンは共有になり、連続ダウンロードのボタンは出ない", async () => {
    render(<ImageSplitTool />);
    await selectFile(imageFile());

    expect(screen.getByText("4枚をまとめて保存・共有")).toBeInTheDocument();
    /*
      iOS Safari は連続ダウンロードで前のダウンロードを潰す
      (「現在進行中のダウンロードは停止します」)。実機で発生した不具合。
    */
    expect(screen.queryByText("4枚まとめて保存")).not.toBeInTheDocument();
  });

  test("⭐「4枚の画像を保存」→ Xアプリ、の手順を案内する(直接Xへは行けない)", async () => {
    render(<ImageSplitTool />);
    await selectFile(imageFile());

    expect(screen.getByText("「4枚の画像を保存」")).toBeInTheDocument();
    expect(screen.getByText(/Xアプリの投稿画面で/)).toBeInTheDocument();
  });

  test("4枚の File を元ファイル名ベースの連番で navigator.share に渡す", async () => {
    render(<ImageSplitTool />);
    await selectFile(imageFile("fireworks.png"));

    await act(async () => {
      fireEvent.click(screen.getByText("4枚をまとめて保存・共有"));
    });

    const shared = (navigator.share as jest.Mock).mock.calls[0][0] as {
      files: File[];
    };
    expect(shared.files).toHaveLength(4);
    expect(shared.files.map((f) => f.name)).toEqual([
      "fireworks_1.png",
      "fireworks_2.png",
      "fireworks_3.png",
      "fireworks_4.png",
    ]);
  });

  test("⭐共有シートを閉じただけ(AbortError)ではエラーを出さない", async () => {
    (navigator.share as jest.Mock).mockRejectedValueOnce(
      new DOMException("cancelled", "AbortError"),
    );
    render(<ImageSplitTool />);
    await selectFile(imageFile());

    await act(async () => {
      fireEvent.click(screen.getByText("4枚をまとめて保存・共有"));
    });

    expect(screen.queryByText(/まとめて保存に失敗しました/)).not.toBeInTheDocument();
  });

  test("共有の失敗(AbortError以外)は1枚ずつの保存へ誘導する", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    (navigator.share as jest.Mock).mockRejectedValueOnce(
      new DOMException("denied", "NotAllowedError"),
    );
    render(<ImageSplitTool />);
    await selectFile(imageFile());

    await act(async () => {
      fireEvent.click(screen.getByText("4枚をまとめて保存・共有"));
    });

    expect(
      screen.getByText(/1枚ずつ保存してください/),
    ).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  test("⭐1枚ずつの保存も共有シート(写真に保存できる。ファイルには落とさない)", async () => {
    const { clicks, restore } = captureAnchorClicks();
    try {
      render(<ImageSplitTool />);
      await selectFile(imageFile("photo.jpg"));

      await act(async () => {
        fireEvent.click(screen.getAllByText("保存")[0]);
      });

      const shared = (navigator.share as jest.Mock).mock.calls[0][0] as {
        files: File[];
      };
      expect(shared.files.map((f) => f.name)).toEqual(["photo_1.png"]);
      expect(clicks).toEqual([]);
    } finally {
      restore();
    }
  });

  test("1枚ずつの保存で共有が失敗したらダウンロードへフォールバック", async () => {
    (navigator.share as jest.Mock).mockRejectedValueOnce(
      new DOMException("denied", "NotAllowedError"),
    );
    const { clicks, restore } = captureAnchorClicks();
    try {
      render(<ImageSplitTool />);
      await selectFile(imageFile("photo.jpg"));

      await act(async () => {
        fireEvent.click(screen.getAllByText("保存")[0]);
      });

      expect(clicks).toEqual(["photo_1.png"]);
    } finally {
      restore();
    }
  });

  test("⭐canShare が無い環境ではまとめてボタン自体を出さない(連続DLはiOSが潰す)", async () => {
    Object.assign(navigator, { canShare: undefined, share: undefined });
    render(<ImageSplitTool />);
    await selectFile(imageFile());

    expect(screen.queryByText("4枚をまとめて保存・共有")).not.toBeInTheDocument();
    expect(screen.queryByText("4枚まとめて保存")).not.toBeInTheDocument();
    // 1枚ずつの保存(単発DL)は生きている
    expect(screen.getAllByText("保存")).toHaveLength(4);
  });
});

/**
 * 枚数に追従する文言。
 *
 * 2/3分割を足したとき、「4枚」と焼き込んだ文言が残っていると嘘になる。
 * とくに **X のタイムラインで 2×2 に畳まれるのは4枚のときだけ**なので、
 * 2枚・3枚でその案内を出してはいけない。
 */
describe("枚数に追従する文言", () => {
  test("PC: まとめて保存のボタンが実際の枚数を出す", async () => {
    setUserAgent(DESKTOP_UA);
    mockSplit.mockResolvedValue(makePieces(2));
    render(<ImageSplitTool />);

    await selectFile(imageFile());

    expect(screen.getByText("2枚まとめて保存")).toBeInTheDocument();
    expect(screen.queryByText("4枚まとめて保存")).not.toBeInTheDocument();
  });

  test("モバイル: 共有ボタンと共有シートの案内が実際の枚数を出す", async () => {
    setUserAgent(IPHONE_UA);
    mockSplit.mockResolvedValue(makePieces(3));
    render(<ImageSplitTool />);

    await selectFile(imageFile());

    expect(screen.getByText("3枚をまとめて保存・共有")).toBeInTheDocument();
    expect(screen.getByText("「3枚の画像を保存」")).toBeInTheDocument();
  });

  test("⭐4枚のときだけ 2×2 に並ぶ案内を出す(PC)", async () => {
    setUserAgent(DESKTOP_UA);
    mockSplit.mockResolvedValue(makePieces(4));
    const { unmount } = render(<ImageSplitTool />);
    await selectFile(imageFile());
    expect(screen.getByText(/タイムラインでは2×2に並び/)).toBeInTheDocument();
    unmount();

    mockSplit.mockResolvedValue(makePieces(3));
    render(<ImageSplitTool />);
    await selectFile(imageFile());
    // 3枚は 2×2 にならないので、この案内は出さない
    expect(screen.queryByText(/タイムラインでは2×2に並び/)).not.toBeInTheDocument();
    expect(screen.getByText(/1枚目から順に選んで投稿/)).toBeInTheDocument();
  });

  test("⭐4枚のときだけ 2×2 に並ぶ案内を出す(モバイル)", async () => {
    setUserAgent(IPHONE_UA);
    mockSplit.mockResolvedValue(makePieces(2));
    render(<ImageSplitTool />);

    await selectFile(imageFile());

    expect(screen.queryByText(/2×2に並び/)).not.toBeInTheDocument();
  });

  test("プレビューの列数は縦分割の枚数に追従する", async () => {
    setUserAgent(DESKTOP_UA);
    mockSplit.mockResolvedValue(makePieces(3));
    const { container } = render(<ImageSplitTool />);
    await selectFile(imageFile());

    await act(async () => {
      fireEvent.click(screen.getAllByText("3分割")[0]);
    });

    // grid-cols-3 は静的なクラス表から引く(動的組み立てだと Tailwind が拾わない)
    expect(container.querySelector(".grid-cols-3")).not.toBeNull();
  });
});
