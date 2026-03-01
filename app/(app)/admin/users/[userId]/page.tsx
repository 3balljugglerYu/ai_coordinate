import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPostThumbUrl } from "@/features/posts/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, User, ImageIcon, MessageCircle, CreditCard, Clock } from "lucide-react";
import { UserDetailActions } from "./UserDetailActions";

async function getUserDetail(userId: string) {
  const supabase = createAdminClient();

  const [profileResult, creditsResult, expiringBatchesResult, expiringCountResult, generatedResult, postedResult, commentsResult, transactionsResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, nickname, avatar_url, bio, deactivated_at")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_credits")
        .select("balance, paid_balance")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.rpc("get_free_percoin_batches_expiring", { p_user_id: userId }),
      supabase.rpc("get_expiring_this_month_count", { p_user_id: userId }),
      supabase
        .from("generated_images")
        .select(
          "id, caption, storage_path, storage_path_thumb, storage_path_display, created_at"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("generated_images")
        .select(
          "id, caption, storage_path, storage_path_thumb, storage_path_display, moderation_status, posted_at, created_at"
        )
        .eq("user_id", userId)
        .eq("is_posted", true)
        .order("posted_at", { ascending: false })
        .limit(50),
      supabase
        .from("comments")
        .select("id, image_id, content, created_at")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("credit_transactions")
        .select("id, amount, transaction_type, metadata, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  if (profileResult.error || !profileResult.data) {
    return null;
  }

  const profile = profileResult.data;
  const credits = creditsResult.data;
  const expiringBatches = (expiringBatchesResult.data ?? []) as Array<{
    id: string;
    user_id: string;
    remaining_amount: number;
    expire_at: string;
    source: string;
  }>;
  const expiringCountRow = Array.isArray(expiringCountResult.data) ? expiringCountResult.data[0] : expiringCountResult.data;
  const expiringThisMonth = Number((expiringCountRow as { expiring_this_month?: number })?.expiring_this_month ?? 0);
  const generated = generatedResult.data || [];
  const posted = postedResult.data || [];
  const comments = commentsResult.data || [];
  const transactions = transactionsResult.data || [];

  const imageIds = [
    ...new Set([
      ...posted.map((p) => p.id),
      ...comments.map((c) => c.image_id),
    ]),
  ].filter(Boolean);

  let postCaptions: Record<string, string> = {};
  if (imageIds.length > 0) {
    const { data: images } = await supabase
      .from("generated_images")
      .select("id, caption")
      .in("id", imageIds);
    if (images) {
      postCaptions = Object.fromEntries(
        images.map((img) => [img.id, img.caption || ""])
      );
    }
  }

  return {
    profile,
    credits,
    expiringBatches,
    expiringThisMonth,
    generated: generated.map((img) => ({
      ...img,
      thumb_url: getPostThumbUrl(img),
    })),
    posted: posted.map((img) => ({
      ...img,
      thumb_url: getPostThumbUrl(img),
    })),
    comments: comments.map((c) => ({
      ...c,
      post_caption: postCaptions[c.image_id] || null,
    })),
    transactions,
  };
}

function formatTransactionType(
  type: string,
  metadata?: Record<string, unknown> | null
) {
  const map: Record<string, string> = {
    purchase: "購入",
    consumption: "生成利用",
    refund: "生成失敗返却",
    signup_bonus: "新規登録ボーナス",
    daily_post: "デイリー投稿ボーナス",
    streak: "連続ログインボーナス",
    referral: "紹介ボーナス",
    admin_bonus: "運営者からのボーナス",
    admin_deduction: "運営による減算",
    tour_bonus: "チュートリアルボーナス",
    forfeiture: "退会による放棄",
  };
  if (type === "admin_bonus" && metadata?.reason) {
    return String(metadata.reason);
  }
  if (type === "admin_deduction" && metadata?.reason) {
    return String(metadata.reason);
  }
  return map[type] || type;
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const user = await getUser();
  const adminUserIds = getAdminUserIds();

  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const { userId } = await params;
  const data = await getUserDetail(userId);

  if (!data) {
    notFound();
  }

  const { profile, credits, expiringBatches, expiringThisMonth, generated, posted, comments, transactions } = data;

  const sourceLabels: Record<string, string> = {
    signup_bonus: "新規登録",
    tour_bonus: "チュートリアル",
    referral: "紹介",
    daily_post: "デイリー投稿",
    streak: "連続ログイン",
    admin_bonus: "運営付与",
    admin_deduction: "運営減算",
    refund: "生成失敗返却",
  };

  // 期限が近い無償コインを月別（JST）にグルーピング
  const monthKeyFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  });
  const monthLabelFormatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
  });
  const monthGroups = expiringBatches.reduce<
    Record<string, (typeof expiringBatches)[number][]>
  >((acc, batch) => {
    const key = monthKeyFormatter.format(new Date(batch.expire_at));
    if (!acc[key]) acc[key] = [];
    acc[key].push(batch);
    return acc;
  }, {});
  const sortedMonthKeys = Object.keys(monthGroups).sort();

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/users"
            className="rounded-lg p-2 text-slate-600 hover:bg-violet-50/80 hover:text-violet-700"
            aria-label="ユーザー検索に戻る"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex flex-1 flex-wrap items-center gap-4">
            {profile.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt=""
                width={56}
                height={56}
                className="rounded-full object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200">
                <User className="h-7 w-7 text-slate-500" />
              </div>
            )}
            <div>
              <h1
                className="text-xl font-bold text-slate-900 sm:text-2xl"
                style={{
                  fontFamily:
                    "var(--font-admin-heading), ui-monospace, monospace",
                }}
              >
                {profile.nickname || "（ニックネーム未設定）"}
              </h1>
              <p className="font-mono text-sm text-slate-500">{profile.user_id}</p>
              {profile.bio && (
                <p className="mt-1 text-sm text-slate-600">
                  {profile.bio}
                </p>
              )}
              {profile.deactivated_at && (
                <span className="mt-2 inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  停止中
                </span>
              )}
              {credits && (
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  <span className="text-slate-600">
                    残高: <strong className="text-slate-900">{credits.balance}</strong> ペルコイン
                  </span>
                  <span className="text-slate-600">
                    有料残高: <strong className="text-emerald-700">{credits.paid_balance}</strong>
                  </span>
                  <span className="text-slate-600">
                    無料残高: <strong className="text-violet-600">{(credits.balance ?? 0) - (credits.paid_balance ?? 0)}</strong>
                  </span>
                  {expiringThisMonth > 0 && (
                    <span className="text-amber-600">
                      今月末失効予定: <strong>{expiringThisMonth}</strong> ペルコイン
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <UserDetailActions
            userId={profile.user_id}
            isDeactivated={!!profile.deactivated_at}
          />
        </div>
      </header>

      {expiringBatches.length > 0 && (
        <Card className="overflow-hidden border-amber-200/60 bg-amber-50/30">
          <CardContent className="p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Clock className="h-5 w-5 text-amber-600" />
              期限が近い無償コイン
              <span className="text-sm font-normal text-slate-500">
                （{expiringBatches.length}件）
              </span>
            </h2>
            <div className="space-y-4">
              {sortedMonthKeys.map((monthKey) => {
                const batches = monthGroups[monthKey];
                const totalAmount = batches.reduce(
                  (sum, b) => sum + b.remaining_amount,
                  0
                );
                const sampleDate = new Date(batches[0].expire_at);
                const monthLabel = monthLabelFormatter.format(sampleDate);
                return (
                  <div key={monthKey}>
                    <h3 className="mb-2 text-sm font-medium text-amber-800">
                      {monthLabel}（{batches.length}件）: {totalAmount} ペルコイン
                    </h3>
                    <ul className="space-y-2">
                      {batches.map((b) => (
                        <li
                          key={b.id}
                          className="flex items-center justify-between rounded-lg border border-amber-200/80 bg-white/80 px-3 py-2 text-sm"
                        >
                          <span className="text-slate-700">
                            {sourceLabels[b.source] ?? b.source}:{" "}
                            {b.remaining_amount} ペルコイン
                          </span>
                          <span className="text-slate-500">
                            {new Date(b.expire_at).toLocaleDateString("ja-JP", {
                              timeZone: "Asia/Tokyo",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}{" "}
                            まで
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
          <CardContent className="p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <ImageIcon className="h-5 w-5 text-violet-600" />
              生成画像
              <span className="text-sm font-normal text-slate-500">
                （{generated.length}件、最大50件表示）
              </span>
            </h2>
            {generated.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-600">
                生成画像はありません
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {generated.map((img) => (
                  <Link
                    key={img.id}
                    href={`/posts/${img.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-square overflow-hidden rounded-lg bg-slate-100"
                  >
                    <Image
                      src={img.thumb_url}
                      alt={img.caption || ""}
                      width={96}
                      height={96}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
          <CardContent className="p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <ImageIcon className="h-5 w-5 text-violet-600" />
              投稿画像
              <span className="text-sm font-normal text-slate-500">
                （{posted.length}件、最大50件表示）
              </span>
            </h2>
            {posted.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-600">
                投稿はありません
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {posted.map((img) => (
                  <Link
                    key={img.id}
                    href={`/posts/${img.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100"
                  >
                    <Image
                      src={img.thumb_url}
                      alt={img.caption || ""}
                      width={96}
                      height={96}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                    {img.moderation_status === "pending" && (
                      <span className="absolute inset-0 flex items-center justify-center bg-amber-500/80 text-xs font-medium text-white">
                        審査中
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
          <CardContent className="p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <MessageCircle className="h-5 w-5 text-violet-600" />
              コメント
              <span className="text-sm font-normal text-slate-500">
                （{comments.length}件、最大50件表示）
              </span>
            </h2>
            {comments.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-600">
                コメントはありません
              </p>
            ) : (
              <ul className="space-y-3">
                {comments.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-3"
                  >
                    <p className="text-sm text-slate-900">{c.content}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(c.created_at).toLocaleString("ja-JP")}
                      {c.post_caption && (
                        <span className="ml-2">
                          投稿: {c.post_caption.slice(0, 30)}
                          {c.post_caption.length > 30 ? "…" : ""}
                        </span>
                      )}
                    </p>
                    <Link
                      href={`/posts/${c.image_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-xs text-violet-600 hover:underline"
                    >
                      投稿を表示 →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
          <CardContent className="p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <CreditCard className="h-5 w-5 text-violet-600" />
              ペルコイン取引
              <span className="text-sm font-normal text-slate-500">
                （{transactions.length}件、最大50件表示）
              </span>
            </h2>
            {transactions.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-600">
                取引履歴はありません
              </p>
            ) : (
              <ul className="space-y-3">
                {transactions.map((tx) => (
                  <li
                    key={tx.id}
                    className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900">
                        {formatTransactionType(tx.transaction_type, tx.metadata)}
                      </span>
                      <span
                        className={`shrink-0 text-sm font-semibold ${
                          tx.amount >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {tx.amount >= 0 ? "+" : ""}
                        {tx.amount}ペルコイン
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(tx.created_at).toLocaleString("ja-JP")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
