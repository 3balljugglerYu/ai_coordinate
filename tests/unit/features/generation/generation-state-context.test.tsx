import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  GenerationStateProvider,
  useGenerationState,
} from "@/features/generation/context/GenerationStateContext";

function wrapper({ children }: { children: ReactNode }) {
  return <GenerationStateProvider>{children}</GenerationStateProvider>;
}

function getContext() {
  const hook = renderHook(() => useGenerationState(), { wrapper });
  const ctx = hook.result.current;

  if (!ctx) {
    throw new Error("GenerationStateProvider did not provide context");
  }

  return { ...hook, ctx };
}

describe("GenerationStateContext", () => {
  test("result URL から upload 由来の pending batch を消費できる", () => {
    const { ctx } = getContext();
    const file = new File(["source"], "source.png", { type: "image/png" });

    act(() => {
      ctx.registerPendingSourceImage(["job-a", "job-b"], file);
      ctx.bindPendingSourceImageResult("job-a", "https://example.test/a.png");
    });

    const batch = ctx.consumePendingSourceImageBatchByResultUrl(
      "https://example.test/a.png"
    );

    expect(batch?.file).toBe(file);
    expect(batch?.jobIds).toEqual(["job-a", "job-b"]);
    expect(ctx.consumePendingSourceImageBatch("job-b")).toBeNull();
  });

  test("provider remount 後も同一タブ内なら result URL から pending batch を消費できる", () => {
    const first = getContext();
    const file = new File(["source"], "source.png", { type: "image/png" });

    act(() => {
      first.ctx.registerPendingSourceImage(["job-remount"], file);
      first.ctx.bindPendingSourceImageResult(
        "job-remount",
        "https://example.test/remount.png"
      );
    });
    first.unmount();

    const second = getContext();
    const batch = second.ctx.consumePendingSourceImageBatchByResultUrl(
      "https://example.test/remount.png"
    );

    expect(batch?.file).toBe(file);
    expect(batch?.jobIds).toEqual(["job-remount"]);
  });
});
