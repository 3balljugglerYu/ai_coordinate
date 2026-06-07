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

/** claim フラグだけを URL から取り除いた pathname + query を組み立てる。 */
function stripClaimFlag(
  pathname: string | null,
  search: string | null | undefined
): string {
  const nextParams = new URLSearchParams(search ?? "");
  nextParams.delete(CLAIM_QUERY_KEY);
  const query = nextParams.toString();
  return `${pathname ?? "/"}${query ? `?${query}` : ""}`;
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

/** ログイン後 claim の進行状態。オーバーレイ表示に使う。 */
export type WardrobeClaimStatus = "idle" | "claiming" | "saved";

export interface UseWardrobeSaveResult {
  /** ゲスト（保存導線を出すべき状態）かどうか。 */
  isGuest: boolean;
  /** 保存ボタン押下時に呼ぶ。計測 → 退避 → AuthModal を開く。 */
  requestSave: (request: WardrobeSaveRequest) => void;
  /** 保存導線専用の signup 固定 AuthModal に spread するための props。 */
  authModalProps: WardrobeAuthModalProps;
  /**
   * ログイン後 claim の状態。"claiming" 中はブロッキングオーバーレイ、
   * "saved" は「保存しました + マイページで見る」表示を出す（自動遷移しない）。
   */
  claimStatus: WardrobeClaimStatus;
  /** 「マイページで見る」押下時。/my-page へ遷移する。 */
  goToSavedImage: () => void;
  /** 保存完了表示を閉じてその場に留まる。 */
  dismissClaim: () => void;
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
  const hasClaimFlag = searchParams?.get(CLAIM_QUERY_KEY) === "1";
  // claim の結果のみ state で持ち、表示状態(claimStatus)は派生で求める。
  // (effect 内での同期 setState を避け、認証解決を待ってから claim するため)
  const [claimOutcome, setClaimOutcome] = useState<
    "pending" | "saved" | "resolved"
  >("pending");
  const claimHandledRef = useRef(false);

  const isGuest = authState !== "authenticated";

  // フラグ付きで戻ってきた瞬間からオーバーレイを出し、未ログイン用バナーの
  // 一瞬の表示(=誤タップ要因)を覆う。ゲスト確定時/閉じた後は出さない。
  const claimStatus: WardrobeClaimStatus =
    claimOutcome === "saved"
      ? "saved"
      : claimOutcome === "resolved"
        ? "idle"
        : hasClaimFlag && authState !== "guest"
          ? "claiming"
          : "idle";

  const requestSave = useCallback((request: WardrobeSaveRequest) => {
    if (!trackAndStashWardrobeSave(request)) return;
    setIsAuthModalOpen(true);
  }, []);

  const goToSavedImage = useCallback(() => {
    router.push("/my-page");
  }, [router]);

  const dismissClaim = useCallback(() => {
    setClaimOutcome("resolved");
  }, []);

  // ログイン後 (?claim_wardrobe=1 で戻る) に、退避した画像を保存する。
  // 自動でページ遷移はせず、claim 中はオーバーレイ・完了後は「保存しました」を
  // その場で表示する(保護ページへの自動遷移で再ログイン画面が挟まるのを防ぐ)。
  // 認証解決まで(guest/null)は待機し、cookie 反映待ちでも取りこぼさない。
  useEffect(() => {
    if (claimHandledRef.current) return;
    if (!hasClaimFlag) return;
    if (authState !== "authenticated") return;
    claimHandledRef.current = true;

    void (async () => {
      const result = await claimPendingWardrobeSave();
      if (result.status === "saved") {
        toast({ title: t("wardrobeSaveSuccess") });
        setClaimOutcome("saved");
      } else {
        setClaimOutcome("resolved");
        if (result.status === "error") {
          toast({
            title:
              result.errorCode === "WARDROBE_CLAIM_ALREADY_CLAIMED"
                ? t("wardrobeSaveAlreadyClaimed")
                : t("wardrobeSaveError"),
          });
        }
      }
      // 結果確定後にフラグを外す(リロードや戻る操作での二重実行を防ぐ)。
      router.replace(stripClaimFlag(pathname, searchParams?.toString()));
    })();
  }, [hasClaimFlag, searchParams, authState, toast, t, router, pathname]);

  return {
    isGuest,
    requestSave,
    claimStatus,
    goToSavedImage,
    dismissClaim,
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
