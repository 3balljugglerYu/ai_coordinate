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
