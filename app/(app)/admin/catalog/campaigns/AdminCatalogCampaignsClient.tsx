"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import type { CatalogCampaignRow } from "@/features/catalog/lib/repository";

interface AdminCampaign extends CatalogCampaignRow {
  /** SSR で解決済みの signed URL。アップロード後は client 側で別途 router.refresh する */
  cover_image_url: string | null;
}

interface Props {
  initialCampaigns: AdminCampaign[];
}

interface FormState {
  slug: string;
  title: string;
  description: string;
  theme_hashtag: string;
  display_order: string;
}

const EMPTY_FORM: FormState = {
  slug: "",
  title: "",
  description: "",
  theme_hashtag: "",
  display_order: "0",
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COVER_MAX_BYTES = 10 * 1024 * 1024;
const COVER_ACCEPT = "image/png,image/jpeg,image/jpg,image/webp";

/**
 * 絵師カタログの企画管理画面 (admin)。
 * 新規作成・公開状態の切替・削除・カバー画像のアップロード/差替/削除を行う。
 */
export function AdminCatalogCampaignsClient({ initialCampaigns }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [campaigns, setCampaigns] =
    useState<AdminCampaign[]>(initialCampaigns);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [coverUploadingId, setCoverUploadingId] = useState<string | null>(null);
  const coverInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleCreate = useCallback(async () => {
    if (!SLUG_PATTERN.test(form.slug)) {
      toast({
        variant: "destructive",
        title: "slug が不正です",
        description:
          "英小文字・数字・ハイフンのみ。例: pelsta-cat-coordinate",
      });
      return;
    }
    if (form.title.trim() === "") {
      toast({ variant: "destructive", title: "タイトルが必須です" });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/catalog/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: form.slug.trim(),
          title: form.title.trim(),
          description: form.description.trim() || null,
          theme_hashtag: form.theme_hashtag.trim() || null,
          display_order: Number(form.display_order) || 0,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? "作成に失敗しました");
      }
      const { campaign } = (await response.json()) as {
        campaign: CatalogCampaignRow;
      };
      setCampaigns((prev) => [{ ...campaign, cover_image_url: null }, ...prev]);
      setForm(EMPTY_FORM);
      toast({ title: "企画を作成しました" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "作成に失敗しました",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [form, toast]);

  const handleToggleStatus = useCallback(
    async (campaign: AdminCampaign) => {
      const nextStatus =
        campaign.status === "published" ? "draft" : "published";
      try {
        const response = await fetch(
          `/api/admin/catalog/campaigns/${campaign.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: nextStatus }),
          },
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error ?? "更新に失敗しました");
        }
        const { campaign: updated } = (await response.json()) as {
          campaign: CatalogCampaignRow;
        };
        setCampaigns((prev) =>
          prev.map((c) =>
            c.id === updated.id
              ? { ...updated, cover_image_url: c.cover_image_url }
              : c,
          ),
        );
        toast({
          title:
            nextStatus === "published" ? "公開しました" : "非公開にしました",
        });
        router.refresh();
      } catch (err) {
        toast({
          variant: "destructive",
          title: "更新に失敗しました",
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [router, toast],
  );

  const handleDelete = useCallback(
    async (campaign: AdminCampaign) => {
      if (
        !window.confirm(
          `企画「${campaign.title}」を削除しますか? 関連するエントリーもすべて削除されます。`,
        )
      ) {
        return;
      }
      try {
        const response = await fetch(
          `/api/admin/catalog/campaigns/${campaign.id}`,
          { method: "DELETE" },
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error ?? "削除に失敗しました");
        }
        setCampaigns((prev) => prev.filter((c) => c.id !== campaign.id));
        toast({ title: "削除しました" });
      } catch (err) {
        toast({
          variant: "destructive",
          title: "削除に失敗しました",
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [toast],
  );

  const handleCoverUpload = useCallback(
    async (campaign: AdminCampaign, file: File) => {
      if (file.size > COVER_MAX_BYTES) {
        toast({
          variant: "destructive",
          title: "画像サイズが大きすぎます",
          description: "10MB 以下に圧縮してください。",
        });
        return;
      }
      const formData = new FormData();
      formData.set("image", file);

      setCoverUploadingId(campaign.id);
      try {
        const response = await fetch(
          `/api/admin/catalog/campaigns/${campaign.id}/cover`,
          { method: "POST", body: formData },
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error ?? "アップロードに失敗しました");
        }
        toast({ title: "カバー画像をアップロードしました" });
        // signed URL は server 側で発行する必要があるので router.refresh で再フェッチ
        router.refresh();
      } catch (err) {
        toast({
          variant: "destructive",
          title: "アップロードに失敗しました",
          description: err instanceof Error ? err.message : undefined,
        });
      } finally {
        setCoverUploadingId(null);
        const input = coverInputRefs.current[campaign.id];
        if (input) input.value = "";
      }
    },
    [router, toast],
  );

  const handleCoverRemove = useCallback(
    async (campaign: AdminCampaign) => {
      if (!campaign.cover_storage_path) return;
      if (!window.confirm("カバー画像を外しますか?")) return;

      setCoverUploadingId(campaign.id);
      try {
        const response = await fetch(
          `/api/admin/catalog/campaigns/${campaign.id}/cover`,
          { method: "DELETE" },
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error ?? "削除に失敗しました");
        }
        setCampaigns((prev) =>
          prev.map((c) =>
            c.id === campaign.id
              ? { ...c, cover_storage_path: null, cover_image_url: null }
              : c,
          ),
        );
        toast({ title: "カバー画像を外しました" });
        router.refresh();
      } catch (err) {
        toast({
          variant: "destructive",
          title: "削除に失敗しました",
          description: err instanceof Error ? err.message : undefined,
        });
      } finally {
        setCoverUploadingId(null);
      }
    },
    [router, toast],
  );

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">新規企画の作成</h2>
        <p className="mt-1 text-sm text-slate-500">
          作成直後は draft 状態です。リスト側で「公開」を押すと公開ページに反映されます。
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-1">
            <Label htmlFor="slug">slug (URL に使う英小文字)</Label>
            <Input
              id="slug"
              value={form.slug}
              onChange={(e) => setForm((s) => ({ ...s, slug: e.target.value }))}
              placeholder="pelsta-cat-coordinate"
            />
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="display_order">表示順 (数値)</Label>
            <Input
              id="display_order"
              type="number"
              value={form.display_order}
              onChange={(e) =>
                setForm((s) => ({ ...s, display_order: e.target.value }))
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="title">タイトル</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) =>
                setForm((s) => ({ ...s, title: e.target.value }))
              }
              placeholder="ペルスタ猫コーデ企画 2026"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="description">説明</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) =>
                setForm((s) => ({ ...s, description: e.target.value }))
              }
              placeholder="この企画の趣旨を記載します"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="hashtag">X ハッシュタグ (任意)</Label>
            <Input
              id="hashtag"
              value={form.theme_hashtag}
              onChange={(e) =>
                setForm((s) => ({ ...s, theme_hashtag: e.target.value }))
              }
              placeholder="ペルスタ猫コーデ"
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          ※ カバー画像は作成後に下の一覧からアップロードできます。
        </p>
        <div className="mt-4 flex justify-end">
          <Button onClick={handleCreate} disabled={isSubmitting}>
            {isSubmitting ? "作成中..." : "企画を作成"}
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">企画一覧</h2>
        {campaigns.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            まだ企画はありません。
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200">
            {campaigns.map((campaign) => {
              const isUploadingCover = coverUploadingId === campaign.id;
              return (
                <li
                  key={campaign.id}
                  className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex min-w-0 flex-1 gap-4">
                    {/* カバー画像プレビュー */}
                    <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                      {campaign.cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={campaign.cover_image_url}
                          alt={`${campaign.title} のカバー画像`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                          画像なし
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">
                          {campaign.title}
                        </span>
                        <code className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          /catalog/{campaign.slug}
                        </code>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            campaign.status === "published"
                              ? "bg-green-100 text-green-800"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {campaign.status === "published"
                            ? "公開中"
                            : "下書き"}
                        </span>
                      </div>
                      {campaign.description ? (
                        <p className="mt-1 text-sm text-slate-600">
                          {campaign.description}
                        </p>
                      ) : null}

                      {/* カバー画像のアクション */}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <input
                          ref={(el) => {
                            coverInputRefs.current[campaign.id] = el;
                          }}
                          type="file"
                          accept={COVER_ACCEPT}
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleCoverUpload(campaign, file);
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            coverInputRefs.current[campaign.id]?.click()
                          }
                          disabled={isUploadingCover}
                        >
                          {campaign.cover_storage_path
                            ? "カバー画像を差し替え"
                            : "カバー画像をアップロード"}
                        </Button>
                        {campaign.cover_storage_path ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCoverRemove(campaign)}
                            disabled={isUploadingCover}
                          >
                            画像を外す
                          </Button>
                        ) : null}
                        {isUploadingCover ? (
                          <span className="text-slate-500">処理中...</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleStatus(campaign)}
                    >
                      {campaign.status === "published"
                        ? "非公開にする"
                        : "公開する"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(campaign)}
                    >
                      削除
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
