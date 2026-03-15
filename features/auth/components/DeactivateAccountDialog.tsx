"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  deactivateAccount,
  getCurrentUser,
  signOut,
} from "@/features/auth/lib/auth-client";

interface DeactivateAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeactivateAccountDialog({
  open,
  onOpenChange,
}: DeactivateAccountDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const locale = useLocale();
  const t = useTranslations("auth");

  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEmailAuthUser, setIsEmailAuthUser] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    setConfirmText("");
    setPassword("");
    setError(null);

    getCurrentUser()
      .then((user) => {
        if (!active || !user) {
          return;
        }

        const provider = (user.app_metadata?.provider as string | undefined) ?? "";
        const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];
        setIsEmailAuthUser(provider === "email" || providers.includes("email"));
      })
      .catch((err) => {
        console.error("Failed to get current user:", err);
      });

    return () => {
      active = false;
    };
  }, [open]);

  const isValidConfirmText = useMemo(() => confirmText === "DELETE", [confirmText]);

  const handleDeactivate = async () => {
    try {
      setError(null);

      if (!isValidConfirmText) {
        throw new Error(t("deactivateErrorConfirmText"));
      }

      if (isEmailAuthUser && !password) {
        throw new Error(t("deactivateErrorPasswordRequired"));
      }

      setIsSubmitting(true);

      const result = await deactivateAccount({
        confirmText,
        password: isEmailAuthUser ? password : undefined,
      });

      const scheduleText = result.scheduled_for
        ? new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US").format(
            new Date(result.scheduled_for)
          )
        : t("deactivateFallbackDate");

      toast({
        title: t("deactivateToastTitle"),
        description: t("deactivateToastDescription", { date: scheduleText }),
      });

      await signOut();
      onOpenChange(false);
      router.push("/login?message=deactivated");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("deactivateErrorGeneric"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-600">{t("deactivateTitle")}</DialogTitle>
          <DialogDescription>{t("deactivateDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="deactivate-confirm-text">{t("deactivateConfirmLabel")}</Label>
            <Input
              id="deactivate-confirm-text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              disabled={isSubmitting}
            />
          </div>

          {isEmailAuthUser && (
            <div className="space-y-2">
              <Label htmlFor="deactivate-password">{t("deactivatePasswordLabel")}</Label>
              <Input
                id="deactivate-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("deactivatePasswordPlaceholder")}
                autoComplete="current-password"
                disabled={isSubmitting}
              />
            </div>
          )}

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t("deactivateCancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDeactivate}
            disabled={isSubmitting || !isValidConfirmText || (isEmailAuthUser && !password)}
          >
            {isSubmitting ? t("deactivateSubmitting") : t("deactivateSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
