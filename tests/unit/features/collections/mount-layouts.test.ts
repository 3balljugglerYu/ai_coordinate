import {
  MOUNT_LAYOUTS,
  getMountLayout,
  isMountLayoutKey,
  parseNormalizedSlots,
  resolveMountSlots,
  slotCountForLayout,
  toPixelRect,
  type MountLayoutKey,
} from "@/features/collections/lib/mount-layouts";

describe("mount-layouts", () => {
  const keys: MountLayoutKey[] = ["grid_3", "grid_4", "grid_6"];

  test("各レイアウトのスロット数が名前と一致する", () => {
    expect(slotCountForLayout("grid_3")).toBe(3);
    expect(slotCountForLayout("grid_4")).toBe(4);
    expect(slotCountForLayout("grid_6")).toBe(6);
  });

  test("全スロット矩形が 0..1 の範囲に収まりテンプレ内に入る", () => {
    for (const key of keys) {
      for (const r of MOUNT_LAYOUTS[key]) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.w).toBeGreaterThan(0);
        expect(r.h).toBeGreaterThan(0);
        expect(r.x + r.w).toBeLessThanOrEqual(1);
        expect(r.y + r.h).toBeLessThanOrEqual(1);
      }
    }
  });

  test("isMountLayoutKey は対応キーのみ true", () => {
    expect(isMountLayoutKey("grid_4")).toBe(true);
    expect(isMountLayoutKey("grid_5")).toBe(false);
    expect(isMountLayoutKey(null)).toBe(false);
    expect(isMountLayoutKey(4)).toBe(false);
  });

  test("getMountLayout は未対応キーで例外", () => {
    expect(() => getMountLayout("grid_9" as MountLayoutKey)).toThrow(
      /Unsupported mount layout/,
    );
  });

  test("toPixelRect はテンプレ実寸へ整数換算する", () => {
    const px = toPixelRect({ x: 0.5, y: 0.25, w: 0.4, h: 0.3 }, 1000, 800);
    expect(px).toEqual({ left: 500, top: 200, width: 400, height: 240 });
  });

  test("grid_4 の同一行スロットは重ならない(左右で分かれる)", () => {
    const [tl, tr] = MOUNT_LAYOUTS.grid_4;
    expect(tl.x + tl.w).toBeLessThanOrEqual(tr.x);
  });
});

describe("parseNormalizedSlots", () => {
  test("正常な配列をパースする", () => {
    expect(parseNormalizedSlots([{ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }])).toEqual([
      { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
    ]);
  });

  test("配列でない/空/要素不正は null", () => {
    expect(parseNormalizedSlots(null)).toBeNull();
    expect(parseNormalizedSlots({})).toBeNull();
    expect(parseNormalizedSlots([])).toBeNull();
    expect(parseNormalizedSlots([{ x: 0.1, y: 0.2, w: 0.3 }])).toBeNull(); // h 欠落
    expect(parseNormalizedSlots([{ x: "a", y: 0, w: 0, h: 0 }])).toBeNull();
  });
});

describe("resolveMountSlots (mount_slots 優先・無ければプリセット)", () => {
  test("mount_slots が null なら mount_layout のプリセットにフォールバック(神コレ grid_6 不変)", () => {
    const slots = resolveMountSlots(null, "grid_6");
    expect(slots).toEqual(MOUNT_LAYOUTS.grid_6);
    expect(slots).toHaveLength(6);
  });

  test("mount_slots が有効ならそれを優先する(任意N)", () => {
    const custom = [
      { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
      { x: 0.5, y: 0.5, w: 0.3, h: 0.3 },
    ];
    expect(resolveMountSlots(custom, "grid_6")).toEqual(custom);
  });

  test("mount_slots が不正なら mount_layout にフォールバック", () => {
    expect(resolveMountSlots("not-array", "grid_4")).toEqual(
      MOUNT_LAYOUTS.grid_4,
    );
    expect(resolveMountSlots([], "grid_4")).toEqual(MOUNT_LAYOUTS.grid_4);
  });

  test("mount_slots も mount_layout も無効なら例外", () => {
    expect(() => resolveMountSlots(null, null)).toThrow();
    expect(() => resolveMountSlots(undefined, "grid_99")).toThrow();
  });
});
