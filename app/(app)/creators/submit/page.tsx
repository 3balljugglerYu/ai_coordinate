import Link from "next/link";
import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { isCreatorLooksEnabledForUser } from "@/lib/auth/creator-looks";
import { CreatorPromptSubmissionForm } from "@/features/creators/components/CreatorPromptSubmissionForm";

export const metadata: Metadata = {
  title: "プロンプトを提供する | Persta.AI",
  description:
    "あなたのプロンプトを One-Tap Style に提供・申請します。掲載時は名前・アイコン付き、プロンプトは非公開で保護されます。",
};

/**
 * クリエイター提供プロンプトの申請ページ(Phase 1)。
 * ゲート: 認証必須 + 招待制(isCreatorLooksEnabledForUser = admin もしくは allowlist)。
 * 招待外には申請フォームを出さず、案内を表示する(/api と DB RPC でも二重に検証される)。
 */
export default async function CreatorPromptSubmitPage() {
  const user = await requireAuth();
  const allowed = await isCreatorLooksEnabledForUser(user);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 pb-12 pt-6 md:pt-10">
        {allowed ? (
          <CreatorPromptSubmissionForm />
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
