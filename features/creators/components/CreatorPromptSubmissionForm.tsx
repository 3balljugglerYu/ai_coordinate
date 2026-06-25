"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CREATOR_PROMPT_BODY_MAX_LENGTH,
  CREATOR_PROMPT_CATEGORY_KEYS,
  CREATOR_PROMPT_CONSENT_KEYS,
  CREATOR_PROMPT_PROVIDERS,
  CREATOR_PROMPT_THUMBNAIL_RECOMMENDED,
  CREATOR_PROMPT_TITLE_MAX_LENGTH,
  isAllCreatorPromptConsentsAcknowledged,
  type CreatorPromptCategoryKey,
  type CreatorPromptConsentKey,
  type CreatorPromptProvider,
} from "@/features/style-presets/lib/creator-submission";
import { CreatorPromptCardPreview } from "./CreatorPromptCardPreview";

/** /style での見え方プレビューに渡すカテゴリのバッジ情報(DB の preset_categories 由来)。 */
export interface CreatorPromptCategoryBadge {
  label: string;
  badgeColor: string;
  badgeTextColor: string;
}

const PROVIDER_LABEL: Record<CreatorPromptProvider, string> = {
  openai: "ChatGPT(GPT Image)",
  gemini: "nanobanana(Gemini)",
};

const CATEGORY_LABEL: Record<
  CreatorPromptCategoryKey,
  { title: string; desc: string }
> = {
  character_remix: {
    title: "アレンジ",
    desc: "アップロードしたイラストそのものを、イメージに沿って変身させる",
  },
  character_coordinate: {
    title: "テイスト",
    desc: "アップロードしたキャラの衣装や背景を変更する",
  },
};

const CONSENT_LABEL: Record<CreatorPromptConsentKey, string> = {
  copyright: "提供する内容は自分が権利を持っている、または権利者の許諾を得ています",
  third_party_ip:
    "第三者の著作権・商標・肖像等を侵害しません(特定キャラクターの無断再現等を含みません)",
  secondary_use: "Persta.AI 上での生成・表示・二次利用に同意します",
  promo_use: "Persta.AI の告知・宣伝での利用に同意します",
  no_sensitive: "公序良俗に反する内容・センシティブな内容を含みません",
  prompt_original:
    "提供するプロンプトは自分で作成したもの(または権利がクリアなもの)です",
};

const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

export function CreatorPromptSubmissionForm({
  submitterAvatarUrl = null,
  categoryBadges = {},
}: {
  submitterAvatarUrl?: string | null;
  submitterNickname?: string | null;
  categoryBadges?: Record<string, CreatorPromptCategoryBadge>;
} = {}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [categoryKey, setCategoryKey] = useState<CreatorPromptCategoryKey>(
    "character_remix"
  );
  const [providers, setProviders] = useState<CreatorPromptProvider[]>(["openai"]);
  const [recommended, setRecommended] = useState<CreatorPromptProvider>("openai");
  const [consents, setConsents] = useState<
    Partial<Record<CreatorPromptConsentKey, boolean>>
  >({});
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const toggleProvider = (p: CreatorPromptProvider) => {
    setProviders((prev) => {
      const next = prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p];
      // 推奨が対応から外れたら、残った先頭を推奨にする。
      if (!next.includes(recommended) && next.length > 0) {
        setRecommended(next[0]);
      }
      return next;
    });
  };

  const handleFile = (file: File | null) => {
    setError(null);
    // 既存の objectURL を解放(再選択時のメモリリーク防止)。
    if (thumbnailPreview) {
      URL.revokeObjectURL(thumbnailPreview);
    }
    if (!file) {
      setThumbnailFile(null);
      setThumbnailPreview(null);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("サムネは JPEG / PNG / WebP を選んでください");
      return;
    }
    if (file.size > MAX_THUMBNAIL_BYTES) {
      setError("サムネは 5MB 以下にしてください");
      return;
    }
    setThumbnailFile(file);
    setThumbnailPreview(URL.createObjectURL(file));
  };

  const allConsents = isAllCreatorPromptConsentsAcknowledged(consents);
  const canSubmit =
    !submitting &&
    title.trim().length > 0 &&
    prompt.trim().length > 0 &&
    providers.length > 0 &&
    !!thumbnailFile &&
    allConsents;

  const handleSubmit = async () => {
    if (!canSubmit || !thumbnailFile) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(),
        prompt: prompt.trim(),
        categoryKey,
        targetProviders: providers,
        recommendedProvider: recommended,
        // 実際のチェック状態をシリアライズする(canSubmit で全 true を保証済みだが、
        // 固定値ではなくユーザー操作の記録を送る)。サーバ側 zod は各キー z.literal(true) を要求。
        consents: {
          copyright: consents.copyright === true,
          third_party_ip: consents.third_party_ip === true,
          secondary_use: consents.secondary_use === true,
          promo_use: consents.promo_use === true,
          no_sensitive: consents.no_sensitive === true,
          prompt_original: consents.prompt_original === true,
          version: "1.0",
          acknowledged_at: new Date().toISOString(),
        },
      };
      const formData = new FormData();
      formData.append("payload", JSON.stringify(payload));
      formData.append("thumbnail", thumbnailFile);

      const res = await fetch("/api/style-presets/submissions", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "申請に失敗しました");
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError("通信に失敗しました。時間をおいて再度お試しください");
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center">
        <p className="text-2xl">🎉</p>
        <h2 className="mt-2 text-xl font-bold text-amber-900">
          申請を受け付けました!
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-amber-800">
          運営がプレビューを生成して内容を確認します。掲載が決まりましたら、
          ホームと Style 画面にあなたの名前・アイコン付きで並びます。
        </p>
        <Button
          type="button"
          className="mt-6 rounded-full bg-amber-500 hover:bg-amber-600"
          onClick={() => router.push("/my-page")}
        >
          マイページへ戻る
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-3xl bg-gradient-to-br from-amber-50 to-rose-50 p-6 text-center">
        <h1 className="text-2xl font-bold text-amber-900">
          プロンプトを提供する 🎨
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-amber-800">
          あなたのプロンプトを One-Tap Style に掲載します。
          <br />
          プロンプトは<strong>非公開で保護</strong>され、サムネと
          <strong>あなたの名前・アイコン</strong>付きで掲載されます。
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cp-title" className="text-base font-medium">
          タイトル
        </Label>
        <Input
          id="cp-title"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, CREATOR_PROMPT_TITLE_MAX_LENGTH))}
          placeholder="例: ふんわり水彩タッチ"
          maxLength={CREATOR_PROMPT_TITLE_MAX_LENGTH}
        />
        <p className="text-right text-xs text-gray-400">
          {title.length}/{CREATOR_PROMPT_TITLE_MAX_LENGTH}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cp-prompt" className="text-base font-medium">
          プロンプト(非公開で保護されます)
        </Label>
        <Textarea
          id="cp-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, CREATOR_PROMPT_BODY_MAX_LENGTH))}
          placeholder="生成したいスタイルのプロンプトを貼り付けてください"
          rows={6}
          maxLength={CREATOR_PROMPT_BODY_MAX_LENGTH}
        />
        <p className="text-right text-xs text-gray-400">
          {prompt.length}/{CREATOR_PROMPT_BODY_MAX_LENGTH}
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-base font-medium">種類</Label>
        <p className="text-xs text-gray-500">
          どちらのスタイルかを選んでください(背景の指定はプロンプト本文に含めてください)。
        </p>
        <div className="space-y-2">
          {CREATOR_PROMPT_CATEGORY_KEYS.map((key) => (
            <label
              key={key}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 p-3 has-[:checked]:border-amber-400 has-[:checked]:bg-amber-50"
            >
              <input
                type="radio"
                name="cp-category"
                className="mt-1"
                checked={categoryKey === key}
                onChange={() => setCategoryKey(key)}
              />
              <span>
                <span className="block text-sm font-medium">
                  {CATEGORY_LABEL[key].title}
                </span>
                <span className="block text-xs text-gray-500">
                  {CATEGORY_LABEL[key].desc}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-base font-medium">対応モデル(1つ以上)</Label>
        <p className="text-xs text-gray-500">
          動作確認したモデルを選んでください。選んだモデルでプレビューを自動生成します。
        </p>
        <div className="space-y-2">
          {CREATOR_PROMPT_PROVIDERS.map((p) => (
            <div key={p} className="flex items-center gap-2">
              <Checkbox
                id={`cp-provider-${p}`}
                checked={providers.includes(p)}
                onCheckedChange={() => toggleProvider(p)}
              />
              <Label htmlFor={`cp-provider-${p}`} className="text-sm font-normal">
                {PROVIDER_LABEL[p]}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {providers.length >= 2 ? (
        <div className="space-y-2">
          <Label className="text-base font-medium">推奨モデル</Label>
          <p className="text-xs text-gray-500">
            ユーザー生成時に既定で使うモデルを1つ選んでください。
          </p>
          <div className="flex gap-4">
            {providers.map((p) => (
              <div key={p} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  id={`cp-recommended-${p}`}
                  name="cp-recommended"
                  checked={recommended === p}
                  onChange={() => setRecommended(p)}
                />
                <label htmlFor={`cp-recommended-${p}`}>{PROVIDER_LABEL[p]}</label>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label className="text-base font-medium">サムネイル画像(縦長 3:4)</Label>
        <p className="text-xs text-gray-500">
          ホーム・Style 画面に表示されます。3:4(例:
          {CREATOR_PROMPT_THUMBNAIL_RECOMMENDED.width}×
          {CREATOR_PROMPT_THUMBNAIL_RECOMMENDED.height}px)推奨。JPEG/PNG/WebP・5MB 以内。
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex aspect-[3/4] w-32 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100"
          >
            {thumbnailPreview ? (
              <Image
                src={thumbnailPreview}
                alt="サムネプレビュー"
                width={CREATOR_PROMPT_THUMBNAIL_RECOMMENDED.width}
                height={CREATOR_PROMPT_THUMBNAIL_RECOMMENDED.height}
                className="h-full w-full object-cover"
                unoptimized
              />
            ) : (
              <span className="text-sm">画像を選ぶ</span>
            )}
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-medium text-gray-700">同意事項</p>
        {CREATOR_PROMPT_CONSENT_KEYS.map((key) => (
          <div key={key} className="flex items-start gap-2">
            <Checkbox
              id={`cp-consent-${key}`}
              className="mt-0.5"
              checked={consents[key] === true}
              onCheckedChange={(checked) =>
                setConsents((prev) => ({ ...prev, [key]: checked === true }))
              }
            />
            <Label
              htmlFor={`cp-consent-${key}`}
              className="text-xs font-normal leading-relaxed text-gray-600"
            >
              {CONSENT_LABEL[key]}
            </Label>
          </div>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        className="w-full rounded-full bg-amber-500 py-6 text-base font-bold hover:bg-amber-600 disabled:opacity-50"
        disabled={!canSubmit}
        onClick={handleSubmit}
      >
        {submitting ? "申請中..." : "この内容で申請する"}
      </Button>

      {/* /style での見え方を示すフローティングプレビュー(タイトル/種類/サムネ/申請者アイコンを即時反映) */}
      <CreatorPromptCardPreview
        title={title}
        thumbnailUrl={thumbnailPreview}
        avatarUrl={submitterAvatarUrl}
        badge={
          categoryBadges[categoryKey] ?? {
            label: CATEGORY_LABEL[categoryKey].title,
            badgeColor: "#1f2937",
            badgeTextColor: "#ffffff",
          }
        }
      />
    </div>
  );
}
