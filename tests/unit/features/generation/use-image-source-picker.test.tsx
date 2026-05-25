/**
 * @jest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { useImageSourcePicker } from "@/features/generation/hooks/useImageSourcePicker";

describe("useImageSourcePicker", () => {
  test("既定タブは generated、open は false", () => {
    const { result } = renderHook(() => useImageSourcePicker());
    expect(result.current.open).toBe(false);
    expect(result.current.activeTab).toBe("generated");
  });

  test("defaultTab を渡すと初期タブを上書きできる", () => {
    const { result } = renderHook(() =>
      useImageSourcePicker({ defaultTab: "stock" }),
    );
    expect(result.current.activeTab).toBe("stock");
  });

  test("openPicker / closePicker で open がトグルする", () => {
    const { result } = renderHook(() => useImageSourcePicker());
    act(() => result.current.openPicker());
    expect(result.current.open).toBe(true);
    act(() => result.current.closePicker());
    expect(result.current.open).toBe(false);
  });

  test("setActiveTab は state を更新し onTabChange を呼ぶ", () => {
    const onTabChange = jest.fn();
    const { result } = renderHook(() =>
      useImageSourcePicker({ onTabChange }),
    );
    act(() => result.current.setActiveTab("stock"));
    expect(result.current.activeTab).toBe("stock");
    expect(onTabChange).toHaveBeenCalledWith("stock");
  });

  test("openPicker は現在の activeTab で onTabChange を発火する", () => {
    const onTabChange = jest.fn();
    const { result } = renderHook(() =>
      useImageSourcePicker({ defaultTab: "stock", onTabChange }),
    );
    act(() => result.current.openPicker());
    expect(onTabChange).toHaveBeenCalledWith("stock");
  });
});
