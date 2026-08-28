"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
 * 表示は入力欄の直下に重ねる縦のリスト（X と同じ形）。キャレット直下への
 * 追従はしない。位置合わせが要らず、モーダルの中でも切れず、1行1件なので
 * 長いタグでも潰れず押しやすい。
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
  const t = useTranslations("posts");
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
    <div
      /*
        listbox/option の ARIA は付けない。矢印キーでの移動と Enter での決定を
        意図的に持たない（Enter は日本語変換の確定に使われる）ため、
        listbox と名乗ると読み上げ側の期待と実際の操作がズレる。
        素のボタンの並びとして扱う。
      */
      role="group"
      aria-label={t("hashtagPopularLabel")}
      className="absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
    >
      {items.map((item) => {
        const [typed, rest] = splitByTypedPart(item.name, query);
        return (
          <button
            key={item.name}
            type="button"
            // 表示は打った部分と続きで分けるが、読み上げと操作の名前は
            // タグ全体で1つにする（分割した要素の間に空白が入るため）
            aria-label={`#${item.name}`}
            disabled={disabled}
            /*
              押した瞬間に textarea の blur が先に走ると、カーソル位置が消えて
              この候補ごと消える（= タップしても何も入らない）。
              mousedown の既定動作を止めてフォーカスを textarea に残す。
              click は従来どおり発火する。
            */
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => handleSelect(item.name)}
            className="flex w-full items-center px-4 py-3 text-left text-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <span className="text-slate-500">#{typed}</span>
            <span className="font-semibold text-slate-900">{rest}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 打った部分と補完される部分に分ける（打った側を細字、続きを太字で出す）。
 *
 * 正規化で文字数が変わる表記（半角カナなど）では境界がずれるため、
 * 一致を確かめられたときだけ分ける。確かめられなければ全体を続き扱いにする。
 */
function splitByTypedPart(name: string, query: string): [string, string] {
  const nameChars = [...name];
  const queryLength = [...query].length;
  const head = nameChars.slice(0, queryLength).join("");

  if (normalizeHashtag(head) !== normalizeHashtag(query)) {
    return ["", name];
  }

  return [head, nameChars.slice(queryLength).join("")];
}
