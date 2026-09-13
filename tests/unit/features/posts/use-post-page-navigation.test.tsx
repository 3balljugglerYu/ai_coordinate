import { act, renderHook } from "@testing-library/react";

import { usePostPageNavigation } from "@/features/posts/hooks/usePostPageNavigation";

/**
 * 投稿フォームへの遷移とその待ち状態。
 *
 * ⭐ ボタンは native の `disabled` にしない（フォーカスが body に落ちる）。
 * 代わりに `aria-disabled` を付けるが、それだけではクリックは止まらないので、
 * **このフック側で二重発火を弾く**必要がある。ここが外れると、連打で同じ遷移が
 * 何度も走る。
 */
const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("usePostPageNavigation", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("投稿フォームの専用ページへ遷移する", () => {
    const { result } = renderHook(() => usePostPageNavigation());

    act(() => {
      result.current.openPostPage("image-1");
    });

    expect(push).toHaveBeenCalledWith("/posts/new/image-1");
  });

  it("押す前は待ち状態ではない", () => {
    const { result } = renderHook(() => usePostPageNavigation());

    expect(result.current.isNavigating).toBe(false);
  });

  it("遷移中の二重押しは弾く", () => {
    const { result } = renderHook(() => usePostPageNavigation());

    // startTransition の中で push が走るので、同一 act 内の連打を再現する
    act(() => {
      result.current.openPostPage("image-1");
      result.current.openPostPage("image-1");
      result.current.openPostPage("image-1");
    });

    expect(push).toHaveBeenCalledTimes(1);
  });
});
