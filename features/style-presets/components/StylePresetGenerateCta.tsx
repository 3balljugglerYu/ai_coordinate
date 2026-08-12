"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LogIn, Lock, Wand2 } from "lucide-react";
import type { PresetUnlockState } from "@/features/collections/lib/resolve-preset-unlock-state";

interface StylePresetGenerateCtaProps {
  presetId: string;
  /** 生成画面への遷移先（ロケール付き）。 */
  href: string;
  label: string;
  /**
   * このスタイルのカテゴリが段階解放かどうか（サーバー側で判定済み）。
   * false のときは問い合わせ自体を行わない。
   */
  isGatedCategory: boolean;
}

/**
 * `/styles/[slug]` の「このスタイルで作る」ボタン。
 *
 * このページは SEO 用の公開ページで、全員が同じキャッシュを共有するため
 * 閲覧者の解放状態を知らない。そのため未開放でもボタンが押せてしまい、
 * `/style` へ飛んだ先で黙って別のスタイルに差し替わっていた
 * （押した人には「押し間違えた？」としか見えない）。
 *
 * 押す前に伝えるため、**段階解放のカテゴリのときだけ**解放状態を1回問い合わせる。
 * ゲートの無いカテゴリ（大多数）では通信を増やさない。
 *
 * 判定できないとき（未ログイン・取得失敗）は従来どおり押せるままにする。
 * 誤って「開放されていません」と止めるより、進ませて生成側の判定に委ねる方が
 * 害が小さい。
 */
export function StylePresetGenerateCta({
  presetId,
  href,
  label,
  isGatedCategory,
}: StylePresetGenerateCtaProps) {
  const t = useTranslations("style");
  const [unlockState, setUnlockState] = useState<PresetUnlockState | null>(null);

  useEffect(() => {
    if (!isGatedCategory) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/style-presets/${encodeURIComponent(presetId)}/unlock-status`
        );
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as PresetUnlockState;
        if (!cancelled) {
          setUnlockState(data);
        }
      } catch (error) {
        // 判定できないときは押せるままにする
        console.error("Failed to fetch preset unlock status:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isGatedCategory, presetId]);

  /*
    未ログイン。ゲストは解放状態を持たないので「まだ開放されていません」ではなく
    「ログインすると使えます」と伝える。黙って生成画面へ飛ばすと、目的のスタイルが
    選ばれないまま何の案内も無く終わってしまう。
  */
  if (unlockState?.status === "login_required") {
    return (
      <div className="space-y-2" data-testid="style-preset-cta-login-required">
        <Link
          href={`/login?redirect=${encodeURIComponent(href)}`}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
        >
          <LogIn className="h-4 w-4" aria-hidden />
          {t("presetLoginRequiredAction")}
        </Link>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("presetLoginRequiredDescription")}
        </p>
      </div>
    );
  }

  if (unlockState?.status === "locked") {
    return (
      <div className="space-y-2" data-testid="style-preset-cta-locked">
        <span className="inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-gray-200 px-6 py-3 text-sm font-bold text-gray-500">
          <Lock className="h-4 w-4" aria-hidden />
          {t("presetLockedLabel")}
        </span>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {unlockState.reason === "prerequisite"
            ? t("presetLockedPrerequisiteDescription")
            : t("presetLockedSequentialDescription")}
        </p>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
      data-testid="style-preset-cta"
    >
      <Wand2 className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  );
}
