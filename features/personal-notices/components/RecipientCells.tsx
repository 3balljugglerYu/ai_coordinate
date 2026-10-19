import Image from "next/image";
import { User } from "lucide-react";

/** 宛先のアイコンとニックネーム */
export function RecipientIdentity({
  nickname,
  avatarUrl,
}: {
  nickname: string | null;
  avatarUrl: string | null;
}) {
  return (
    <span className="flex items-center gap-2">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200">
          <User className="h-4 w-4 text-slate-500" aria-hidden />
        </span>
      )}
      <span className="whitespace-nowrap">{nickname ?? "-"}</span>
    </span>
  );
}

/** 付ける作品のサムネイル(作品なしは「なし」) */
export function AttachedPostThumb({
  postId,
  thumbUrl,
}: {
  postId: string | null;
  thumbUrl: string | null;
}) {
  if (!postId) {
    return <span className="text-slate-400">なし</span>;
  }
  if (!thumbUrl) {
    return <span className="text-slate-400">画像なし</span>;
  }
  return (
    <a
      href={`/posts/${postId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block h-12 w-12 overflow-hidden rounded-md border border-slate-200"
    >
      <Image
        src={thumbUrl}
        alt="付ける作品"
        width={48}
        height={48}
        className="h-12 w-12 object-cover"
      />
    </a>
  );
}
