"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag, MoreHorizontal, Share2, ShieldBan } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { REPORT_TAXONOMY } from "@/constants/report-taxonomy";
import { reportPostAPI, blockUserAPI, getBlockStatusAPI, unblockUserAPI } from "@/features/moderation/lib/api";
import type { ReportCategoryId, ReportSubcategoryId } from "@/constants/report-taxonomy";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { sharePost } from "@/lib/share-post";
import { getPostDetailUrl } from "@/lib/url-utils";
import { localizePublicPath, stripLocalePrefix, type Locale } from "@/i18n/config";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PostModerationMenuProps {
  postId: string;
  authorUserId?: string | null;
  currentUserId?: string | null;
  onHidden?: () => void;
  align?: "start" | "center" | "end";
  showShare?: boolean;
  showBlock?: boolean;
}

const categoryLabelKeyMap = {
  rights: "categoryRights",
  sexual: "categorySexual",
  violence: "categoryViolence",
  harassment: "categoryHarassment",
  danger: "categoryDanger",
  spam_fraud: "categorySpamFraud",
  other: "categoryOther",
} as const;

const subcategoryLabelKeyMap = {
  copyright: "subcategoryCopyright",
  trademark: "subcategoryTrademark",
  publicity: "subcategoryPublicity",
  adult_sexual: "subcategoryAdultSexual",
  minor_sexual: "subcategoryMinorSexual",
  sexual_exploitation: "subcategorySexualExploitation",
  gore: "subcategoryGore",
  cruelty: "subcategoryCruelty",
  animal_abuse: "subcategoryAnimalAbuse",
  hate: "subcategoryHate",
  threat: "subcategoryThreat",
  bullying: "subcategoryBullying",
  self_harm: "subcategorySelfHarm",
  illegal_goods: "subcategoryIllegalGoods",
  crime: "subcategoryCrime",
  fraud: "subcategoryFraud",
  spam: "subcategorySpam",
  scam_link: "subcategoryScamLink",
  other: "subcategoryOther",
} as const;

export function PostModerationMenu({
  postId,
  authorUserId,
  currentUserId,
  onHidden,
  align = "end",
  showShare = false,
  showBlock = true,
}: PostModerationMenuProps) {
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [categoryId, setCategoryId] = useState<ReportCategoryId>(REPORT_TAXONOMY[0].id);
  const [subcategoryId, setSubcategoryId] = useState<ReportSubcategoryId>(
    REPORT_TAXONOMY[0].subcategories[0].id
  );
  const [details, setDetails] = useState("");
  const [isBlocked, setIsBlocked] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const locale = useLocale() as Locale;
  const moderationT = useTranslations("moderation");
  const postsT = useTranslations("posts");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const redirectPath =
    searchParams?.toString() ? `${pathname}?${searchParams.toString()}` : pathname;

  const canShowBlock = showBlock && Boolean(authorUserId && currentUserId && authorUserId !== currentUserId);
  const canShowReport = !(authorUserId && currentUserId && authorUserId === currentUserId);
  const canShowShare = showShare;
  const isPostDetailPage = pathname
    ? stripLocalePrefix(pathname).pathname.startsWith("/posts/")
    : false;
  const category = useMemo(
    () => REPORT_TAXONOMY.find((item) => item.id === categoryId) || REPORT_TAXONOMY[0],
    [categoryId]
  );
  const moderationApiMessages = useMemo(
    () => ({
      reportFailed: moderationT("apiReportFailed"),
      blockFailed: moderationT("apiBlockFailed"),
      unblockFailed: moderationT("apiUnblockFailed"),
      blockStatusFailed: moderationT("apiBlockStatusFailed"),
    }),
    [moderationT]
  );

  useEffect(() => {
    if (!canShowBlock || !authorUserId) {
      return;
    }
    getBlockStatusAPI(authorUserId, moderationApiMessages)
      .then((status) => {
        setIsBlocked(status.isBlocked);
      })
      .catch(() => {
        setIsBlocked(false);
      });
  }, [authorUserId, canShowBlock, moderationApiMessages]);

  const requireLogin = () => {
    if (!currentUserId) {
      setShowAuthModal(true);
      return true;
    }
    return false;
  };

  const handleReport = async () => {
    if (requireLogin()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await reportPostAPI({
        postId,
        categoryId,
        subcategoryId,
        details: details.trim() || undefined,
      }, moderationApiMessages);
      toast({
        title: moderationT("reportSuccessTitle"),
        description: moderationT("reportSuccessDescription"),
      });
      setIsReportDialogOpen(false);
      onHidden?.();
      if (isPostDetailPage) {
        router.replace(`${localizePublicPath("/", locale)}?mod_refresh=1`);
        router.refresh();
      }
    } catch (error) {
      toast({
        title: moderationT("reportFailedTitle"),
        description:
          error instanceof Error ? error.message : moderationT("retryLater"),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBlockToggle = async () => {
    if (requireLogin()) {
      return;
    }
    if (!authorUserId) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (isBlocked) {
        await unblockUserAPI(authorUserId, moderationApiMessages);
        setIsBlocked(false);
        toast({
          title: moderationT("unblockSuccessTitle"),
        });
      } else {
        await blockUserAPI(authorUserId, moderationApiMessages);
        setIsBlocked(true);
        toast({
          title: moderationT("blockSuccessTitle"),
          description: moderationT("blockSuccessDescription"),
        });
        onHidden?.();
        if (isPostDetailPage) {
          router.replace(`${localizePublicPath("/", locale)}?mod_refresh=1`);
          router.refresh();
        }
      }
      setIsBlockDialogOpen(false);
    } catch (error) {
      toast({
        title: isBlocked
          ? moderationT("unblockFailedTitle")
          : moderationT("blockFailedTitle"),
        description:
          error instanceof Error ? error.message : moderationT("retryLater"),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShare = async () => {
    try {
      const url = getPostDetailUrl(postId, locale);
      const result = await sharePost(url);

      if (result.method === "clipboard") {
        toast({
          title: postsT("shareCopyTitle"),
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      toast({
        title: postsT("errorTitle"),
        description: postsT("shareFailed"),
        variant: "destructive",
      });
    }
  };

  const getCategoryLabel = (id: ReportCategoryId) =>
    moderationT(categoryLabelKeyMap[id]);
  const getSubcategoryLabel = (id: ReportSubcategoryId) =>
    moderationT(subcategoryLabelKeyMap[id]);

  return (
    <>
      {(canShowShare || canShowReport || canShowBlock) && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 p-0"
            aria-label={moderationT("menuAria")}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align}>
          {canShowShare && (
            <DropdownMenuItem onClick={handleShare}>
              <Share2 className="mr-2 h-4 w-4" />
              {moderationT("shareAction")}
            </DropdownMenuItem>
          )}
          {canShowReport && (
            <DropdownMenuItem onClick={() => setIsReportDialogOpen(true)}>
              <Flag className="mr-2 h-4 w-4" />
              {moderationT("reportAction")}
            </DropdownMenuItem>
          )}
          {canShowBlock && (
            <DropdownMenuItem onClick={() => setIsBlockDialogOpen(true)}>
              <ShieldBan className="mr-2 h-4 w-4" />
              {isBlocked
                ? moderationT("unblockAction")
                : moderationT("blockAction")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      )}

      <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{moderationT("reportDialogTitle")}</DialogTitle>
            <DialogDescription>
              {moderationT("reportDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{moderationT("categoryLabel")}</Label>
              <Select
                value={categoryId}
                onValueChange={(value) => {
                  const nextCategory = REPORT_TAXONOMY.find((item) => item.id === value);
                  if (!nextCategory) {
                    return;
                  }
                  setCategoryId(nextCategory.id);
                  setSubcategoryId(nextCategory.subcategories[0].id);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={moderationT("categoryPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TAXONOMY.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {getCategoryLabel(item.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{moderationT("subcategoryLabel")}</Label>
              <Select
                value={subcategoryId}
                onValueChange={(value) => setSubcategoryId(value as ReportSubcategoryId)}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={moderationT("subcategoryPlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {category.subcategories.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {getSubcategoryLabel(item.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{moderationT("detailsLabel")}</Label>
              <Textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                maxLength={300}
                placeholder={moderationT("detailsPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReportDialogOpen(false)}>
              {moderationT("cancel")}
            </Button>
            <Button onClick={handleReport} disabled={isSubmitting}>
              {moderationT("submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isBlockDialogOpen} onOpenChange={setIsBlockDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isBlocked
                ? moderationT("unblockConfirmTitle")
                : moderationT("blockConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isBlocked
                ? moderationT("unblockConfirmDescription")
                : moderationT("blockConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{moderationT("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleBlockToggle} disabled={isSubmitting}>
              {isBlocked
                ? moderationT("unblockConfirmAction")
                : moderationT("blockConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AuthModal
        open={showAuthModal && !currentUserId}
        onClose={() => setShowAuthModal(false)}
        redirectTo={redirectPath}
      />
    </>
  );
}
