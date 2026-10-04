"use client";

import { useEffect, useRef } from "react";
import { getInProgressJobs } from "@/features/generation/lib/async-api";

/** 生成中のものがあるあいだ、状態を確かめる間隔 */
export const FINISHED_GENERATION_POLL_INTERVAL_MS = 3000;
/** 問い合わせが続けて失敗したら、見張りをやめる回数 */
const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * 生成中のものが終わったら知らせる（マイページを開いているあいだだけ）。
 *
 * - 開いたとき・タブに戻ったときに、生成中のものがあるかを1回だけ確かめる。
 *   無ければ何もしない（ほとんどの人はここで通信が増えない）
 * - あれば、無くなるまで数秒おきに確かめ、前回あったものが消えたら `onFinished` を呼ぶ。
 *   同時に複数生成していても、1回の問い合わせで全部を見る（件数で通信は増えない）
 * - 画面を離れたら止める。タブを裏に回しているあいだも問い合わせない
 *
 * バックグラウンドの進捗バー（GenerationProgressHost）は直近の1件しか追わず、
 * 公開前は運営だけなので、こちらでは使わない。
 */
export function useFinishedGenerationWatcher(onFinished: () => void) {
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let knownIds = new Set<string>();
    let failures = 0;

    const check = async () => {
      timer = null;
      // 見ていないあいだは問い合わせない。戻ったとき(visibilitychange)に続きから確かめる。
      // knownIds は残すので、見ていないあいだに終わったものも戻ったときに気づける
      if (document.visibilityState === "hidden") {
        running = false;
        return;
      }
      let jobs;
      try {
        jobs = await getInProgressJobs(false);
      } catch {
        if (cancelled) return;
        failures += 1;
        if (failures < MAX_CONSECUTIVE_FAILURES && knownIds.size > 0) {
          timer = setTimeout(check, FINISHED_GENERATION_POLL_INTERVAL_MS);
        } else {
          running = false;
        }
        return;
      }
      if (cancelled) return;
      failures = 0;
      const ids = new Set(jobs.map((job) => job.id));
      const someFinished = [...knownIds].some((id) => !ids.has(id));
      knownIds = ids;
      if (someFinished) onFinishedRef.current();
      if (ids.size > 0) {
        timer = setTimeout(check, FINISHED_GENERATION_POLL_INTERVAL_MS);
      } else {
        running = false;
      }
    };

    const start = () => {
      if (running || cancelled) return;
      running = true;
      void check();
    };

    start();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") start();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
}
