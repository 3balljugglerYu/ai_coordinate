import Image from "next/image";
import Link from "next/link";

interface CampaignCardProps {
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  themeHashtag: string | null;
}

export function CampaignCard({
  slug,
  title,
  description,
  coverImageUrl,
  themeHashtag,
}: CampaignCardProps) {
  return (
    <Link
      href={`/catalog/${slug}`}
      className="group block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
        {coverImageUrl ? (
          <Image
            src={coverImageUrl}
            alt={title}
            fill
            unoptimized
            className="object-cover transition-transform duration-200 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400">
            画像なし
          </div>
        )}
      </div>
      <div className="space-y-1 p-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {themeHashtag ? (
          <p className="text-xs text-blue-600">#{themeHashtag}</p>
        ) : null}
        {description ? (
          <p className="line-clamp-2 text-sm text-slate-600">{description}</p>
        ) : null}
      </div>
    </Link>
  );
}
