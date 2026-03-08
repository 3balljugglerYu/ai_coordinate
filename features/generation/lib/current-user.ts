/**
 * 現在の認証ユーザーIDを取得する
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { getCurrentUser } = await import("@/features/auth/lib/auth-client");
  const user = await getCurrentUser();
  return user?.id ?? null;
}
