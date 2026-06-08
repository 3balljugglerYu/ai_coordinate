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

  test("PATCH: 既存ONで N のみ変更は既存値とマージして ok", () => {
    const r = parseCollectionSettings({ completion_threshold: 6 }, ON);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload).toEqual({ completionThreshold: 6 });
  });

  test("PATCH: 既存ONを無効化すれば必須チェックは不要で ok", () => {
    const r = parseCollectionSettings({ is_collection_series: false }, ON);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.isCollectionSeries).toBe(false);
  });
});
