"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/use-toast";
import { getCurrentUserId } from "@/features/generation/lib/current-user";
import {
  getGeneratedImages,
  listCoordinateImagesCreatedAfter,
} from "@/features/generation/lib/database";
import {
  fetchCoordinateToastAckAt,
  setCoordinateToastAckAt,
} from "@/features/generation/lib/coordinate-toast-ack";

const COORDINATE_TOAST_DURATION_MS = 5000;
/** 初期シード・新規検知の両方で十分な上限（バースト生成時の取りこぼし防止） */
const COORDINATE_TOAST_QUERY_LIMIT = 50;

function maxIsoTimestamps(values: string[]): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const cur of values) {
    const ms = Date.parse(cur);
    if (Number.isFinite(ms) && ms >= bestMs) {
      bestMs = ms;
      best = cur;
    }
  }
  return best;
}

/**
 * 画像生成完了通知チェックコンポーネント
 * グローバルにマウントし、coordinate 生成の新規画像をトーストする。
 * 重複防止は profiles.last_coordinate_toast_ack_at（サーバー）で端末をまたいで共有する。
 */
export function GeneratedImageNotificationChecker() {
  const { toast } = useToast();
  const t = useTranslations("notifications");
  const toastRef = useRef(toast);
  const tRef = useRef(t);
  toastRef.current = toast;
  tRef.current = t;

  const isCheckingRef = useRef(false);

  // 翻訳・toast は ref で常に最新を参照。依存を空にしてポーリングの張り直しを防ぐ（Vercel: refs for stable subscriptions）。
  useEffect(() => {
    const checkNewImages = async () => {
      if (isCheckingRef.current) {
        return;
      }
      isCheckingRef.current = true;

      try {
        const userId = await getCurrentUserId();
        if (!userId) {
          return;
        }

        const ackAt = await fetchCoordinateToastAckAt(userId);

        if (!ackAt || !Number.isFinite(Date.parse(ackAt))) {
          const recentImages = await getGeneratedImages(
            userId,
            COORDINATE_TOAST_QUERY_LIMIT,
            0,
            "coordinate"
          );
          const createdList = recentImages
            .map((img) => img.created_at)
            .filter((v): v is string => typeof v === "string" && v.length > 0);
          const seed =
            maxIsoTimestamps(createdList) ?? new Date().toISOString();
          await setCoordinateToastAckAt(userId, seed);
          return;
        }

        const pending = await listCoordinateImagesCreatedAfter(
          userId,
          ackAt,
          COORDINATE_TOAST_QUERY_LIMIT
        );

        if (pending.length === 0) {
          return;
        }

        const pendingCreated = pending
          .map((img) => img.created_at)
          .filter((v): v is string => typeof v === "string" && v.length > 0);
        const nextAck =
          maxIsoTimestamps(pendingCreated) ?? new Date().toISOString();

        const tr = tRef.current;
        toastRef.current({
          title: tr("generatedImageReadyTitle"),
          description:
            pending.length === 1
              ? tr("generatedImageReadySingle")
              : tr("generatedImageReadyMultiple", { count: pending.length }),
          duration: COORDINATE_TOAST_DURATION_MS,
        });

        await setCoordinateToastAckAt(userId, nextAck);
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("[GeneratedImageNotificationChecker] Error:", error);
        }
      } finally {
        isCheckingRef.current = false;
      }
    };

    void checkNewImages();
    const intervalId = setInterval(() => {
      void checkNewImages();
    }, 10000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  return null;
}
