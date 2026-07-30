/** @jest-environment node */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const workerSource = readFileSync(
  join(
    process.cwd(),
    "supabase/functions/image-gen-worker/index.ts",
  ),
  "utf8",
);

describe("Worker課金後処理のack契約", () => {
  it("stale-processing最終失敗も共通settlement成功後だけackする", () => {
    const staleSectionStart = workerSource.indexOf(
      "// 最終失敗確定時のみ返金または無料枠release。",
    );
    const staleSectionEnd = workerSource.indexOf(
      "// ステータスを'processing'に更新（排他制御）",
      staleSectionStart,
    );

    expect(staleSectionStart).toBeGreaterThanOrEqual(0);
    expect(staleSectionEnd).toBeGreaterThan(staleSectionStart);

    const staleSection = workerSource.slice(
      staleSectionStart,
      staleSectionEnd,
    );
    expect(staleSection).toContain(
      "settleFailedJobBillingWithSupabase",
    );
    expect(staleSection).toMatch(
      /if \(!staleSettled\) \{[\s\S]*?continue;[\s\S]*?pgmq_delete/,
    );
  });
});
