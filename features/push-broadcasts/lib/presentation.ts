import {
  emptyDeliveryStats,
  type PushBroadcast,
  type PushBroadcastAdminView,
  type PushBroadcastDeliveryStats,
  type PushBroadcastStatus,
} from "./schema";

const STATUS_LABELS: Record<
  PushBroadcastStatus,
  { label: string; className: string }
> = {
  scheduled: { label: "予約中", className: "bg-amber-100 text-amber-800" },
  sending: { label: "送信中", className: "bg-sky-100 text-sky-800" },
  sent: { label: "送信済み", className: "bg-emerald-100 text-emerald-800" },
  canceled: { label: "取り消し", className: "bg-slate-100 text-slate-700" },
  expired: { label: "期限切れ", className: "bg-rose-100 text-rose-800" },
};

/** sent で、送り終えたかの件数を読めなかったとき（「送信済み」と言い切らない） */
const SENT_UNKNOWN_LABEL = {
  label: "送信済み（件数を確認できません）",
  className: "bg-slate-100 text-slate-700",
};

/**
 * 表示する状態。sent は「送信待ちを積み終えた」だけなので、送り終えていない
 * 送信待ち（pendingCount）が残っている間は「送信中」と出す
 * （送信関数が止まっているあいだに「送信済み」と見せない）。
 * 件数を読めなかった（null）ときも「送信済み」とは言い切らない。
 */
export function getPushBroadcastStatusLabel(
  status: PushBroadcastStatus,
  pendingCount: number | null = 0
) {
  if (status === "sent" && pendingCount === null) {
    return SENT_UNKNOWN_LABEL;
  }
  if (status === "sent" && pendingCount !== null && pendingCount > 0) {
    return STATUS_LABELS.sending;
  }
  return STATUS_LABELS[status] ?? STATUS_LABELS.scheduled;
}

/** 期限切れ（expired）の説明。途中まで積んでいたら、残りだけを送っていない */
export function describeExpiredPushBroadcast(enqueuedCount: number) {
  return enqueuedCount > 0
    ? "送信日時から 1 時間以内に送り終えられなかったため、残りは送っていません。"
    : "送信日時から 1 時間以内に送り始められなかったため、送っていません。";
}

/** 送信日時を日本時間で（確認画面で、端末の時間帯がずれていても気づけるように） */
export function formatPushBroadcastSendAtJst(value: string) {
  return formatAdminDateTime(value);
}

function formatAdminDateTime(value: string) {
  return new Date(value).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * stats: 件数の Map を読めたら、その配信の件数（無ければ 0 件）。
 * 読めなかったら null（「0 件」と見せない）。
 */
export function decoratePushBroadcastAdmin(
  broadcast: PushBroadcast,
  stats: PushBroadcastDeliveryStats | undefined | null
): PushBroadcastAdminView {
  const deliveryStats = stats === null ? null : (stats ?? emptyDeliveryStats());
  const status = getPushBroadcastStatusLabel(
    broadcast.status,
    deliveryStats ? deliveryStats.pending : null
  );
  return {
    ...broadcast,
    stats: deliveryStats,
    sendAtDisplay: formatAdminDateTime(broadcast.sendAt),
    statusLabel: status.label,
    statusClassName: status.className,
  };
}
