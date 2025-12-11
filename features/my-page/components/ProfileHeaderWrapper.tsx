import { requireAuth } from "@/lib/auth";
import { getUserProfileServer } from "../lib/server-api";
import { ProfileHeader } from "./ProfileHeader";

/**
 * サーバーコンポーネント: プロフィールヘッダーのデータ取得と表示
 */
export async function ProfileHeaderWrapper() {
  const user = await requireAuth();
  const profile = await getUserProfileServer(user.id);

  return <ProfileHeader profile={profile} isOwnProfile={true} />;
}
