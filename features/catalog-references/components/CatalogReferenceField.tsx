"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { normalizeSourceImage } from "@/features/generation/lib/normalize-source-image";
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

/**
 * カタログをつくる(/free)の「見本(参照画像)」の欄。見本を使える人(運営が選んだ人)にだけ出す。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 6)
 *
 * - 使ってはいけない画像を選ばないことへの同意にチェックしてから選べる(API も同意を確かめる)
 * - 選んだら元の画像と同じく縮めて(大きい写真で上限に当たらないように)、POST /api/catalog-references に上げる
 * - 見本はほかの人には見えない。見本を使った作品は、運営の確認のあとで投稿できる
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

  // 外したとき・置き換えたときに、前のプレビューの URL を放す
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

  const handleFile = async (file: File) => {
    setError(null);
    setUploadingState(true);
    try {
      const normalized = await normalizeSourceImage(file);
      const form = new FormData();
      form.append("file", normalized);
      form.append("copyrightConsent", "true");
      const res = await fetch("/api/catalog-references", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !body?.id) {
        throw new Error(body?.error || t("catalogReferenceUploadFailed"));
      }
      onChange({
        id: body.id,
        previewUrl: URL.createObjectURL(normalized),
        takes: value?.takes.length ? value.takes : DEFAULT_TAKES,
      });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("catalogReferenceUploadFailed"));
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
          </fieldset>
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
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
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
