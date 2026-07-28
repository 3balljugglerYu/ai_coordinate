import { connection } from "next/server";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getModerationDecisionForOwner } from "@/features/moderation/lib/appeal-repository";
import { PostAppealForm } from "@/features/moderation/components/PostAppealForm";
import {
  getModerationPolicyLabelKeys,
  shouldHideThumbnailForPolicy,
} from "@/constants/moderation-policy";
import { getPostThumbUrl } from "@/features/posts/lib/utils";

/**
 * 公開停止判定の詳細（投稿者向け）
 *
 * 設計判断: docs/planning/post-moderation-notification-implementation-plan.md
 *           ADR-008, ADR-011 / REQ-006, REQ-013, REQ-022, REQ-023, REQ-025
 *
 * - 投稿が visible に復帰した後でも開ける（異議申立ての結果を確認できるように）
 * - 措置は「公開停止」表記で、種類・範囲・期間の3項目を出す（DSA 第17条3項(a)）
 * - 「画像そのものは削除されていない」旨を併記する
 * - 通報件数・通報者・運営内部メモは一切表示しない
 */
export default async function ModerationDecisionPage({
  params,
}: {
  params: Promise<{ decisionId: string }>;
}) {
  await connection();

  const { decisionId } = await params;
  const user = await getUser();
  if (!user) {
    notFound();
  }

  const adminClient = createAdminClient();
  const detail = await getModerationDecisionForOwner(decisionId, user.id, {
    adminClient,
  });

  // 他人の判定・存在しない判定はいずれも 404 として扱う（REQ-014）
  if (!detail) {
    notFound();
  }

  const t = await getTranslations("moderation");
  const { decision, appeal } = detail;
  const policyLabelKeys = getModerationPolicyLabelKeys(decision.policy_code);
  const hideThumbnail = shouldHideThumbnailForPolicy(decision.policy_code);

  let thumbnailUrl: string | null = null;
  if (!hideThumbnail) {
    const { data: post } = await adminClient
      .from("generated_images")
      .select("image_url,storage_path,storage_path_thumb")
      .eq("id", decision.post_id)
      .maybeSingle<{
        image_url: string | null;
        storage_path: string | null;
        storage_path_thumb: string | null;
      }>();
    if (post) {
      thumbnailUrl =
        getPostThumbUrl({
          storage_path_thumb: post.storage_path_thumb,
          storage_path: post.storage_path,
          image_url: post.image_url,
        }) || null;
    }
  }

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleString("ja-JP") : "-";

  /**
   * 現在の状況をひと目で伝えるバナーの内容を決める。
   *
   * タイトルは状態で切り替えず汎用にしている。このページは「1つの判定の
   * 永続的な記録」で、措置が解除された後に別の理由で再度公開停止されることが
   * ありうるため、タイトルを現在の状態に連動させると古い判定のページが
   * 別の停止を指してしまうため。状態はバナーで表す。
   */
  const statusBanner = (() => {
    if (appeal?.status === "overturned") {
      return {
        tone: "positive" as const,
        text: t("statusRestoredByAppeal"),
      };
    }
    if (detail.postModerationStatus === "removed") {
      return detail.isCurrentRemoval
        ? { tone: "warning" as const, text: t("statusCurrentlySuspended") }
        : { tone: "neutral" as const, text: t("statusSupersededSuspension") };
    }
    return { tone: "positive" as const, text: t("statusCurrentlyPublished") };
  })();

  const bannerClass =
    statusBanner.tone === "positive"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : statusBanner.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t("decisionPageTitle")}
        </h1>
        <p className="text-sm text-slate-600">{t("decisionPageDescription")}</p>
        <p className={`rounded-md border p-3 text-sm font-medium ${bannerClass}`}>
          {statusBanner.text}
        </p>
      </header>

      {/*
        履歴は新しい順に並べる。ユーザーは「今どうなっているか」を先に知りたい。
        ① 異議申立ての結果 → ② 異議申立て → ③ 公開停止 の順。
      */}

      {/* ① 異議申立ての結果（判定済みのときだけ） */}
      {appeal && appeal.status !== "pending" && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={appeal.status === "overturned" ? "default" : "destructive"}>
                {appeal.status === "overturned"
                  ? t("appealStatusOverturned")
                  : t("appealStatusUpheld")}
              </Badge>
              <span className="text-xs text-slate-500">
                {t("appealDecidedAt")}: {formatDate(appeal.decided_at)}
              </span>
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-slate-900">
                {t("appealResultReason")}
              </h2>
              <p className="whitespace-pre-wrap text-sm text-slate-700">
                {appeal.decision_note || "-"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ② 異議申立て（申立て済みのときだけ） */}
      {appeal && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                {t("appealYourMessage")}
              </h2>
              {appeal.status === "pending" && (
                <Badge variant="secondary">{t("appealStatusPending")}</Badge>
              )}
              <span className="text-xs text-slate-500">
                {t("appealSubmittedAt")}: {formatDate(appeal.created_at)}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{appeal.body}</p>
          </CardContent>
        </Card>
      )}

      {/* ③ 公開停止の措置 (DSA 第17条3項(a): 種類・期間) */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <dl className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <dt className="w-28 shrink-0 text-slate-500">{t("actionLabel")}</dt>
              <dd className="flex-1 font-medium text-slate-900">
                <Badge variant="secondary">{t("actionSuspended")}</Badge>
                <span className="ml-2">{t("actionSuspendedDetail")}</span>
              </dd>
            </div>
            {/*
              「範囲」の行は表示しない。
              措置の行に「すべての利用者に非表示」と出ており重複するうえ、
              「全世界のすべての利用者」という表現が投稿者には過度に威圧的に読める。
              DSA 第17条3項(a) の territorial scope は `restriction_scope` として
              DB に保存し続けており、DSA 適用と判断した場合に表示を戻せる
              (i18n キー scopeLabel / scopeAllUsers も残してある)。
            */}
            <div className="flex flex-wrap gap-2">
              <dt className="w-28 shrink-0 text-slate-500">{t("durationLabel")}</dt>
              <dd className="flex-1 text-slate-900">{t("durationUntilReversed")}</dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="w-28 shrink-0 text-slate-500">{t("decidedAtLabel")}</dt>
              <dd className="flex-1 text-slate-900">{formatDate(decision.created_at)}</dd>
            </div>
          </dl>

          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-900">{t("policyLabel")}</h2>
            <p className="text-sm text-slate-700">
              {/* 通報ダイアログ用のラベルキーを再利用する（全ロケール既存） */}
              {policyLabelKeys
                ? `${t(policyLabelKeys.categoryKey as never)} / ${t(policyLabelKeys.subcategoryKey as never)}`
                : decision.policy_code}
            </p>
            {decision.policy_version && (
              <p className="text-xs text-slate-500">
                {t("policyVersionLabel")}: {decision.policy_version}
              </p>
            )}
            <Link
              href={`/community-guidelines#${decision.policy_anchor ?? ""}`}
              className="inline-block text-xs text-blue-600 underline"
            >
              {t("guidelinesLink")}
            </Link>
          </div>

          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-900">{t("reasonLabel")}</h2>
            <p className="whitespace-pre-wrap text-sm text-slate-700">
              {decision.author_facing_reason || t("reasonUnavailable")}
            </p>
          </div>

          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-900">
              {t("automatedLabel")}
            </h2>
            <p className="text-sm text-slate-700">
              {decision.automated_means_used ? t("automatedYes") : t("automatedNo")}
            </p>
          </div>

          {/* 物理削除ではないことの補足は、現在この措置で停止中のときだけ出す */}
          {detail.isCurrentRemoval && (
            <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              {t("notDeletedNotice")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 対象の投稿（イベントではなく参照情報なので履歴の下） */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <h2 className="text-sm font-semibold text-slate-900">{t("targetPostLabel")}</h2>
          {hideThumbnail ? (
            <div className="flex h-40 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-500">
              {t("thumbnailHidden")}
            </div>
          ) : thumbnailUrl ? (
            <Image
              src={thumbnailUrl}
              alt={t("targetPostLabel")}
              width={240}
              height={240}
              className="rounded-md"
            />
          ) : (
            <div className="flex h-40 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-500">
              {t("thumbnailUnavailable")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 未申立てのときだけフォーム（申立て済みなら上の履歴に出ている） */}
      {!appeal && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-slate-900">
                {t("appealSection")}
              </h2>
              <p className="text-xs text-slate-600">
                {detail.appealDeadlineAt
                  ? t("appealDeadlineNotice", {
                      deadline: formatDate(detail.appealDeadlineAt),
                    })
                  : t("appealDeadlineNotYetStarted")}
              </p>
            </div>

            {detail.canAppeal ? (
              <PostAppealForm moderationDecisionId={decision.id} />
            ) : (
              <p className="text-sm text-slate-600">
                {detail.postModerationStatus === "removed"
                  ? t("appealClosed")
                  : t("appealNotNeeded")}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-slate-500">{t("contactNotice")}</p>
    </div>
  );
}
