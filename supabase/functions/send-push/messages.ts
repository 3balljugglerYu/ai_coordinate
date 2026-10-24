// ===============================================
// send-push: 送る中身の組み立て (pure helper)
// ===============================================
// Edge Function 本体から分離して Jest からテストできるようにする。
// Deno-only import は使わない。
//
// 計画書: docs/planning/push-notifications-implementation-plan.md Phase 2

/** claim_push_outbox が返す 1 行 */
export interface ClaimedRow {
  id: string;
  recipient_id: string;
  category: string;
  collapse_key: string | null;
  title: string | null;
  body: string | null;
  data: Record<string, unknown> | null;
  attempt_count: number;
  notification_id: string | null;
  notification_type: string | null;
  notification_entity_type: string | null;
  notification_entity_id: string | null;
  notification_comment_id: string | null;
  notification_actor_id: string | null;
  notification_data: Record<string, unknown> | null;
}

/** 1 通ぶん。同じ宛先・同じ collapse_key の行は 1 通にまとめる */
export interface PushGroup {
  recipientId: string;
  category: string;
  collapseKey: string | null;
  /** いちばん新しい行(表示文と行き先はこの行のものを使う) */
  latest: ClaimedRow;
  /** まとめた行の id すべて(結果は全部に同じものを記録する) */
  rowIds: string[];
}

/**
 * 送ってよい行を、宛先と collapse_key ごとに 1 通へまとめる。
 * collapse_key の無い行はそれぞれ 1 通。並びは確保した順(send_after の古い順)。
 */
export function groupRows(rows: ClaimedRow[]): PushGroup[] {
  const groups: PushGroup[] = [];
  const byKey = new Map<string, PushGroup>();
  for (const row of rows) {
    if (!row.collapse_key) {
      groups.push({
        recipientId: row.recipient_id,
        category: row.category,
        collapseKey: null,
        latest: row,
        rowIds: [row.id],
      });
      continue;
    }
    const key = `${row.recipient_id}\u0000${row.collapse_key}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.latest = row;
      existing.rowIds.push(row.id);
      continue;
    }
    const group: PushGroup = {
      recipientId: row.recipient_id,
      category: row.category,
      collapseKey: row.collapse_key,
      latest: row,
      rowIds: [row.id],
    };
    byKey.set(key, group);
    groups.push(group);
  }
  return groups;
}

const DEFAULT_ACTOR_NAME = "ユーザー";

/**
 * 通知に出す相手の名前に「さん」を付ける(2026-10-24 ユーザー決定)。
 * 名前の側にもう「さん」「様」が付いていれば重ねない。
 */
export function withHonorific(name: string): string {
  const trimmed = name.trim();
  return /(さん|様)$/u.test(trimmed) ? trimmed : `${trimmed}さん`;
}

// 題名が「〇〇があなた…」の形で記録される通知(相手の名前が入る)
const ACTOR_NAME_TITLE_TYPES = new Set([
  "like",
  "comment",
  "follow",
  "derived_post_published",
  "style_preset_post_published",
]);

/**
 * 記録してある題名の名前に「さん」を付ける(「りる🐣があなたの…」→「りる🐣さんがあなたの…」)。
 * 名前の入る通知でない・形の違う題名は null(記録のまま出す)。
 * 記録の題名は画面のお知らせと共通なので、DB の文は変えずに送るときだけ足す。
 */
export function buildHonorificTitle(row: ClaimedRow): string | null {
  if (!row.notification_type || !ACTOR_NAME_TITLE_TYPES.has(row.notification_type)) {
    return null;
  }
  const match = /^(.+?)が(あなた.+)$/u.exec(row.title?.trim() ?? "");
  if (!match) return null;
  return `${withHonorific(match[1])}が${match[2]}`;
}

/**
 * いいねのまとめ文。likeCount はその投稿の未読のいいね数(今回の分を含む)。
 * 端末側は collapse_key で前の通知を置き換えるので、件数は今回確保した分ではなく
 * 未読の総数で書く。1 件なら元の通知と同じ文。
 */
export function buildLikeTitle(
  actorNickname: string | null | undefined,
  likeCount: number,
): string {
  const name = withHonorific(actorNickname?.trim() ? actorNickname : DEFAULT_ACTOR_NAME);
  const others = Math.max(0, Math.floor(likeCount) - 1);
  if (others === 0) {
    return `${name}があなたの投稿にいいねしました`;
  }
  return `${name}ほか${others}人があなたの投稿にいいねしました`;
}

/** data の回数・枚数(正の整数だけ。文字列で入っていても読む) */
function positiveInteger(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * クリエイター還元(usage_reward_earned)の文。この通知は題名・本文を空で記録し、
 * 回数と枚数を data に持つ(受け手×JST日付で1行にまとめ、利用のたびに足す)。
 * お知らせ画面(features/notifications/lib/presentation.ts)と同じ文にする。
 */
export function buildUsageRewardTitle(row: ClaimedRow): string | null {
  if (row.notification_type !== "usage_reward_earned") return null;
  const count = positiveInteger(row.notification_data?.usage_count);
  const amount = positiveInteger(row.notification_data?.total_amount);
  if (count === null || amount === null) return null;
  return `本日、あなたの作品が${count}回利用され${amount}ペルコイン獲得！`;
}

/**
 * 端末で前の通知を置き換えるための鍵。クリエイター還元は1日1行の通知を
 * 書き足していくので、同じ通知の分は置き換える(回数が増えた1件になる)。
 * usage_reward:<uuid> は 49 バイト(APNs は 64 バイトまで)
 */
export function resolveCollapseKey(group: PushGroup): string | null {
  if (group.collapseKey) return group.collapseKey;
  const row = group.latest;
  if (row.notification_type === "usage_reward_earned" && row.notification_id) {
    return `usage_reward:${row.notification_id}`;
  }
  return null;
}

/** 表示文。タイトルが無い時のための保険も入れる */
export function resolveText(
  row: ClaimedRow,
  likeTitle: string | null,
): { title: string; body: string } {
  const title = likeTitle ?? buildUsageRewardTitle(row) ?? buildHonorificTitle(row) ??
    row.title?.trim() ?? "";
  const body = row.body?.trim() ?? "";
  if (title) {
    return { title, body };
  }
  // タイトルが空の通知は本文を見出しにする(どちらも空なら固定文)
  return { title: body || "Persta.AI からのお知らせ", body: "" };
}

/**
 * アプリが行き先を決めるための data。FCM の data は文字列だけなので、
 * 入れ子(notifications.data)は JSON 文字列にする。空の値は入れない。
 */
export function buildDataPayload(row: ClaimedRow): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return;
    out[key] = typeof value === "string" ? value : JSON.stringify(value);
  };

  // 生成完了などは outbox 自身の data(kind, image_job_id, status ...)を持つ
  for (const [key, value] of Object.entries(row.data ?? {})) {
    put(key, value);
  }
  put("category", row.category);
  if (row.notification_id) {
    put("kind", out.kind ?? "notification");
    put("notification_id", row.notification_id);
    put("type", row.notification_type);
    put("entity_type", row.notification_entity_type);
    put("entity_id", row.notification_entity_id);
    put("comment_id", row.notification_comment_id);
    put("actor_id", row.notification_actor_id);
    // 通知の data には投稿の原本画像の URL(image_url)が入っていることがある。
    // 端末には渡さない(措置・非公開になった投稿の原本を見せない。添える画像は
    // 上の段の image_url に、公開中の小さい版だけを入れる)
    const notificationData = Object.fromEntries(
      Object.entries(row.notification_data ?? {}).filter(([key]) => key !== "image_url"),
    );
    if (Object.keys(notificationData).length > 0) {
      put("data", notificationData);
    }
  }
  return out;
}

/**
 * 通知に添える画像の出どころ。
 * - 投稿への反応(いいね・コメント・プロンプト/スタイル/Creator Looks の利用投稿・利用数の節目)は、その投稿
 * - フォローは、フォローした人のアイコン
 * - 生成の完了(成功)は、できた画像。本人あてなので投稿していなくても付ける
 * 運営の措置・ペルコインなどには付けない(措置の対象画像を再び見せないため)。
 */
export type PushImageSource =
  | { kind: "post"; postId: string }
  | { kind: "comment"; commentId: string }
  | { kind: "avatar"; userId: string }
  | { kind: "generated"; imageJobId: string; userId: string };

const POST_IMAGE_NOTIFICATION_TYPES = new Set([
  "like",
  "comment",
  "derived_post_published",
  "style_preset_post_published",
  "creator_looks_post_published",
  "derived_usage_milestone",
]);

export function pushImageSourceFor(row: ClaimedRow): PushImageSource | null {
  // 生成の完了は、できた画像の小さい版。完了と同時に送るが、小さい版(WebP)は
  // worker がそのあと作るので、送る側(process.ts)が少し待って探す
  // (原本の PNG は重いので付けない)。失敗の通知には画像が無い
  if (row.category === "generation") {
    const imageJobId = row.data?.image_job_id;
    return row.data?.status === "succeeded" && typeof imageJobId === "string" && imageJobId
      ? { kind: "generated", imageJobId, userId: row.recipient_id }
      : null;
  }

  const type = row.notification_type;
  if (type === "follow") {
    return row.notification_actor_id
      ? { kind: "avatar", userId: row.notification_actor_id }
      : null;
  }
  if (!type || !POST_IMAGE_NOTIFICATION_TYPES.has(type)) return null;

  // Creator Looks の利用投稿は、通知がテンプレートを指し、投稿は data に入る
  const generatedImageId = row.notification_data?.generated_image_id;
  if (typeof generatedImageId === "string" && generatedImageId) {
    return { kind: "post", postId: generatedImageId };
  }

  const entityId = row.notification_entity_id;
  if (!entityId) return null;
  if (row.notification_entity_type === "post") {
    return { kind: "post", postId: entityId };
  }
  if (row.notification_entity_type === "comment") {
    const imageId = row.notification_data?.image_id;
    return typeof imageId === "string" && imageId
      ? { kind: "post", postId: imageId }
      : { kind: "comment", commentId: entityId };
  }
  return null;
}

/**
 * 送り主のアイコンつきで出す(iOS のコミュニケーション通知)種類。人からの反応だけ。
 * 2026-10-24 ユーザー決定: アイコンを設定している人だけ。設定していない人(avatar_url が空)は今までどおり。
 */
const SENDER_NOTIFICATION_TYPES = new Set(["like", "comment", "follow"]);

export function senderSourceFor(row: ClaimedRow): PushImageSource | null {
  if (!row.notification_type || !SENDER_NOTIFICATION_TYPES.has(row.notification_type)) {
    return null;
  }
  return row.notification_actor_id
    ? { kind: "avatar", userId: row.notification_actor_id }
    : null;
}

/**
 * 送り主の名前の下に出す文。iOS は名前を1行目に出すので、名前を外す。
 * 記録してある題名(「〇〇があなたの投稿にいいねしました」「〇〇があなたのコメントに返信しました」など)の
 * 「〇〇が」を外して使う(題名の名前は記録したときのものなので、今の名前とは限らない)。
 * 形が違う題名は null(アイコンつきにせず、今までどおり送る)。
 */
export function buildSenderMessage(
  row: ClaimedRow,
  likeCount: number | null,
): string | null {
  const match = /^.+?が(あなた.+)$/u.exec(row.title?.trim() ?? "");
  if (!match) return null;
  let message = match[1];
  const others = Math.max(0, Math.floor(likeCount ?? 0) - 1);
  if (row.notification_type === "like" && others > 0) {
    message = `ほか${others}人と、${message}`;
  }
  const body = row.body?.trim();
  return body ? `${message}\n${body}` : message;
}

/** 送り主(アイコン・名前・名前の下の文)。端末が iOS のコミュニケーション通知にする */
export interface PushSender {
  name: string;
  iconUrl: string;
  message: string;
}

export interface PushImageRow {
  storage_path_thumb?: string | null;
  storage_path_display?: string | null;
  is_posted?: boolean | null;
  moderation_status?: string | null;
  user_id?: string | null;
}

/**
 * 投稿画像の行 → 通知に添える URL。
 * - 公開中(投稿済み・措置なし)のときだけ。非公開・確認待ち・公開停止の画像は付けない
 * - 小さい版(サムネイル → 表示用の WebP)だけを使う。原本(PNG 2MB 前後)は付けない
 */
export function pushImageUrlFromRow(
  supabaseUrl: string,
  image: PushImageRow | null | undefined,
): string | null {
  if (!image) return null;
  if (image.is_posted !== true || image.moderation_status !== "visible") {
    return null;
  }
  return storageImageUrl(supabaseUrl, image);
}

/**
 * 生成したばかりの本人の画像(生成完了の通知に添える)。本人あてなので投稿していなくても
 * 付けるが、宛先と持ち主が違う・運営が見えなくした画像は付けない。小さい版だけ。
 */
export function ownGeneratedImageUrlFromRow(
  supabaseUrl: string,
  image: PushImageRow | null | undefined,
  recipientId: string,
): string | null {
  if (!image || image.user_id !== recipientId) return null;
  if (image.moderation_status !== "visible") return null;
  return storageImageUrl(supabaseUrl, image);
}

function storageImageUrl(supabaseUrl: string, image: PushImageRow): string | null {
  const path = image.storage_path_thumb || image.storage_path_display;
  if (!path) return null;
  const base = supabaseUrl.replace(/\/+$/, "");
  // パスは区切りの / を残して、各部分をエンコードする(空白・日本語などがあっても壊れない)
  const encodedPath = path.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  return usableImageUrl(`${base}/storage/v1/object/public/generated-images/${encodedPath}`);
}

/** 端末が取りに行ける URL だけを使う(相対パスや空文字は付けない) */
export function usableImageUrl(url: string | null | undefined): string | null {
  return typeof url === "string" && /^https:\/\//i.test(url.trim()) ? url.trim() : null;
}

export interface FcmMessageInput {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
  category: string;
  collapseKey: string | null;
  badge: number | null;
  /** 通知に添える画像(https のみ)。無ければ文字だけの通知 */
  imageUrl?: string | null;
  /**
   * 送り主。iOS はアプリの Notification Service Extension が、左にこのアイコン・右下にアプリのアイコンの
   * 形(コミュニケーション通知)にする。アイコンが取れなければ今までどおり。Android は使わない
   */
  sender?: PushSender | null;
}

/** FCM HTTP v1 の message。Android はチャンネル=種類、iOS は未読数のバッジ */
export function buildFcmMessage(input: FcmMessageInput): Record<string, unknown> {
  const notification: Record<string, string> = { title: input.title };
  if (input.body) notification.body = input.body;
  const imageUrl = usableImageUrl(input.imageUrl);
  // Android は FCM がそのまま大きな画像つきで出す。iOS はアプリの
  // Notification Service Extension が画像を取ってきて添える(mutable-content と
  // fcm_options.image が要る)
  if (imageUrl) notification.image = imageUrl;

  const androidNotification: Record<string, unknown> = {
    channel_id: input.category,
  };
  if (input.collapseKey) {
    // 表示中の同じ通知を置き換える
    androidNotification.tag = input.collapseKey;
  }

  const aps: Record<string, unknown> = {
    sound: "default",
    "thread-id": input.category,
  };
  if (input.badge !== null && input.badge >= 0) {
    aps.badge = input.badge;
  }
  const senderIconUrl = usableImageUrl(input.sender?.iconUrl);
  const sender =
    input.sender && senderIconUrl && input.sender.name.trim() && input.sender.message.trim()
      ? input.sender
      : null;
  if (imageUrl || sender) {
    aps["mutable-content"] = 1;
  }

  const apnsHeaders: Record<string, string> = { "apns-priority": "10" };
  if (input.collapseKey) {
    // 64 バイトまで。like:<uuid> は 41 バイト
    apnsHeaders["apns-collapse-id"] = input.collapseKey.slice(0, 64);
  }

  const android: Record<string, unknown> = {
    priority: "HIGH",
    notification: androidNotification,
  };
  if (input.collapseKey) {
    android.collapse_key = input.collapseKey;
  }

  const apns: Record<string, unknown> = { headers: apnsHeaders, payload: { aps } };
  if (imageUrl) {
    apns.fcm_options = { image: imageUrl };
  }

  const data: Record<string, string> = { ...input.data };
  // アプリを開いている時はアプリが自分で通知を出すので、画像の URL も渡す
  if (imageUrl) data.image_url = imageUrl;
  if (sender && senderIconUrl) {
    data.sender_name = sender.name.trim();
    data.sender_icon_url = senderIconUrl;
    data.sender_message = sender.message.trim();
  }

  return {
    token: input.token,
    notification,
    data,
    android,
    apns,
  };
}

/** FCM の返事 1 件の読み方 */
export type FcmOutcome =
  | { kind: "ok" }
  /** その宛先はもう使えない(アプリ削除・トークン失効)→ 宛先を消す */
  | { kind: "invalid_token"; error: string }
  /** 混雑・一時障害 → 送る時刻を延ばしてやり直す */
  | { kind: "retry"; error: string }
  /** アクセストークンが無効(鍵の差し替え直後など)→ 使い回しを捨ててやり直す */
  | { kind: "unauthorized"; error: string }
  /** それ以外(設定の誤りなど)→ やり直しても直らない */
  | { kind: "failed"; error: string };

interface FcmErrorBody {
  error?: {
    status?: string;
    message?: string;
    details?: Array<{ "@type"?: string; errorCode?: string }>;
  };
}

export function classifyFcmResponse(status: number, body: unknown): FcmOutcome {
  if (status >= 200 && status < 300) {
    return { kind: "ok" };
  }
  const err = (body as FcmErrorBody | null)?.error;
  const fcmCode = err?.details?.find((d) =>
    d["@type"]?.endsWith("google.firebase.fcm.v1.FcmError")
  )?.errorCode;
  const message = `${status} ${fcmCode ?? err?.status ?? ""} ${err?.message ?? ""}`
    .replace(/\s+/g, " ")
    .trim();

  // 宛先を消すのは、宛先そのものが使えないと FCM が言っている時だけ。
  // 詳細コードの無い 404 や SENDER_ID_MISMATCH は、鍵やプロジェクトの設定の誤り
  // (こちら側)でも返るので消さない(消すと、設定を一度間違えるだけで全員の宛先が消える)
  if (fcmCode === "UNREGISTERED") {
    return { kind: "invalid_token", error: message };
  }
  // INVALID_ARGUMENT は送る中身の誤りでも返る。登録トークンが壊れている時だけ宛先を消す
  if (fcmCode === "INVALID_ARGUMENT" && /registration token/i.test(err?.message ?? "")) {
    return { kind: "invalid_token", error: message };
  }
  if (status === 401) {
    return { kind: "unauthorized", error: message };
  }
  if (status === 429 || status >= 500 || fcmCode === "QUOTA_EXCEEDED" ||
    fcmCode === "UNAVAILABLE" || fcmCode === "INTERNAL") {
    return { kind: "retry", error: message };
  }
  return { kind: "failed", error: message };
}

export type GroupStatus = "sent" | "skipped" | "failed" | "retry";

/**
 * 宛先(端末)ごとの結果から、その 1 通の結果を決める。
 * 1 台でも届けば sent。届かず一時障害(アクセストークンの無効を含む)があれば retry。
 * 端末が無ければ skipped。
 */
export function summarizeOutcomes(
  outcomes: FcmOutcome[],
): { status: GroupStatus; error: string | null } {
  if (outcomes.length === 0) {
    return { status: "skipped", error: "no_device" };
  }
  if (outcomes.some((o) => o.kind === "ok")) {
    return { status: "sent", error: null };
  }
  const firstError = (o: FcmOutcome) => ("error" in o ? o.error : "");
  const retry = outcomes.find((o) => o.kind === "retry" || o.kind === "unauthorized");
  if (retry) {
    return { status: "retry", error: firstError(retry) };
  }
  if (outcomes.every((o) => o.kind === "invalid_token")) {
    return { status: "skipped", error: "no_valid_device" };
  }
  const failed = outcomes.find((o) => o.kind === "failed") ?? outcomes[0];
  return { status: "failed", error: firstError(failed) };
}
