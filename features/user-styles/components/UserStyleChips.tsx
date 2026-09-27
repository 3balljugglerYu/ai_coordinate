"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { User } from "lucide-react";
import { useHorizontalScrollIndicator } from "@/features/style/hooks/useHorizontalScrollIndicator";
import { cn } from "@/lib/utils";
import { StylesCatalogChipBar } from "@/features/style-presets/components/StylesCatalogChipBar";
import {
  CatalogTabBar,
  type CatalogTab,
} from "@/features/style-presets/components/CatalogTabBar";
import { useStylesCatalogRevamp } from "@/features/style-presets/hooks/useStylesCatalogRevamp";
import type { UserStyleAuthor } from "@/features/user-styles/types";

/** 選択中のチップ。作者チップは `author:<id>` で表す。 */
export type UserStyleChipId = "all" | "usage" | `author:${string}`;

/** 作者アイコンの一辺。ニックネームと同じ行に並ぶので名前の高さに合わせる。 */
const AUTHOR_AVATAR_PX = 20;

/**
 * /user-styles のチップ列。カタログ刷新(段階公開中は運営のみ)ではタブ(`CatalogTabBar`)にする。
 *
 * `✨すべて（新着順）` / `💖みんなが使ってる` は最初から描き、**作者チップだけをマウント後に足す**。
 * 作者チップは閲覧者依存（フォロー中の人しか出ない）なので、静的シェルに載せられない
 * ── `/styles` のお気に入りチップと同じ作法。
 *
 * ⭐ 作者チップはアバター(20px)を文字の行の高さに合わせてあるので、
 * 後から足しても列の高さは変わらない（一覧全体が下へずれない）。
 */
export function UserStyleChips({
  active,
  authors,
  onSelect,
}: {
  active: UserStyleChipId;
  /** フォロー中の作者。未ログイン・取得前・0人ならすべて空配列。 */
  authors: UserStyleAuthor[];
  onSelect: (chip: UserStyleChipId) => void;
}) {
  const t = useTranslations("userStyles");
  const isCatalogRevamp = useStylesCatalogRevamp();
  const {
    setScrollEl,
    trackRef,
    thumbRef,
  } = useHorizontalScrollIndicator({
    // 刷新後はタブにするので、このインジケーターはチップ列(刷新前)だけで使う
    remeasureKey: authors,
  });

  if (isCatalogRevamp) {
    // /styles と同じタブ。スクロールで上端に固定する。
    // ⭐ 並び順は userStyleChipIds(一覧のスワイプで隣を決める)と同じにすること
    const tabs: CatalogTab<UserStyleChipId>[] = [
      { id: "all", label: `✨ ${t("chipAll")}` },
      // ⭐ 👑 は /styles の「人気」(直近30日)が使っている。こちらは累計なので別の絵文字にする
      { id: "usage", label: `💖 ${t("chipUsage")}` },
      ...authors.map(
        (author): CatalogTab<UserStyleChipId> => ({
          id: `author:${author.authorId}`,
          label: author.nickname ?? "",
          icon: <AuthorAvatar url={author.avatarUrl} />,
        })
      ),
    ];
    return (
      <StylesCatalogChipBar>
        <CatalogTabBar
          tabs={tabs}
          activeId={active}
          onSelect={onSelect}
          ariaLabel={t("chipRowLabel")}
        />
      </StylesCatalogChipBar>
    );
  }

  return (
    <StylesCatalogChipBar>
      <div
        ref={setScrollEl}
        role="tablist"
        aria-label={t("chipRowLabel")}
        // /styles のチップ列(StylesGalleryClient)と同じ寸法にそろえる。
        // 作者チップ(アバター 20px)も文字だけのチップと同じ高さなので、後乗せで列の高さは変わらない
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Chip
          active={active === "all"}
          onClick={() => onSelect("all")}
          label={`✨ ${t("chipAll")}`}
        />
        <Chip
          active={active === "usage"}
          onClick={() => onSelect("usage")}
          // ⭐ 👑 は /styles の「人気」(直近30日)が使っている。こちらは累計なので別の絵文字にする
          label={`💖 ${t("chipUsage")}`}
        />
        {authors.map((author) => {
          const id: UserStyleChipId = `author:${author.authorId}`;
          return (
            <Chip
              key={author.authorId}
              active={active === id}
              onClick={() => onSelect(id)}
              label={author.nickname ?? ""}
              avatarUrl={author.avatarUrl}
            />
          );
        })}
      </div>
      {/* チップ列の常時表示スクロールインジケーター。iOS はスクロール中しか
          ネイティブバーが出ず「横に続きがある」ことに気づきにくいため自前描画。
          高さは常に確保してレイアウトシフトを防ぐ。 */}
      <div
        ref={trackRef}
        className="relative mx-1 mb-4 mt-1 h-1 overflow-hidden rounded-full bg-slate-100"
        style={{ visibility: "hidden" }}
        aria-hidden="true"
      >
        <div
          ref={thumbRef}
          className="absolute top-0 h-full rounded-full bg-slate-300 [inset-inline-start:0]"
        />
      </div>
    </StylesCatalogChipBar>
  );
}

function Chip({
  active,
  label,
  avatarUrl,
  onClick,
}: {
  active: boolean;
  label: string;
  avatarUrl?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        // /styles のチップ(px-3.5 py-1.5)と同じ大きさにそろえる(2つのタブで見た目を統一する)。
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400",
        active
          ? "border-primary bg-primary text-white"
          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
      )}
    >
      {avatarUrl !== undefined ? (
        <AuthorAvatar url={avatarUrl} />
      ) : null}
      {/* 長い名前でチップ列が横に伸び切らないように切り詰める */}
      <span className="max-w-[10rem] truncate">{label}</span>
    </button>
  );
}

function AuthorAvatar({ url }: { url: string | null }) {
  const box = { width: AUTHOR_AVATAR_PX, height: AUTHOR_AVATAR_PX };
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={AUTHOR_AVATAR_PX}
        height={AUTHOR_AVATAR_PX}
        style={box}
        className="shrink-0 rounded-full object-cover ring-1 ring-black/10"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={box}
      className="flex shrink-0 items-center justify-center rounded-full bg-gray-200 ring-1 ring-black/10"
    >
      <User className="h-2.5 w-2.5 text-gray-500" />
    </span>
  );
}
