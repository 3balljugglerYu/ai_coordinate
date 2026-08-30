/** @jest-environment node */

import {
  resolveEffectiveAmount,
  resolveScheduleState,
  validateScheduledAt,
} from "@/features/credits/lib/percoin-schedule";

const NOW = new Date("2026-09-15T12:00:00+09:00");
const FUTURE = "2026-10-01T00:00:00+09:00";
const PAST = "2026-09-01T00:00:00+09:00";

describe("resolveScheduleState", () => {
  test("予約が無ければ none", () => {
    expect(
      resolveScheduleState({ scheduledAmount: null, scheduledAt: null }, NOW)
    ).toEqual({ kind: "none" });
  });

  test("切替日時が未来なら pending", () => {
    const state = resolveScheduleState(
      { scheduledAmount: 10, scheduledAt: FUTURE },
      NOW
    );
    expect(state.kind).toBe("pending");
  });

  test("切替日時を過ぎていれば applied", () => {
    const state = resolveScheduleState(
      { scheduledAmount: 10, scheduledAt: PAST },
      NOW
    );
    expect(state.kind).toBe("applied");
  });

  test("ちょうど切替時刻なら applied（DB の now() >= と揃える）", () => {
    const at = "2026-09-15T12:00:00+09:00";
    expect(
      resolveScheduleState({ scheduledAmount: 5, scheduledAt: at }, NOW).kind
    ).toBe("applied");
  });

  test("片方だけの状態は予約なしに倒す（壊れた表示を出さない）", () => {
    expect(
      resolveScheduleState({ scheduledAmount: 10, scheduledAt: null }, NOW)
    ).toEqual({ kind: "none" });
    expect(
      resolveScheduleState({ scheduledAmount: null, scheduledAt: FUTURE }, NOW)
    ).toEqual({ kind: "none" });
  });

  test("日時が壊れていても落とさない", () => {
    expect(
      resolveScheduleState({ scheduledAmount: 10, scheduledAt: "こわれた" }, NOW)
    ).toEqual({ kind: "none" });
  });
});

describe("resolveEffectiveAmount", () => {
  test("切替前は現在額", () => {
    expect(
      resolveEffectiveAmount(20, { scheduledAmount: 10, scheduledAt: FUTURE }, NOW)
    ).toBe(20);
  });

  test("切替後は予約額", () => {
    /*
      ここが画面と付与のズレを防ぐ肝。DB 側も同じ判定をしており、
      画面が amount をそのまま出すと「20と書いてあるのに10しか入らない」になる。
    */
    expect(
      resolveEffectiveAmount(20, { scheduledAmount: 10, scheduledAt: PAST }, NOW)
    ).toBe(10);
  });

  test("予約が無ければ現在額", () => {
    expect(
      resolveEffectiveAmount(20, { scheduledAmount: null, scheduledAt: null }, NOW)
    ).toBe(20);
  });

  test("予約額 0 も有効な値として扱う（0=停止を予約できる）", () => {
    expect(
      resolveEffectiveAmount(20, { scheduledAmount: 0, scheduledAt: PAST }, NOW)
    ).toBe(0);
  });
});

describe("validateScheduledAt", () => {
  test("未来なら通る", () => {
    expect(validateScheduledAt(FUTURE, NOW)).toBeNull();
  });

  test("過去は弾く（保存した瞬間に効いてしまうため）", () => {
    expect(validateScheduledAt(PAST, NOW)).not.toBeNull();
  });

  test("現在時刻ちょうども弾く", () => {
    expect(validateScheduledAt("2026-09-15T12:00:00+09:00", NOW)).not.toBeNull();
  });

  test("形式が不正なら弾く", () => {
    expect(validateScheduledAt("2026-13-45", NOW)).not.toBeNull();
  });
});
