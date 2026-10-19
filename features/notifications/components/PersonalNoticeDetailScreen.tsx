"use client";

import { Fragment, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { markPersonalNoticeOpened } from "../lib/personal-notice-api";

export interface PersonalNoticeDetailView {
  id: string;
  title: string;
  body: string;
  receivedAtLabel: string;
  post: { id: string; imageUrl: string } | null;
}

interface PersonalNoticeDetailScreenProps {
  notice: PersonalNoticeDetailView;
  /** 開いた記録を送る。管理画面のプレビューでは false */
  recordOpened?: boolean;
}

// http(s) の URL だけをリンクにする(本文は文字として描く。HTML としては入れない)
const URL_PATTERN = /(https?:\/\/[^\s<>"'「」（）()]+)/g;

function renderBody(body: string) {
  return body.split(URL_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <a
        key={index}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-blue-600 underline underline-offset-2"
      >
        {part}
      </a>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    )
  );
}

/**
 * 個人あてのお知らせの詳細(「運営からのお知らせ」の詳細と同じ並び)。
 * 計画書 docs/planning/personal-notices-implementation-plan.md PN-010 / PN-011
 */
export function PersonalNoticeDetailScreen({
  notice,
  recordOpened = true,
}: PersonalNoticeDetailScreenProps) {
  const t = useTranslations("notifications");
  const hasMarkedOpenedRef = useRef(false);

  useEffect(() => {
    if (!recordOpened || hasMarkedOpenedRef.current) {
      return;
    }
    hasMarkedOpenedRef.current = true;
    void markPersonalNoticeOpened(notice.id).catch((error) => {
      // 開いた記録に失敗しても、読むのは止めない
      console.error("Failed to record personal notice opened:", error);
    });
  }, [notice.id, recordOpened]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Button asChild variant="ghost" size="sm" className="px-0 text-slate-600">
        <Link href="/notifications">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("personalNoticeBackToList")}
        </Link>
      </Button>

      <div className="space-y-2">
        <p className="text-sm text-slate-500">{notice.receivedAtLabel}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {notice.title}
        </h1>
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={18}
            height={18}
            className="rounded"
          />
          {t("personalNoticeFrom")}
        </p>
      </div>

      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {notice.post && (
          <div className="space-y-3">
            <Link
              href={`/posts/${notice.post.id}?from=notifications`}
              className="block overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
            >
              <Image
                src={notice.post.imageUrl}
                alt={t("personalNoticePostImageAlt")}
                width={640}
                height={640}
                className="mx-auto max-h-[360px] w-full object-contain"
              />
            </Link>
            <Button asChild className="w-full">
              <Link href={`/posts/${notice.post.id}?from=notifications`}>
                {t("personalNoticeViewPost")}
              </Link>
            </Button>
          </div>
        )}
        <p className="whitespace-pre-line break-words text-sm leading-7 text-slate-800">
          {renderBody(notice.body)}
        </p>
      </div>
    </div>
  );
}
