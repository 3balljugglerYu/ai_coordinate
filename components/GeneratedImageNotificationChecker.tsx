"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/use-toast";
import { stripLocalePrefix } from "@/i18n/config";
import {
  COORDINATE_GENERATED_LIST_HASH,
  COORDINATE_GENERATED_LIST_ID,
} from "@/features/generation/components/CoordinateGeneratedListHashScroll";
import { getCurrentSession } from "@/features/auth/lib/auth-client";
import {
  getGeneratedImages,
  listCoordinateImagesCreatedAfter,
} from "@/features/generation/lib/database";
import {
  fetchCoordinateToastAckAt,
  setCoordinateToastAckAt,
} from "@/features/generation/lib/coordinate-toast-ack";

const COORDINATE_PATH = "/coordinate";

const COORDINATE_TOAST_DURATION_MS = 5000;
/** 初期シード・新規検知の両方で十分な上限（バースト生成時の取りこぼし防止） */
const COORDINATE_TOAST_QUERY_LIMIT = 50;

function isCoordinatePath(pathname: string | null | undefined) {
  return stripLocalePrefix(pathname ?? "/").pathname === COORDINATE_PATH;
}

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
 *
 * ⭐ ユーザーは手元のセッションから取り、画面が裏にある間は確かめない。
 * 以前は10秒ごとに getUser(Supabase への通信)を呼び、裏のタブでも続けていた。
 * supabase-js 2.90 の getUser は通信の間ずっと認証のロックを握るため、裏に回った
 * タブがその途中で止まると、他のタブのログイン確認まで止まった(2026-09-27)。
 */
export function GeneratedImageNotificationChecker() {
  const { toast } = useToast();
  const t = useTranslations("notifications");
  const router = useRouter();
  const pathname = usePathname();
  const toastRef = useRef(toast);
  const tRef = useRef(t);
  const routerRef = useRef(router);
  const pathnameRef = useRef(pathname);
  toastRef.current = toast;
  tRef.current = t;
  routerRef.current = router;
  pathnameRef.current = pathname;

  const isCheckingRef = useRef(false);

  // 翻訳・toast は ref で常に最新を参照。依存を空にしてポーリングの張り直しを防ぐ（Vercel: refs for stable subscriptions）。
  useEffect(() => {
    const checkNewImages = async () => {
      if (isCheckingRef.current) {
        return;
      }
      isCheckingRef.current = true;

      try {
        const session = await getCurrentSession();
        const userId = session?.user?.id;
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
        const openGeneratedList = () => {
          if (isCoordinatePath(pathnameRef.current)) {
            document
              .getElementById(COORDINATE_GENERATED_LIST_ID)
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          } else {
            routerRef.current.push(
              `${COORDINATE_PATH}${COORDINATE_GENERATED_LIST_HASH}`
            );
          }
        };
        const { dismiss } = toastRef.current({
          title: tr("generatedImageReadyTitle"),
          description:
            pending.length === 1
              ? tr("generatedImageReadySingle")
              : tr("generatedImageReadyMultiple", { count: pending.length }),
          duration: COORDINATE_TOAST_DURATION_MS,
          className: "cursor-pointer pr-6",
          showCloseButton: false,
          role: "button",
          tabIndex: 0,
          onClick: () => {
            openGeneratedList();
            dismiss();
          },
          onKeyDown: (event) => {
            if (event.key !== "Enter" && event.key !== " ") {
              return;
            }
            event.preventDefault();
            openGeneratedList();
            dismiss();
          },
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

    // 表に出ているときだけ確かめる。裏から戻ったらすぐ1回確かめる
    const checkIfVisible = () => {
      if (document.visibilityState === "visible") {
        void checkNewImages();
      }
    };

    checkIfVisible();
    const intervalId = setInterval(checkIfVisible, 10000);
    document.addEventListener("visibilitychange", checkIfVisible);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", checkIfVisible);
    };
  }, []);

  return null;
}
