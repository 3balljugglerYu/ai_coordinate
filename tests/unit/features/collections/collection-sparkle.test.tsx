/**
 * `CollectionSparkle` のレンダリングテスト。
 * show による表示/非表示と、colors prop による色の反映を検証する。
 */

import { render } from "@testing-library/react";
import { CollectionSparkle } from "@/features/collections/components/CollectionSparkle";

describe("CollectionSparkle", () => {
  it("show=false のとき何も描画しない", () => {
    const { container } = render(<CollectionSparkle show={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("show=true のときスパークル(svg)を描画する", () => {
    const { container } = render(<CollectionSparkle show />);
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
  });

  it("colors を指定するとスパークルの色に反映される", () => {
    const { container } = render(
      <CollectionSparkle show colors={["rgb(255, 0, 0)"]} />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("style") ?? "").toContain("rgb(255, 0, 0)");
  });
});
