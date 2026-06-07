"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { useToast } from "@/components/ui/use-toast";
import { useCurrentUrlForRedirect } from "@/lib/build-current-url";
import { recordStyleUsageClientEvent } from "@/features/style/lib/style-usage-client";
import {
  claimPendingWardrobeSave,
  stashPendingWardrobeSave,
} from "@/features/wardrobe/lib/pending-wardrobe-save";
import {
  getGuestGeneration,
  useGuestGeneration,
} from "@/features/wardrobe/lib/guest-generation-store";
import type { AuthModalProps } from "@/features/auth/components/AuthModal";
import { WARDROBE_SIGNUP_SOURCE } from "@/features/auth/lib/signup-source";

/** ログイン後に「退避した画像を保存する」ことを示すクエリキー。 */
const CLAIM_QUERY_KEY = "claim_wardrobe";

/** currentUrl に claim フラグを付与する（既存クエリの有無で ? / & を切替）。 */
function appendClaimFlag(currentUrl: string): string {
  return currentUrl.includes("?")
    ? `${currentUrl}&${CLAIM_QUERY_KEY}=1`
    : `${currentUrl}?${CLAIM_QUERY_KEY}=1`;
}

/**
 * 保存導線の共通処理: 計測（wardrobe_save_click）+ 画像を localStorage へ退避。
 * 画像が無ければ false を返し何もしない。
 */
function trackAndStashWardrobeSave({
  imageBase64,
  styleId,
}: WardrobeSaveRequest): boolean {
  if (!imageBase64) return false;
  void recordStyleUsageClientEvent({
    eventType: "wardrobe_save_click",
    styleId: styleId ?? null,
  }).catch(() => {
    // 計測はブロッカーにしない
  });
  stashPendingWardrobeSave({
    imageBase64,
    styleId: styleId ?? null,
  });
  return true;
}

export interface WardrobeSaveRequest {
  /** 退避する生成画像（data URL）。null/undefined の場合は何もしない。 */
  imageBase64: string | null | undefined;
  /** 由来の style プリセット ID。/coordinate など概念が無い画面では null。 */
  styleId?: string | null;
}

export interface UseWardrobeSaveParams {
  /** 現在の認証状態。"authenticated" 以外（guest / null）はゲスト扱い。 */
  authState: "authenticated" | "guest" | null;
}

/** AuthModal に spread して使う、保存導線専用（signup 固定）の props。 */
export type WardrobeAuthModalProps = Pick<
  AuthModalProps,
  | "open"
  | "onClose"
  | "redirectTo"
  | "title"
  | "description"
  | "mode"
  | "hideModeSwitch"
  | "signupSource"
>;

export interface UseWardrobeSaveResult {
  /** ゲスト（保存導線を出すべき状態）かどうか。 */
  isGuest: boolean;
  /** 保存ボタン押下時に呼ぶ。計測 → 退避 → AuthModal を開く。 */
  requestSave: (request: WardrobeSaveRequest) => void;
  /** 保存導線専用の signup 固定 AuthModal に spread するための props。 */
  authModalProps: WardrobeAuthModalProps;
}

/**
 * ゲストが生成した画像を「アカウントへ保存（＝ログイン転換）」する導線の共通ロジック。
 *
 * 画面（/style, /coordinate, ...）に依存しないよう、以下をすべて内包する:
 * - 保存ボタン押下時の計測 + 画像退避 + signup 固定モーダルの開閉
 * - ログイン後 (?claim_wardrobe=1 で戻る) に退避画像を保存する副作用
 * - 保存導線専用 AuthModal に渡す props（signup 固定・切替リンク非表示）
 *
 * 文言は "style" 名前空間の wardrobe* キーを共通で使う。
 */
export function useWardrobeSave({
  authState,
}: UseWardrobeSaveParams): UseWardrobeSaveResult {
  const t = useTranslations("style");
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUrl = useCurrentUrlForRedirect();

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const claimHandledRef = useRef(false);

  const isGuest = authState !== "authenticated";

  const requestSave = useCallback((request: WardrobeSaveRequest) => {
    if (!trackAndStashWardrobeSave(request)) return;
    setIsAuthModalOpen(true);
  }, []);

  // ログイン後 (?claim_wardrobe=1 で戻る) に、退避した画像を保存する。
  useEffect(() => {
    if (claimHandledRef.current) return;
    if (searchParams?.get(CLAIM_QUERY_KEY) !== "1") return;
    if (authState !== "authenticated") return;
    claimHandledRef.current = true;
    void (async () => {
      const result = await claimPendingWardrobeSave();
      if (result.status === "saved") {
        toast({ title: t("wardrobeSaveSuccess") });
        router.push("/my-page");
        return;
      }
      if (result.status === "error") {
        toast({
          title:
            result.errorCode === "WARDROBE_CLAIM_ALREADY_CLAIMED"
              ? t("wardrobeSaveAlreadyClaimed")
              : t("wardrobeSaveError"),
        });
      }
      // none / error: claim フラグだけを URL から外して元の画面に留める
      const nextParams = new URLSearchParams(searchParams?.toString() ?? "");
      nextParams.delete(CLAIM_QUERY_KEY);
      const nextQuery = nextParams.toString();
      router.replace(`${pathname ?? "/"}${nextQuery ? `?${nextQuery}` : ""}`);
    })();
  }, [searchParams, authState, toast, t, router, pathname]);

  return {
    isGuest,
    requestSave,
    authModalProps: {
      open: isAuthModalOpen,
      onClose: () => setIsAuthModalOpen(false),
      redirectTo: appendClaimFlag(currentUrl),
      title: t("wardrobeSaveModalTitle"),
      description: t("wardrobeSaveModalDescription"),
      mode: "signup",
      hideModeSwitch: true,
      signupSource: WARDROBE_SIGNUP_SOURCE,
    },
  };
}

export interface UseWardrobeSaveTriggerResult {
  /** ストアにゲスト生成画像があるか（＝保存導線を出せる状態か）。 */
  hasGuestImage: boolean;
  /** 押下時にストアの画像を退避し、signup 固定モーダルを開く。 */
  trigger: () => void;
  /** 保存導線専用の signup 固定 AuthModal に spread するための props。 */
  authModalProps: WardrobeAuthModalProps;
}

/**
 * 生成結果 state を持たない外側のUI（試用バナー・サイドバーのログインボタン等）
 * から、ゲスト保存導線を発火させるための軽量フック。
 *
 * `useWardrobeSave` と異なり claim 副作用は持たない（claim は遷移先ページの
 * `useWardrobeSave` が一元処理する）。画像は共有ストアから取得する。
 */
export function useWardrobeSaveTrigger(): UseWardrobeSaveTriggerResult {
  const t = useTranslations("style");
  const guest = useGuestGeneration();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  // 静的レンダリング(PPR)を壊さないよう usePathname/useSearchParams は使わず、
  // redirectTo はクリック時に window.location から組み立てる。
  const [redirectTo, setRedirectTo] = useState("/");

  const trigger = useCallback(() => {
    const value = getGuestGeneration();
    if (!value) return;
    if (
      !trackAndStashWardrobeSave({
        imageBase64: value.imageBase64,
        styleId: value.styleId,
      })
    ) {
      return;
    }
    const location =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/";
    setRedirectTo(appendClaimFlag(location));
    setIsAuthModalOpen(true);
  }, []);

  return {
    hasGuestImage: guest !== null,
    trigger,
    authModalProps: {
      open: isAuthModalOpen,
      onClose: () => setIsAuthModalOpen(false),
      redirectTo,
      title: t("wardrobeSaveModalTitle"),
      description: t("wardrobeSaveModalDescription"),
      mode: "signup",
      hideModeSwitch: true,
      signupSource: WARDROBE_SIGNUP_SOURCE,
    },
  };
}
