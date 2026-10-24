/** @jest-environment node */

import {
  buildDataPayload,
  buildFcmMessage,
  buildHonorificTitle,
  buildLikeTitle,
  buildSenderMessage,
  type ClaimedRow,
  classifyFcmResponse,
  groupRows,
  ownGeneratedImageUrlFromRow,
  pushImageSourceFor,
  pushImageUrlFromRow,
  buildUsageRewardTitle,
  resolveCollapseKey,
  resolveText,
  senderSourceFor,
  summarizeOutcomes,
  withHonorific,
} from "@/supabase/functions/send-push/messages";

function row(overrides: Partial<ClaimedRow> = {}): ClaimedRow {
  return {
    id: "row-1",
    recipient_id: "user-a",
    category: "comments",
    collapse_key: null,
    title: "Miki があなたの投稿にコメントしました",
    body: "かわいい！",
    data: {},
    attempt_count: 1,
    notification_id: "n-1",
    notification_type: "comment",
    notification_entity_type: "post",
    notification_entity_id: "post-1",
    notification_comment_id: "c-1",
    notification_actor_id: "actor-1",
    notification_data: { image_id: "post-1" },
    ...overrides,
  };
}

describe("groupRows", () => {
  test("collapse_key の無い行はそれぞれ 1 通", () => {
    const groups = groupRows([row({ id: "a" }), row({ id: "b" })]);
    expect(groups.map((g) => g.rowIds)).toEqual([["a"], ["b"]]);
  });

  test("同じ宛先・同じ collapse_key は 1 通にまとめ、最後の行を表示に使う", () => {
    const groups = groupRows([
      row({ id: "a", category: "likes", collapse_key: "like:p1", notification_actor_id: "x" }),
      row({ id: "b", category: "comments" }),
      row({ id: "c", category: "likes", collapse_key: "like:p1", notification_actor_id: "y" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].rowIds).toEqual(["a", "c"]);
    expect(groups[0].latest.notification_actor_id).toBe("y");
    expect(groups[1].rowIds).toEqual(["b"]);
  });

  test("collapse_key が同じでも宛先が違えば別の 1 通", () => {
    const groups = groupRows([
      row({ id: "a", collapse_key: "like:p1" }),
      row({ id: "b", recipient_id: "user-b", collapse_key: "like:p1" }),
    ]);
    expect(groups.map((g) => g.rowIds)).toEqual([["a"], ["b"]]);
  });
});

describe("buildLikeTitle", () => {
  test("1 件なら元の通知と同じ文", () => {
    expect(buildLikeTitle("Miki", 1)).toBe("Mikiさんがあなたの投稿にいいねしました");
  });

  test("2 件以上は「ほか N 人」", () => {
    expect(buildLikeTitle("Miki", 4)).toBe("Mikiさんほか3人があなたの投稿にいいねしました");
  });

  test("ニックネームが無ければ「ユーザー」", () => {
    expect(buildLikeTitle(null, 2)).toBe("ユーザーさんほか1人があなたの投稿にいいねしました");
    expect(buildLikeTitle("  ", 1)).toBe("ユーザーさんがあなたの投稿にいいねしました");
  });
});

describe("buildUsageRewardTitle", () => {
  const reward = (data: Record<string, unknown> | null) =>
    row({
      category: "percoin",
      title: "",
      body: "",
      notification_type: "usage_reward_earned",
      notification_entity_type: "user",
      notification_data: data,
    });

  test("お知らせ画面と同じ文を data の回数と枚数で作る", () => {
    expect(buildUsageRewardTitle(reward({ usage_count: 1, total_amount: 2 }))).toBe(
      "本日、あなたの作品が1回利用され2ペルコイン獲得！",
    );
  });

  test("数が文字列で入っていても読む", () => {
    expect(buildUsageRewardTitle(reward({ usage_count: "4", total_amount: "8" }))).toBe(
      "本日、あなたの作品が4回利用され8ペルコイン獲得！",
    );
  });

  test.each([
    ["data が無い", null],
    ["回数が無い", { total_amount: 2 }],
    ["枚数が 0", { usage_count: 1, total_amount: 0 }],
    ["小数", { usage_count: 1.5, total_amount: 2 }],
    ["数でない", { usage_count: "abc", total_amount: 2 }],
  ])("%s なら作らない", (_label, data) => {
    expect(buildUsageRewardTitle(reward(data))).toBeNull();
  });

  test("ほかの種類では作らない", () => {
    expect(
      buildUsageRewardTitle(
        row({ notification_data: { usage_count: 1, total_amount: 2 } }),
      ),
    ).toBeNull();
  });

  test("resolveText は空の題名の代わりにこの文を使う(固定文にしない)", () => {
    expect(resolveText(reward({ usage_count: 2, total_amount: 4 }), null)).toEqual({
      title: "本日、あなたの作品が2回利用され4ペルコイン獲得！",
      body: "",
    });
  });

  test("数が読めなければ、今までどおり固定文", () => {
    expect(resolveText(reward(null), null).title).toBe("Persta.AI からのお知らせ");
  });
});

describe("resolveCollapseKey", () => {
  const group = (overrides: Partial<ClaimedRow>, collapseKey: string | null = null) => {
    const latest = row(overrides);
    return {
      recipientId: latest.recipient_id,
      category: latest.category,
      collapseKey,
      latest,
      rowIds: [latest.id],
    };
  };

  test("クリエイター還元は通知ごとの鍵(同じ日の分を置き換える)", () => {
    expect(
      resolveCollapseKey(
        group({ notification_type: "usage_reward_earned", notification_id: "n-9" }),
      ),
    ).toBe("usage_reward:n-9");
  });

  test("UUID でも 64 バイトに収まる", () => {
    const key = resolveCollapseKey(
      group({
        notification_type: "usage_reward_earned",
        notification_id: "123e4567-e89b-12d3-a456-426614174000",
      }),
    );
    expect(Buffer.byteLength(key ?? "")).toBeLessThanOrEqual(64);
  });

  test("行に鍵があればそれを使う(いいね)", () => {
    expect(resolveCollapseKey(group({ notification_type: "like" }, "like:post-1"))).toBe(
      "like:post-1",
    );
  });

  test("ほかの種類は鍵なし", () => {
    expect(resolveCollapseKey(group({}))).toBeNull();
  });
});

describe("resolveText", () => {
  test("まとめ文があればタイトルに使う", () => {
    expect(resolveText(row(), "まとめ")).toEqual({ title: "まとめ", body: "かわいい！" });
  });

  test("タイトルが空なら本文を見出しにする", () => {
    expect(resolveText(row({ title: "", body: "本文だけ" }), null)).toEqual({
      title: "本文だけ",
      body: "",
    });
  });

  test("どちらも空なら固定文", () => {
    expect(resolveText(row({ title: null, body: null }), null).title).toBe(
      "Persta.AI からのお知らせ",
    );
  });
});

describe("buildDataPayload", () => {
  test("通知の行き先に必要なキーを文字列で入れ、入れ子は JSON 文字列にする", () => {
    expect(buildDataPayload(row())).toEqual({
      category: "comments",
      kind: "notification",
      notification_id: "n-1",
      type: "comment",
      entity_type: "post",
      entity_id: "post-1",
      comment_id: "c-1",
      actor_id: "actor-1",
      data: JSON.stringify({ image_id: "post-1" }),
    });
  });

  test("生成完了は outbox の data をそのまま使い、空の値は入れない", () => {
    const payload = buildDataPayload(
      row({
        category: "generation",
        notification_id: null,
        notification_type: null,
        notification_entity_type: null,
        notification_entity_id: null,
        notification_comment_id: null,
        notification_actor_id: null,
        notification_data: null,
        data: { kind: "generation", image_job_id: "job-1", status: "succeeded", generation_type: null },
      }),
    );
    expect(payload).toEqual({
      kind: "generation",
      image_job_id: "job-1",
      status: "succeeded",
      category: "generation",
    });
    for (const value of Object.values(payload)) {
      expect(typeof value).toBe("string");
    }
  });
});

describe("buildFcmMessage", () => {
  test("Android はチャンネル=種類、iOS はバッジと置き換え用の collapse id", () => {
    const message = buildFcmMessage({
      token: "tok",
      title: "T",
      body: "B",
      data: { kind: "notification" },
      category: "likes",
      collapseKey: "like:p1",
      badge: 3,
    });
    expect(message).toEqual({
      token: "tok",
      notification: { title: "T", body: "B" },
      data: { kind: "notification" },
      android: {
        priority: "HIGH",
        collapse_key: "like:p1",
        notification: { channel_id: "likes", tag: "like:p1" },
      },
      apns: {
        headers: { "apns-priority": "10", "apns-collapse-id": "like:p1" },
        payload: { aps: { sound: "default", "thread-id": "likes", badge: 3 } },
      },
    });
  });

  test("本文・collapse_key・バッジが無ければ入れない", () => {
    const message = buildFcmMessage({
      token: "tok",
      title: "T",
      body: "",
      data: {},
      category: "generation",
      collapseKey: null,
      badge: null,
    }) as {
      notification: Record<string, string>;
      android: Record<string, unknown>;
      apns: { headers: Record<string, string>; payload: { aps: Record<string, unknown> } };
    };
    expect(message.notification).toEqual({ title: "T" });
    expect(message.android.collapse_key).toBeUndefined();
    expect(message.apns.headers["apns-collapse-id"]).toBeUndefined();
    expect(message.apns.payload.aps.badge).toBeUndefined();
  });
});

describe("classifyFcmResponse", () => {
  const fcmError = (status: string, errorCode: string, message = "") => ({
    error: {
      status,
      message,
      details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode }],
    },
  });

  test("2xx は届いた", () => {
    expect(classifyFcmResponse(200, { name: "projects/p/messages/1" })).toEqual({ kind: "ok" });
  });

  test("UNREGISTERED は宛先を消す", () => {
    expect(classifyFcmResponse(404, fcmError("NOT_FOUND", "UNREGISTERED")).kind).toBe(
      "invalid_token",
    );
  });

  test("トークンの形が壊れている INVALID_ARGUMENT も宛先を消す", () => {
    const body = fcmError(
      "INVALID_ARGUMENT",
      "INVALID_ARGUMENT",
      "The registration token is not a valid FCM registration token",
    );
    expect(classifyFcmResponse(400, body).kind).toBe("invalid_token");
  });

  test("トークン以外の INVALID_ARGUMENT は失敗(宛先は消さない)", () => {
    const body = fcmError("INVALID_ARGUMENT", "INVALID_ARGUMENT", "Invalid JSON payload");
    expect(classifyFcmResponse(400, body).kind).toBe("failed");
  });

  test("⭐本文に token の語があっても、登録トークンの話でなければ宛先を消さない", () => {
    const body = fcmError(
      "INVALID_ARGUMENT",
      "INVALID_ARGUMENT",
      "Invalid JSON payload received. Unknown name \"tokens\" at 'message': Cannot find field.",
    );
    expect(classifyFcmResponse(400, body).kind).toBe("failed");
  });

  test("⭐SENDER_ID_MISMATCH は鍵の設定の誤りでも返るので、宛先を消さずに失敗", () => {
    const body = fcmError("PERMISSION_DENIED", "SENDER_ID_MISMATCH", "SenderId mismatch");
    expect(classifyFcmResponse(403, body)).toEqual({
      kind: "failed",
      error: "403 SENDER_ID_MISMATCH SenderId mismatch",
    });
  });

  test("⭐詳細コードの無い 404(プロジェクトの取り違えなど)は、宛先を消さずに失敗", () => {
    expect(
      classifyFcmResponse(404, {
        error: { status: "NOT_FOUND", message: "Requested entity was not found." },
      }).kind,
    ).toBe("failed");
    expect(classifyFcmResponse(404, null).kind).toBe("failed");
  });

  test("429 と 5xx はやり直す", () => {
    expect(classifyFcmResponse(429, fcmError("RESOURCE_EXHAUSTED", "QUOTA_EXCEEDED")).kind).toBe(
      "retry",
    );
    expect(classifyFcmResponse(503, null).kind).toBe("retry");
  });

  test("⭐401 はアクセストークンの無効(作り直してやり直す)", () => {
    expect(classifyFcmResponse(401, { error: { status: "UNAUTHENTICATED" } })).toEqual({
      kind: "unauthorized",
      error: "401 UNAUTHENTICATED",
    });
  });

  test("403(権限の誤り)は失敗", () => {
    expect(classifyFcmResponse(403, { error: { status: "PERMISSION_DENIED" } })).toEqual({
      kind: "failed",
      error: "403 PERMISSION_DENIED",
    });
  });
});

describe("summarizeOutcomes", () => {
  test("端末が無ければ skipped", () => {
    expect(summarizeOutcomes([])).toEqual({ status: "skipped", error: "no_device" });
  });

  test("1 台でも届けば sent", () => {
    expect(
      summarizeOutcomes([{ kind: "invalid_token", error: "x" }, { kind: "ok" }]),
    ).toEqual({ status: "sent", error: null });
  });

  test("届かず一時障害があれば retry", () => {
    expect(
      summarizeOutcomes([{ kind: "failed", error: "f" }, { kind: "retry", error: "r" }]),
    ).toEqual({ status: "retry", error: "r" });
  });

  test("⭐アクセストークンの無効も retry(失敗で確定させない)", () => {
    expect(
      summarizeOutcomes([{ kind: "failed", error: "f" }, { kind: "unauthorized", error: "401" }]),
    ).toEqual({ status: "retry", error: "401" });
  });

  test("全部の宛先が使えなければ skipped", () => {
    expect(summarizeOutcomes([{ kind: "invalid_token", error: "x" }])).toEqual({
      status: "skipped",
      error: "no_valid_device",
    });
  });

  test("それ以外は failed", () => {
    expect(
      summarizeOutcomes([{ kind: "invalid_token", error: "x" }, { kind: "failed", error: "f" }]),
    ).toEqual({ status: "failed", error: "f" });
  });
});

describe("pushImageSourceFor", () => {
  test("いいね・コメントは、その投稿", () => {
    expect(pushImageSourceFor(row({ notification_type: "like", category: "likes" })))
      .toEqual({ kind: "post", postId: "post-1" });
    expect(pushImageSourceFor(row())).toEqual({ kind: "post", postId: "post-1" });
  });

  test("コメントが対象の通知は data.image_id、無ければコメントから投稿を探す", () => {
    const onComment = {
      notification_entity_type: "comment",
      notification_entity_id: "c-9",
    } satisfies Partial<ClaimedRow>;
    expect(pushImageSourceFor(row({ ...onComment, notification_data: { image_id: "post-7" } })))
      .toEqual({ kind: "post", postId: "post-7" });
    expect(pushImageSourceFor(row({ ...onComment, notification_data: {} })))
      .toEqual({ kind: "comment", commentId: "c-9" });
  });

  test("プロンプト・スタイルの利用投稿と利用数の節目は、その投稿", () => {
    for (const type of [
      "derived_post_published",
      "style_preset_post_published",
      "derived_usage_milestone",
    ]) {
      expect(pushImageSourceFor(row({ notification_type: type, category: "creator_activity" })))
        .toEqual({ kind: "post", postId: "post-1" });
    }
  });

  test("Creator Looks の利用投稿は、テンプレートでなく data.generated_image_id の投稿", () => {
    expect(pushImageSourceFor(row({
      notification_type: "creator_looks_post_published",
      category: "creator_activity",
      notification_entity_type: "creator_looks_template",
      notification_entity_id: "template-1",
      notification_data: { template_id: "template-1", generated_image_id: "post-9" },
    }))).toEqual({ kind: "post", postId: "post-9" });
    // 投稿が分からなければ付けない(テンプレートの ID を投稿として探さない)
    expect(pushImageSourceFor(row({
      notification_type: "creator_looks_post_published",
      category: "creator_activity",
      notification_entity_type: "creator_looks_template",
      notification_entity_id: "template-1",
      notification_data: { template_id: "template-1" },
    }))).toBeNull();
  });

  test("フォローは、フォローした人のアイコン", () => {
    expect(pushImageSourceFor(row({
      notification_type: "follow",
      category: "follows",
      notification_entity_type: "user",
      notification_entity_id: "user-a",
    }))).toEqual({ kind: "avatar", userId: "actor-1" });
  });

  describe("生成の完了", () => {
    const generation = {
      category: "generation",
      recipient_id: "user-a",
      notification_id: null,
      notification_type: null,
      notification_entity_type: null,
      notification_entity_id: null,
      notification_actor_id: null,
      notification_data: null,
    } satisfies Partial<ClaimedRow>;

    test("成功は、できた画像(宛先の本人の画像として探す)", () => {
      expect(pushImageSourceFor(row({
        ...generation,
        data: { kind: "generation", status: "succeeded", image_job_id: "job-1" },
      }))).toEqual({ kind: "generated", imageJobId: "job-1", userId: "user-a" });
    });

    test("失敗・ジョブが分からないときは付けない", () => {
      for (const data of [
        { kind: "generation", status: "failed", image_job_id: "job-1" },
        { kind: "generation", status: "succeeded" },
        { kind: "generation", status: "succeeded", image_job_id: "" },
      ]) {
        expect(pushImageSourceFor(row({ ...generation, data }))).toBeNull();
      }
    });
  });

  test("⭐運営の措置・ペルコインには付けない", () => {
    expect(pushImageSourceFor(row({
      notification_type: "post_moderation_removed",
      category: "moderation",
    }))).toBeNull();
    expect(pushImageSourceFor(row({ notification_type: "bonus", category: "percoin" })))
      .toBeNull();
  });
});

describe("pushImageUrlFromRow", () => {
  const base = "https://ref.supabase.co/";
  const visible = { is_posted: true, moderation_status: "visible" };

  test("小さい版(サムネイル → 表示用の WebP)を使う", () => {
    expect(pushImageUrlFromRow(base, { ...visible, storage_path_thumb: "u/p_thumb.webp", storage_path_display: "u/p.webp" }))
      .toBe("https://ref.supabase.co/storage/v1/object/public/generated-images/u/p_thumb.webp");
    expect(pushImageUrlFromRow(base, { ...visible, storage_path_display: "/u/p.webp" }))
      .toBe("https://ref.supabase.co/storage/v1/object/public/generated-images/u/p.webp");
  });

  test("パスの各部分はエンコードする(区切りの / は残す)", () => {
    expect(pushImageUrlFromRow(base, { ...visible, storage_path_thumb: "u/あ い#1.webp" }))
      .toBe("https://ref.supabase.co/storage/v1/object/public/generated-images/u/%E3%81%82%20%E3%81%84%231.webp");
  });

  test("⭐小さい版が無ければ付けない(原本の PNG は重いので付けない)", () => {
    expect(pushImageUrlFromRow(base, { ...visible, storage_path_thumb: null, storage_path_display: null }))
      .toBeNull();
    expect(pushImageUrlFromRow(base, null)).toBeNull();
  });

  test.each([
    ["非公開(投稿していない)", { is_posted: false, moderation_status: "visible" }],
    ["確認待ち", { is_posted: true, moderation_status: "pending" }],
    ["公開停止", { is_posted: true, moderation_status: "removed" }],
  ])("⭐投稿が%sなら画像を付けない", (_label, state) => {
    expect(pushImageUrlFromRow(base, { ...state, storage_path_thumb: "u/p_thumb.webp" }))
      .toBeNull();
  });
});

describe("buildDataPayload の通知の data", () => {
  test("⭐原本画像の URL(image_url)は端末に渡さず、ほかの値は残す", () => {
    const payload = buildDataPayload(row({
      notification_data: { image_id: "post-1", image_url: "https://x/original.png", comment_id: "c1" },
    }));
    expect(JSON.parse(payload.data)).toEqual({ image_id: "post-1", comment_id: "c1" });
    expect(payload.data).not.toContain("original.png");
  });

  test("image_url だけなら data を付けない", () => {
    const payload = buildDataPayload(row({ notification_data: { image_url: "https://x/a.png" } }));
    expect(payload.data).toBeUndefined();
  });
});

describe("buildFcmMessage の画像", () => {
  const base = {
    token: "tok",
    title: "t",
    body: "",
    data: { kind: "notification" },
    category: "likes",
    collapseKey: null,
    badge: null,
  };

  test("画像があれば Android・iOS・アプリ用の data に入れる", () => {
    const message = buildFcmMessage({ ...base, imageUrl: "https://cdn.example/a.webp" }) as {
      notification: Record<string, string>;
      data: Record<string, string>;
      apns: { fcm_options?: { image: string }; payload: { aps: Record<string, unknown> } };
    };
    expect(message.notification.image).toBe("https://cdn.example/a.webp");
    expect(message.apns.fcm_options).toEqual({ image: "https://cdn.example/a.webp" });
    expect(message.apns.payload.aps["mutable-content"]).toBe(1);
    expect(message.data).toEqual({ kind: "notification", image_url: "https://cdn.example/a.webp" });
  });

  test("⭐https でない URL は付けない(端末が取りに行けない)", () => {
    for (const imageUrl of [null, "", "u/p.png", "http://insecure.example/a.png"]) {
      const message = buildFcmMessage({ ...base, imageUrl }) as {
        notification: Record<string, string>;
        apns: { fcm_options?: unknown; payload: { aps: Record<string, unknown> } };
      };
      expect(message.notification.image).toBeUndefined();
      expect(message.apns.fcm_options).toBeUndefined();
      expect(message.apns.payload.aps["mutable-content"]).toBeUndefined();
    }
  });
});

describe("送り主のアイコンつき(iOS のコミュニケーション通知)", () => {
  const fcmBase = {
    token: "tok",
    title: "Miki があなたの投稿にいいねしました",
    body: "",
    data: { kind: "notification" },
    category: "likes",
    collapseKey: null,
    badge: null,
  };

  describe("senderSourceFor", () => {
    test.each(["like", "comment", "follow"])("%s は送り主のアイコンを探す", (type) => {
      expect(senderSourceFor(row({ notification_type: type, notification_actor_id: "actor-1" })))
        .toEqual({ kind: "avatar", userId: "actor-1" });
    });

    test.each(["usage_reward_earned", "derived_post_published", "moderation_rejected", null])(
      "%s は対象外",
      (type) => {
        expect(senderSourceFor(row({ notification_type: type }))).toBeNull();
      },
    );

    test("送り主がいなければ対象外", () => {
      expect(senderSourceFor(row({ notification_type: "like", notification_actor_id: null })))
        .toBeNull();
    });
  });

  describe("buildSenderMessage", () => {
    test("題名の「〇〇が」を外す(いいね・フォロー)", () => {
      expect(buildSenderMessage(
        row({ notification_type: "like", title: "りる🐣があなたの投稿にいいねしました", body: "" }),
        1,
      )).toBe("あなたの投稿にいいねしました");
      expect(buildSenderMessage(
        row({ notification_type: "follow", title: "吉野理沙があなたをフォローしました", body: "" }),
        null,
      )).toBe("あなたをフォローしました");
    });

    test("いいねが2件以上なら「ほか N 人と、」を付ける", () => {
      expect(buildSenderMessage(
        row({ notification_type: "like", title: "りる🐣があなたの投稿にいいねしました", body: null }),
        3,
      )).toBe("ほか2人と、あなたの投稿にいいねしました");
    });

    test("コメント・返信は、本文を次の行に付ける", () => {
      expect(buildSenderMessage(
        row({ title: "りる🐣があなたの投稿にコメントしました", body: " かわいい！ " }),
        null,
      )).toBe("あなたの投稿にコメントしました\nかわいい！");
      expect(buildSenderMessage(
        row({ title: "ちゃんりおがあなたのコメントに返信しました", body: "ありがとう" }),
        null,
      )).toBe("あなたのコメントに返信しました\nありがとう");
      expect(buildSenderMessage(
        row({ title: "MIOがあなたの返信に返信しました", body: "またね" }),
        null,
      )).toBe("あなたの返信に返信しました\nまたね");
    });

    test("⭐名前に「が」が入っていても、最初の「があなた」で切る", () => {
      expect(buildSenderMessage(
        row({ notification_type: "follow", title: "ながのがあなたをフォローしました", body: "" }),
        null,
      )).toBe("あなたをフォローしました");
    });

    test("形の違う題名は null(今までどおり送る)", () => {
      expect(buildSenderMessage(row({ title: "新しいコメントがあります" }), null)).toBeNull();
      expect(buildSenderMessage(row({ title: null }), null)).toBeNull();
    });
  });

  describe("buildFcmMessage の sender", () => {
    const sender = { name: "りる🐣", iconUrl: "https://cdn.example/avatar.webp", message: "あなたの投稿にいいねしました" };

    test("送り主を data に入れ、iOS で Notification Service Extension を起こす", () => {
      const message = buildFcmMessage({ ...fcmBase, sender }) as {
        data: Record<string, string>;
        apns: { payload: { aps: Record<string, unknown> }; fcm_options?: unknown };
        notification: Record<string, string>;
      };
      expect(message.data).toEqual({
        kind: "notification",
        sender_name: "りる🐣",
        sender_icon_url: "https://cdn.example/avatar.webp",
        sender_message: "あなたの投稿にいいねしました",
      });
      expect(message.apns.payload.aps["mutable-content"]).toBe(1);
      // 添える画像とは別(送り主のアイコンを大きな画像として付けない)
      expect(message.apns.fcm_options).toBeUndefined();
      expect(message.notification.image).toBeUndefined();
    });

    test.each([
      ["https でないアイコン", { ...sender, iconUrl: "http://cdn.example/a.webp" }],
      ["空の名前", { ...sender, name: " " }],
      ["空の文", { ...sender, message: "" }],
    ])("%s なら送り主を入れない(今までどおり)", (_label, bad) => {
      const message = buildFcmMessage({ ...fcmBase, sender: bad }) as {
        data: Record<string, string>;
        apns: { payload: { aps: Record<string, unknown> } };
      };
      expect(message.data).toEqual({ kind: "notification" });
      expect(message.apns.payload.aps["mutable-content"]).toBeUndefined();
    });
  });
});

describe("ownGeneratedImageUrlFromRow", () => {
  const base = "https://ref.supabase.co";
  const own = {
    user_id: "user-a",
    is_posted: false,
    moderation_status: "visible",
    storage_path_thumb: "user-a/g_thumb.webp",
    storage_path_display: "user-a/g.webp",
  };

  test("本人の画像は、投稿していなくても小さい版を付ける", () => {
    expect(ownGeneratedImageUrlFromRow(base, own, "user-a"))
      .toBe(`${base}/storage/v1/object/public/generated-images/user-a/g_thumb.webp`);
  });

  test("サムネイルが無ければ表示用", () => {
    expect(ownGeneratedImageUrlFromRow(base, { ...own, storage_path_thumb: null }, "user-a"))
      .toBe(`${base}/storage/v1/object/public/generated-images/user-a/g.webp`);
  });

  test("小さい版がまだ無ければ null(原本は付けない)", () => {
    expect(ownGeneratedImageUrlFromRow(
      base,
      { ...own, storage_path_thumb: null, storage_path_display: null },
      "user-a",
    )).toBeNull();
  });

  test("⭐宛先と持ち主が違う・運営が見えなくした画像は付けない", () => {
    expect(ownGeneratedImageUrlFromRow(base, own, "user-b")).toBeNull();
    expect(ownGeneratedImageUrlFromRow(base, { ...own, user_id: null }, "user-a")).toBeNull();
    for (const moderation_status of ["removed", "pending", null]) {
      expect(ownGeneratedImageUrlFromRow(base, { ...own, moderation_status }, "user-a"))
        .toBeNull();
    }
    expect(ownGeneratedImageUrlFromRow(base, null, "user-a")).toBeNull();
  });
});

describe("名前の「さん」", () => {
  test("withHonorific は「さん」を付ける。もう付いていれば重ねない", () => {
    expect(withHonorific("りる🐣")).toBe("りる🐣さん");
    expect(withHonorific(" Miki ")).toBe("Mikiさん");
    expect(withHonorific("田中さん")).toBe("田中さん");
    expect(withHonorific("山田様")).toBe("山田様");
    expect(withHonorific("みきちゃん")).toBe("みきちゃん");
    expect(withHonorific("たろうくん")).toBe("たろうくん");
  });

  test.each([
    ["like", "りる🐣があなたの投稿にいいねしました", "りる🐣さんがあなたの投稿にいいねしました"],
    ["comment", "MIOがあなたのコメントに返信しました", "MIOさんがあなたのコメントに返信しました"],
    ["follow", "吉野理沙があなたをフォローしました", "吉野理沙さんがあなたをフォローしました"],
    [
      "derived_post_published",
      "カモネギ。があなたのプロンプトで作品を投稿しました",
      "カモネギ。さんがあなたのプロンプトで作品を投稿しました",
    ],
    [
      "style_preset_post_published",
      "りる🐣があなたのスタイルで作品を投稿しました",
      "りる🐣さんがあなたのスタイルで作品を投稿しました",
    ],
  ])("%s の題名の名前に付ける", (type, title, expected) => {
    expect(buildHonorificTitle(row({ notification_type: type, title }))).toBe(expected);
  });

  test("⭐名前に「が」が入っていても、最初の「があなた」で切る", () => {
    expect(buildHonorificTitle(row({
      notification_type: "follow",
      title: "ながのがあなたをフォローしました",
    }))).toBe("ながのさんがあなたをフォローしました");
  });

  test("⭐名前に「があなた」が入っていても、名前の途中で切らない", () => {
    expect(buildHonorificTitle(row({
      notification_type: "like",
      title: "君があなたがあなたの投稿にいいねしました",
    }))).toBe("君があなたさんがあなたの投稿にいいねしました");
  });

  test("名前の入らない通知・形の違う題名は null(記録のまま)", () => {
    expect(buildHonorificTitle(row({
      notification_type: "derived_usage_milestone",
      title: "あなたのプロンプトが初めて利用されました",
    }))).toBeNull();
    expect(buildHonorificTitle(row({
      notification_type: "admin_message",
      title: "運営があなたに特別賞を贈りました",
    }))).toBeNull();
    expect(buildHonorificTitle(row({ notification_type: "comment", title: "新しいコメント" })))
      .toBeNull();
    expect(buildHonorificTitle(row({ notification_type: "comment", title: null }))).toBeNull();
  });

  test("resolveText は記録の題名に「さん」を足して出す", () => {
    expect(resolveText(row({ title: "りる🐣があなたの投稿にコメントしました" }), null).title)
      .toBe("りる🐣さんがあなたの投稿にコメントしました");
  });
});
