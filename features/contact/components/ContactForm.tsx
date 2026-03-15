"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

interface ContactFormProps {
  defaultEmail?: string;
}

export function ContactForm({ defaultEmail = "" }: ContactFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("contact");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [subjectType, setSubjectType] = useState<string>("improvement");
  const [subjectDetail, setSubjectDetail] = useState("");
  const [message, setMessage] = useState("");
  const subjectOptions = [
    { value: "improvement", label: t("subjectImprovement") },
    { value: "bug", label: t("subjectBug") },
    { value: "other", label: t("subjectOther") },
  ] as const;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const selectedOption = subjectOptions.find((o) => o.value === subjectType);
    const subject =
      subjectType === "other"
        ? subjectDetail.trim() || t("subjectOther")
        : selectedOption?.label || t("subjectDefault");

    if (!email.trim()) {
      toast({
        title: t("validationTitle"),
        description: t("validationEmail"),
        variant: "destructive",
      });
      return;
    }

    if (!message.trim()) {
      toast({
        title: t("validationTitle"),
        description: t("validationMessage"),
        variant: "destructive",
      });
      return;
    }

    if (subjectType === "other" && !subjectDetail.trim()) {
      toast({
        title: t("validationTitle"),
        description: t("validationSubject"),
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          subject,
          message: message.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? t("errorGeneric"));
      }

      toast({
        title: t("successTitle"),
        description: t("successDescription"),
      });
      router.push("/my-page");
    } catch (err) {
      toast({
        title: t("errorTitle"),
        description: err instanceof Error ? err.message : t("errorGeneric"),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="email">{t("emailLabel")}</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          disabled={!!defaultEmail}
          className="text-base"
        />
        {defaultEmail && (
          <p className="text-xs text-muted-foreground">
            {t("emailHintLoggedIn")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject">{t("subjectLabel")}</Label>
        <Select value={subjectType} onValueChange={setSubjectType}>
          <SelectTrigger id="subject" className="text-base">
            <SelectValue placeholder={t("subjectPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {subjectOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {subjectType === "other" && (
          <Input
            placeholder={t("subjectDetailPlaceholder")}
            value={subjectDetail}
            onChange={(e) => setSubjectDetail(e.target.value)}
            className="mt-2 text-base"
          />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">{t("messageLabel")}</Label>
        <Textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("messagePlaceholder")}
          rows={6}
          required
          maxLength={5000}
          className="resize-none text-base"
        />
        <p className="text-xs text-muted-foreground">
          {t("messageCount", { count: message.length })}
        </p>
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full min-h-[48px] text-base"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("submitting")}
          </>
        ) : (
          t("submit")
        )}
      </Button>
    </form>
  );
}
