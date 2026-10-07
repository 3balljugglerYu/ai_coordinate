import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { isAdminViewer } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getUserProfileServer } from "@/features/my-page/lib/server-api";
import { getPublishedStylePreset } from "@/features/style-presets/lib/get-public-style-presets";
import { categoryNeedsUnlockContext } from "@/features/collections/lib/collection-unlock";
import { resolvePresetUnlockState } from "@/features/collections/lib/resolve-preset-unlock-state";
import { StyleGenerationScreen } from "@/features/style/components/StyleGenerationScreen";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * One-Tap Style の、スマホの生成画面。ボトムシート(StyleGenerationSheet)の代わり
 * (2026-10-07 ユーザー決定。キーボードでシートが上下し、名前の欄などが隠れたため)。
 * パソコンは今までどおりダイアログで開く。
 *
 * 開けるかの判定は、シートを開く側(useStylePresetGenerationSheet)と同じ:
 * - 未ログイン → ログインなしで生成できるカテゴリ(段階解放なし)だけ。ほかはログインへ
 * - 段階解放のカテゴリ → 開放済みのときだけ。ほかはスタイル紹介ページへ(理由はそのページが伝える)
 * 生成の受付も同じ判定で守っている。
 */
export default async function StyleGeneratePage({
  params,
}: {
  params: Promise<{ presetId: string }>;
}) {
  await connection();
  const { presetId } = await params;
  const user = await getUser();
  const isAdmin = isAdminViewer(user?.id ?? null);

  const preset = await getPublishedStylePreset(presetId, { includeAdminOnly: isAdmin });
  if (!preset) {
    notFound();
  }
  const needsUnlock = categoryNeedsUnlockContext(preset.category);

  if (!user) {
    if (preset.category.allowGuestGeneration && !needsUnlock) {
      return (
        <StyleGenerationScreen
          preset={preset}
          subscriptionPlan="free"
          canUseFreePose={false}
          isGuest
        />
      );
    }
    redirect(`/login?redirect=${encodeURIComponent(`/generate/style/${presetId}`)}`);
  }

  if (needsUnlock) {
    const supabase = await createClient();
    const unlockState = await resolvePresetUnlockState(presetId, user.id, supabase, {
      includeAdminOnly: isAdmin,
    });
    if (unlockState.status !== "unlocked") {
      redirect(`/styles/${encodeURIComponent(preset.slug)}`);
    }
  }

  const profile = await getUserProfileServer(user.id);
  return (
    <StyleGenerationScreen
      preset={preset}
      subscriptionPlan={profile?.subscription_plan ?? "free"}
      canUseFreePose={isAdmin}
      isGuest={false}
    />
  );
}
