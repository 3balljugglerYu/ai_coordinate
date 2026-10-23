/** @jest-environment node */

import type { ClaimedRow, FcmOutcome } from "@/supabase/functions/send-push/messages";
import {
  CLAIM_LIMIT,
  type DeviceRow,
  type FcmSender,
  type FinishItem,
  IMAGE_LOOKUP_TIMEOUT_MS,
  mapWithConcurrency,
  NOT_PROCESSED_ERROR,
  type PushStore,
  runSendPush,
  SEND_CONCURRENCY,
  TIME_BUDGET_MS,
} from "@/supabase/functions/send-push/process";

function row(id: string, overrides: Partial<ClaimedRow> = {}): ClaimedRow {
  return {
    id,
    recipient_id: "user-a",
    category: "comments",
    collapse_key: null,
    title: "Miki があなたの投稿にコメントしました",
    body: "かわいい！",
    data: {},
    attempt_count: 1,
    notification_id: `n-${id}`,
    notification_type: "comment",
    notification_entity_type: "post",
    notification_entity_id: "post-1",
    notification_comment_id: null,
    notification_actor_id: "actor-1",
    notification_data: null,
    ...overrides,
  };
}

function rows(prefix: string, count: number, overrides: Partial<ClaimedRow> = {}): ClaimedRow[] {
  return Array.from({ length: count }, (_, i) => row(`${prefix}-${i}`, overrides));
}

const device = (id: string, userId: string, token: string): DeviceRow => ({
  id,
  user_id: userId,
  token,
});

interface StoreOptions {
  batches?: ClaimedRow[][];
  devices?: DeviceRow[];
  allowed?: (userId: string, category: string) => boolean;
  allowedError?: (userId: string) => string | null;
  claimError?: string;
  finishFailures?: number;
  devicesThrow?: boolean;
  unreadLikeCount?: (userId: string, entityId: string) => Promise<number | null>;
  imageUrl?: PushStore["imageUrl"];
  nickname?: PushStore["nickname"];
}

function fakeStore(options: StoreOptions = {}) {
  const batches = [...(options.batches ?? [])];
  let finishFailures = options.finishFailures ?? 0;
  const calls = {
    claim: 0,
    finish: [] as FinishItem[][],
    removeTokens: [] as string[][],
  };
  const store: PushStore = {
    async claim() {
      calls.claim += 1;
      if (options.claimError) return { rows: [], error: options.claimError };
      return { rows: batches.shift() ?? [], error: null };
    },
    async finish(results) {
      calls.finish.push(results);
      if (finishFailures > 0) {
        finishFailures -= 1;
        return { error: "connection reset" };
      }
      return { error: null };
    },
    async allowedNow(userId, category) {
      const error = options.allowedError?.(userId) ?? null;
      if (error) return { allowed: false, error };
      return { allowed: options.allowed ? options.allowed(userId, category) : true, error: null };
    },
    async devices(userIds) {
      if (options.devicesThrow) throw new Error("unexpected");
      return {
        devices: (options.devices ?? []).filter((d) => userIds.includes(d.user_id)),
        error: null,
      };
    },
    async unreadCount() {
      return 2;
    },
    unreadLikeCount: options.unreadLikeCount ?? (async () => 1),
    nickname: options.nickname ?? (async () => "Miki"),
    imageUrl: options.imageUrl ?? (async () => null),
    async removeTokens(tokens) {
      calls.removeTokens.push(tokens);
      return { removed: tokens.length, error: null };
    },
  };
  return { store, calls };
}

/**
 * FCM の偽物。アクセストークンは fcm-auth と同じく使い回し、resetAccessToken で捨てる。
 */
function fakeSender(
  outcomeFor: (token: string, accessToken: string) => FcmOutcome | Promise<FcmOutcome> = () => ({
    kind: "ok",
  }),
) {
  let current: string | null = null;
  let issued = 0;
  const calls = {
    sentTokens: [] as string[],
    accessTokens: [] as string[],
    messages: [] as Record<string, unknown>[],
    reset: 0,
  };
  const sender: FcmSender = {
    async getAccessToken() {
      if (!current) current = `access-${++issued}`;
      return current;
    },
    resetAccessToken() {
      calls.reset += 1;
      current = null;
    },
    async send(accessToken, message) {
      const token = (message as { token: string }).token;
      calls.sentTokens.push(token);
      calls.accessTokens.push(accessToken);
      calls.messages.push(message);
      return outcomeFor(token, accessToken);
    },
  };
  return { sender, calls };
}

function statusById(items: FinishItem[]): Record<string, string> {
  return Object.fromEntries(items.map((i) => [i.id, `${i.status}:${i.error ?? ""}`]));
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("runSendPush", () => {
  test("送ってよい行は送り、設定でオフ・端末なしは skipped にして、1 回で記録する", async () => {
    const { store, calls } = fakeStore({
      batches: [[row("r1"), row("r2", { recipient_id: "user-b" }), row("r3", { recipient_id: "user-c" })]],
      devices: [device("d1", "user-a", "tok-a"), device("d3", "user-c", "tok-c")],
      allowed: (userId) => userId !== "user-c",
    });
    const { sender, calls: fcm } = fakeSender();

    const result = await runSendPush(store, sender);

    expect(result).toEqual({
      ok: true,
      totals: { claimed: 3, sent: 1, skipped: 2, failed: 0, retry: 0, removedTokens: 0 },
    });
    expect(calls.finish).toHaveLength(1);
    expect(statusById(calls.finish[0])).toEqual({
      r1: "sent:",
      r2: "skipped:no_device",
      r3: "skipped:preference",
    });
    expect(fcm.sentTokens).toEqual(["tok-a"]);
  });

  test("投稿への反応には、その投稿の画像を添える", async () => {
    const sources: unknown[] = [];
    const { store } = fakeStore({
      batches: [[row("r1")]],
      devices: [device("d1", "user-a", "tok-a")],
      imageUrl: async (source) => {
        sources.push(source);
        return "https://cdn.example/thumb.webp";
      },
    });
    const { sender, calls: fcm } = fakeSender();

    await runSendPush(store, sender);

    // 投稿の画像(と、コメントした人のアイコン)
    expect(sources).toEqual([
      { kind: "post", postId: "post-1" },
      { kind: "avatar", userId: "actor-1" },
    ]);
    const message = fcm.messages[0] as {
      notification: { image?: string };
      data: Record<string, string>;
    };
    expect(message.notification.image).toBe("https://cdn.example/thumb.webp");
    expect(message.data.image_url).toBe("https://cdn.example/thumb.webp");
  });

  test("⭐画像が取れなくても、文字だけで送る", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const { store, calls } = fakeStore({
      batches: [[row("r1")]],
      devices: [device("d1", "user-a", "tok-a")],
      imageUrl: async () => {
        throw new Error("storage down");
      },
    });
    const { sender, calls: fcm } = fakeSender();

    await runSendPush(store, sender);

    expect(fcm.sentTokens).toEqual(["tok-a"]);
    expect((fcm.messages[0] as { notification: { image?: string } }).notification.image)
      .toBeUndefined();
    expect(statusById(calls.finish[0])).toEqual({ r1: "sent:" });
    // 握りつぶさず、何が失敗したかを記録する
    expect(consoleError).toHaveBeenCalledWith("[send-push] image lookup failed:", "storage down");
    consoleError.mockRestore();
  });

  test("⭐画像を探すのが遅いときは、上限で打ち切って文字だけで送る", async () => {
    jest.useFakeTimers();
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const { store, calls } = fakeStore({
      batches: [[row("r1")]],
      devices: [device("d1", "user-a", "tok-a")],
      imageUrl: () => new Promise<string | null>(() => {}),
    });
    const { sender, calls: fcm } = fakeSender();

    const run = runSendPush(store, sender);
    await jest.advanceTimersByTimeAsync(IMAGE_LOOKUP_TIMEOUT_MS + 10);
    await run;

    expect(fcm.sentTokens).toEqual(["tok-a"]);
    expect((fcm.messages[0] as { notification: { image?: string } }).notification.image)
      .toBeUndefined();
    expect(statusById(calls.finish[0])).toEqual({ r1: "sent:" });
    expect(consoleError).toHaveBeenCalledWith(
      "[send-push] image lookup failed:",
      `timeout after ${IMAGE_LOOKUP_TIMEOUT_MS}ms`,
    );
    consoleError.mockRestore();
    jest.useRealTimers();
  });

  test("端末が無い宛先では画像を探さない", async () => {
    const imageUrl = jest.fn(async () => "https://cdn.example/thumb.webp");
    const { store } = fakeStore({
      batches: [[row("r1")]],
      devices: [],
      imageUrl,
    });
    const { sender } = fakeSender();

    await runSendPush(store, sender);

    expect(imageUrl).not.toHaveBeenCalled();
  });

  test("同じ宛先・同じ collapse_key のいいねは 1 通にまとめ、まとめ文で送る", async () => {
    const like = {
      category: "likes",
      collapse_key: "like:post-1",
      notification_type: "like",
    } satisfies Partial<ClaimedRow>;
    const { store, calls } = fakeStore({
      batches: [[row("l1", like), row("l2", like)]],
      devices: [device("d1", "user-a", "tok-a")],
      unreadLikeCount: async () => 3,
    });
    const { sender, calls: fcm } = fakeSender();

    await runSendPush(store, sender);

    expect(fcm.sentTokens).toEqual(["tok-a"]);
    expect((fcm.messages[0].notification as { title: string }).title).toBe(
      "Mikiほか2人があなたの投稿にいいねしました",
    );
    expect(statusById(calls.finish[0])).toEqual({ l1: "sent:", l2: "sent:" });
  });

  test("⭐クリエイター還元は data の回数で文を作り、画像は付けず、同じ日の通知を置き換える鍵で送る", async () => {
    const imageUrl = jest.fn(async () => "https://cdn.example/thumb.webp");
    const { store } = fakeStore({
      batches: [[
        row("u1", {
          category: "percoin",
          title: "",
          body: "",
          notification_id: "n-reward",
          notification_type: "usage_reward_earned",
          notification_entity_type: "user",
          notification_entity_id: "user-a",
          notification_actor_id: "user-a",
          notification_data: { reward_date: "2026-10-20", usage_count: 3, total_amount: 6 },
        }),
      ]],
      devices: [device("d1", "user-a", "tok-a")],
      imageUrl,
    });
    const { sender, calls: fcm } = fakeSender();

    await runSendPush(store, sender);

    const message = fcm.messages[0] as {
      notification: { title: string; body?: string; image?: string };
      android: { collapse_key?: string };
      apns: { headers: Record<string, string> };
    };
    expect(message.notification).toEqual({
      title: "本日、あなたの作品が3回利用され6ペルコイン獲得！",
    });
    expect(message.android.collapse_key).toBe("usage_reward:n-reward");
    expect(message.apns.headers["apns-collapse-id"]).toBe("usage_reward:n-reward");
    // ペルコインの通知には画像を付けない(探しにも行かない)
    expect(imageUrl).not.toHaveBeenCalled();
  });

  describe("送り主のアイコン(iOS のコミュニケーション通知)", () => {
    const like = {
      category: "likes",
      collapse_key: "like:post-1",
      title: "マサがあなたの投稿にいいねしました",
      body: "",
      notification_type: "like",
    } satisfies Partial<ClaimedRow>;

    type Sent = {
      data: Record<string, string>;
      notification: { title: string; image?: string };
      apns: { payload: { aps: Record<string, unknown> } };
    };

    test("アイコンを設定している人のいいねは、送り主の名前(今の名前)・アイコン・文を入れる", async () => {
      const { store } = fakeStore({
        batches: [[row("l1", like)]],
        devices: [device("d1", "user-a", "tok-a")],
        imageUrl: async (source) =>
          source.kind === "avatar"
            ? "https://cdn.example/avatar.webp"
            : "https://cdn.example/thumb.webp",
      });
      const { sender, calls: fcm } = fakeSender();

      await runSendPush(store, sender);

      const message = fcm.messages[0] as Sent;
      expect(message.data.sender_name).toBe("Miki");
      expect(message.data.sender_icon_url).toBe("https://cdn.example/avatar.webp");
      expect(message.data.sender_message).toBe("あなたの投稿にいいねしました");
      // 投稿の画像は今までどおり添え、題名も変えない(Android とアイコンが取れなかったとき用)
      expect(message.notification.image).toBe("https://cdn.example/thumb.webp");
      expect(message.notification.title).toBe("マサがあなたの投稿にいいねしました");
      expect(message.apns.payload.aps["mutable-content"]).toBe(1);
    });

    test("いいねのまとめは、題名と同じ人数で「ほか N 人と、」", async () => {
      const { store } = fakeStore({
        batches: [[row("l1", like), row("l2", like)]],
        devices: [device("d1", "user-a", "tok-a")],
        unreadLikeCount: async () => 3,
        imageUrl: async () => "https://cdn.example/avatar.webp",
      });
      const { sender, calls: fcm } = fakeSender();

      await runSendPush(store, sender);

      const message = fcm.messages[0] as Sent;
      expect(message.notification.title).toBe("Mikiほか2人があなたの投稿にいいねしました");
      expect(message.data.sender_message).toBe("ほか2人と、あなたの投稿にいいねしました");
    });

    test("⭐アイコンを設定していない人(アイコンが見つからない)は、今までどおり", async () => {
      const { store } = fakeStore({
        batches: [[row("l1", like)]],
        devices: [device("d1", "user-a", "tok-a")],
        imageUrl: async (source) =>
          source.kind === "avatar" ? null : "https://cdn.example/thumb.webp",
      });
      const { sender, calls: fcm } = fakeSender();

      await runSendPush(store, sender);

      const message = fcm.messages[0] as Sent;
      expect(message.data.sender_name).toBeUndefined();
      expect(message.data.sender_icon_url).toBeUndefined();
      expect(message.data.sender_message).toBeUndefined();
      expect(message.notification.image).toBe("https://cdn.example/thumb.webp");
    });

    test("フォローは、添える画像と送り主のアイコンが同じなので1回だけ探す", async () => {
      const imageUrl = jest.fn(async () => "https://cdn.example/avatar.webp");
      const { store } = fakeStore({
        batches: [[row("f1", {
          category: "follows",
          title: "吉野理沙があなたをフォローしました",
          body: "",
          notification_type: "follow",
          notification_entity_type: "user",
          notification_entity_id: "user-a",
        })]],
        devices: [device("d1", "user-a", "tok-a")],
        imageUrl,
      });
      const { sender, calls: fcm } = fakeSender();

      await runSendPush(store, sender);

      expect(imageUrl).toHaveBeenCalledTimes(1);
      const message = fcm.messages[0] as Sent;
      expect(message.data.sender_icon_url).toBe("https://cdn.example/avatar.webp");
      expect(message.data.sender_message).toBe("あなたをフォローしました");
    });

    test("⭐送り主の名前が取れなければ、送り主なしで今までどおり送る", async () => {
      const { store, calls } = fakeStore({
        batches: [[row("l1", like)]],
        devices: [device("d1", "user-a", "tok-a")],
        imageUrl: async () => "https://cdn.example/avatar.webp",
        nickname: async () => null,
      });
      const { sender, calls: fcm } = fakeSender();

      await runSendPush(store, sender);

      expect((fcm.messages[0] as Sent).data.sender_name).toBeUndefined();
      expect(statusById(calls.finish[0])).toEqual({ l1: "sent:" });
    });

    test("⭐送り主の名前を探すのが遅いときは、上限で打ち切って送り主なしで送る", async () => {
      jest.useFakeTimers();
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
      const { store, calls } = fakeStore({
        batches: [[row("l1", like)]],
        devices: [device("d1", "user-a", "tok-a")],
        imageUrl: async () => "https://cdn.example/avatar.webp",
        nickname: () => new Promise<string | null>(() => {}),
      });
      const { sender, calls: fcm } = fakeSender();

      const run = runSendPush(store, sender);
      await jest.advanceTimersByTimeAsync(IMAGE_LOOKUP_TIMEOUT_MS + 10);
      await run;

      expect((fcm.messages[0] as Sent).data.sender_name).toBeUndefined();
      expect(statusById(calls.finish[0])).toEqual({ l1: "sent:" });
      expect(consoleError).toHaveBeenCalledWith(
        "[send-push] sender name lookup failed:",
        `timeout after ${IMAGE_LOOKUP_TIMEOUT_MS}ms`,
      );
      consoleError.mockRestore();
      jest.useRealTimers();
    });

    test("題名の形が違えば、送り主なしで今までどおり送る", async () => {
      const { store } = fakeStore({
        batches: [[row("c1", { title: "新しいコメントがあります" })]],
        devices: [device("d1", "user-a", "tok-a")],
        imageUrl: async () => "https://cdn.example/avatar.webp",
      });
      const { sender, calls: fcm } = fakeSender();

      await runSendPush(store, sender);

      const message = fcm.messages[0] as Sent;
      expect(message.data.sender_name).toBeUndefined();
      expect(message.notification.title).toBe("新しいコメントがあります");
    });

    test("人からの反応でない通知は、送り主のアイコンを探さない", async () => {
      const imageUrl = jest.fn(async () => "https://cdn.example/avatar.webp");
      const { store } = fakeStore({
        batches: [[row("m1", {
          category: "moderation",
          title: "投稿が非公開になりました",
          notification_type: "moderation_rejected",
        })]],
        devices: [device("d1", "user-a", "tok-a")],
        imageUrl,
      });
      const { sender, calls: fcm } = fakeSender();

      await runSendPush(store, sender);

      expect(imageUrl).not.toHaveBeenCalled();
      expect((fcm.messages[0] as Sent).data.sender_name).toBeUndefined();
    });
  });

  test("設定の確認に失敗した行は retry", async () => {
    const { store, calls } = fakeStore({
      batches: [[row("r1"), row("r2", { recipient_id: "user-b" })]],
      devices: [device("d1", "user-a", "tok-a"), device("d2", "user-b", "tok-b")],
      allowedError: (userId) => (userId === "user-b" ? "timeout" : null),
    });
    const { sender } = fakeSender();

    await runSendPush(store, sender);

    expect(statusById(calls.finish[0])).toEqual({
      r1: "sent:",
      r2: "retry:allowed_check: timeout",
    });
  });

  test("⭐使えない宛先は token で消す(行の id では消さない)", async () => {
    const { store, calls } = fakeStore({
      batches: [[row("r1")]],
      devices: [device("d-dead", "user-a", "tok-dead"), device("d-ok", "user-a", "tok-ok")],
    });
    const { sender } = fakeSender((token) =>
      token === "tok-dead" ? { kind: "invalid_token", error: "404 UNREGISTERED" } : { kind: "ok" }
    );

    const result = await runSendPush(store, sender);

    expect(calls.removeTokens).toEqual([["tok-dead"]]);
    expect(result.totals.removedTokens).toBe(1);
    expect(statusById(calls.finish[0])).toEqual({ r1: "sent:" });
  });

  test("⭐401 ならアクセストークンを捨てて retry にし、次の確保で作り直して送る", async () => {
    const { store, calls } = fakeStore({
      batches: [rows("b1", CLAIM_LIMIT), [row("b2-0")]],
      devices: [device("d1", "user-a", "tok-a")],
    });
    // 古いアクセストークン(access-1)は FCM に拒まれる
    const { sender, calls: fcm } = fakeSender((_token, accessToken) =>
      accessToken === "access-1"
        ? { kind: "unauthorized", error: "401 UNAUTHENTICATED" }
        : { kind: "ok" }
    );

    const result = await runSendPush(store, sender);

    expect(fcm.reset).toBeGreaterThan(0);
    expect(calls.finish).toHaveLength(2);
    expect(new Set(calls.finish[0].map((i) => `${i.status}:${i.error}`))).toEqual(
      new Set(["retry:401 UNAUTHENTICATED"]),
    );
    expect(statusById(calls.finish[1])).toEqual({ "b2-0": "sent:" });
    expect(fcm.accessTokens.at(-1)).toBe("access-2");
    expect(result.totals).toMatchObject({ sent: 1, retry: CLAIM_LIMIT, failed: 0 });
  });

  test("⭐1 通の処理が例外で落ちても、ほかは送り、全行を 1 回で記録する", async () => {
    const { store, calls } = fakeStore({
      batches: [
        [
          row("ok1"),
          row("boom", {
            category: "likes",
            collapse_key: "like:post-x",
            notification_type: "like",
            notification_entity_id: "post-x",
          }),
          row("ok2"),
        ],
      ],
      devices: [device("d1", "user-a", "tok-a")],
      unreadLikeCount: async (_userId, entityId) => {
        if (entityId === "post-x") throw new Error("db down");
        return 1;
      },
    });
    const { sender } = fakeSender();

    const result = await runSendPush(store, sender);

    expect(result.ok).toBe(true);
    expect(calls.finish).toHaveLength(1);
    expect(statusById(calls.finish[0])).toEqual({
      ok1: "sent:",
      boom: "retry:exception: db down",
      ok2: "sent:",
    });
  });

  test("⭐送る前の段階で例外が出ても、確保した行を processing のまま残さず retry で記録する", async () => {
    const { store, calls } = fakeStore({
      batches: [[row("r1"), row("r2")]],
      devicesThrow: true,
    });
    const { sender, calls: fcm } = fakeSender();

    const result = await runSendPush(store, sender);

    expect(result.ok).toBe(true);
    expect(fcm.sentTokens).toEqual([]);
    expect(statusById(calls.finish[0])).toEqual({
      r1: `retry:${NOT_PROCESSED_ERROR}`,
      r2: `retry:${NOT_PROCESSED_ERROR}`,
    });
  });

  test("⭐持ち時間を過ぎたら新しく送らず、送っていない行は retry で記録し、次の確保もしない", async () => {
    let clock = 0;
    const { store, calls } = fakeStore({
      batches: [rows("b1", CLAIM_LIMIT), rows("b2", 1)],
      devices: [device("d1", "user-a", "tok-a")],
    });
    // 最初の送信が返る時点で持ち時間を使い切ったことにする
    const { sender, calls: fcm } = fakeSender(() => {
      clock = TIME_BUDGET_MS + 1;
      return { kind: "ok" };
    });

    const result = await runSendPush(store, sender, () => clock);

    // 持ち時間の内に始めた分(同時に始められる数)だけが送られる
    expect(fcm.sentTokens).toHaveLength(SEND_CONCURRENCY);
    const statuses = calls.finish[0].map((i) => `${i.status}:${i.error ?? ""}`);
    expect(statuses.filter((s) => s === "sent:")).toHaveLength(SEND_CONCURRENCY);
    expect(statuses.filter((s) => s === `retry:${NOT_PROCESSED_ERROR}`)).toHaveLength(
      CLAIM_LIMIT - SEND_CONCURRENCY,
    );
    expect(calls.claim).toBe(1);
    expect(result.ok).toBe(true);
  });

  test("⭐同時に送るのは SEND_CONCURRENCY 通まで(1 通ずつ待たない)", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const { store, calls } = fakeStore({
      batches: [rows("r", 25)],
      devices: [device("d1", "user-a", "tok-a")],
    });
    const { sender } = fakeSender(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { kind: "ok" };
    });

    await runSendPush(store, sender);

    expect(maxInFlight).toBe(SEND_CONCURRENCY);
    expect(calls.finish[0].every((i) => i.status === "sent")).toBe(true);
    expect(calls.finish[0]).toHaveLength(25);
  });

  test("⭐記録に失敗したら 1 回だけやり直す", async () => {
    const { store, calls } = fakeStore({
      batches: [[row("r1")]],
      devices: [device("d1", "user-a", "tok-a")],
      finishFailures: 1,
    });
    const { sender } = fakeSender();

    const result = await runSendPush(store, sender);

    expect(result.ok).toBe(true);
    expect(calls.finish).toHaveLength(2);
    expect(calls.finish[1]).toEqual(calls.finish[0]);
  });

  test("記録に 2 回失敗したら finish_failed で終える", async () => {
    const { store, calls } = fakeStore({
      batches: [[row("r1")], [row("r2")]],
      devices: [device("d1", "user-a", "tok-a")],
      finishFailures: 2,
    });
    const { sender } = fakeSender();

    const result = await runSendPush(store, sender);

    expect(result).toMatchObject({ ok: false, error: "finish_failed" });
    expect(calls.finish).toHaveLength(2);
    expect(calls.claim).toBe(1);
  });

  test("確保に失敗したら claim_failed で終え、記録はしない", async () => {
    const { store, calls } = fakeStore({ claimError: "permission denied" });
    const { sender } = fakeSender();

    const result = await runSendPush(store, sender);

    expect(result).toMatchObject({ ok: false, error: "claim_failed" });
    expect(calls.finish).toHaveLength(0);
  });

  test("確保が空なら何もせず終える", async () => {
    const { store, calls } = fakeStore({ batches: [] });
    const { sender } = fakeSender();

    const result = await runSendPush(store, sender);

    expect(result).toEqual({
      ok: true,
      totals: { claimed: 0, sent: 0, skipped: 0, failed: 0, retry: 0, removedTokens: 0 },
    });
    expect(calls.claim).toBe(1);
    expect(calls.finish).toHaveLength(0);
  });
});

describe("mapWithConcurrency", () => {
  test("1 件の例外で止まらず、残りも処理する", async () => {
    const done: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      done.push(n);
    });
    expect(done.sort()).toEqual([1, 3, 4]);
  });

  test("空の配列ならすぐ終わる", async () => {
    const worker = jest.fn(async () => {});
    await mapWithConcurrency([], 10, worker);
    expect(worker).not.toHaveBeenCalled();
  });
});
