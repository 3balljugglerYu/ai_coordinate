/** @jest-environment node */

/**
 * 最終失敗ジョブの課金後処理のテスト。
 *
 * Worker は「failed へ更新 → 返金/release → pgmq_delete」の順で処理する。
 * この途中でクラッシュすると、再配送側が終端判定でメッセージを削除してしまい、
 * 未実施の返金が永久に実行されない。ユーザーのペルコインが減算されたまま
 * 確定してしまう。
 *
 * 戻り値が「ack してよいか」を表すことがこの関数の契約なので、レビューで
 * 指摘された3ケースを固定する。
 *   1. failed 更新後・返金前にクラッシュ（= 再配送で再実行される）
 *   2. 返金RPCが一度失敗（= ack せずメッセージを残す）
 *   3. 返金済み failed の再配送（= 冪等に通り ack できる）
 */

import { settleFailedJobBilling } from "@/supabase/functions/image-gen-worker/failed-job-billing";

function baseParams(
  overrides: Partial<Parameters<typeof settleFailedJobBilling>[0]> = {}
) {
  return {
    jobId: "job-1",
    isFreeOneTapStyleJob: false,
    reservedAttemptId: null,
    errorMessage: "Unknown error",
    releaseFreeAttempt: jest.fn().mockResolvedValue(undefined),
    refundPercoins: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("有料ジョブの返金", () => {
  it("返金が成功すれば ack してよい", async () => {
    const params = baseParams();

    const settled = await settleFailedJobBilling(params);

    expect(settled).toBe(true);
    expect(params.refundPercoins).toHaveBeenCalledTimes(1);
  });

  it("返金が失敗したら ack してはならない", async () => {
    // ケース2: 返金RPCが一度失敗。メッセージを残して次の配送で再試行する。
    // ここで true を返すと、減算されたまま確定してしまう。
    const params = baseParams({
      refundPercoins: jest.fn().mockRejectedValue(new Error("rpc down")),
    });

    const settled = await settleFailedJobBilling(params);

    expect(settled).toBe(false);
  });

  it("再配送で呼び直せば ack できる（冪等な reconciliation）", async () => {
    // ケース1と3: 返金前にクラッシュした場合も、返金済みの再配送も、
    // refund_percoins が冪等なので同じ呼び方で収束する。
    const refundPercoins = jest
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(undefined);
    const params = baseParams({ refundPercoins });

    const first = await settleFailedJobBilling(params);
    const second = await settleFailedJobBilling(params);

    expect(first).toBe(false);
    expect(second).toBe(true);
    expect(refundPercoins).toHaveBeenCalledTimes(2);
  });

  it("無料枠ジョブでなければ release を呼ばない", async () => {
    const params = baseParams();

    await settleFailedJobBilling(params);

    expect(params.releaseFreeAttempt).not.toHaveBeenCalled();
  });
});

describe("無料枠 One-Tap Style ジョブの release", () => {
  it("予約があれば release して ack してよい", async () => {
    const params = baseParams({
      isFreeOneTapStyleJob: true,
      reservedAttemptId: "attempt-1",
    });

    const settled = await settleFailedJobBilling(params);

    expect(settled).toBe(true);
    expect(params.releaseFreeAttempt).toHaveBeenCalledWith(
      "attempt-1",
      "worker_failed"
    );
    expect(params.refundPercoins).not.toHaveBeenCalled();
  });

  it("画像が生成されなかった場合は理由を分けて release する", async () => {
    const params = baseParams({
      isFreeOneTapStyleJob: true,
      reservedAttemptId: "attempt-1",
      errorMessage: "No images generated",
    });

    await settleFailedJobBilling(params);

    expect(params.releaseFreeAttempt).toHaveBeenCalledWith(
      "attempt-1",
      "no_image_generated"
    );
  });

  it("release が失敗したら ack してはならない", async () => {
    const params = baseParams({
      isFreeOneTapStyleJob: true,
      reservedAttemptId: "attempt-1",
      releaseFreeAttempt: jest.fn().mockRejectedValue(new Error("rpc down")),
    });

    const settled = await settleFailedJobBilling(params);

    expect(settled).toBe(false);
  });

  it("安全性ブロックでは枠を返さないが ack してよい", async () => {
    // 安全性ブロックは枠を消費させる仕様。返すものが無いので完了扱い。
    const params = baseParams({
      isFreeOneTapStyleJob: true,
      reservedAttemptId: "attempt-1",
      errorMessage: "SAFETY_POLICY_BLOCKED",
    });

    const settled = await settleFailedJobBilling(params);

    expect(settled).toBe(true);
    expect(params.releaseFreeAttempt).not.toHaveBeenCalled();
  });

  it("予約が無ければ何もせず ack してよい", async () => {
    const params = baseParams({
      isFreeOneTapStyleJob: true,
      reservedAttemptId: null,
    });

    const settled = await settleFailedJobBilling(params);

    expect(settled).toBe(true);
    expect(params.releaseFreeAttempt).not.toHaveBeenCalled();
    expect(params.refundPercoins).not.toHaveBeenCalled();
  });
});
