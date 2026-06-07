/**
 * @jest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import {
  clearGuestGeneration,
  getGuestGeneration,
  setGuestGeneration,
  useGuestGeneration,
} from "@/features/wardrobe/lib/guest-generation-store";

afterEach(() => {
  clearGuestGeneration();
});

describe("guest-generation-store", () => {
  test("set / get / clear が動作する", () => {
    expect(getGuestGeneration()).toBeNull();
    setGuestGeneration({ imageBase64: "data:image/png;base64,abc", styleId: "s1" });
    expect(getGuestGeneration()).toEqual({
      imageBase64: "data:image/png;base64,abc",
      styleId: "s1",
    });
    clearGuestGeneration();
    expect(getGuestGeneration()).toBeNull();
  });

  test("useGuestGeneration は set/clear に反応する", () => {
    const { result } = renderHook(() => useGuestGeneration());
    expect(result.current).toBeNull();

    act(() => {
      setGuestGeneration({ imageBase64: "data:image/png;base64,xyz", styleId: null });
    });
    expect(result.current).toEqual({
      imageBase64: "data:image/png;base64,xyz",
      styleId: null,
    });

    act(() => {
      clearGuestGeneration();
    });
    expect(result.current).toBeNull();
  });
});
