"use client";

import { useSyncExternalStore } from "react";
import { getKimePosePhase, type KimePosePhase } from "../kime-pose";

/** 段階は時刻で変わるだけなので、知らせる相手はいない */
function subscribeNothing(): () => void {
  return () => {};
}

function getPhaseSnapshot(): KimePosePhase {
  return getKimePosePhase(Date.now());
}

function getServerPhaseSnapshot(): null {
  return null;
}

/**
 * 決めポーズ企画のいまの段階(応募の前・応募期間・投票期間・締め切りのあと)。
 *
 * 段階はブラウザの時刻で見る。ページはサーバーで前もって描いておく(cacheComponents)ので、
 * 描くときに時刻を読まない。サーバーで描いた HTML と食い違わないよう、
 * useSyncExternalStore のサーバー用の値(null = まだ分からない)から始める。
 */
export function useKimePosePhase(): KimePosePhase | null {
  return useSyncExternalStore<KimePosePhase | null>(
    subscribeNothing,
    getPhaseSnapshot,
    getServerPhaseSnapshot,
  );
}
