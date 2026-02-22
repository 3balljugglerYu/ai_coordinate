"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import type { ModerationQueueItem } from "@/features/moderation/types";

interface QueueResponse {
  posts: ModerationQueueItem[];
}

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
  action: "approve" | "reject",
  reason?: string
): Promise<void> {
  const response = await fetch(`/api/admin/moderation/posts/${postId}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, reason }),
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
  const { toast } = useToast();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const queue = await fetchQueue();
      setPosts(queue);
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

  const handleDecision = async (postId: string, action: "approve" | "reject") => {
    setProcessingId(postId);
    try {
      await decidePost(postId, action, action === "reject" ? "admin_reject" : undefined);
      setPosts((prev) => prev.filter((item) => item.id !== postId));
      toast({
        title: "反映しました",
        description: action === "approve" ? "問題なしと判断し、公開を再開しました" : "不適切と判断し、非公開にしました",
      });
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

  if (loading) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-slate-600">読み込み中...</p>
      </div>
    );
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
      {posts.map((post) => (
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
              <p className="text-xs text-slate-600">
                通報件数: {post.report_count} / 重み合計:{" "}
                {post.weighted_report_score.toFixed(2)}
              </p>
              <p className="text-xs text-slate-500">
                理由: {post.moderation_reason || "report_threshold"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
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
                disabled={processingId === post.id}
                onClick={() => handleDecision(post.id, "reject")}
              >
                不適切
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
