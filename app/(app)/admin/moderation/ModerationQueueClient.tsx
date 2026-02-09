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
        description: action === "approve" ? "公開を再開しました" : "非公開を維持しました",
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
    return <p className="text-sm text-muted-foreground">読み込み中...</p>;
  }

  if (posts.length === 0) {
    return <p className="text-sm text-muted-foreground">審査待ちの投稿はありません。</p>;
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <div key={post.id} className="rounded-md border p-4">
          <div className="flex items-start gap-4">
            <div className="relative h-24 w-24 overflow-hidden rounded bg-gray-100">
              <Image
                src={post.image_url}
                alt={post.caption || "pending post"}
                fill
                className="object-cover"
                sizes="96px"
                unoptimized
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{post.caption || "キャプションなし"}</p>
              <p className="text-xs text-muted-foreground mt-1">
                通報件数: {post.report_count} / 重み合計:{" "}
                {post.weighted_report_score.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                理由: {post.moderation_reason || "report_threshold"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={processingId === post.id}
                onClick={() => handleDecision(post.id, "approve")}
              >
                承認
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={processingId === post.id}
                onClick={() => handleDecision(post.id, "reject")}
              >
                却下
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
