"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/components/ui/use-toast";
import { DeactivateAccountDialog } from "@/features/auth/components/DeactivateAccountDialog";
import {
  getBlockedUsersAPI,
  getReportedContentsAPI,
  unblockUserFromAccountAPI,
  withdrawReportAPI,
} from "@/features/account/lib/api";
import type { BlockedUserItem, ReportedContentItem } from "@/features/account/types";

export function AccountManagementPage() {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserItem[]>([]);
  const [reportedContents, setReportedContents] = useState<ReportedContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  const [isBlocksOpen, setIsBlocksOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const { toast } = useToast();

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [blocks, reports] = await Promise.all([
        getBlockedUsersAPI(),
        getReportedContentsAPI(),
      ]);
      setBlockedUsers(blocks);
      setReportedContents(reports);
    } catch (error) {
      toast({
        title: "読み込みに失敗しました",
        description: error instanceof Error ? error.message : "時間をおいて再試行してください",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleUnblock = async (userId: string) => {
    setProcessingKey(`unblock:${userId}`);
    try {
      await unblockUserFromAccountAPI(userId);
      setBlockedUsers((prev) => prev.filter((item) => item.userId !== userId));
      toast({ title: "ブロックを解除しました" });
    } catch (error) {
      toast({
        title: "ブロック解除に失敗しました",
        description: error instanceof Error ? error.message : "時間をおいて再試行してください",
        variant: "destructive",
      });
    } finally {
      setProcessingKey(null);
    }
  };

  const handleWithdrawReport = async (postId: string) => {
    setProcessingKey(`report:${postId}`);
    try {
      await withdrawReportAPI(postId);
      setReportedContents((prev) => prev.filter((item) => item.postId !== postId));
      toast({ title: "通報を解除しました" });
    } catch (error) {
      toast({
        title: "通報解除に失敗しました",
        description: error instanceof Error ? error.message : "時間をおいて再試行してください",
        variant: "destructive",
      });
    } finally {
      setProcessingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <Collapsible open={isBlocksOpen} onOpenChange={setIsBlocksOpen}>
          <CollapsibleTrigger className="w-full text-left">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">ブロックユーザー一覧</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  ブロック中のユーザーを確認し、解除できます。
                </p>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  isBlocksOpen ? "rotate-180" : ""
                }`}
              />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">読み込み中...</p>
            ) : blockedUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                ブロックしているユーザーはいません。
              </p>
            ) : (
              <div className="space-y-3">
                {blockedUsers.map((item) => (
                  <div
                    key={item.userId}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative h-9 w-9 overflow-hidden rounded-full bg-gray-100">
                        {item.avatarUrl ? (
                          <Image
                            src={item.avatarUrl}
                            alt={item.nickname || "ユーザー"}
                            fill
                            className="object-cover"
                            sizes="36px"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {item.nickname || "ユーザー"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.blockedAt).toLocaleString("ja-JP")}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={processingKey === `unblock:${item.userId}`}
                      onClick={() => void handleUnblock(item.userId)}
                    >
                      解除
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Card className="p-5">
        <Collapsible open={isReportsOpen} onOpenChange={setIsReportsOpen}>
          <CollapsibleTrigger className="w-full text-left">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">通報済みコンテンツ一覧</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  通報したコンテンツを確認し、通報解除できます。
                </p>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  isReportsOpen ? "rotate-180" : ""
                }`}
              />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">読み込み中...</p>
            ) : reportedContents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                通報済みのコンテンツはありません。
              </p>
            ) : (
              <div className="space-y-3">
                {reportedContents.map((item) => (
                  <div
                    key={item.postId}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative h-14 w-14 overflow-hidden rounded bg-gray-100">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt="通報済み投稿"
                            fill
                            className="object-cover"
                            sizes="56px"
                            unoptimized
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          通報日時: {new Date(item.reportedAt).toLocaleString("ja-JP")}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={processingKey === `report:${item.postId}`}
                      onClick={() => void handleWithdrawReport(item.postId)}
                    >
                      通報解除
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Card className="p-5 border-red-200">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-red-700">アカウント削除</h2>
          <p className="text-sm text-muted-foreground mt-1">
            退会後はアカウントが凍結され、30日後に完全削除されます。
          </p>
        </div>
        <Button variant="destructive" onClick={() => setIsDeactivateDialogOpen(true)}>
          アカウント削除を申請
        </Button>
      </Card>

      <DeactivateAccountDialog
        open={isDeactivateDialogOpen}
        onOpenChange={setIsDeactivateDialogOpen}
      />
    </div>
  );
}
