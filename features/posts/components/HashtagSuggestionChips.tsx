"use client";

import { useEffect, useState } from "react";
import {
  extractHashtags,
  normalizeHashtag,
  type ExtractedHashtag,
} from "@/lib/hashtag";
import { useSearchAvailable } from "./SearchAvailabilityProvider";

/**
 * 説明欄の下に出すタグ候補。**押して初めて説明文に入る。**
 *
 * タグがほぼ存在しない状態から始まるため、候補の出所は「その作品を作った企画に
 * 設定されたタグ」と「自分が前に使ったタグ」の 2 つ（サーバー側で解決）。
 *
 * 既に説明文へ入っているタグは出さない。押しても何も起きない候補は、
 * 押し損に見えるため。
 */

interface Props {
  /** 投稿対象の generated_images.id */
  imageId: string;
  /** 現在のキャプション。ここに含まれるタグは候補から外す */
  caption: string;
  /** 候補を押したときに差し込んだ結果のキャプションを返す */
  onInsert: (caption: string) => void;
  /** キャプションの上限。超える挿入はしない */
  maxLength: number;
  disabled?: boolean;
}

interface Suggestion {
  name: string;
  source: "category" | "recent";
}

export function HashtagSuggestionChips({
  imageId,
  caption,
  onInsert,
  maxLength,
  disabled,
}: Props) {
  const searchAvailable = useSearchAvailable();
  // どの作品に対する候補かを一緒に持つ。作品が変わった瞬間に
  // 前の作品の候補が残って見えるのを防ぐ（effect 内で state を消さずに済む）。
  const [loaded, setLoaded] = useState<{
    imageId: string;
    items: Suggestion[];
  } | null>(null);

  useEffect(() => {
    if (!searchAvailable || !imageId) return;

    let active = true;
    void fetch(`/api/hashtags/suggestions?imageId=${encodeURIComponent(imageId)}`)
      .then((response) => (response.ok ? response.json() : { suggestions: [] }))
      .then((data) => {
        if (active) setLoaded({ imageId, items: data.suggestions ?? [] });
      })
      .catch(() => {
        // 候補が出ないだけ。投稿は妨げない
        if (active) setLoaded({ imageId, items: [] });
      });

    return () => {
      active = false;
    };
  }, [imageId, searchAvailable]);

  const suggestions = loaded?.imageId === imageId ? loaded.items : [];

  if (!searchAvailable || suggestions.length === 0) {
    return null;
  }

  const alreadyUsed = new Set(
    extractHashtags(caption).map((tag: ExtractedHashtag) => tag.normalized)
  );
  const remaining = suggestions.filter(
    (item) => !alreadyUsed.has(normalizeHashtag(item.name))
  );

  if (remaining.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">タグ候補</span>
      {remaining.map((item) => (
        <button
          key={item.name}
          type="button"
          disabled={disabled}
          onClick={() => onInsert(appendHashtag(caption, item.name, maxLength))}
          className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-50"
        >
          #{item.name}
        </button>
      ))}
    </div>
  );
}

/**
 * 説明文の末尾へタグを足す。
 *
 * 直前に区切りが無いと `おでかけ#冬服` のように前の文字と繋がり、
 * タグとして成立しなくなる（`#` の直前がタグ文字だと開始と見なさない規則）。
 * 上限を超える場合は何もしない。
 */
export function appendHashtag(
  caption: string,
  name: string,
  maxLength: number
): string {
  const tag = `#${name}`;
  const base = caption.trimEnd();
  const next = base ? `${base} ${tag}` : tag;
  return next.length <= maxLength ? next : caption;
}
