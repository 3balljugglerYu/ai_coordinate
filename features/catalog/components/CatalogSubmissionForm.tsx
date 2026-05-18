"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Turnstile } from "@marsidev/react-turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";

interface CatalogSubmissionFormProps {
  campaignSlug: string;
  campaignTitle: string;
  turnstileSiteKey: string | null;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

export function CatalogSubmissionForm({
  campaignSlug,
  campaignTitle,
  turnstileSiteKey,
}: CatalogSubmissionFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [xAccountUrl, setXAccountUrl] = useState("");
  const [sourceTweetUrl, setSourceTweetUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0] ?? null;
    setFile(next);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(next ? URL.createObjectURL(next) : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast({ variant: "destructive", title: "画像を選択してください" });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast({
        variant: "destructive",
        title: "画像サイズが大きすぎます",
        description: "10MB 以下に圧縮してください。",
      });
      return;
    }
    if (!ACCEPTED_MIME.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "対応していないファイル形式です",
        description: "PNG / JPEG / WebP をご利用ください。",
      });
      return;
    }
    if (displayName.trim() === "") {
      toast({ variant: "destructive", title: "表示名は必須です" });
      return;
    }
    if (!consent) {
      toast({ variant: "destructive", title: "著作権同意が必要です" });
      return;
    }
    if (turnstileSiteKey && !turnstileToken) {
      toast({
        variant: "destructive",
        title: "セキュリティチェックを完了してください",
      });
      return;
    }

    const formData = new FormData();
    formData.set("campaign_slug", campaignSlug);
    formData.set("display_name", displayName.trim());
    formData.set("x_account_url", xAccountUrl.trim());
    formData.set("source_tweet_url", sourceTweetUrl.trim());
    formData.set("alt", alt.trim());
    formData.set("submitter_email", submitterEmail.trim());
    formData.set("copyright_consent", "true");
    if (turnstileToken) {
      formData.set("turnstile_token", turnstileToken);
    }
    formData.set("image", file);

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/catalog/submissions", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? "申請に失敗しました");
      }
      toast({ title: "申請を受け付けました" });
      router.push("/catalog/submit/thanks");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "申請に失敗しました",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <header>
        <h2 className="text-lg font-semibold text-slate-900">
          {campaignTitle} に作品を申請
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          未ログインでも申請できます。運営者の審査後、公開ページに掲載されます。
        </p>
      </header>

      <div className="space-y-2">
        <Label htmlFor="image">作品画像 (PNG / JPEG / WebP, 10MB 以下)</Label>
        <Input
          id="image"
          type="file"
          accept={ACCEPTED_MIME.join(",")}
          onChange={handleFileChange}
        />
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="プレビュー"
            className="mt-2 max-h-64 rounded-md border border-slate-200 object-contain"
          />
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="display_name">表示名 (X ハンドル名)</Label>
        <Input
          id="display_name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={64}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="x_account_url">X アカウント URL</Label>
        <Input
          id="x_account_url"
          type="url"
          value={xAccountUrl}
          onChange={(e) => setXAccountUrl(e.target.value)}
          placeholder="https://x.com/your_handle"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="source_tweet_url">
          その作品を投稿したツイート URL
        </Label>
        <Input
          id="source_tweet_url"
          type="url"
          value={sourceTweetUrl}
          onChange={(e) => setSourceTweetUrl(e.target.value)}
          placeholder="https://x.com/your_handle/status/..."
          required
        />
        <p className="text-xs text-slate-500">
          ※ 運営者がこの URL を開いて、X アカウント所有者であることを確認します。
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="alt">作品の説明 (任意)</Label>
        <Textarea
          id="alt"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          maxLength={280}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="submitter_email">通知用メール (任意)</Label>
        <Input
          id="submitter_email"
          type="email"
          value={submitterEmail}
          onChange={(e) => setSubmitterEmail(e.target.value)}
        />
        <p className="text-xs text-slate-500">
          承認 / 差戻しの結果をこのメールに送ります。空欄でも申請できます。
        </p>
      </div>

      <label className="flex items-start gap-3 text-sm text-slate-700">
        <Checkbox
          checked={consent}
          onCheckedChange={(checked) => setConsent(checked === true)}
          className="mt-0.5"
        />
        <span>
          自分の作品であり、第三者の権利を侵害していないことに同意します。Pelsta が
          本企画のカタログ表示に利用することに同意します。
        </span>
      </label>

      {turnstileSiteKey ? (
        <div>
          <Turnstile
            siteKey={turnstileSiteKey}
            onSuccess={(token: string) => setTurnstileToken(token)}
            onError={() => setTurnstileToken(null)}
            onExpire={() => setTurnstileToken(null)}
          />
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "送信中..." : "申請する"}
        </Button>
      </div>
    </form>
  );
}
