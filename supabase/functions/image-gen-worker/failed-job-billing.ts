import { isSafetyPolicyBlockedErrorMessage } from "../../../shared/generation/errors.ts";

/**
 * 消費トランザクションに記録された額から返金額を復元する。
 *
 * reconciliation は失敗から時間が経って実行されることがあるため、現在の
 * モデル料金表から再計算してはならない。料金改定後に再計算値と
 * generation_percoin_allocations の合計がずれると、refund_percoins の
 * allocation total mismatch で永久に返金できなくなる。
 */
export function resolveRecordedPercoinRefundAmount(
  consumptionAmount: unknown,
): number {
  const numericAmount = Number(consumptionAmount);
  if (!Number.isSafeInteger(numericAmount) || numericAmount >= 0) {
    throw new Error("invalid recorded consumption amount");
  }

  return Math.abs(numericAmount);
}

/**
 * 最終失敗したジョブの課金後処理。
 *
 * Worker は「failed へ更新 → 返金/release → pgmq_delete」の順で処理する。
 * この途中でクラッシュすると、再配送側が終端判定でメッセージを削除してしまい、
 * 未実施の返金が永久に実行されない。ユーザーのペルコインが減算されたまま
 * 確定してしまう。
 *
 * そこで課金後処理をここへ集約し、初回失敗時と failed 再配送時の両方から
 * 呼ぶ。`refund_percoins` と release RPC はどちらも冪等なので、再配送を
 * reconciliation として使える。
 *
 * 副作用は呼び出し側から注入する。Worker 本体は Deno/JSR に依存しており
 * Jest から import できないため、判定と順序だけをこのモジュールへ隔離して
 * テスト可能にしている。
 */

export interface SettleFailedJobBillingParams {
  jobId: string;
  /** 無料枠の One-Tap Style ジョブか */
  isFreeOneTapStyleJob: boolean;
  /** 予約済みの無料枠 ID。無ければ null */
  reservedAttemptId: string | null;
  /** 失敗理由。安全性ブロックの判定に使う */
  errorMessage: string;
  /** 無料枠を返す副作用 */
  releaseFreeAttempt: (
    reservedAttemptId: string,
    releaseReason: "no_image_generated" | "worker_failed",
  ) => Promise<void>;
  /** ペルコインを返金する副作用（冪等） */
  refundPercoins: () => Promise<void>;
  /** ログ出力（テストでは差し替える） */
  logInfo?: (message: string) => void;
  logError?: (message: string, error: unknown) => void;
}

/**
 * 課金後処理を実行する。
 *
 * @returns 完了したか。**false のときメッセージを ack してはならない。**
 *          残しておけば次の配送で reconciliation として再実行される。
 */
export async function settleFailedJobBilling(
  params: SettleFailedJobBillingParams,
): Promise<boolean> {
  const {
    jobId,
    isFreeOneTapStyleJob,
    reservedAttemptId,
    errorMessage,
    releaseFreeAttempt,
    refundPercoins,
    logInfo = () => {},
    logError = () => {},
  } = params;

  if (isFreeOneTapStyleJob) {
    // 安全性ブロックは枠を消費させる仕様なので release しない。
    // 予約が無い場合も返すものが無いので完了扱いにする。
    if (
      reservedAttemptId === null ||
      isSafetyPolicyBlockedErrorMessage(errorMessage)
    ) {
      return true;
    }

    try {
      await releaseFreeAttempt(
        reservedAttemptId,
        errorMessage === "No images generated"
          ? "no_image_generated"
          : "worker_failed",
      );
      logInfo(`Released free style attempt for failed job ${jobId}`);
      return true;
    } catch (releaseError) {
      logError(
        `Failed to release free style attempt; leaving message for retry: ${jobId}`,
        releaseError,
      );
      return false;
    }
  }

  try {
    await refundPercoins();
    logInfo(`Refunded percoins for finally failed job ${jobId}`);
    return true;
  } catch (refundError) {
    logError(
      `Failed to refund percoins; leaving message for retry: ${jobId}`,
      refundError,
    );
    return false;
  }
}
