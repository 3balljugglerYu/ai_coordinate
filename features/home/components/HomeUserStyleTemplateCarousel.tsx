"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface HomeUserStyleTemplateCardData {
  id: string;
  alt: string | null;
  image_url: string | null;
}

interface HomeUserStyleTemplateCarouselProps {
  templates: HomeUserStyleTemplateCardData[];
}

/**
 * ホームのユーザー投稿スタイルカルーセル（ADR-013）。
 * MVP は単純な横スクロール grid。本コンポーネントの mount 自体を env で制御するため、
 * 表示時点で既にフラグ ON が確定している前提で良い。
 */
export function HomeUserStyleTemplateCarousel({
  templates,
}: HomeUserStyleTemplateCarouselProps) {
  const t = useTranslations("home");
  const router = useRouter();
  const [pending, setPending] = useState<HomeUserStyleTemplateCardData | null>(
    null
  );

  if (templates.length === 0) {
    return null;
  }

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-lg font-semibold text-gray-900 sm:text-xl">
        {t("userStyleTemplateCarouselTitle")}
      </h2>
      <ul className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 scrollbar-hide">
        {templates.map((template) => (
          <li key={template.id} className="flex-shrink-0">
            <button
              type="button"
              onClick={() => setPending(template)}
              className="block w-[140px] overflow-hidden rounded-md border bg-card transition hover:opacity-90 sm:w-[160px]"
            >
              <div className="aspect-square w-full bg-muted">
                {template.image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={template.image_url}
                    alt={template.alt ?? ""}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : null}
              </div>
            </button>
          </li>
        ))}
      </ul>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("userStyleTemplateConfirmTitle")}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("userStyleTemplateConfirmCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) router.push(`/inspire/${pending.id}`);
              }}
            >
              {t("userStyleTemplateConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
