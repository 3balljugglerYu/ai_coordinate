import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";

/**
 * 応募作品へのリンク。ページの中(#am-works)へ飛ぶときは素の a(Link を通さない)、
 * 一覧がまだ無くてハッシュタグの検索へ行くときは Link。
 * 手順の「応募作品を見る」と、画面の下に浮いたボタンで同じものを使う。
 */
export function WorksAnchor({
  href,
  className,
  onClick,
  children,
}: {
  href: string;
  className: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  children: ReactNode;
}) {
  return href.startsWith("#") ? (
    <a className={className} href={href} onClick={onClick}>
      {children}
    </a>
  ) : (
    <Link className={className} href={href} onClick={onClick}>
      {children}
    </Link>
  );
}
