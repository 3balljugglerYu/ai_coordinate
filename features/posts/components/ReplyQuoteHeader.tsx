"use client";

import Image from "next/image";
import Link from "next/link";
import { CornerUpLeft, User } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReplyQuoteRef } from "../types";

interface ReplyQuoteHeaderProps {
  /** 引用先の表示情報(存命時)。 */
  replyTo: ReplyQuoteRef | null;
  /** 引用先が削除済みなら true(「削除されたコメント」フォールバック)。 */
  replyToDeleted: boolean;
}

/**
 * 引用リプライの引用ヘッダー(Discord風)。
 * 引用先の小さいアバター + @ニックネーム + 本文プレビュー1行を返信本文の上に表示し、
 * タップで引用先ユーザーのプロフィールへ遷移する。
 * 引用先が削除済みのときはリンク無しのフォールバック表示にする。
 */
export function ReplyQuoteHeader({
  replyTo,
  replyToDeleted,
}: ReplyQuoteHeaderProps) {
  const t = useTranslations("posts");

  if (!replyToDeleted && !replyTo) {
    return null;
  }

  if (replyToDeleted || !replyTo) {
    return (
      <div className="mb-1 flex items-center gap-1.5 text-xs text-gray-400">
        <CornerUpLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="italic">{t("replyQuoteDeleted")}</span>
      </div>
    );
  }

  const name = replyTo.nickname || t("anonymousUser");
  const inner = (
    <>
      <CornerUpLeft
        className="h-3.5 w-3.5 shrink-0 text-gray-400"
        aria-hidden="true"
      />
      {replyTo.avatar_url ? (
        <span className="relative h-4 w-4 shrink-0 overflow-hidden rounded-full">
          <Image
            src={replyTo.avatar_url}
            alt=""
            fill
            className="object-cover"
            sizes="16px"
          />
        </span>
      ) : (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-200">
          <User className="h-2.5 w-2.5 text-gray-500" aria-hidden="true" />
        </span>
      )}
      <span className="shrink-0 font-medium text-gray-600">@{name}</span>
      <span className="min-w-0 truncate text-gray-400">
        {replyTo.content_preview}
      </span>
    </>
  );

  // 引用先ユーザーが存在する場合のみプロフィールへのリンクにする。
  if (replyTo.user_id) {
    return (
      <Link
        href={`/users/${replyTo.user_id}`}
        className="mb-1 flex min-w-0 items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="mb-1 flex min-w-0 items-center gap-1.5 text-xs">
      {inner}
    </div>
  );
}
