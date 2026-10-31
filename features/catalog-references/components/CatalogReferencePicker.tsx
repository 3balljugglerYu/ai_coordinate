"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  prepareCatalogReferenceImage,
  ReferenceImageError,
  type ReferenceImageProblem,
} from "@/features/catalog-references/lib/prepare-reference-image";
import {
  hasSeenCatalogReferenceIntro,
  markCatalogReferenceIntroSeen,
  subscribeCatalogReferenceFlags,
} from "@/features/catalog-references/lib/local-flags";
import type { CatalogReferenceValue } from "@/features/catalog-references/types";
import { SUBMISSION_IMAGE_MIN_DIMENSION } from "@/features/inspire/lib/submission-image-constraints";
import type { CatalogReferenceTake } from "@/shared/generation/catalog-reference";
import { CatalogReferenceConsentSheet } from "./CatalogReferenceConsentSheet";
import { CatalogReferenceIntroSheet } from "./CatalogReferenceIntroSheet";
import { REFERENCE_STRIPES_CLASS } from "./reference-styles";

interface CatalogReferencePickerProps {
  /** うちの子の欄(元の画像を上げる部品。並べて置く) */
  ownImage: ReactNode;
  value: CatalogReferenceValue | null;
  onChange: (value: CatalogReferenceValue | null) => void;
  /** 上げている間は生成させない */
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
  /**
   * 有効な同意がサーバーにあるか(/free のサーバーで確かめた値)。あれば同意の画面を出さない。
   * 同意が無い・同意のあとに本人の見本が作り直しになったときは false
   */
  consented: boolean;
  /** 一度でも同意したことがあるか。無いときだけ「先行公開」の案内と「次からは出ません」を出す */
  consentedBefore: boolean;
  /** 本人の ID(案内を見た印を、本人ごとに分けて端末に残す) */
  userId: string;
}

/** 上げたときに最初から選んでおくまねるもの */
const DEFAULT_TAKES: CatalogReferenceTake[] = ["outfit"];

/** 手元で断った理由の文言 */
const PROBLEM_KEYS = {
  load_failed: "catalogReferenceInvalid",
  too_small: "catalogReferenceTooSmall",
  too_large: "catalogReferenceTooLarge",
} as const satisfies Record<ReferenceImageProblem, string>;

type UploadErrorKey =
  | (typeof PROBLEM_KEYS)[ReferenceImageProblem]
  | "catalogReferenceAuthRequired"
  | "catalogReferenceNotAllowed"
  | "catalogReferenceConsentRequired"
  | "catalogReferenceConsentFailed"
  | "catalogReferenceUploadFailed";

/** API の断りの文言(API の文は日本語だけなので、言語ごとの文言に置き換える) */
const UPLOAD_ERROR_KEYS: Record<string, UploadErrorKey> = {
  CATALOG_REFERENCE_AUTH_REQUIRED: "catalogReferenceAuthRequired",
  CATALOG_REFERENCE_NOT_ALLOWED: "catalogReferenceNotAllowed",
  CATALOG_REFERENCE_CONSENT_REQUIRED: "catalogReferenceConsentRequired",
  CATALOG_REFERENCE_IMAGE_INVALID: "catalogReferenceInvalid",
  CATALOG_REFERENCE_IMAGE_TOO_SMALL: "catalogReferenceTooSmall",
  CATALOG_REFERENCE_IMAGE_TOO_LARGE: "catalogReferenceTooLarge",
  CATALOG_REFERENCE_FILE_TOO_LARGE: "catalogReferenceTooLarge",
};

/**
 * カタログをつくる(/free)の画像の欄を、「うちの子」と「見本」の2枚並べにする(第2案)。
 * 見本を使える人(運営が選んだ人)にだけ出す。計画: docs/planning/i2i-catalog-review-implementation-plan.md §10
 *
 * - 有効な同意がサーバーに無い人には、見本を選んだ直後に「使える見本・使えない見本」を出す。
 *   「わかりました」で同意をサーバーに残し(POST /api/catalog-references/consent)、それから上げる。
 *   閉じたら上げない。あとから見返すこともできる(見返して「わかりました」を押しても同意にはしない)
 * - 見本を上げる API が「同意が要る」と断ったら(開いたあとに見本が作り直しになったなど)、選んだ画像を持ったまま同意の画面を出す
 * - 選んだら、API の決まり(縦横とも 768〜4096px・4MB まで)に合わせて手元で縮め、POST /api/catalog-references に上げる
 *   (HEIC はブラウザで読めないので受け付けない)
 * - 「先行公開」の案内は、一度も同意したことが無く、まだ見ていない人に1回だけ出す(見た印は本人ごとに端末に残す)
 * - プレビューの blob URL は値を持つ親(GenerationForm)が片付ける
 */
export function CatalogReferencePicker({
  ownImage,
  value,
  onChange,
  onUploadingChange,
  disabled = false,
  consented,
  consentedBefore,
  userId,
}: CatalogReferencePickerProps) {
  const t = useTranslations("free");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // この画面で同意した(サーバーに残せた)。サーバーが同意を要ると断ったら、もう一度同意を取る
  const [consentInPage, setConsentInPage] = useState<"agreed" | "required" | null>(null);
  const agreed = consentInPage === "agreed" || (consented && consentInPage !== "required");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 同意の画面を出している間、選んだ画像を持っておく(同意したら上げる)。縮め終えていれば、もう縮めない
  const [pending, setPending] = useState<{ file: File; prepared: boolean } | null>(null);
  // もう一度同意が要るわけ(同意の画面の中に出す)
  const [consentNotice, setConsentNotice] = useState<string | null>(null);
  // 開いたときの使い方を、閉じていく間も変えずに持つ(閉じる途中で文が変わらないように)
  const [consentSheet, setConsentSheet] = useState<{ open: boolean; mode: "consent" | "view" }>({
    open: false,
    mode: "view",
  });

  // 案内は、一度も同意したことが無く、まだ見ていない人にだけ出す(SSR では出さない。ほかのタブで見たら閉じる)
  const introEligible = useSyncExternalStore(
    subscribeCatalogReferenceFlags,
    () => !consentedBefore && !hasSeenCatalogReferenceIntro(userId),
    () => false,
  );
  const [introDismissed, setIntroDismissed] = useState(false);
  const introOpen = introEligible && !introDismissed;

  const setUploadingState = (next: boolean) => {
    setUploading(next);
    onUploadingChange?.(next);
  };

  const messageFor = (key: UploadErrorKey) =>
    key === "catalogReferenceTooSmall" ? t(key, { min: SUBMISSION_IMAGE_MIN_DIMENSION }) : t(key);

  /** 上げている間の印をつけて走らせる(生成させない) */
  const runBusy = async (work: () => Promise<void>) => {
    setError(null);
    setUploadingState(true);
    try {
      await work();
    } finally {
      setUploadingState(false);
    }
  };

  const uploadFile = async (file: File, alreadyPrepared = false) => {
    let prepared: File;
    try {
      prepared = alreadyPrepared ? file : await prepareCatalogReferenceImage(file);
    } catch (e) {
      setError(messageFor(e instanceof ReferenceImageError ? PROBLEM_KEYS[e.problem] : "catalogReferenceInvalid"));
      return;
    }
    const form = new FormData();
    form.append("file", prepared);
    let res: Response;
    try {
      res = await fetch("/api/catalog-references", { method: "POST", body: form });
    } catch {
      setError(messageFor("catalogReferenceUploadFailed"));
      return;
    }
    const body = (await res.json().catch(() => null)) as { id?: string; errorCode?: string } | null;
    if (!res.ok || !body?.id) {
      if (body?.errorCode === "CATALOG_REFERENCE_CONSENT_REQUIRED") {
        // 同意が無効になっていた(開いたあとに見本が作り直しになったなど)。わけを出し、縮めた画像を持ったまま同意の画面を出す
        // (わけは同意の画面の中と、閉じたあとの欄の下の両方に出す)
        const reason = messageFor("catalogReferenceConsentRequired");
        setError(reason);
        setConsentNotice(reason);
        setConsentInPage("required");
        openConsent({ file: prepared, prepared: true });
        return;
      }
      setError(messageFor((body?.errorCode && UPLOAD_ERROR_KEYS[body.errorCode]) || "catalogReferenceUploadFailed"));
      return;
    }
    onChange({ id: body.id, previewUrl: URL.createObjectURL(prepared), takes: DEFAULT_TAKES });
  };

  /** 「わかりました」を押したことをサーバーに残す。残せなかったら出す文言のキーを返す */
  const recordConsent = async (): Promise<UploadErrorKey | null> => {
    try {
      const res = await fetch("/api/catalog-references/consent", { method: "POST" });
      if (res.ok) return null;
      const body = (await res.json().catch(() => null)) as { errorCode?: string } | null;
      // ログインが切れた・一覧から外れたは、もう一度選んでも同じなので、その理由を出す
      if (body?.errorCode === "CATALOG_REFERENCE_AUTH_REQUIRED") return "catalogReferenceAuthRequired";
      if (body?.errorCode === "CATALOG_REFERENCE_NOT_ALLOWED") return "catalogReferenceNotAllowed";
      return "catalogReferenceConsentFailed";
    } catch {
      return "catalogReferenceConsentFailed";
    }
  };

  function openConsent(next: { file: File; prepared: boolean }) {
    setPending(next);
    setConsentSheet({ open: true, mode: "consent" });
  }

  const handleSelected = (file: File) => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (agreed) {
      void runBusy(() => uploadFile(file));
      return;
    }
    setError(null);
    openConsent({ file, prepared: false });
  };

  const closeConsent = () => {
    // 同意せずに閉じたら、選んだ画像は上げない
    setPending(null);
    setConsentNotice(null);
    setConsentSheet((current) => ({ ...current, open: false }));
  };

  const handleAgree = () => {
    const selected = pending;
    closeConsent();
    // 見返しただけのときは閉じるだけ(同意の画面を通らずに同意にしない)
    if (consentSheet.mode !== "consent" || !selected) return;
    void runBusy(async () => {
      const failure = await recordConsent();
      if (failure) {
        setError(messageFor(failure));
        return;
      }
      setConsentInPage("agreed");
      await uploadFile(selected.file, selected.prepared);
    });
  };

  const closeIntro = () => {
    markCatalogReferenceIntroSeen(userId);
    setIntroDismissed(true);
  };

  return (
    <div className="space-y-3" data-testid="catalog-reference-picker">
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 space-y-1.5">
          {ownImage}
          {/* 読み上げでは、うちの子の欄の見出し(画面には出さない)で読む */}
          <p className="text-center text-xs text-muted-foreground" aria-hidden="true">
            {t.rich("catalogReferenceOwnImageCaption", { b: emphasize })}
          </p>
        </div>

        <div className="min-w-0 space-y-1.5">
          <div className="relative mt-3 aspect-[3/4] w-full overflow-hidden rounded-xl">
            {value ? (
              <>
                {/* 手元のファイルの blob の URL なので next/image を通さない */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={value.previewUrl}
                  alt={t("catalogReferenceImageAlt")}
                  className="h-full w-full bg-gray-100 object-contain"
                />
                {/* 押せる広さは 44px、見た目の丸は 32px */}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="group absolute right-0 top-0 h-11 w-11 rounded-full hover:bg-transparent"
                  onClick={() => onChange(null)}
                  disabled={disabled}
                  aria-label={t("catalogReferenceRemove")}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white group-hover:bg-black/70">
                    <X className="h-4 w-4" />
                  </span>
                </Button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || uploading}
                aria-busy={uploading}
                className={cn(
                  "flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-violet-300 p-2 text-center text-xs font-medium text-violet-800",
                  REFERENCE_STRIPES_CLASS,
                  "transition-colors hover:border-violet-400",
                  "disabled:cursor-not-allowed disabled:opacity-70",
                )}
              >
                {uploading ? (
                  <LoaderCircle className="h-7 w-7 animate-spin" aria-hidden="true" />
                ) : (
                  <ImagePlus className="h-7 w-7" aria-hidden="true" />
                )}
                <span>{uploading ? t("catalogReferenceUploading") : t("catalogReferenceChoose")}</span>
              </button>
            )}
            <span className="pointer-events-none absolute left-2 top-2 inline-flex h-5 items-center rounded-full bg-white/90 px-2 text-[10px] font-bold tracking-wide text-violet-800">
              {t("catalogReferenceBeta")}
            </span>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {t.rich("catalogReferenceImageCaption", { b: emphasize })}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            data-testid="catalog-reference-file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleSelected(file);
            }}
          />
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-1 text-xs leading-relaxed text-muted-foreground">
        <p>{t("catalogReferenceHint")}</p>
        <button
          type="button"
          className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-foreground"
          onClick={() => setConsentSheet({ open: true, mode: "view" })}
        >
          {t("catalogReferenceConsentTitle")}
        </button>
      </div>

      <CatalogReferenceConsentSheet
        open={consentSheet.open}
        onOpenChange={(open) => {
          if (!open) closeConsent();
        }}
        onAgree={handleAgree}
        mode={consentSheet.mode}
        // 「次からは出ません」は、一度も同意したことが無い人の初めての同意のときだけ出す
        showOnceNote={!consentedBefore && consentInPage !== "required"}
        notice={consentNotice}
      />
      <CatalogReferenceIntroSheet
        open={introOpen}
        onOpenChange={(open) => {
          if (!open) closeIntro();
        }}
      />
    </div>
  );
}

/** 見出しの名前の部分(「うちの子」「見本」)を太字にする */
function emphasize(chunks: ReactNode) {
  return <span className="font-bold text-foreground">{chunks}</span>;
}
