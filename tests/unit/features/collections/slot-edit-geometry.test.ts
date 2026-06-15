import {
  alignGroup,
  applyAspect,
  clampPosition,
  distributeEvenly,
  joinSlots,
  movePosition,
  pixelAspectRatio,
  resizeShared,
  seedSlots,
  setSlotCount,
  splitSlots,
  type EditorSlots,
} from "@/features/collections/lib/slot-edit-geometry";
import { MOUNT_LAYOUTS } from "@/features/collections/lib/mount-layouts";

describe("splitSlots / joinSlots", () => {
  test("共有サイズと位置に分解し、合成で往復する", () => {
    const slots = [
      { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
      { x: 0.6, y: 0.6, w: 0.2, h: 0.2 },
    ];
    const state = splitSlots(slots);
    expect(state.size).toEqual({ w: 0.2, h: 0.2 });
    expect(state.positions).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.6, y: 0.6 },
    ]);
    expect(joinSlots(state)).toEqual(slots);
  });

  test("共有サイズは先頭枠の w,h を採用する", () => {
    const state = splitSlots([
      { x: 0, y: 0, w: 0.3, h: 0.25 },
      { x: 0.5, y: 0.5, w: 0.9, h: 0.9 },
    ]);
    expect(state.size).toEqual({ w: 0.3, h: 0.25 });
    // join すると全枠が先頭サイズに揃う
    expect(joinSlots(state).every((s) => s.w === 0.3 && s.h === 0.25)).toBe(true);
  });

  test("空配列は size 0 / positions 空", () => {
    expect(splitSlots([])).toEqual({ size: { w: 0, h: 0 }, positions: [] });
  });
});

describe("seedSlots", () => {
  test("MOUNT_LAYOUTS と同値のコピーを返す(参照は別)", () => {
    const seeded = seedSlots("grid_4");
    expect(seeded).toEqual(MOUNT_LAYOUTS.grid_4);
    expect(seeded[0]).not.toBe(MOUNT_LAYOUTS.grid_4[0]);
  });
});

describe("clampPosition / movePosition", () => {
  test("位置を 0..1(共有サイズ分の余白)内へクランプ", () => {
    const size = { w: 0.3, h: 0.3 };
    expect(clampPosition({ x: -0.5, y: 1.2 }, size)).toEqual({ x: 0, y: 0.7 });
  });

  test("movePosition はその枠だけ移動しクランプする", () => {
    const size = { w: 0.2, h: 0.2 };
    expect(movePosition({ x: 0.1, y: 0.1 }, size, 0.05, -0.05)).toEqual({
      x: 0.15000000000000002,
      y: 0.05,
    });
    // 端を超える移動はクランプ
    expect(movePosition({ x: 0.7, y: 0.7 }, size, 0.5, 0.5)).toEqual({
      x: 0.8,
      y: 0.8,
    });
  });
});

describe("resizeShared (対角固定・全枠連動)", () => {
  const base: EditorSlots = {
    size: { w: 0.2, h: 0.2 },
    positions: [
      { x: 0.1, y: 0.1 },
      { x: 0.6, y: 0.6 },
    ],
  };
  const sq = { lockRatio: false, templateWidth: 1000, templateHeight: 1000, minPx: 24 };

  test("se を引くと左上が固定されたまま全枠が同じ新サイズになる", () => {
    const next = resizeShared(base, "se", 0.05, 0.05, sq);
    expect(next.size.w).toBeCloseTo(0.25, 6);
    expect(next.size.h).toBeCloseTo(0.25, 6);
    // 左上(対角=nw)は固定 → 位置不変
    expect(next.positions[0]).toEqual({ x: 0.1, y: 0.1 });
    expect(next.positions[1]).toEqual({ x: 0.6, y: 0.6 });
    // 全枠同サイズ
    const joined = joinSlots(next);
    expect(joined.every((s) => s.w === next.size.w && s.h === next.size.h)).toBe(true);
  });

  test("nw を引くと各枠の右下が固定されたままサイズが変わる", () => {
    const next = resizeShared(base, "nw", -0.05, -0.05, sq);
    expect(next.size.w).toBeCloseTo(0.25, 6);
    expect(next.size.h).toBeCloseTo(0.25, 6);
    // 右下(対角=se)は固定: 枠0 右下 = (0.3,0.3), 枠1 = (0.8,0.8)
    expect(next.positions[0].x + next.size.w).toBeCloseTo(0.3, 6);
    expect(next.positions[0].y + next.size.h).toBeCloseTo(0.3, 6);
    expect(next.positions[1].x + next.size.w).toBeCloseTo(0.8, 6);
    expect(next.positions[1].y + next.size.h).toBeCloseTo(0.8, 6);
  });

  test("拡大しすぎは各枠が対角固定で 0..1 に収まる最大サイズへクランプ", () => {
    // se 拡大 → 左上固定。枠1(0.6,0.6)の右辺が 1 まで → maxW = 1-0.6 = 0.4
    const next = resizeShared(base, "se", 0.5, 0.5, sq);
    expect(next.size.w).toBeCloseTo(0.4, 6);
    expect(next.size.h).toBeCloseTo(0.4, 6);
  });

  test("nw 拡大は右下固定で左辺が 0 まで → maxW = 右辺座標(0.3)", () => {
    const next = resizeShared(base, "nw", -0.5, -0.5, sq);
    // 枠0 右辺=0.3, 枠1 右辺=0.8 → min=0.3
    expect(next.size.w).toBeCloseTo(0.3, 6);
    expect(next.size.h).toBeCloseTo(0.3, 6);
    // 枠0 は左辺 0 まで拡大
    expect(next.positions[0].x).toBeCloseTo(0, 6);
  });

  test("最小サイズ(px)を下回らない", () => {
    const next = resizeShared(base, "se", -0.5, -0.5, sq);
    // minPx 24 / 1000 = 0.024
    expect(next.size.w).toBeCloseTo(0.024, 6);
    expect(next.size.h).toBeCloseTo(0.024, 6);
  });

  test("比率ロック: 非正方形台紙でもピクセル正方形を維持する", () => {
    // template 1000x500。ピクセル正方形 = w*1000 == h*500
    const start: EditorSlots = {
      size: { w: 0.2, h: 0.4 }, // px 200x200
      positions: [{ x: 0.1, y: 0.1 }],
    };
    const next = resizeShared(start, "se", 0.05, 0.0, {
      lockRatio: true,
      templateWidth: 1000,
      templateHeight: 500,
      minPx: 24,
    });
    // ピクセル正方形不変
    expect(next.size.w * 1000).toBeCloseTo(next.size.h * 500, 4);
  });
});

describe("setSlotCount (枠数の増減)", () => {
  const base: EditorSlots = {
    size: { w: 0.2, h: 0.2 },
    positions: [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.5 },
    ],
  };

  test("増やすと既存枠は保持し不足分を追加する", () => {
    const next = setSlotCount(base, 4);
    expect(next.positions).toHaveLength(4);
    // 既存2枠は不変
    expect(next.positions[0]).toEqual({ x: 0.1, y: 0.1 });
    expect(next.positions[1]).toEqual({ x: 0.5, y: 0.5 });
    // 追加枠は共有サイズ・0..1内
    next.positions.slice(2).forEach((p) => {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1 - base.size.w);
    });
    // サイズは維持
    expect(next.size).toEqual({ w: 0.2, h: 0.2 });
  });

  test("減らすと末尾を削除する", () => {
    const next = setSlotCount(base, 1);
    expect(next.positions).toEqual([{ x: 0.1, y: 0.1 }]);
  });

  test("同数なら変化なし、0以下は空", () => {
    expect(setSlotCount(base, 2)).toBe(base);
    expect(setSlotCount(base, 0).positions).toEqual([]);
  });
});

describe("alignGroup (辺そろえ・全枠が端に揃う)", () => {
  // 3枠: x[0.2,0.5,0.8], y[0.1,0.3,0.6], size 0.1
  const base: EditorSlots = {
    size: { w: 0.1, h: 0.1 },
    positions: [
      { x: 0.2, y: 0.1 },
      { x: 0.5, y: 0.3 },
      { x: 0.8, y: 0.6 },
    ],
  };

  test("左寄せ: 全枠の x が一番左(0.2)に揃う。y は不変", () => {
    const next = alignGroup(base, "left", null);
    expect(next.positions.map((p) => p.x)).toEqual([0.2, 0.2, 0.2]);
    // y は変わらない
    expect(next.positions.map((p) => p.y)).toEqual([0.1, 0.3, 0.6]);
  });

  test("右寄せ: 全枠の x が一番右(0.8)に揃う", () => {
    const next = alignGroup(base, "right", null);
    expect(next.positions.map((p) => p.x)).toEqual([0.8, 0.8, 0.8]);
  });

  test("水平中央: 全枠の x が中点(0.5)に揃う", () => {
    const next = alignGroup(base, "center", null);
    next.positions.forEach((p) => expect(p.x).toBeCloseTo(0.5, 6));
  });

  test("上寄せ: 全枠の y が一番上(0.1)に揃う。x は不変", () => {
    const next = alignGroup(base, null, "top");
    expect(next.positions.map((p) => p.y)).toEqual([0.1, 0.1, 0.1]);
    expect(next.positions.map((p) => p.x)).toEqual([0.2, 0.5, 0.8]);
  });

  test("下寄せ: 全枠の y が一番下(0.6)に揃う", () => {
    const next = alignGroup(base, null, "bottom");
    expect(next.positions.map((p) => p.y)).toEqual([0.6, 0.6, 0.6]);
  });

  test("横と縦を同時に指定すると全枠が1点(左上端)に重なる", () => {
    const next = alignGroup(base, "left", "top");
    next.positions.forEach((p) => {
      expect(p.x).toBeCloseTo(0.2, 6);
      expect(p.y).toBeCloseTo(0.1, 6);
    });
  });

  test("indices を渡すと選択枠だけ整列し、他は不変", () => {
    // 枠0(y=0.1) と 枠1(y=0.3) だけ上そろえ → 両方 y=0.1。枠2 は不変。
    const next = alignGroup(base, null, "top", [0, 1]);
    expect(next.positions[0].y).toBeCloseTo(0.1, 6);
    expect(next.positions[1].y).toBeCloseTo(0.1, 6);
    expect(next.positions[2].y).toBeCloseTo(0.6, 6); // 不変
    // x は全て不変
    expect(next.positions.map((p) => p.x)).toEqual([0.2, 0.5, 0.8]);
  });
});

describe("distributeEvenly (両端固定・等間隔)", () => {
  test("横: 両端固定で間の枠を等間隔にする", () => {
    const state: EditorSlots = {
      size: { w: 0.1, h: 0.1 },
      positions: [
        { x: 0.0, y: 0.1 }, // 左端
        { x: 0.1, y: 0.2 }, // 偏った中間
        { x: 0.15, y: 0.3 },
        { x: 0.6, y: 0.4 }, // 右端
      ],
    };
    const next = distributeEvenly(state, "horizontal");
    // lo=0, hi=0.6, step=0.2 → 0, 0.2, 0.4, 0.6
    [0, 0.2, 0.4, 0.6].forEach((expected, i) =>
      expect(next.positions[i].x).toBeCloseTo(expected, 6),
    );
    // y は不変
    expect(next.positions.map((p) => p.y)).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  test("縦: 両端固定で間の枠を等間隔にする", () => {
    const state: EditorSlots = {
      size: { w: 0.1, h: 0.1 },
      positions: [
        { x: 0.1, y: 0.0 },
        { x: 0.2, y: 0.05 },
        { x: 0.3, y: 0.9 },
      ],
    };
    const next = distributeEvenly(state, "vertical");
    // lo=0, hi=0.9, step=0.45 → 0, 0.45, 0.9
    expect(next.positions.map((p) => p.y)).toEqual([0, 0.45, 0.9]);
  });

  test("順序が入れ替わっていても元のインデックスを保持して等間隔化", () => {
    const state: EditorSlots = {
      size: { w: 0.1, h: 0.1 },
      positions: [
        { x: 0.6, y: 0 }, // 実は右端
        { x: 0.0, y: 0 }, // 実は左端
        { x: 0.5, y: 0 },
      ],
    };
    const next = distributeEvenly(state, "horizontal");
    // ソート: idx1(0), idx2(0.5→0.3), idx0(0.6) → step=0.3
    expect(next.positions[1].x).toBeCloseTo(0, 6);
    expect(next.positions[2].x).toBeCloseTo(0.3, 6);
    expect(next.positions[0].x).toBeCloseTo(0.6, 6);
  });

  test("枠が2つ以下なら変化しない", () => {
    const state: EditorSlots = {
      size: { w: 0.1, h: 0.1 },
      positions: [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.5 },
      ],
    };
    expect(distributeEvenly(state, "horizontal")).toEqual(state);
  });
});

describe("pixelAspectRatio", () => {
  test("正方形台紙では正規化比そのまま", () => {
    expect(pixelAspectRatio({ w: 0.3, h: 0.4 }, 1000, 1000)).toBeCloseTo(0.75, 6);
  });

  test("非正方形台紙では実寸を反映する", () => {
    // 1000x500: w_px=0.2*1000=200, h_px=0.4*500=200 → 1:1
    expect(pixelAspectRatio({ w: 0.2, h: 0.4 }, 1000, 500)).toBeCloseTo(1, 6);
  });
});

describe("applyAspect (指定ピクセル比にそろえる)", () => {
  test("正方形台紙で 3:4 にそろえる(幅基準で高さ決定)", () => {
    const state: EditorSlots = {
      size: { w: 0.3, h: 0.3 },
      positions: [{ x: 0.1, y: 0.1 }],
    };
    const next = applyAspect(state, 3 / 4, 1000, 1000, 24);
    // ピクセル比 = 3/4
    expect(pixelAspectRatio(next.size, 1000, 1000)).toBeCloseTo(0.75, 6);
    // 幅維持・高さ拡張 (h = w / (3/4) = 0.4)
    expect(next.size.w).toBeCloseTo(0.3, 6);
    expect(next.size.h).toBeCloseTo(0.4, 6);
    // 左上は不変
    expect(next.positions[0]).toEqual({ x: 0.1, y: 0.1 });
  });

  test("はみ出す場合は比率を保ったまま全枠が収まるよう縮める", () => {
    // 枠が下端付近: y=0.8 で 3:4(縦長) にすると h が 1-0.8=0.2 を超える
    const state: EditorSlots = {
      size: { w: 0.3, h: 0.1 },
      positions: [{ x: 0.1, y: 0.8 }],
    };
    const next = applyAspect(state, 3 / 4, 1000, 1000, 24);
    // 比率は維持
    expect(pixelAspectRatio(next.size, 1000, 1000)).toBeCloseTo(0.75, 6);
    // 高さは余白 0.2 に収まる
    expect(next.size.h).toBeLessThanOrEqual(0.2 + 1e-9);
  });

  test("非正方形台紙でも指定比を維持する", () => {
    const state: EditorSlots = {
      size: { w: 0.3, h: 0.3 },
      positions: [{ x: 0.1, y: 0.1 }],
    };
    const next = applyAspect(state, 16 / 9, 1000, 500, 24);
    expect(pixelAspectRatio(next.size, 1000, 500)).toBeCloseTo(16 / 9, 4);
  });
});
