"use client";

import { useSyncExternalStore } from "react";
import { useLocale } from "next-intl";
import { isHalloweenBestShotOpen } from "../halloween-best-shot";

/** 期間は時刻で変わるだけなので、知らせる相手はいない */
function subscribeNothing(): () => void {
  return () => {};
}

function getIsOpenSnapshot(): boolean {
  return isHalloweenBestShotOpen(Date.now());
}

function getServerIsOpenSnapshot(): boolean {
  return false;
}

/**
 * ハロウィン企画の期間中で、日本語の画面か(企画は日本国内向けで、企画ページも日本語だけ)。
 * みんなのカタログの「🎃 #うちの子のベストショット」のタブを出すかに使う(2026-10-16 ユーザー指示)。
 *
 * 期間はブラウザの時刻で見る。サーバーで描いた HTML と食い違わないよう、
 * useSyncExternalStore のサーバー用の値(期間外)から始める。
 */
export function useHalloweenCampaignOpen(): boolean {
  const locale = useLocale();
  const isOpen = useSyncExternalStore(subscribeNothing, getIsOpenSnapshot, getServerIsOpenSnapshot);
  return isOpen && locale === "ja";
}
