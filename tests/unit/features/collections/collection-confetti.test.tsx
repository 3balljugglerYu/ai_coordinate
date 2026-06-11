/**
 * `CollectionConfetti` のレンダリングテスト。
 * show による表示/非表示と、createPortal による body 直下への描画を検証する。
 */

import { render } from "@testing-library/react";
import { CollectionConfetti } from "@/features/collections/components/CollectionConfetti";

describe("CollectionConfetti", () => {
  it("show=false のとき何も描画しない", () => {
    const { container, baseElement } = render(
      <CollectionConfetti show={false} />,
    );
    expect(container.firstChild).toBeNull();
    expect(baseElement.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it("show=true のとき body(portal)に紙吹雪を描画する", () => {
    const { baseElement } = render(<CollectionConfetti show />);
    expect(baseElement.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(baseElement.querySelectorAll("span").length).toBeGreaterThan(0);
  });
});
