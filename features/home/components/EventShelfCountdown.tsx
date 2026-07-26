"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  deriveEventShelfCountdown,
  MS_PER_SECOND,
} from "@/features/home/lib/event-shelf-countdown";

interface EventShelfCountdownProps {
  /** 企画の終了日時(ISO)。null なら何も表示しない。 */
  endsAt: string | null;
  /** サーバーで解決したリクエスト時刻(ISO)。SSR/ハイドレーションの不一致を防ぐ初期値。 */
  nowIso: string;
}

/**
 * 企画棚のカウントダウンバッジ。
 *
 * - 残り 24 時間以上: 「あと{days}日」(グレー)
 * - 残り 24 時間未満: 「あと{hours}時間{minutes}分{seconds}秒」(赤・緊急表示)で、
 *   1 秒ごとに自動更新する。更新は「秒の境界」ちょうどにスケジュールするため、
 *   企画終了時刻にはぴったり「あと0秒」になり、その 1 秒後に消える
 * - 終了後は何も表示しない(棚自体は次のサーバー再検証で消える)
 *
 * 初期表示はサーバー時刻(nowIso)で描画してハイドレーション不一致を避け、
 * マウント後にクライアント時計へ同期する。
 */
export function EventShelfCountdown({
  endsAt,
  nowIso,
}: EventShelfCountdownProps) {
  const t = useTranslations("home");
  const [nowMs, setNowMs] = useState(() => Date.parse(nowIso));
  const endsAtMs = endsAt ? Date.parse(endsAt) : Number.NaN;

  useEffect(() => {
    if (Number.isNaN(endsAtMs)) {
      return;
    }
    let timer: number | null = null;
    const tick = () => {
      const current = Date.now();
      setNowMs(current);
      const msLeft = endsAtMs - current;
      // 終了から 1 秒以上過ぎたら更新を止める(バッジは既に非表示)。
      if (msLeft < -MS_PER_SECOND) {
        return;
      }
      // 次の「秒の境界」ちょうどに再計算する。残りが秒の倍数ぴったりの瞬間は
      // 1 秒後に予約する(0 だと同一時刻に連続発火してしまうため)。
      const delay =
        msLeft > 0 ? msLeft % MS_PER_SECOND || MS_PER_SECOND : MS_PER_SECOND;
      timer = window.setTimeout(tick, delay);
    };
    tick();
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [endsAtMs]);

  const countdown = deriveEventShelfCountdown(endsAt, nowMs);
  if (!countdown) {
    return null;
  }

  const urgent = countdown.type === "countdown";
  const label =
    countdown.type === "days"
      ? t("eventShelfCountdownDaysLeft", { days: countdown.days })
      : countdown.hours > 0
        ? t("eventShelfCountdownHoursMinutesSeconds", {
            hours: countdown.hours,
            minutes: countdown.minutes,
            seconds: countdown.seconds,
          })
        : countdown.minutes > 0
          ? t("eventShelfCountdownMinutesSeconds", {
              minutes: countdown.minutes,
              seconds: countdown.seconds,
            })
          : t("eventShelfCountdownSeconds", { seconds: countdown.seconds });

  return (
    <span
      className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
        urgent ? "bg-red-500 text-white" : "bg-gray-200 text-gray-600"
      }`}
    >
      {label}
    </span>
  );
}
