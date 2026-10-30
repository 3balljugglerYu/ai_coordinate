"use client";

import { useSyncExternalStore } from "react";
import { KIME_POSE, getKimePosePhase, type KimePosePhase } from "../kime-pose";

/** setTimeout で待てる最長(約24.8日)。これより先の切り替わりは、いったんここで起きて測り直す */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** 段階が切り替わる時刻(応募の始まり・応募の締め切り = 投票の始まり・投票の締め切り) */
const PHASE_BOUNDARIES_MS = [KIME_POSE.submitStartsAt, KIME_POSE.submitEndsAt, KIME_POSE.voteEndsAt].map(
  (iso) => Date.parse(iso),
);

/**
 * 次の切り替わりの時刻に知らせる。
 * ページを開いたまま 11/1 0:00 や 11/16 0:00 をまたいでも、読み直さずにお知らせと浮いたボタンが変わるように。
 */
function subscribePhase(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    const now = Date.now();
    const next = PHASE_BOUNDARIES_MS.find((boundary) => boundary > now);
    if (next === undefined) return;
    // 境目ちょうどに起きると、端末の時計の誤差で前の段階のまま読むことがあるので、少しだけあとに起きる
    timer = setTimeout(
      () => {
        onChange();
        schedule();
      },
      Math.min(next - now + 50, MAX_TIMEOUT_MS),
    );
  };
  schedule();
  return () => clearTimeout(timer);
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
  return useSyncExternalStore<KimePosePhase | null>(subscribePhase, getPhaseSnapshot, getServerPhaseSnapshot);
}
