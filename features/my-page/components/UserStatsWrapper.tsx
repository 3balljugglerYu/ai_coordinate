import { requireAuth } from "@/lib/auth";
import { getUserStatsServer } from "../lib/server-api";
import { UserStats } from "./UserStats";

/**
 * サーバーコンポーネント: 統計情報のデータ取得と表示
 */
export async function UserStatsWrapper() {
  const user = await requireAuth();
  const stats = await getUserStatsServer(user.id);

  return <UserStats stats={stats} />;
}
