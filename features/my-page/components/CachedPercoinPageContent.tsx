import { cacheLife, cacheTag } from "next/cache";
import {
  getPercoinBalanceServer,
  getPercoinTransactionsServer,
} from "../lib/server-api";
import { PercoinPageContent } from "./PercoinPageContent";
import { createAdminClient } from "@/lib/supabase/admin";

interface CachedPercoinPageContentProps {
  userId: string;
}

/**
 * ペルコイン管理画面用（use cache でサーバーキャッシュ）
 */
export async function CachedPercoinPageContent({
  userId,
}: CachedPercoinPageContentProps) {
  "use cache";
  cacheTag(`my-page-credits-${userId}`);
  cacheLife("minutes");

  const supabase = createAdminClient();
  const [percoinBalance, transactions] = await Promise.all([
    getPercoinBalanceServer(userId, supabase),
    getPercoinTransactionsServer(userId, 10, supabase),
  ]);

  return (
    <PercoinPageContent
      percoinBalance={percoinBalance}
      transactions={transactions}
    />
  );
}
