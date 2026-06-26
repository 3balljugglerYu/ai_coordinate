import Link from "next/link";
import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { isCreatorPromptSubmitterAllowed } from "@/lib/auth/creator-looks";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import {
  CreatorPromptSubmissionForm,
  type CreatorPromptCategoryBadge,
} from "@/features/creators/components/CreatorPromptSubmissionForm";
import { CreatorSubmitTopBar } from "@/features/creators/components/CreatorSubmitTopBar";
import { CreatorSubmitFlowGuide } from "@/features/creators/components/CreatorSubmitFlowGuide";
import { CREATOR_PROMPT_CATEGORY_KEYS } from "@/features/style-presets/lib/creator-submission";

export const metadata: Metadata = {
  title: "プロンプトを提供する | Persta.AI",
  description:
    "あなたのプロンプトを One-Tap Style に提供・申請します。掲載時は名前・アイコン付き、プロンプトは非公開で保護されます。",
};

/**
 * クリエイター提供プロンプトの申請ページ(Phase 1)。
 * ゲート: 認証必須 + isCreatorPromptSubmitterAllowed
 *   (admin は機能フラグ不問で常に許可 / 一般は CREATOR_LOOKS_ENABLED + allowlist)。
 * 許可外には申請フォームを出さず、案内を表示する(/api と DB RPC でも二重に検証される)。
 */
export default async function CreatorPromptSubmitPage() {
  const user = await requireAuth();
  const allowed = await isCreatorPromptSubmitterAllowed(user);

  // プレビュー(/style での見え方)を本物に寄せるため、申請者のアイコン/名前と
  // 各カテゴリのバッジ色をサーバ側で取得して渡す。
  let submitterAvatarUrl: string | null = null;
  let submitterNickname: string | null = null;
  const categoryBadges: Record<string, CreatorPromptCategoryBadge> = {};
  if (allowed) {
    const admin = createAdminClient();
    const [{ data: profile }, { data: categories }] = await Promise.all([
      admin
        .from("profiles")
        .select("nickname, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("preset_categories")
        .select("key, display_name_ja, badge_color, badge_text_color")
        .in("key", CREATOR_PROMPT_CATEGORY_KEYS as unknown as string[]),
    ]);
    submitterAvatarUrl = profile?.avatar_url ?? null;
    submitterNickname = profile?.nickname ?? null;
    for (const c of categories ?? []) {
      categoryBadges[c.key] = {
        label: c.display_name_ja,
        badgeColor: c.badge_color,
        badgeTextColor: c.badge_text_color,
      };
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <CreatorSubmitTopBar />
      <div className="px-4 pb-12 pt-6 md:pt-10">
        {allowed ? (
          <div className="mx-auto max-w-2xl space-y-6">
            <CreatorSubmitFlowGuide
              testImageUrl={env.INSPIRE_TEST_CHARACTER_IMAGE_URL || null}
            />
            <CreatorPromptSubmissionForm
              submitterAvatarUrl={submitterAvatarUrl}
              submitterNickname={submitterNickname}
              categoryBadges={categoryBadges}
            />
          </div>
        ) : (
          <div className="mx-auto max-w-xl rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center">
            <p className="text-2xl">✋</p>
            <h1 className="mt-2 text-xl font-bold text-amber-900">
              現在は招待制です
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-amber-800">
              プロンプトの提供は、招待されたクリエイターの方にお願いしています。
              掲載にご興味があれば、まずはお気軽にご相談ください。
            </p>
            <Link
              href="/creators"
              className="mt-6 inline-block rounded-full bg-amber-500 px-6 py-3 text-sm font-bold text-white hover:bg-amber-600"
            >
              募集ページを見る
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
