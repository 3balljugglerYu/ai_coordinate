import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { CreatorLooksDetailClient } from "./CreatorLooksDetailClient";

/**
 * Creator Looks 投稿の詳細ページ (= /inspire/[templateId] で is_creator_looks=true 時)
 *
 * 設計判断: docs/planning/creator-looks-implementation-plan.md HG-002
 *   - **Server Component で帰属表示 + メタ情報を render** (= Client バンドル削減)
 *   - 子の Client Component は ImageUploader / 背景チェックボックス / Submit / GenerationFlow のみ
 *   - by クリエイター リンク (= /users/[userId]) は Server 側で next/link で生成
 *
 * モックアップ参照: docs/planning/mockups/creator-looks/03-detail-page.png
 */

interface CreatorLooksDetailSectionProps {
  templateId: string;
  templateImageUrl: string | null;
  title: string | null;
  submittedByUserId: string;
  submitterNickname: string | null;
  usageCount: number;
  subscriptionPlan: string;
}

export async function CreatorLooksDetailSection({
  templateId,
  templateImageUrl,
  title,
  submittedByUserId,
  submitterNickname,
  usageCount,
  subscriptionPlan,
}: CreatorLooksDetailSectionProps) {
  const t = await getTranslations("creatorLooksDetail");

  const displayTitle = title?.trim() || t("untitled");
  const displayNickname = submitterNickname?.trim() || t("anonymousCreator");

  return (
    <section className="space-y-6">
      {/* 大画像 (= モックアップ 03 の上半分) */}
      {templateImageUrl ? (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-muted shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={templateImageUrl}
            alt={displayTitle}
            className="aspect-square w-full object-contain"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="flex aspect-square w-full items-center justify-center rounded-2xl border border-gray-200 bg-muted text-sm text-muted-foreground">
          {t("imageMissing")}
        </div>
      )}

      {/* タイトル + 帰属 + 利用回数 */}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">{displayTitle}</h1>
        <p className="text-sm text-muted-foreground">
          {t("byLabel")}{" "}
          <Link
            href={`/users/${submittedByUserId}`}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {displayNickname}
          </Link>
        </p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {t("usageCount", { count: usageCount })}
        </p>
      </header>

      {/* 区切り線 */}
      <div className="h-px w-full bg-gray-200" />

      {/* Client component: ImageUploader / 背景チェックボックス / Try this look / 生成フロー */}
      <CreatorLooksDetailClient
        templateId={templateId}
        subscriptionPlan={subscriptionPlan}
      />
    </section>
  );
}
