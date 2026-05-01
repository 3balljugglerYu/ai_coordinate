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

  test("getPendingSourceImageBatch は consume せずに batch を取得できる", () => {
    const { ctx } = getContext();
    const file = new File(["source"], "source.png", { type: "image/png" });

    act(() => {
      ctx.registerPendingSourceImage(["job-read-1", "job-read-2"], file);
    });

    const batch = ctx.getPendingSourceImageBatch("job-read-1");
    expect(batch?.file).toBe(file);
    expect(batch?.jobIds).toEqual(
      expect.arrayContaining(["job-read-1", "job-read-2"])
    );
    expect(batch?.promptShown).toBe(false);

    // read-only なので 2 度目の取得も同じ結果が得られる
    const batchAgain = ctx.getPendingSourceImageBatch("job-read-2");
    expect(batchAgain?.jobIds).toEqual(batch?.jobIds);
  });

  test("markSourceImageBatchPromptShown は同一 batch の全 entry を表示済みにする", () => {
    const { ctx } = getContext();
    const file = new File(["source"], "source.png", { type: "image/png" });

    act(() => {
      ctx.registerPendingSourceImage(["job-mark-1", "job-mark-2"], file);
      ctx.markSourceImageBatchPromptShown("job-mark-1");
    });

    expect(ctx.getPendingSourceImageBatch("job-mark-1")?.promptShown).toBe(true);
    expect(ctx.getPendingSourceImageBatch("job-mark-2")?.promptShown).toBe(true);
  });

  test("同一 File 参照で連続生成すると batch が共有され jobIds が蓄積される", () => {
    const { ctx } = getContext();
    const file = new File(["source"], "source.png", { type: "image/png" });

    act(() => {
      ctx.registerPendingSourceImage(["job-a"], file);
      ctx.registerPendingSourceImage(["job-b"], file);
    });

    const batch = ctx.getPendingSourceImageBatch("job-a");
    expect(batch?.jobIds).toEqual(
      expect.arrayContaining(["job-a", "job-b"])
    );
    expect(batch?.jobIds).toHaveLength(2);

    // 別 jobId 経由で取得しても同じ batch が返る
    const batchFromB = ctx.getPendingSourceImageBatch("job-b");
    expect(batchFromB?.jobIds).toEqual(
      expect.arrayContaining(["job-a", "job-b"])
    );
  });

  test("別の File 参照で生成すると独立した batch になる", () => {
    const { ctx } = getContext();
    const fileA = new File(["a"], "a.png", { type: "image/png" });
    const fileB = new File(["b"], "b.png", { type: "image/png" });

    act(() => {
      ctx.registerPendingSourceImage(["job-x"], fileA);
      ctx.registerPendingSourceImage(["job-y"], fileB);
    });

    const batchX = ctx.getPendingSourceImageBatch("job-x");
    const batchY = ctx.getPendingSourceImageBatch("job-y");

    expect(batchX?.file).toBe(fileA);
    expect(batchX?.jobIds).toEqual(["job-x"]);
    expect(batchY?.file).toBe(fileB);
    expect(batchY?.jobIds).toEqual(["job-y"]);
  });

  test("consumePendingSourceImageBatch は promptShown を含む batch を返す", () => {
    const { ctx } = getContext();
    const file = new File(["source"], "source.png", { type: "image/png" });

    act(() => {
      ctx.registerPendingSourceImage(["job-c"], file);
      ctx.markSourceImageBatchPromptShown("job-c");
    });

    const batch = ctx.consumePendingSourceImageBatch("job-c");
    expect(batch?.promptShown).toBe(true);
    // consume 後は batch が削除されている
    expect(ctx.getPendingSourceImageBatch("job-c")).toBeNull();
  });
});
