import {
  parseCollectionSettings,
  type CollectionSettingsExisting,
} from "@/app/api/admin/preset-categories/collection-settings-payload";

const OFF: CollectionSettingsExisting = {
  isCollectionSeries: false,
  completionThreshold: null,
  mountTemplatePath: null,
  mountLayout: null,
};

const ON: CollectionSettingsExisting = {
  isCollectionSeries: true,
  completionThreshold: 4,
  mountTemplatePath: "wafer/template.png",
  mountLayout: "grid_4",
};

describe("parseCollectionSettings", () => {
  test("空 body は ok で空 payload(変更なし)", () => {
    const r = parseCollectionSettings({}, OFF);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload).toEqual({});
  });

  test("コレクションを有効化し全項目そろえば ok", () => {
    const r = parseCollectionSettings(
      {
        is_collection_series: true,
        completion_threshold: 4,
        mount_template_path: "wafer/t.png",
        mount_layout: "grid_4",
      },
      OFF,
    );
    expect(r.ok).toBe(true);
  });

  test("有効化で N 欠落は拒否(R-02)", () => {
    const r = parseCollectionSettings(
      {
        is_collection_series: true,
        mount_template_path: "wafer/t.png",
        mount_layout: "grid_4",
      },
      OFF,
    );
    expect(r.ok).toBe(false);
  });

  test("有効化でテンプレ欠落は拒否(R-02)", () => {
    const r = parseCollectionSettings(
      {
        is_collection_series: true,
        completion_threshold: 4,
        mount_layout: "grid_4",
      },
      OFF,
    );
    expect(r.ok).toBe(false);
  });

  test("有効化でレイアウト欠落は拒否(R-02)", () => {
    const r = parseCollectionSettings(
      {
        is_collection_series: true,
        completion_threshold: 4,
        mount_template_path: "wafer/t.png",
      },
      OFF,
    );
    expect(r.ok).toBe(false);
  });

  test("threshold が 0 / 負 / 非整数は拒否", () => {
    expect(parseCollectionSettings({ completion_threshold: 0 }, OFF).ok).toBe(false);
    expect(parseCollectionSettings({ completion_threshold: -1 }, OFF).ok).toBe(false);
    expect(parseCollectionSettings({ completion_threshold: 1.5 }, OFF).ok).toBe(false);
  });

  test("未対応レイアウトは拒否", () => {
    expect(parseCollectionSettings({ mount_layout: "grid_5" }, OFF).ok).toBe(false);
  });

  test("テンプレに空文字は拒否、null は許可", () => {
    expect(parseCollectionSettings({ mount_template_path: "" }, OFF).ok).toBe(false);
    const r = parseCollectionSettings({ mount_template_path: null }, OFF);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.mountTemplatePath).toBeNull();
  });

  test("PATCH: 既存ONでレイアウトのスロット数と異なる N は拒否", () => {
    const r = parseCollectionSettings({ completion_threshold: 6 }, ON);
    expect(r.ok).toBe(false);
  });

  test("PATCH: 既存ONで N とレイアウトを同時に変更しスロット数が一致すれば ok", () => {
    const r = parseCollectionSettings(
      { completion_threshold: 6, mount_layout: "grid_6" },
      ON,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload).toEqual({
        completionThreshold: 6,
        mountLayout: "grid_6",
      });
    }
  });

  test("PATCH: 既存ONを無効化すれば必須チェックは不要で ok", () => {
    const r = parseCollectionSettings({ is_collection_series: false }, ON);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.isCollectionSeries).toBe(false);
  });

  test("表示期間: 有効な ISO 文字列は正規化して受理、null はクリア", () => {
    const r = parseCollectionSettings(
      {
        collection_display_starts_at: "2026-07-01T00:00:00+09:00",
        collection_display_ends_at: null,
      },
      OFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.collectionDisplayStartsAt).toBe(
        new Date("2026-07-01T00:00:00+09:00").toISOString(),
      );
      expect(r.payload.collectionDisplayEndsAt).toBeNull();
    }
  });

  test("表示期間: 解釈できない日時文字列は拒否", () => {
    expect(
      parseCollectionSettings(
        { collection_display_starts_at: "not-a-date" },
        OFF,
      ).ok,
    ).toBe(false);
    expect(
      parseCollectionSettings({ collection_display_ends_at: "" }, OFF).ok,
    ).toBe(false);
  });

  test("表示期間: 開始 >= 終了は拒否", () => {
    const r = parseCollectionSettings(
      {
        collection_display_starts_at: "2026-07-31T00:00:00Z",
        collection_display_ends_at: "2026-07-01T00:00:00Z",
      },
      OFF,
    );
    expect(r.ok).toBe(false);
  });

  test("表示期間 PATCH: 既存の開始と矛盾する終了のみの変更は拒否", () => {
    const r = parseCollectionSettings(
      { collection_display_ends_at: "2026-06-01T00:00:00Z" },
      { ...ON, collectionDisplayStartsAt: "2026-07-01T00:00:00Z" },
    );
    expect(r.ok).toBe(false);
  });

  test("表示期間 PATCH: 既存の開始より後の終了のみの変更は ok", () => {
    const r = parseCollectionSettings(
      { collection_display_ends_at: "2026-08-01T00:00:00Z" },
      { ...ON, collectionDisplayStartsAt: "2026-07-01T00:00:00Z" },
    );
    expect(r.ok).toBe(true);
  });

  // ---------------- 型違反系の単純拒否分岐 ----------------

  test("is_collection_series が boolean 以外は拒否", () => {
    const r = parseCollectionSettings({ is_collection_series: "true" }, OFF);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/is_collection_series/);
  });

  test("mount_template_path が string 以外は拒否", () => {
    const r = parseCollectionSettings({ mount_template_path: 123 }, OFF);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/mount_template_path/);
  });

  test("mount_template_path に null を渡すとクリアされる", () => {
    const r = parseCollectionSettings({ mount_template_path: null }, OFF);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.mountTemplatePath).toBeNull();
  });

  test("mount_layout に null を渡すとクリアされる", () => {
    const r = parseCollectionSettings({ mount_layout: null }, OFF);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.mountLayout).toBeNull();
  });

  // ---------------- collection_character_path ----------------

  test("collection_character_path: 文字列はトリムして採用", () => {
    const r = parseCollectionSettings(
      { collection_character_path: "  wafer/char.png  " },
      OFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.collectionCharacterPath).toBe("wafer/char.png");
  });

  test("collection_character_path: null はクリア扱い", () => {
    const r = parseCollectionSettings(
      { collection_character_path: null },
      OFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.collectionCharacterPath).toBeNull();
  });

  test("collection_character_path: 数値など string/null 以外は拒否", () => {
    const r = parseCollectionSettings(
      { collection_character_path: 42 },
      OFF,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/collection_character_path/);
  });

  test("collection_character_path: 空文字は拒否", () => {
    const r = parseCollectionSettings(
      { collection_character_path: "   " },
      OFF,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/collection_character_path/);
  });

  // ---------------- 表示期間: null での明示クリア ----------------

  test("collection_display_starts_at に null を渡すとクリア (existing の値を上書き)", () => {
    const r = parseCollectionSettings(
      { collection_display_starts_at: null },
      {
        ...ON,
        collectionDisplayStartsAt: "2026-07-01T00:00:00Z",
        collectionDisplayEndsAt: "2026-08-01T00:00:00Z",
      },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.collectionDisplayStartsAt).toBeNull();
  });

  test("collection_display_ends_at に null を渡すとクリア", () => {
    const r = parseCollectionSettings(
      { collection_display_ends_at: null },
      {
        ...ON,
        collectionDisplayStartsAt: "2026-07-01T00:00:00Z",
        collectionDisplayEndsAt: "2026-08-01T00:00:00Z",
      },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.collectionDisplayEndsAt).toBeNull();
  });

  test("collection_display_ends_at に解釈不能な文字列は拒否", () => {
    const r = parseCollectionSettings(
      { collection_display_ends_at: "not-a-date" },
      OFF,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/collection_display_ends_at/);
  });

  // ---------------- 解放ゲート: unlock_prerequisite_key ----------------

  test("unlock_prerequisite_key: 文字列はトリムして採用", () => {
    const r = parseCollectionSettings(
      { unlock_prerequisite_key: "  god_collection  " },
      OFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.unlockPrerequisiteKey).toBe("god_collection");
  });

  test("unlock_prerequisite_key: 空文字は null(ゲートなし)に正規化", () => {
    const r = parseCollectionSettings({ unlock_prerequisite_key: "  " }, OFF);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.unlockPrerequisiteKey).toBeNull();
  });

  test("unlock_prerequisite_key: null はクリア(ゲートなし)", () => {
    const r = parseCollectionSettings({ unlock_prerequisite_key: null }, OFF);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.unlockPrerequisiteKey).toBeNull();
  });

  test("unlock_prerequisite_key: string/null 以外は拒否", () => {
    const r = parseCollectionSettings({ unlock_prerequisite_key: 42 }, OFF);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unlock_prerequisite_key/);
  });

  test("空 body は unlock_prerequisite_key を payload に含めない(no-op)", () => {
    const r = parseCollectionSettings({}, OFF);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.unlockPrerequisiteKey).toBeUndefined();
  });

  // ---------------- 段階解放: progressive_batch_size ----------------

  test("progressive_batch_size: 1 以上の整数はそのまま採用", () => {
    const r = parseCollectionSettings({ progressive_batch_size: 3 }, OFF);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.progressiveBatchSize).toBe(3);
  });

  test("progressive_batch_size: null はクリア(一括解放)", () => {
    const r = parseCollectionSettings({ progressive_batch_size: null }, OFF);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.progressiveBatchSize).toBeNull();
  });

  test("progressive_batch_size: 0 / 負 / 非整数は拒否", () => {
    expect(
      parseCollectionSettings({ progressive_batch_size: 0 }, OFF).ok,
    ).toBe(false);
    expect(
      parseCollectionSettings({ progressive_batch_size: -2 }, OFF).ok,
    ).toBe(false);
    expect(
      parseCollectionSettings({ progressive_batch_size: 1.5 }, OFF).ok,
    ).toBe(false);
  });

  test("progressive_batch_size: 数値以外は拒否", () => {
    const r = parseCollectionSettings({ progressive_batch_size: "3" }, OFF);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/progressive_batch_size/);
  });

  test("空 body は progressive_batch_size を payload に含めない(no-op)", () => {
    const r = parseCollectionSettings({}, OFF);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.progressiveBatchSize).toBeUndefined();
  });
});

describe("parseCollectionSettings - mount_slots(カスタム枠) / 任意N / 台紙実寸", () => {
  const SLOTS = [
    { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
    { x: 0.6, y: 0.1, w: 0.3, h: 0.3 },
  ];

  test("mount_slots を指定し threshold=スロット数なら layout 無しでも ok", () => {
    const r = parseCollectionSettings(
      {
        is_collection_series: true,
        completion_threshold: 2,
        mount_template_path: "wafer/t.png",
        mount_slots: SLOTS,
      },
      OFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.mountSlots).toEqual(SLOTS);
  });

  test("mount_slots のスロット数が threshold と不一致なら拒否", () => {
    const r = parseCollectionSettings(
      {
        is_collection_series: true,
        completion_threshold: 3,
        mount_template_path: "wafer/t.png",
        mount_slots: SLOTS,
      },
      OFF,
    );
    expect(r.ok).toBe(false);
  });

  test("mount_slots が配列でない/要素不正は拒否", () => {
    expect(parseCollectionSettings({ mount_slots: "x" }, OFF).ok).toBe(false);
    expect(
      parseCollectionSettings({ mount_slots: [{ x: 0.1, y: 0.1, w: 0.3 }] }, OFF)
        .ok,
    ).toBe(false);
  });

  test("mount_slots の枠が 0..1 をはみ出すと拒否", () => {
    expect(
      parseCollectionSettings(
        { mount_slots: [{ x: 0.9, y: 0.1, w: 0.3, h: 0.3 }] },
        OFF,
      ).ok,
    ).toBe(false);
  });

  test("浮動小数点誤差レベルの超過(EPS以内)は許容する", () => {
    // 0.1 + 0.2 = 0.30000000000000004 → x+w が 1 をごくわずかに超える
    const r = parseCollectionSettings(
      { mount_slots: [{ x: 0.7, y: 0.1, w: 0.1 + 0.2, h: 0.2 }] },
      OFF,
    );
    expect(r.ok).toBe(true);
  });

  test("mount_slots=null は許可(プリセットに戻す)", () => {
    const r = parseCollectionSettings({ mount_slots: null }, OFF);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.mountSlots).toBeNull();
  });

  test("mount_template_width/height は正の整数のみ", () => {
    expect(parseCollectionSettings({ mount_template_width: 1024 }, OFF).ok).toBe(
      true,
    );
    expect(parseCollectionSettings({ mount_template_width: 0 }, OFF).ok).toBe(
      false,
    );
    expect(parseCollectionSettings({ mount_template_height: -5 }, OFF).ok).toBe(
      false,
    );
    expect(
      parseCollectionSettings({ mount_template_height: null }, OFF).ok,
    ).toBe(true);
  });

  test("既存に mount_slots があり threshold だけ更新でも slots 数と整合", () => {
    const existingWithSlots: CollectionSettingsExisting = {
      isCollectionSeries: true,
      completionThreshold: 2,
      mountTemplatePath: "wafer/t.png",
      mountLayout: null,
      mountSlots: SLOTS,
    };
    expect(
      parseCollectionSettings({ completion_threshold: 3 }, existingWithSlots).ok,
    ).toBe(false);
    expect(parseCollectionSettings({}, existingWithSlots).ok).toBe(true);
  });
});

describe("parseCollectionSettings - 進捗モーダル設定(任意・独立)", () => {
  const MODAL_SLOTS = [
    { x: 0.05, y: 0.7, w: 0.14, h: 0.14 },
    { x: 0.25, y: 0.7, w: 0.14, h: 0.14 },
    { x: 0.45, y: 0.7, w: 0.14, h: 0.14 },
  ];
  const BUTTON = { x: 0.1, y: 0.85, w: 0.8, h: 0.09 };
  const CENTER = { x: 0.17, y: 0.21, w: 0.66, h: 0.44 };

  test("frame path / 実寸 / slots / button が揃えば ok でそのまま採用", () => {
    const r = parseCollectionSettings(
      {
        progress_modal_frame_path: "collection-progress-modals/k/abc.png",
        progress_modal_frame_width: 1086,
        progress_modal_frame_height: 1448,
        progress_modal_slots: MODAL_SLOTS,
        progress_modal_button: BUTTON,
      },
      OFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.progressModalFramePath).toBe(
        "collection-progress-modals/k/abc.png",
      );
      expect(r.payload.progressModalFrameWidth).toBe(1086);
      expect(r.payload.progressModalFrameHeight).toBe(1448);
      expect(r.payload.progressModalSlots).toEqual(MODAL_SLOTS);
      expect(r.payload.progressModalButton).toEqual(BUTTON);
    }
  });

  test("is_collection_series が false でも進捗モーダル設定だけで ok(独立)", () => {
    const r = parseCollectionSettings(
      {
        is_collection_series: false,
        progress_modal_frame_path: "collection-progress-modals/k/abc.png",
        progress_modal_frame_width: 1024,
        progress_modal_frame_height: 1024,
        progress_modal_slots: MODAL_SLOTS,
        progress_modal_button: BUTTON,
      },
      OFF,
    );
    expect(r.ok).toBe(true);
  });

  test("進捗モーダル設定は is_collection_series=true の必須要件を増やさない", () => {
    // コレクション有効化の必須(N/テンプレ/レイアウト)が揃っていれば、
    // 進捗モーダル設定が無くても ok のまま。
    const r = parseCollectionSettings(
      {
        is_collection_series: true,
        completion_threshold: 4,
        mount_template_path: "wafer/t.png",
        mount_layout: "grid_4",
      },
      OFF,
    );
    expect(r.ok).toBe(true);
  });

  test("frame path の空文字は拒否、null は許可(クリア)", () => {
    expect(
      parseCollectionSettings({ progress_modal_frame_path: "  " }, OFF).ok,
    ).toBe(false);
    const r = parseCollectionSettings(
      { progress_modal_frame_path: null },
      OFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.progressModalFramePath).toBeNull();
  });

  test("frame width/height は正の整数のみ、null は許可", () => {
    expect(
      parseCollectionSettings({ progress_modal_frame_width: 1024 }, OFF).ok,
    ).toBe(true);
    expect(
      parseCollectionSettings({ progress_modal_frame_width: 0 }, OFF).ok,
    ).toBe(false);
    expect(
      parseCollectionSettings({ progress_modal_frame_height: 1.5 }, OFF).ok,
    ).toBe(false);
    expect(
      parseCollectionSettings({ progress_modal_frame_height: null }, OFF).ok,
    ).toBe(true);
  });

  test("slots が配列でない/要素不正は拒否", () => {
    expect(
      parseCollectionSettings({ progress_modal_slots: "x" }, OFF).ok,
    ).toBe(false);
    expect(
      parseCollectionSettings(
        { progress_modal_slots: [{ x: 0.1, y: 0.1, w: 0.3 }] },
        OFF,
      ).ok,
    ).toBe(false);
  });

  test("slots の枠が 0..1 をはみ出すと拒否", () => {
    expect(
      parseCollectionSettings(
        { progress_modal_slots: [{ x: 0.9, y: 0.1, w: 0.3, h: 0.3 }] },
        OFF,
      ).ok,
    ).toBe(false);
  });

  test("slots=null は許可(クリア)", () => {
    const r = parseCollectionSettings({ progress_modal_slots: null }, OFF);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.progressModalSlots).toBeNull();
  });

  test("button が配列やオブジェクト不正は拒否、null は許可", () => {
    expect(
      parseCollectionSettings({ progress_modal_button: [BUTTON] }, OFF).ok,
    ).toBe(false);
    expect(
      parseCollectionSettings(
        { progress_modal_button: { x: 0.1, y: 0.1, w: 0.2 } },
        OFF,
      ).ok,
    ).toBe(false);
    const r = parseCollectionSettings({ progress_modal_button: null }, OFF);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.progressModalButton).toBeNull();
  });

  test("button が 0..1 をはみ出すと拒否", () => {
    expect(
      parseCollectionSettings(
        { progress_modal_button: { x: 0.5, y: 0.9, w: 0.8, h: 0.2 } },
        OFF,
      ).ok,
    ).toBe(false);
  });

  test("空 body は進捗モーダル設定を payload に含めない(no-op)", () => {
    const r = parseCollectionSettings({}, OFF);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.progressModalFramePath).toBeUndefined();
      expect(r.payload.progressModalSlots).toBeUndefined();
      expect(r.payload.progressModalButton).toBeUndefined();
      expect(r.payload.progressModalCenter).toBeUndefined();
    }
  });

  // ---------------- progress_modal_center(中央画像領域) ----------------

  test("center が有効な矩形なら ok でそのまま採用", () => {
    const r = parseCollectionSettings(
      { progress_modal_center: CENTER },
      OFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.progressModalCenter).toEqual(CENTER);
  });

  test("center=null は許可(クリア)", () => {
    const r = parseCollectionSettings({ progress_modal_center: null }, OFF);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.progressModalCenter).toBeNull();
  });

  test("center が配列やオブジェクト不正は拒否", () => {
    expect(
      parseCollectionSettings({ progress_modal_center: [CENTER] }, OFF).ok,
    ).toBe(false);
    expect(
      parseCollectionSettings(
        { progress_modal_center: { x: 0.1, y: 0.1, w: 0.2 } },
        OFF,
      ).ok,
    ).toBe(false);
  });

  test("center が 0..1 をはみ出すと拒否", () => {
    expect(
      parseCollectionSettings(
        { progress_modal_center: { x: 0.5, y: 0.7, w: 0.8, h: 0.5 } },
        OFF,
      ).ok,
    ).toBe(false);
  });

  // ---------------- progress_modal_ring_color / progress_modal_badge_color ----------------

  test("ring/badge color: 有効な #RRGGBB はそのまま採用", () => {
    const r = parseCollectionSettings(
      {
        progress_modal_ring_color: "#F97316",
        progress_modal_badge_color: "#1E90FF",
      },
      OFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.progressModalRingColor).toBe("#F97316");
      expect(r.payload.progressModalBadgeColor).toBe("#1E90FF");
    }
  });

  test("ring/badge color: 大文字小文字混在の hex も受理", () => {
    const r = parseCollectionSettings(
      { progress_modal_ring_color: "#aabBcc" },
      OFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.progressModalRingColor).toBe("#aabBcc");
  });

  test("ring/badge color: null はクリア(デフォルト配色に戻す)", () => {
    const r = parseCollectionSettings(
      {
        progress_modal_ring_color: null,
        progress_modal_badge_color: null,
      },
      OFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.progressModalRingColor).toBeNull();
      expect(r.payload.progressModalBadgeColor).toBeNull();
    }
  });

  test("ring color: hex でない文字列は拒否", () => {
    expect(
      parseCollectionSettings({ progress_modal_ring_color: "orange" }, OFF).ok,
    ).toBe(false);
    // 3桁短縮形は許可しない
    expect(
      parseCollectionSettings({ progress_modal_ring_color: "#FFF" }, OFF).ok,
    ).toBe(false);
    // # 抜けは拒否
    expect(
      parseCollectionSettings({ progress_modal_ring_color: "F97316" }, OFF).ok,
    ).toBe(false);
  });

  test("badge color: 文字列以外(数値)は拒否", () => {
    const r = parseCollectionSettings(
      { progress_modal_badge_color: 16711680 },
      OFF,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/progress_modal_badge_color/);
  });

  test("空 body は ring/badge color を payload に含めない(no-op)", () => {
    const r = parseCollectionSettings({}, OFF);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.progressModalRingColor).toBeUndefined();
      expect(r.payload.progressModalBadgeColor).toBeUndefined();
    }
  });

  // ---------------- progress_modal_badge_text_color / progress_modal_badge_bg_color ----------------

  test("badge text/bg color: 有効な #RRGGBB はそのまま採用", () => {
    const r = parseCollectionSettings(
      {
        progress_modal_badge_text_color: "#FF0000",
        progress_modal_badge_bg_color: "#00FF00",
      },
      OFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.progressModalBadgeTextColor).toBe("#FF0000");
      expect(r.payload.progressModalBadgeBgColor).toBe("#00FF00");
    }
  });

  test("badge text/bg color: 大文字小文字混在の hex も受理", () => {
    const r = parseCollectionSettings(
      {
        progress_modal_badge_text_color: "#aAbBcC",
        progress_modal_badge_bg_color: "#DdEeFf",
      },
      OFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.progressModalBadgeTextColor).toBe("#aAbBcC");
      expect(r.payload.progressModalBadgeBgColor).toBe("#DdEeFf");
    }
  });

  test("badge text/bg color: null はクリア(デフォルト配色に戻す)", () => {
    const r = parseCollectionSettings(
      {
        progress_modal_badge_text_color: null,
        progress_modal_badge_bg_color: null,
      },
      OFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.progressModalBadgeTextColor).toBeNull();
      expect(r.payload.progressModalBadgeBgColor).toBeNull();
    }
  });

  test("badge text color: hex でない文字列は拒否", () => {
    // 名前付き色は拒否
    expect(
      parseCollectionSettings(
        { progress_modal_badge_text_color: "orange" },
        OFF,
      ).ok,
    ).toBe(false);
    // 3桁短縮形は許可しない
    expect(
      parseCollectionSettings(
        { progress_modal_badge_text_color: "#FFF" },
        OFF,
      ).ok,
    ).toBe(false);
    // # 抜けは拒否
    const r = parseCollectionSettings(
      { progress_modal_badge_text_color: "FF0000" },
      OFF,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/progress_modal_badge_text_color/);
  });

  test("badge bg color: 文字列以外(数値)は拒否", () => {
    const r = parseCollectionSettings(
      { progress_modal_badge_bg_color: 16711680 },
      OFF,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/progress_modal_badge_bg_color/);
  });

  test("空 body は badge text/bg color を payload に含めない(no-op)", () => {
    const r = parseCollectionSettings({}, OFF);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.progressModalBadgeTextColor).toBeUndefined();
      expect(r.payload.progressModalBadgeBgColor).toBeUndefined();
    }
  });

  test("CTAボタン色: #RRGGBB を採用、null はそのまま", () => {
    const r = parseCollectionSettings(
      {
        progress_modal_button_color: "#C670FF",
        progress_modal_button_text_color: null,
      },
      OFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.progressModalButtonColor).toBe("#C670FF");
      expect(r.payload.progressModalButtonTextColor).toBeNull();
    }
  });

  test("CTAボタン色: 不正な HEX は拒否", () => {
    const r1 = parseCollectionSettings(
      { progress_modal_button_color: "#FFF" },
      OFF,
    );
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toMatch(/progress_modal_button_color/);

    const r2 = parseCollectionSettings(
      { progress_modal_button_text_color: "FFFFFF" },
      OFF,
    );
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toMatch(/progress_modal_button_text_color/);
  });

  test("空 body は CTAボタン色を payload に含めない(no-op)", () => {
    const r = parseCollectionSettings({}, OFF);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.progressModalButtonColor).toBeUndefined();
      expect(r.payload.progressModalButtonTextColor).toBeUndefined();
    }
  });
});

describe("parseCollectionSettings - 解放お知らせ設定(任意・独立)", () => {
  test("hero path: 非空文字列は trim して採用、null はそのまま", () => {
    const r = parseCollectionSettings(
      { unlock_announcement_hero_path: "  heroes/petit/a.png  " },
      OFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.unlockAnnouncementHeroPath).toBe("heroes/petit/a.png");
    }

    const rNull = parseCollectionSettings(
      { unlock_announcement_hero_path: null },
      OFF,
    );
    expect(rNull.ok).toBe(true);
    if (rNull.ok) {
      expect(rNull.payload.unlockAnnouncementHeroPath).toBeNull();
    }
  });

  test("hero path: 空文字は拒否", () => {
    const r = parseCollectionSettings(
      { unlock_announcement_hero_path: "   " },
      OFF,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unlock_announcement_hero_path/);
  });

  test("本文: trim して採用、空文字は null に正規化", () => {
    const r = parseCollectionSettings(
      {
        unlock_announcement_initial_body: "  新スタイル登場！  ",
        unlock_announcement_drip_body: "",
      },
      OFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.unlockAnnouncementInitialBody).toBe("新スタイル登場！");
      expect(r.payload.unlockAnnouncementDripBody).toBeNull();
    }
  });

  test("本文: 200文字超は拒否", () => {
    const r = parseCollectionSettings(
      { unlock_announcement_initial_body: "あ".repeat(201) },
      OFF,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unlock_announcement_initial_body/);
  });

  test("本文: 文字列以外(数値)は拒否", () => {
    const r = parseCollectionSettings(
      { unlock_announcement_drip_body: 123 },
      OFF,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unlock_announcement_drip_body/);
  });

  test("色4種: #RRGGBB を採用、null はそのまま", () => {
    const r = parseCollectionSettings(
      {
        unlock_announcement_accent_color: "#C670FF",
        unlock_announcement_accent_hover_color: "#B14DF0",
        unlock_announcement_title_color: "#8B3DC9",
        unlock_announcement_soft_color: null,
      },
      OFF,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.unlockAnnouncementAccentColor).toBe("#C670FF");
      expect(r.payload.unlockAnnouncementAccentHoverColor).toBe("#B14DF0");
      expect(r.payload.unlockAnnouncementTitleColor).toBe("#8B3DC9");
      expect(r.payload.unlockAnnouncementSoftColor).toBeNull();
    }
  });

  test("色: 不正な HEX(3桁/#抜け)は拒否", () => {
    expect(
      parseCollectionSettings(
        { unlock_announcement_accent_color: "#FFF" },
        OFF,
      ).ok,
    ).toBe(false);
    const r = parseCollectionSettings(
      { unlock_announcement_soft_color: "F3E0FF" },
      OFF,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unlock_announcement_soft_color/);
  });

  test("空 body は解放お知らせ項目を payload に含めない(no-op)", () => {
    const r = parseCollectionSettings({}, OFF);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.unlockAnnouncementHeroPath).toBeUndefined();
      expect(r.payload.unlockAnnouncementInitialBody).toBeUndefined();
      expect(r.payload.unlockAnnouncementAccentColor).toBeUndefined();
    }
  });

  // ===== 完走表示モード(completion_view_mode) / book =====
  describe("completion_view_mode (mount / book)", () => {
    test("book で有効化: N があれば台紙テンプレ/レイアウト無しでも ok(R-02 免除)", () => {
      const r = parseCollectionSettings(
        {
          is_collection_series: true,
          completion_view_mode: "book",
          completion_threshold: 8,
        },
        OFF,
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.payload.completionViewMode).toBe("book");
        expect(r.payload.completionThreshold).toBe(8);
      }
    });

    test("book で有効化: N 欠落は拒否", () => {
      const r = parseCollectionSettings(
        { is_collection_series: true, completion_view_mode: "book" },
        OFF,
      );
      expect(r.ok).toBe(false);
    });

    test("既存が book のカテゴリは body に mode 無しでも台紙必須にならない", () => {
      const existingBook: CollectionSettingsExisting = {
        isCollectionSeries: true,
        completionThreshold: 8,
        completionViewMode: "book",
        mountTemplatePath: null,
        mountLayout: null,
      };
      // N だけ更新(mode 据え置き)。mount 用 R-02 にひっかからないこと。
      const r = parseCollectionSettings({ completion_threshold: 8 }, existingBook);
      expect(r.ok).toBe(true);
    });

    test("mount(既定)では従来どおり台紙テンプレ/レイアウトが必須", () => {
      const r = parseCollectionSettings(
        {
          is_collection_series: true,
          completion_view_mode: "mount",
          completion_threshold: 4,
        },
        OFF,
      );
      expect(r.ok).toBe(false);
    });

    test("不正な mode は拒否", () => {
      const r = parseCollectionSettings(
        { completion_view_mode: "invalid" },
        OFF,
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/completion_view_mode/);
    });

    test("book_cover_path: 空文字は拒否 / null は受理 / 文字列は trim", () => {
      expect(
        parseCollectionSettings({ book_cover_path: "  " }, OFF).ok,
      ).toBe(false);
      const rNull = parseCollectionSettings({ book_cover_path: null }, OFF);
      expect(rNull.ok).toBe(true);
      if (rNull.ok) expect(rNull.payload.bookCoverPath).toBeNull();
      const rStr = parseCollectionSettings(
        { book_cover_path: "  travel/cover.png  " },
        OFF,
      );
      expect(rStr.ok).toBe(true);
      if (rStr.ok) expect(rStr.payload.bookCoverPath).toBe("travel/cover.png");
    });
  });
});
