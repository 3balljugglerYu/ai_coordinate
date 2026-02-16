"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

const SUBJECT_OPTIONS = [
  { value: "improvement", label: "改善要望" },
  { value: "bug", label: "不具合報告" },
  { value: "other", label: "その他" },
] as const;

interface ContactFormProps {
  defaultEmail?: string;
}

export function ContactForm({ defaultEmail = "" }: ContactFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [subjectType, setSubjectType] = useState<string>("improvement");
  const [subjectDetail, setSubjectDetail] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const subject =
      subjectType === "other"
        ? subjectDetail.trim() || "その他"
        : (SUBJECT_OPTIONS.find((o) => o.value === subjectType)?.label ?? subjectDetail.trim()) || "お問い合わせ";

    if (!email.trim()) {
      toast({
        title: "入力エラー",
        description: "メールアドレスを入力してください",
        variant: "destructive",
      });
      return;
    }

    if (!message.trim()) {
      toast({
        title: "入力エラー",
        description: "お問い合わせ内容を入力してください",
        variant: "destructive",
      });
      return;
    }

    if (subjectType === "other" && !subjectDetail.trim()) {
      toast({
        title: "入力エラー",
        description: "件名を入力してください",
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
        throw new Error(data.error ?? "送信に失敗しました");
      }

      toast({
        title: "送信完了",
        description: "お問い合わせを受け付けました。3営業日以内にご連絡いたします。",
      });
      router.push("/my-page");
    } catch (err) {
      toast({
        title: "送信エラー",
        description: err instanceof Error ? err.message : "送信に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="email">メールアドレス</Label>
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
            ログイン中のアカウントのメールアドレスが使用されます
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject">お問い合わせ種別</Label>
        <Select value={subjectType} onValueChange={setSubjectType}>
          <SelectTrigger id="subject" className="text-base">
            <SelectValue placeholder="選択してください" />
          </SelectTrigger>
          <SelectContent>
            {SUBJECT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {subjectType === "other" && (
          <Input
            placeholder="件名を入力"
            value={subjectDetail}
            onChange={(e) => setSubjectDetail(e.target.value)}
            className="mt-2 text-base"
          />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">お問い合わせ内容</Label>
        <Textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="改善要望やご意見をご記入ください"
          rows={6}
          required
          maxLength={5000}
          className="resize-none text-base"
        />
        <p className="text-xs text-muted-foreground">
          {message.length} / 5000 文字
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
            送信中...
          </>
        ) : (
          "送信する"
        )}
      </Button>
    </form>
  );
}
