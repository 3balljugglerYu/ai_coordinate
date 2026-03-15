"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
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
import {
  BlockListSkeleton,
  ReportedContentListSkeleton,
} from "./AccountManagementSkeleton";

export function AccountManagementPage() {
  const locale = useLocale();
  const t = useTranslations("accountManagement");
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
        getBlockedUsersAPI({
          blockedUsersFetchFailed: t("blockedUsersFetchFailed"),
        }),
        getReportedContentsAPI({
          reportedContentsFetchFailed: t("reportedContentsFetchFailed"),
        }),
      ]);
      setBlockedUsers(blocks);
      setReportedContents(reports);
    } catch (error) {
      toast({
        title: t("loadFailedTitle"),
        description: error instanceof Error ? error.message : t("retryLater"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleUnblock = async (userId: string) => {
    setProcessingKey(`unblock:${userId}`);
    try {
      await unblockUserFromAccountAPI(userId, {
        unblockFailed: t("unblockFailed"),
      });
      setBlockedUsers((prev) => prev.filter((item) => item.userId !== userId));
      toast({ title: t("unblockSuccess") });
    } catch (error) {
      toast({
        title: t("unblockFailedTitle"),
        description: error instanceof Error ? error.message : t("retryLater"),
        variant: "destructive",
      });
    } finally {
      setProcessingKey(null);
    }
  };

  const handleWithdrawReport = async (postId: string) => {
    setProcessingKey(`report:${postId}`);
    try {
      await withdrawReportAPI(postId, {
        withdrawReportFailed: t("withdrawReportFailed"),
      });
      setReportedContents((prev) => prev.filter((item) => item.postId !== postId));
      toast({ title: t("withdrawReportSuccess") });
    } catch (error) {
      toast({
        title: t("withdrawReportFailedTitle"),
        description: error instanceof Error ? error.message : t("retryLater"),
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
                <h2 className="text-lg font-semibold">{t("blockedUsersTitle")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("blockedUsersDescription")}
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
              <BlockListSkeleton />
            ) : blockedUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noBlockedUsers")}
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
                            alt={item.nickname || t("userFallback")}
                            fill
                            className="object-cover"
                            sizes="36px"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {item.nickname || t("userFallback")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Intl.DateTimeFormat(
                            locale === "ja" ? "ja-JP" : "en-US",
                            { dateStyle: "medium", timeStyle: "short" }
                          ).format(new Date(item.blockedAt))}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={processingKey === `unblock:${item.userId}`}
                      onClick={() => void handleUnblock(item.userId)}
                    >
                      {t("unblock")}
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
                <h2 className="text-lg font-semibold">{t("reportedContentsTitle")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("reportedContentsDescription")}
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
              <ReportedContentListSkeleton />
            ) : reportedContents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noReportedContents")}
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
                            alt={t("reportedPostAlt")}
                            fill
                            className="object-cover"
                            sizes="56px"
                            unoptimized
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {t("reportedAt", {
                            date: new Intl.DateTimeFormat(
                              locale === "ja" ? "ja-JP" : "en-US",
                              { dateStyle: "medium", timeStyle: "short" }
                            ).format(new Date(item.reportedAt)),
                          })}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={processingKey === `report:${item.postId}`}
                      onClick={() => void handleWithdrawReport(item.postId)}
                    >
                      {t("withdrawReport")}
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
          <h2 className="text-lg font-semibold text-red-700">{t("deleteAccountTitle")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("deleteAccountDescription")}
          </p>
        </div>
        <Button variant="destructive" onClick={() => setIsDeactivateDialogOpen(true)}>
          {t("requestDeletion")}
        </Button>
      </Card>

      <DeactivateAccountDialog
        open={isDeactivateDialogOpen}
        onOpenChange={setIsDeactivateDialogOpen}
      />
    </div>
  );
}
