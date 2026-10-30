"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  prepareCatalogReferenceImage,
  ReferenceImageError,
  type ReferenceImageProblem,
} from "@/features/catalog-references/lib/prepare-reference-image";
import { SUBMISSION_IMAGE_MIN_DIMENSION } from "@/features/inspire/lib/submission-image-constraints";
import {
  CATALOG_REFERENCE_TAKES,
  type CatalogReferenceTake,
} from "@/shared/generation/catalog-reference";

/** 上げ終えた見本(id はサーバーが返したもの。画像の場所は持たない) */
export interface CatalogReferenceValue {
  id: string;
  /** 手元のファイルから作った blob の URL(表示だけに使う) */
  previewUrl: string;
  takes: CatalogReferenceTake[];
}

interface CatalogReferenceFieldProps {
  value: CatalogReferenceValue | null;
  onChange: (value: CatalogReferenceValue | null) => void;
  /** 上げている間は生成させない */
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
}

const TAKE_LABEL_KEYS = {
  outfit: "catalogReferenceTakeOutfit",
  angle: "catalogReferenceTakeAngle",
  pose: "catalogReferenceTakePose",
  background: "catalogReferenceTakeBackground",
} as const satisfies Record<CatalogReferenceTake, string>;

/** 上げたときに最初から選んでおくまねるもの */
const DEFAULT_TAKES: CatalogReferenceTake[] = ["outfit"];

/** 手元で断った理由の文言 */
const PROBLEM_KEYS = {
  load_failed: "catalogReferenceInvalid",
  too_small: "catalogReferenceTooSmall",
  too_large: "catalogReferenceTooLarge",
} as const satisfies Record<ReferenceImageProblem, string>;

/** API の断りの文言(API の文は日本語だけなので、言語ごとの文言に置き換える) */
const UPLOAD_ERROR_KEYS: Record<
  string,
  (typeof PROBLEM_KEYS)[ReferenceImageProblem] | "catalogReferenceAuthRequired" | "catalogReferenceNotAllowed"
> = {
  CATALOG_REFERENCE_AUTH_REQUIRED: "catalogReferenceAuthRequired",
  CATALOG_REFERENCE_NOT_ALLOWED: "catalogReferenceNotAllowed",
  CATALOG_REFERENCE_IMAGE_INVALID: "catalogReferenceInvalid",
  CATALOG_REFERENCE_IMAGE_TOO_SMALL: "catalogReferenceTooSmall",
  CATALOG_REFERENCE_IMAGE_TOO_LARGE: "catalogReferenceTooLarge",
  CATALOG_REFERENCE_FILE_TOO_LARGE: "catalogReferenceTooLarge",
};

/**
 * カタログをつくる(/free)の「見本(参照画像)」の欄。見本を使える人(運営が選んだ人)にだけ出す。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 6)
 *
 * - 使ってはいけない画像を選ばないことへの同意にチェックしてから選べる(API も同意を確かめる)
 * - 選んだら、API の決まり(縦横とも 768〜4096px・4MB まで)に合わせて手元で縮め、POST /api/catalog-references に上げる
 *   (HEIC はブラウザで読めないので受け付けない。iPhone は JPEG に変えて渡す)
 * - 見本はほかの人には見えない。見本を使った作品は、運営の確認のあとで投稿できる(第2案の帯。目安は2日以内)
 * - 同意は今は毎回のチェック。第2案(初めてのときだけ絵の例で見せる)は 6b で作る
 */
export function CatalogReferenceField({
  value,
  onChange,
  onUploadingChange,
  disabled = false,
}: CatalogReferenceFieldProps) {
  const t = useTranslations("free");
  const fieldId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [consented, setConsented] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 外したときに、プレビューの URL を放す
  const previewUrl = value?.previewUrl;
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const setUploadingState = (next: boolean) => {
    setUploading(next);
    onUploadingChange?.(next);
  };

  const messageFor = (key: (typeof UPLOAD_ERROR_KEYS)[string] | "catalogReferenceUploadFailed") =>
    key === "catalogReferenceTooSmall" ? t(key, { min: SUBMISSION_IMAGE_MIN_DIMENSION }) : t(key);

  const handleFile = async (file: File) => {
    setError(null);
    setUploadingState(true);
    try {
      let prepared: File;
      try {
        prepared = await prepareCatalogReferenceImage(file);
      } catch (e) {
        setError(messageFor(e instanceof ReferenceImageError ? PROBLEM_KEYS[e.problem] : "catalogReferenceInvalid"));
        return;
      }
      const form = new FormData();
      form.append("file", prepared);
      form.append("copyrightConsent", "true");
      let res: Response;
      try {
        res = await fetch("/api/catalog-references", { method: "POST", body: form });
      } catch {
        setError(messageFor("catalogReferenceUploadFailed"));
        return;
      }
      const body = (await res.json().catch(() => null)) as { id?: string; errorCode?: string } | null;
      if (!res.ok || !body?.id) {
        setError(messageFor((body?.errorCode && UPLOAD_ERROR_KEYS[body.errorCode]) || "catalogReferenceUploadFailed"));
        return;
      }
      onChange({ id: body.id, previewUrl: URL.createObjectURL(prepared), takes: DEFAULT_TAKES });
    } finally {
      setUploadingState(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleTake = (take: CatalogReferenceTake, checked: boolean) => {
    if (!value) return;
    // 並びはいつも決まった順(衣装・アングル・ポーズ・背景)にする
    const takes = CATALOG_REFERENCE_TAKES.filter((key) =>
      key === take ? checked : value.takes.includes(key),
    );
    onChange({ ...value, takes });
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-gray-300 p-4" data-testid="catalog-reference-field">
      <div>
        <Label className="block text-base font-medium">{t("catalogReferenceLabel")}</Label>
        <p className="mt-1 text-sm text-muted-foreground">{t("catalogReferenceHint")}</p>
      </div>

      {value ? (
        <div className="space-y-3">
          <div className="relative w-32">
            {/* 手元のファイルの blob の URL なので next/image を通さない */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.previewUrl}
              alt={t("catalogReferenceImageAlt")}
              className="aspect-square w-32 rounded-md bg-gray-100 object-contain"
            />
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute -right-2 -top-2 h-7 w-7 rounded-full"
              onClick={() => onChange(null)}
              disabled={disabled}
              aria-label={t("catalogReferenceRemove")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <fieldset>
            <legend className="text-sm font-medium">{t("catalogReferenceTakesLabel")}</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {CATALOG_REFERENCE_TAKES.map((take) => (
                <div key={take} className="flex items-center gap-2">
                  <Checkbox
                    id={`${fieldId}-${take}`}
                    checked={value.takes.includes(take)}
                    onCheckedChange={(checked) => toggleTake(take, checked === true)}
                    disabled={disabled}
                  />
                  <Label htmlFor={`${fieldId}-${take}`} className="text-sm">
                    {t(TAKE_LABEL_KEYS[take])}
                  </Label>
                </div>
              ))}
            </div>
            {value.takes.length === 0 ? (
              <p className="mt-2 text-sm text-destructive">{t("catalogReferenceTakesRequired")}</p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">{t("catalogReferenceNotTaken")}</p>
          </fieldset>
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="catalog-reference-review-banner">
            {t("catalogReferenceReviewBanner")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <Checkbox
              id={`${fieldId}-consent`}
              checked={consented}
              onCheckedChange={(checked) => setConsented(checked === true)}
              disabled={disabled || uploading}
            />
            <Label htmlFor={`${fieldId}-consent`} className="text-sm leading-snug">
              {t("catalogReferenceConsent")}
            </Label>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            data-testid="catalog-reference-file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || !consented || uploading}
            pending={uploading}
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            {uploading ? t("catalogReferenceUploading") : t("catalogReferenceChoose")}
          </Button>
        </div>
      )}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
