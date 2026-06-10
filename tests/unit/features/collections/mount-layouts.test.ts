import {
  MOUNT_LAYOUTS,
  getMountLayout,
  isMountLayoutKey,
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
