/** @jest-environment jsdom */

/**
 * 分割線のドラッグ操作。
 *
 * ここが誤ると「線を掴んだのに動かない」「指を離しても切り直されない」に
 * なるが、**どちらも画面上はそれらしく見えてしまう**ので気づきにくい。
 *
 * ⭐ とくに2つ。
 * 1. `setPointerCapture` を取ること。端の線は画像の縁にあるので、
 *    capture が無いと掴んだ瞬間にポインタが外れて動かせない。
 * 2. ドラッグ中は切り直さないこと(onCommit は指を離したときだけ)。
 *    1本動かすたびに画像を何枚もデコードすると指に追従しなくなる。
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { SplitBoundaryEditor } from "@/features/tools/components/SplitBoundaryEditor";
import { createEqualBoundaries } from "@/features/tools/lib/split-boundaries";

/** jsdom には無いので補う。呼ばれたことも検証する。 */
const setCapture = jest.fn();
const releaseCapture = jest.fn();

/*
  jsdom は PointerEvent を実装していない。無いままだと fireEvent が素の Event に
  倒し、**clientX も pointerId も届かない**(座標が NaN になる)。
  MouseEvent を土台にした最小の実装を足す。
*/
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}

beforeAll(() => {
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent =
    TestPointerEvent;
  Element.prototype.setPointerCapture = setCapture;
  Element.prototype.releasePointerCapture = releaseCapture;
});

beforeEach(() => {
  jest.clearAllMocks();
  // 表示領域を 400x200 に固定して、座標 → 比率の計算を検証できるようにする
  jest
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 200,
      right: 400,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function renderEditor(
  overrides: Partial<React.ComponentProps<typeof SplitBoundaryEditor>> = {}
) {
  const onChange = jest.fn();
  const onCommit = jest.fn();
  render(
    <SplitBoundaryEditor
      imageUrl="blob:test"
      axis="vertical"
      boundaries={createEqualBoundaries(4)}
      onChange={onChange}
      onCommit={onCommit}
      {...overrides}
    />
  );
  return { onChange, onCommit };
}

describe("SplitBoundaryEditor", () => {
  test("枚数ぶんの線を出す（内側3本 + 両端2本）", () => {
    renderEditor();

    expect(screen.getAllByRole("slider")).toHaveLength(5);
    expect(screen.getByTestId("split-boundary-edge-start")).toBeInTheDocument();
    expect(screen.getByTestId("split-boundary-edge-end")).toBeInTheDocument();
  });

  test("⭐掴んだらポインタを捕まえる（端の線が縁で外れないように）", () => {
    renderEditor();

    fireEvent.pointerDown(screen.getByTestId("split-boundary-edge-start"), {
      pointerId: 1,
    });

    expect(setCapture).toHaveBeenCalledWith(1);
  });

  test("横方向にドラッグすると位置が比率で伝わる", () => {
    const { onChange } = renderEditor();
    const handle = screen.getByTestId("split-boundary-divider-1");

    fireEvent.pointerDown(handle, { pointerId: 1 });
    // 幅400の 100px = 0.25
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 100, clientY: 0 });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ dividers: [0.25, 0.5, 0.75] })
    );
  });

  test("⭐ドラッグ中は切り直さない（onCommit を呼ばない）", () => {
    const { onChange, onCommit } = renderEditor();
    const handle = screen.getByTestId("split-boundary-divider-1");

    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 60, clientY: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 80, clientY: 0 });

    expect(onChange).toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  test("⭐指を離したときに切り直す", () => {
    const { onCommit } = renderEditor();
    const handle = screen.getByTestId("split-boundary-divider-1");

    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 60, clientY: 0 });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(releaseCapture).toHaveBeenCalledWith(1);
  });

  test("掴んでいない線は動かない（別の線のドラッグを拾わない）", () => {
    const { onChange } = renderEditor();

    // pointerDown せずに move だけ起こす
    fireEvent.pointerMove(screen.getByTestId("split-boundary-divider-2"), {
      pointerId: 1,
      clientX: 10,
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  test("横分割では縦方向の座標で計算する", () => {
    const { onChange } = renderEditor({
      axis: "horizontal",
      boundaries: createEqualBoundaries(2),
    });
    const handle = screen.getByTestId("split-boundary-divider-1");

    fireEvent.pointerDown(handle, { pointerId: 1 });
    // 高さ200の 50px = 0.25
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 0, clientY: 50 });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ dividers: [0.25] })
    );
  });

  test("キーボードでも動かせる（1回 1%）", () => {
    const { onChange, onCommit } = renderEditor({
      boundaries: createEqualBoundaries(2),
    });

    fireEvent.keyDown(screen.getByTestId("split-boundary-divider-1"), {
      key: "ArrowRight",
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ dividers: [0.51] })
    );
    // キー操作は1回で確定する
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  test("分割中(disabled)は掴めない", () => {
    const { onChange } = renderEditor({ disabled: true });
    const handle = screen.getByTestId("split-boundary-divider-1");

    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 100 });

    expect(setCapture).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("使う範囲の外を暗くして、捨てられる部分が分かるようにする", () => {
    const { container } = render(
      <SplitBoundaryEditor
        imageUrl="blob:test"
        axis="vertical"
        boundaries={{ start: 0.2, end: 0.8, dividers: [0.5] }}
        onChange={jest.fn()}
        onCommit={jest.fn()}
      />
    );

    const shades = container.querySelectorAll(".bg-slate-900\\/55");
    expect(shades).toHaveLength(2);
    expect((shades[0] as HTMLElement).style.width).toBe("20%");
    // 1 - 0.8 = 0.2 → 端数が出るので前方一致で見る
    expect((shades[1] as HTMLElement).style.width).toMatch(/^19\.99|^20/);
  });
});
