"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

interface PostAppealFormProps {
  moderationDecisionId: string;
}

const APPEAL_BODY_MAX_LENGTH = 1000;

/**
 * 異議申立てフォーム。
 *
 * 設計判断: docs/planning/post-moderation-notification-implementation-plan.md
 *           ADR-004 / REQ-007
 *
 * 対象は投稿ではなく個々の公開停止判定。送信先は判定 ID を受け取る。
 */
export function PostAppealForm({ moderationDecisionId }: PostAppealFormProps) {
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const t = useTranslations("moderation");

  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/moderation/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moderationDecisionId, body: trimmed }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || t("appealSubmitFailed"));
      }

      toast({
        title: t("appealSubmittedTitle"),
        description: t("appealSubmittedDescription"),
      });
      setBody("");
      router.refresh();
    } catch (error) {
      toast({
        title: t("appealSubmitFailedTitle"),
        description:
          error instanceof Error ? error.message : t("appealSubmitFailed"),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="appeal_body">{t("appealBodyLabel")}</Label>
        <Textarea
          id="appeal_body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={APPEAL_BODY_MAX_LENGTH}
          rows={6}
          placeholder={t("appealBodyPlaceholder")}
        />
        <p className="text-xs text-slate-500">
          {trimmed.length} / {APPEAL_BODY_MAX_LENGTH}
        </p>
      </div>
      <Button onClick={handleSubmit} disabled={!canSubmit}>
        {isSubmitting ? t("appealSubmitting") : t("appealSubmit")}
      </Button>
    </div>
  );
}
