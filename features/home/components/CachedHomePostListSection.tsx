import { cacheLife, cacheTag } from "next/cache";
import { getUser } from "@/lib/auth";
import { CachedHomePostList } from "@/features/posts/components/CachedHomePostList";

export async function CachedHomePostListSection() {
  "use cache: private";
  cacheTag("home-posts");
  cacheTag("home-posts-week");
  cacheLife("minutes");

  const user = await getUser();

  return <CachedHomePostList userId={user?.id ?? null} />;
}
