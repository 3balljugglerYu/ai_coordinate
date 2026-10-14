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
};

export function getPushBroadcastStatusLabel(status: PushBroadcastStatus) {
  return STATUS_LABELS[status] ?? STATUS_LABELS.scheduled;
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

export function decoratePushBroadcastAdmin(
  broadcast: PushBroadcast,
  stats: PushBroadcastDeliveryStats | undefined
): PushBroadcastAdminView {
  const status = getPushBroadcastStatusLabel(broadcast.status);
  return {
    ...broadcast,
    stats: stats ?? emptyDeliveryStats(),
    sendAtDisplay: formatAdminDateTime(broadcast.sendAt),
    statusLabel: status.label,
    statusClassName: status.className,
  };
}
