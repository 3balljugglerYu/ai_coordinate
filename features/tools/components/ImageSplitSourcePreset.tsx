import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { IMAGE_SPLIT_SIGNUP_SOURCE } from "../lib/tool-signup-sources";

/**
 * 分割の材料になる画像をつくるための One-Tap Style を、サムネイル付きで出す。
 *
 * 文字リンクだけだと読み飛ばされる。豪州企画の「旅のあいだ」の棚と同じく、
 * **サムネイルを主役にしてカードごと押せる**形にする。
 * タップで別ページへ移ることは、矢印だけに頼らず文言でも伝える
 * (押した先で何が起きるか分からないまま遷移させない)。
 *
 * サムネイルが取れないとき(未公開・非公開カテゴリへの変更・取得失敗)は
 * カードごと出さない。壊れた画像枠を見せるより、本文の説明だけの方がよい。
 */
export interface ImageSplitSourcePreset {
  id: string;
  title: string;
  thumbnailImageUrl: string;
}

export function ImageSplitSourcePreset({
  preset,
}: {
  preset: ImageSplitSourcePreset | null;
}) {
  if (!preset) return null;

  return (
    <Link
      href={`/ja/style?style=${preset.id}&signup_source=${IMAGE_SPLIT_SIGNUP_SOURCE}`}
      className="group flex items-center gap-3 rounded-2xl border border-pink-200/70 bg-gradient-to-r from-pink-50 to-orange-50 p-3 transition hover:border-pink-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
    >
      <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-xl border-2 border-white bg-white shadow-sm">
        <Image
          src={preset.thumbnailImageUrl}
          alt={preset.title}
          fill
          sizes="96px"
          className="object-cover transition group-hover:scale-105"
          loading="lazy"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold tracking-wide text-pink-600">
          One-Tap Style
        </p>
        <p className="mt-0.5 truncate text-sm font-bold text-slate-900">
          {preset.title}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          手持ちのイラストを16:9の横長に広げられます。
        </p>
        {/* 遷移することを矢印だけに頼らず明示する */}
        <p className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-semibold text-pink-600">
          タップすると生成ページへ移動します
          <ChevronRight className="h-3 w-3" aria-hidden />
        </p>
      </div>
    </Link>
  );
}
