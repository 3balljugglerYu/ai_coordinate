import { cacheLife, cacheTag } from "next/cache";
import { getUser } from "@/lib/auth";
import { isPopularPromptsAvailable } from "@/lib/env";
import { CachedHomePostList } from "@/features/posts/components/CachedHomePostList";

export async function CachedHomePostListSection() {
  "use cache: private";
  cacheTag("home-posts");
  cacheTag("home-posts-week");
  cacheTag("popular-prompts");
  cacheLife("minutes");

  const user = await getUser();

  /*
    ⭐ SSR の取得可否はここで決める（Loader では決められない）。

    `PopularPromptsAvailabilityLoader` はクライアントの後段昇格なので、
    SSR 時点の取得可否は決められない。「一般ユーザーの HTML に人気投稿の配列を
    含めない」という不変条件は、この位置で確定させて引数で渡すことで担保する。
    ここは `"use cache: private"` なので getUser() を呼べる。

    受け取った側（CachedHomePostList）は `"use cache"` で、この引数が
    そのままキャッシュキーに入る（userId と同じ扱い）。true / false で
    エントリが分かれるため、一般ユーザーのキャッシュに人気配列が混ざらない。
  */
  const popularPromptsAvailable = isPopularPromptsAvailable(user?.id);

  return (
    <CachedHomePostList
      userId={user?.id ?? null}
      popularPromptsAvailable={popularPromptsAvailable}
    />
  );
}
