import Image from "next/image";
import { Mail } from "lucide-react";

/**
 * 「あなたへの通知」の1行の見え方(管理画面のプレビュー用)。
 * 本物の NotificationList は通知の読み込み・既読・リアルタイム購読まで動くので、
 * 管理画面では見た目だけを同じクラスで描く。NotificationList の行を変えたら合わせる。
 */
export function PersonalNoticeListRowPreview({
  title,
  body,
  thumbUrl,
}: {
  title: string;
  body: string;
  thumbUrl: string | null;
}) {
  return (
    <div className="flex w-full gap-3 bg-blue-50 p-4 text-left">
      <div className="flex-shrink-0">
        <Image
          src="/icons/icon-192.png"
          alt="Persta.AI"
          width={36}
          height={36}
          className="rounded-md"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <p className="line-clamp-2 text-sm font-medium text-gray-900">
              {title}
            </p>
            {body && (
              <p className="mt-1 line-clamp-2 text-xs text-gray-600">{body}</p>
            )}
            <p className="mt-1 text-xs text-gray-400">たった今</p>
          </div>
          <div className="flex-shrink-0">
            <Mail className="h-4 w-4 text-violet-500" aria-hidden />
          </div>
        </div>
        {thumbUrl && (
          <div className="mt-2">
            <Image
              src={thumbUrl}
              alt="作品"
              width={60}
              height={60}
              className="rounded object-cover"
            />
          </div>
        )}
      </div>
      <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
    </div>
  );
}
