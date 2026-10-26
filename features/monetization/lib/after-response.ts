import "server-only";

import { after } from "next/server";

/**
 * 記録など、結果を待たなくてよい仕事を、応答を返したあとに回す。
 *
 * - 応答を記録のせいで遅らせない(DB が遅いときも、本来の返事はすぐ返る)。
 * - after() が使えない所(リクエストの外・テストなど)では、待たずにその場で始める。
 * - どちらの場合も、投げない(仕事の失敗は、仕事の側でログに残す)。
 */
export function runAfterResponse(task: () => Promise<unknown>): void {
  try {
    after(async () => {
      try {
        await task();
      } catch (error) {
        console.error("[after-response] task failed:", error);
      }
    });
  } catch {
    void task().catch((error) => console.error("[after-response] task failed:", error));
  }
}
