/** 個人あてのお知らせを開いたことを記録する(初回だけ時刻が残り、既読になる) */
export async function markPersonalNoticeOpened(id: string): Promise<void> {
  const response = await fetch(
    `/api/notifications/messages/${encodeURIComponent(id)}/opened`,
    { method: "POST" }
  );

  if (!response.ok) {
    throw new Error(`Failed to record opened: ${response.status}`);
  }
}
