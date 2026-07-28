import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getCurrentRemovalDecisionId } from "@/features/moderation/lib/appeal-repository";

/**
 * 投稿 ID から「現在有効な公開停止判定」へ解決して redirect する。
 *
 * 設計判断: docs/planning/post-moderation-notification-implementation-plan.md ADR-008
 *
 * 生成ギャラリーの tombstone カードは判定 ID を持たない。カード側に判定 ID を
 * 引き回すと、ギャラリーを描画する複数のコンポーネントを横断して props を
 * 通す必要が出るため、サーバー側で解決する薄いルートに寄せる。
 *
 * 同じ投稿が複数回公開停止されている場合は最新の reject 判定へ送る。
 */
export default async function ModerationDecisionResolverPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  await connection();

  const { postId } = await params;
  const user = await getUser();
  if (!user) {
    notFound();
  }

  const decisionId = await getCurrentRemovalDecisionId(postId, user.id);
  if (!decisionId) {
    // 他人の投稿・存在しない投稿・既に復帰済みはすべて 404 として扱う
    notFound();
  }

  redirect(`/my-page/moderation/decisions/${decisionId}?from=my-page`);
}
