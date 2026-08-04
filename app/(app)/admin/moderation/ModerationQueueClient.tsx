"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ModerationQueueSkeleton } from "@/features/moderation/components/ModerationQueueSkeleton";
import { useToast } from "@/components/ui/use-toast";
import type { ModerationQueueItem } from "@/features/moderation/types";
import { MODERATION_POLICY_CATALOG } from "@/constants/moderation-policy";
import { REPORT_TAXONOMY } from "@/constants/report-taxonomy";

interface QueueResponse {
  posts: ModerationQueueItem[];
}

/** 投稿ごとの入力状態。理由は投稿者向けと内部メモの2欄に分ける (ADR-011 / REQ-024)。 */
interface DraftState {
  policyCode: string;
  authorFacingReason: string;
  internalNote: string;
  /** 再送で同じ判定が二重に走らないよう、カードごとに固定する冪等キー。 */
  idempotencyKey: string;
}

const AUTHOR_FACING_MAX = 1000;
const INTERNAL_NOTE_MAX = 1000;

/** 表示用のポリシーラベル（管理画面は日本語固定なのでタクソノミの label を使う）。 */
const POLICY_OPTIONS = MODERATION_POLICY_CATALOG.map((policy) => {
  const category = REPORT_TAXONOMY.find((item) => item.id === policy.categoryId);
  const subcategory = category?.subcategories.find(
    (item) => item.id === policy.subcategoryId
  );
  return {
    code: policy.code,
    label: `${category?.label ?? policy.categoryId} / ${subcategory?.label ?? policy.subcategoryId}`,
    hideThumbnail: policy.hideThumbnail,
  };
});

async function fetchQueue(): Promise<ModerationQueueItem[]> {
  const response = await fetch("/api/admin/moderation/posts");
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "審査キューの取得に失敗しました");
  }
  const data = (await response.json()) as QueueResponse;
  return data.posts || [];
}

async function decidePost(
  postId: string,
  payload: {
    action: "approve" | "reject";
    idempotencyKey: string;
    policyCode?: string;
    authorFacingReason?: string;
    internalNote?: string;
  }
): Promise<void> {
  const response = await fetch(`/api/admin/moderation/posts/${postId}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "判定の反映に失敗しました");
  }
}

export function ModerationQueueClient() {
  const [posts, setPosts] = useState<ModerationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const { toast } = useToast();
  const router = useRouter();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const queue = await fetchQueue();
      setPosts(queue);
      setDrafts((prev) => {
        const next: Record<string, DraftState> = {};
        for (const post of queue) {
          next[post.id] =
            prev[post.id] ?? {
              policyCode: "",
              authorFacingReason: "",
              internalNote: "",
              idempotencyKey: crypto.randomUUID(),
            };
        }
        return next;
      });
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "取得に失敗しました",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateDraft = (postId: string, patch: Partial<DraftState>) => {
    setDrafts((prev) => ({
      ...prev,
      [postId]: {
        ...(prev[postId] ?? {
          policyCode: "",
          authorFacingReason: "",
          internalNote: "",
          idempotencyKey: crypto.randomUUID(),
        }),
        ...patch,
      },
    }));
  };

  const handleDecision = async (postId: string, action: "approve" | "reject") => {
    const draft = drafts[postId];
    if (!draft) return;

    setProcessingId(postId);
    try {
      await decidePost(postId, {
        action,
        idempotencyKey: draft.idempotencyKey,
        ...(action === "reject"
          ? {
              policyCode: draft.policyCode,
              authorFacingReason: draft.authorFacingReason.trim(),
              internalNote: draft.internalNote.trim() || undefined,
            }
          : {}),
      });
      setPosts((prev) => prev.filter((item) => item.id !== postId));
      toast({
        title: "反映しました",
        description:
          action === "approve"
            ? "問題なしと判断し、公開を再開しました"
            : "公開停止しました。投稿者へ理由付きで通知されます",
      });
      // 判定後にフィードのキャッシュ再検証を反映させる
      router.refresh();
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "判定に失敗しました",
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
    }
  };

  const canReject = useMemo(
    () => (postId: string) => {
      const draft = drafts[postId];
      if (!draft) return false;
      return (
        draft.policyCode.length > 0 && draft.authorFacingReason.trim().length > 0
      );
    },
    [drafts]
  );

  if (loading) {
    return <ModerationQueueSkeleton />;
  }

  if (posts.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-slate-600">審査待ちの投稿はありません。</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {posts.map((post) => {
        const draft = drafts[post.id];
        const selectedPolicy = POLICY_OPTIONS.find(
          (option) => option.code === draft?.policyCode
        );

        return (
          <div
            key={post.id}
            className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-5 sm:p-6"
          >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-200/60">
                <Image
                  src={post.image_url}
                  alt={post.caption || "pending post"}
                  fill
                  className="object-cover"
                  sizes="96px"
                  unoptimized
                />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <p className="text-sm font-medium text-slate-900 line-clamp-2">
                  {post.caption || "キャプションなし"}
                </p>
                {/*
                  プロンプト非公開の投稿は、中身の見えないプロンプトを他人に
                  配っている状態。運営はキューの段階で見分けられるようにする。
                  本文そのものは投稿詳細（admin 閲覧）で確認できる (REQ-018)。
                */}
                {post.prompt_visibility === "private" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                    🔒 プロンプト非公開
                  </span>
                )}
                <p className="text-xs text-slate-600">
                  通報件数: {post.report_count} / 重み合計:{" "}
                  {post.weighted_report_score.toFixed(2)}
                </p>
                <p className="text-xs text-slate-500">
                  理由: {post.moderation_reason || "report_threshold"}
                </p>
              </div>
            </div>

            {/* 公開停止する場合の入力。approve だけなら未入力でよい */}
            <div className="mt-5 space-y-4 rounded-md border border-slate-200 bg-white p-4">
              <div className="space-y-2">
                <Label htmlFor={`policy-${post.id}`}>
                  違反ポリシー
                  <span className="ml-1 text-xs text-slate-500">
                    （公開停止する場合は必須）
                  </span>
                </Label>
                <Select
                  value={draft?.policyCode || undefined}
                  onValueChange={(value) => updateDraft(post.id, { policyCode: value })}
                >
                  <SelectTrigger id={`policy-${post.id}`} className="min-h-[44px]">
                    <SelectValue placeholder="違反ポリシーを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {POLICY_OPTIONS.map((option) => (
                      <SelectItem key={option.code} value={option.code}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPolicy?.hideThumbnail && (
                  <p className="text-xs text-amber-700">
                    このカテゴリでは、投稿者の画面でもサムネイルを表示しません。
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`author-reason-${post.id}`}>
                  投稿者に見せる説明
                  <span className="ml-1 text-xs font-semibold text-rose-600">
                    ※投稿者が読みます
                  </span>
                </Label>
                <Textarea
                  id={`author-reason-${post.id}`}
                  value={draft?.authorFacingReason ?? ""}
                  onChange={(event) =>
                    updateDraft(post.id, { authorFacingReason: event.target.value })
                  }
                  maxLength={AUTHOR_FACING_MAX}
                  rows={3}
                  placeholder="例: 既存キャラクターの著作権を侵害する内容のため公開を停止しました。"
                />
                <p className="text-xs text-slate-500">
                  通報者を特定できる情報（氏名・アカウント名・通報件数など）は書かないでください。
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`internal-note-${post.id}`}>
                  運営内部メモ
                  <span className="ml-1 text-xs text-slate-500">
                    ※投稿者には表示されません（任意）
                  </span>
                </Label>
                <Textarea
                  id={`internal-note-${post.id}`}
                  value={draft?.internalNote ?? ""}
                  onChange={(event) =>
                    updateDraft(post.id, { internalNote: event.target.value })
                  }
                  maxLength={INTERNAL_NOTE_MAX}
                  rows={2}
                  placeholder="例: 通報者3名、再犯2回目。"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={processingId === post.id}
                  onClick={() => handleDecision(post.id, "approve")}
                >
                  問題なし
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={processingId === post.id || !canReject(post.id)}
                  onClick={() => handleDecision(post.id, "reject")}
                >
                  不適切
                </Button>
                {!canReject(post.id) && (
                  <span className="text-xs text-slate-500">
                    「不適切」には違反ポリシーと投稿者向け説明の入力が必要です
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
