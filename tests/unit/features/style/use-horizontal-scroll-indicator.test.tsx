/** @jest-environment jsdom */

import { render } from "@testing-library/react";
import { useHorizontalScrollIndicator } from "@/features/style/hooks/useHorizontalScrollIndicator";

/** はみ出しの有無を差し替えるため、scrollWidth / clientWidth を固定する。 */
function stubWidths(scrollWidth: number, clientWidth: number) {
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get: () => scrollWidth,
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => clientWidth,
  });
}

function Harness({ collapseWhenFits }: { collapseWhenFits?: boolean }) {
  const { setScrollEl, trackRef, thumbRef } = useHorizontalScrollIndicator({
    collapseWhenFits,
  });
  return (
    <div>
      <div ref={setScrollEl} />
      <div
        ref={trackRef}
        data-testid="track"
        style={{ visibility: "hidden" }}
      >
        <div ref={thumbRef} />
      </div>
    </div>
  );
}

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe("useHorizontalScrollIndicator", () => {
  test("既定: はみ出しが無いときは隠すが、高さは確保したまま", () => {
    stubWidths(300, 300);
    const { getByTestId } = render(<Harness />);
    const track = getByTestId("track");
    expect(track.style.visibility).toBe("hidden");
    expect(track.style.display).toBe("");
  });

  test("collapseWhenFits: はみ出しが無いときは場所ごと消す", () => {
    stubWidths(300, 300);
    const { getByTestId } = render(<Harness collapseWhenFits />);
    expect(getByTestId("track").style.display).toBe("none");
  });

  test("collapseWhenFits: はみ出しがあれば表示する", () => {
    stubWidths(600, 300);
    const { getByTestId } = render(<Harness collapseWhenFits />);
    const track = getByTestId("track");
    expect(track.style.display).toBe("");
    expect(track.style.visibility).toBe("visible");
  });
});
