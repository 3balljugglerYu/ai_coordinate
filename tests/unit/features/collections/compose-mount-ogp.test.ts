import sharp from "sharp";

import {
  DEFAULT_OGP_MOUNT_PLACEMENT,
  composeMountOgpFromTemplate,
  ogpPathFromMountPath,
  parseOgpMountPlacement,
} from "@/features/collections/lib/compose-mount-ogp";

function solidPng(width: number, height: number, rgb: [number, number, number]) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: rgb[0], g: rgb[1], b: rgb[2] },
    },
  })
    .png()
    .toBuffer();
}

describe("parseOgpMountPlacement", () => {
  test("null / 配列 / 非オブジェクトは既定値を返す", () => {
    expect(parseOgpMountPlacement(null)).toEqual(DEFAULT_OGP_MOUNT_PLACEMENT);
    expect(parseOgpMountPlacement(undefined)).toEqual(
      DEFAULT_OGP_MOUNT_PLACEMENT,
    );
    expect(parseOgpMountPlacement([1, 2])).toEqual(DEFAULT_OGP_MOUNT_PLACEMENT);
    expect(parseOgpMountPlacement("cx=10")).toEqual(
      DEFAULT_OGP_MOUNT_PLACEMENT,
    );
  });

  test("有効なフィールドは採用し、不正・欠損は既定値で補う", () => {
    expect(
      parseOgpMountPlacement({ cx: 700, cy: 300, width: 400, rotate: -3 }),
    ).toEqual({ cx: 700, cy: 300, width: 400, rotate: -3 });
    expect(parseOgpMountPlacement({ cx: 700 })).toEqual({
      ...DEFAULT_OGP_MOUNT_PLACEMENT,
      cx: 700,
    });
    // 範囲外・非数は既定値
    expect(
      parseOgpMountPlacement({
        cx: 99999,
        cy: -5,
        width: "wide",
        rotate: Number.NaN,
      }),
    ).toEqual(DEFAULT_OGP_MOUNT_PLACEMENT);
  });
});

describe("composeMountOgpFromTemplate", () => {
  test("テンプレートと台紙から 1200x630 の PNG を生成する", async () => {
    const templatePng = await solidPng(600, 315, [255, 230, 220]);
    const mountPng = await solidPng(128, 201, [40, 40, 200]);

    const out = await composeMountOgpFromTemplate({ templatePng, mountPng });
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);

    // 配置中心(既定 cx=800, cy=315)付近に台紙の色が乗っている
    const { data } = await sharp(out)
      .extract({ left: 798, top: 313, width: 4, height: 4 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data[2]).toBeGreaterThan(150); // B が支配的(台紙の色)
    expect(data[0]).toBeLessThan(100);
  });

  test("台紙がキャンバス外に完全に出る placement はエラーになる", async () => {
    const templatePng = await solidPng(600, 315, [255, 255, 255]);
    const mountPng = await solidPng(64, 100, [0, 0, 0]);
    await expect(
      composeMountOgpFromTemplate({
        templatePng,
        mountPng,
        placement: { cx: 5000, cy: 315, width: 100, rotate: 0 },
      }),
    ).rejects.toThrow("out of canvas");
  });
});

describe("ogpPathFromMountPath", () => {
  test("mount- プレフィックスのファイル名を ogp- に変換する", () => {
    expect(
      ogpPathFromMountPath("collection-mounts/u/cat/mount-1718000000000.png"),
    ).toBe("collection-mounts/u/cat/ogp-1718000000000.png");
    expect(ogpPathFromMountPath("collection-mounts/u/cat/other.png")).toBeNull();
  });
});
