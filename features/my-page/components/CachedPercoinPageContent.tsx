import { cacheLife, cacheTag } from "next/cache";
import {
  getPercoinBalanceBreakdownServer,
  getPercoinTransactionsServer,
  getFreePercoinBatchesExpiringServer,
  PERCOIN_TRANSACTIONS_PER_PAGE,
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
  const [balanceBreakdown, transactions, expiringBatches] = await Promise.all([
    getPercoinBalanceBreakdownServer(userId, supabase),
    getPercoinTransactionsServer(userId, PERCOIN_TRANSACTIONS_PER_PAGE, supabase),
    getFreePercoinBatchesExpiringServer(userId, supabase),
  ]);

  return (
    <PercoinPageContent
      balanceBreakdown={balanceBreakdown}
      transactions={transactions}
      expiringBatches={expiringBatches}
    />
  );
}
