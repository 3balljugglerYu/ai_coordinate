"use client";

import { useEffect, useRef, useState } from "react";
import { findHashtagQueryAt, normalizeHashtag } from "@/lib/hashtag";
import { useSearchAvailable } from "./SearchAvailabilityProvider";

/**
 * 入力中の `#冬` に対して、既に使われているタグを候補として出す。
 *
 * 目的は表記ゆれの収束。`#冬服` が既にあるのに `#ふゆふく` を新しく作られると、
 * どちらを押しても片方しか出てこない。
 *
 * ## 日本語入力での約束事
 *
 * - **変換中は出さない**。変換候補と二重に出ると読めない
 * - **Enter では選ばない**。Enter は変換の確定に使われるので、候補の決定に
 *   割り当てると「確定したつもりでタグが入る」事故になる。押す（タップ）だけ
 *
 * 位置合わせの都合でキャレット直下に浮かせず、入力欄の下に並べる。
 * モーダルの中でも切れず、モバイルでも押しやすい。
 */

interface Props {
  /** 現在のキャプション */
  value: string;
  /** カーソル位置。null なら候補を出さない */
  caret: number | null;
  /** IME 変換中か */
  composing: boolean;
  /** 候補を押したときの置き換え後キャプション */
  onSelect: (nextValue: string) => void;
  disabled?: boolean;
}

interface HashtagMatch {
  name: string;
  post_count: number;
}

/** 何文字打ってから候補を出すか。1文字だと候補が多すぎて選べない。 */
const MIN_QUERY_LENGTH = 1;

/** 打っている最中に毎回投げない。 */
const DEBOUNCE_MS = 200;

export function HashtagTypeahead({
  value,
  caret,
  composing,
  onSelect,
  disabled,
}: Props) {
  const searchAvailable = useSearchAvailable();
  const [matches, setMatches] = useState<{
    query: string;
    items: HashtagMatch[];
  } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const found =
    searchAvailable && !composing && caret !== null
      ? findHashtagQueryAt(value, caret)
      : null;
  const query = found && found.query.length >= MIN_QUERY_LENGTH ? found.query : "";

  useEffect(() => {
    if (!query) return;

    let active = true;
    timerRef.current = setTimeout(() => {
      void fetch(`/api/hashtags/search?prefix=${encodeURIComponent(query)}`)
        .then((response) => (response.ok ? response.json() : { hashtags: [] }))
        .then((data) => {
          if (active) setMatches({ query, items: data.hashtags ?? [] });
        })
        .catch(() => {
          // 候補が出ないだけ。入力は妨げない
          if (active) setMatches({ query, items: [] });
        });
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  if (!query || matches?.query !== query || matches.items.length === 0) {
    return null;
  }

  // 打ちかけの文字と完全に同じタグだけが出ても選ぶ意味がない
  const items = matches.items.filter(
    (item) => normalizeHashtag(item.name) !== normalizeHashtag(query)
  );
  if (items.length === 0 || !found) {
    return null;
  }

  const handleSelect = (name: string) => {
    const before = value.slice(0, found.start);
    const after = value.slice(found.end);
    // 直後が空白でなければ空白を足す。続けて打った文字がタグに飲まれないようにする
    const separator = after.startsWith(" ") || after === "" ? "" : " ";
    onSelect(`${before}#${name}${separator}${after}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">よく使われています</span>
      {items.map((item) => (
        <button
          key={item.name}
          type="button"
          disabled={disabled}
          onClick={() => handleSelect(item.name)}
          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
        >
          #{item.name}
          <span className="ml-1 text-slate-400">{item.post_count}</span>
        </button>
      ))}
    </div>
  );
}
