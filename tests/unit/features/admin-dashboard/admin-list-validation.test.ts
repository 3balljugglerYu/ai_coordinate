/**
 * 「集計から除く一覧」と「出来事の印」の入力の確認。
 *
 * 長さと種類は DB の CHECK でも守っている。ここが DB より緩いと、
 * DB のエラーが 500 になって画面に「失敗しました」としか出ない。
 * DB より厳しいと、DB なら入る値を画面で断ってしまう。
 * そのため、境界(ちょうど上限・上限+1)と、数え方(絵文字)を固定する。
 */

import {
  EXCLUSION_REASON_MAX_LENGTH,
  TIMELINE_EVENT_KINDS,
  TIMELINE_NOTE_MAX_LENGTH,
  TIMELINE_TITLE_MAX_LENGTH,
  countChars,
  isValidIsoDate,
  validateExclusionReason,
  validateTimelineEventInput,
} from "@/features/admin-dashboard/lib/admin-list-validation";

describe("validateExclusionReason", () => {
  test("前後の空白を落として返す", () => {
    expect(validateExclusionReason("  審査用  ")).toEqual({ ok: true, value: "審査用" });
  });

  test.each([
    ["空文字", ""],
    ["空白だけ", "   "],
    ["文字列でない", 123],
    ["未指定", undefined],
  ])("%s は断る", (_label, value) => {
    expect(validateExclusionReason(value)).toEqual({
      ok: false,
      error: "理由を入力してください",
    });
  });

  test("上限ちょうどは通り、1文字超えると断る", () => {
    const max = "あ".repeat(EXCLUSION_REASON_MAX_LENGTH);
    expect(validateExclusionReason(max).ok).toBe(true);
    expect(validateExclusionReason(`${max}あ`).ok).toBe(false);
  });

  test("絵文字は1文字と数える(DB の char_length と同じ)", () => {
    // "🐭" は String#length では 2 だが、DB では 1文字
    const emojis = "🐭".repeat(EXCLUSION_REASON_MAX_LENGTH);
    expect(emojis.length).toBe(EXCLUSION_REASON_MAX_LENGTH * 2);
    expect(validateExclusionReason(emojis).ok).toBe(true);
  });
});

describe("countChars", () => {
  test("コードポイントで数える", () => {
    expect(countChars("a🐭あ")).toBe(3);
  });
});

describe("isValidIsoDate", () => {
  test.each(["2026-10-16", "2024-02-29", "2000-01-01", "2100-12-31"])("%s は通る", (value) => {
    expect(isValidIsoDate(value)).toBe(true);
  });

  test.each([
    ["存在しない日", "2026-02-30"],
    ["うるう年でない2/29", "2025-02-29"],
    ["形が違う", "2026/10/16"],
    ["時刻つき", "2026-10-16T00:00:00Z"],
    ["0000年(DB が断る)", "0000-01-01"],
    ["2000年より前", "1999-12-31"],
    ["2100年より後", "2101-01-01"],
    ["文字列でない", 20261016],
  ])("%s は断る", (_label, value) => {
    expect(isValidIsoDate(value)).toBe(false);
  });
});

describe("validateTimelineEventInput(作るとき)", () => {
  const valid = {
    eventDate: "2026-10-16",
    kind: "campaign",
    title: " ハロウィン企画を開始 ",
    note: "",
  };

  test("名前の前後の空白を落とし、空のメモは null にする", () => {
    expect(validateTimelineEventInput(valid)).toEqual({
      ok: true,
      value: {
        eventDate: "2026-10-16",
        kind: "campaign",
        title: "ハロウィン企画を開始",
        note: null,
      },
    });
  });

  test("決まった6つの種類はどれも通る", () => {
    for (const kind of TIMELINE_EVENT_KINDS) {
      expect(validateTimelineEventInput({ ...valid, kind }).ok).toBe(true);
    }
  });

  test.each([
    ["種類が一覧にない", { kind: "launch" }, "種類が不正です"],
    ["日付が無い", { eventDate: undefined }, "日付を YYYY-MM-DD で入力してください"],
    ["名前が空白だけ", { title: "  " }, "名前を入力してください"],
    ["メモが文字列でない", { note: 1 }, "メモが不正です"],
  ])("%s は断る", (_label, patch, error) => {
    expect(validateTimelineEventInput({ ...valid, ...patch })).toEqual({
      ok: false,
      error,
    });
  });

  test("名前は上限ちょうどまで、メモも上限ちょうどまで", () => {
    const title = "あ".repeat(TIMELINE_TITLE_MAX_LENGTH);
    const note = "あ".repeat(TIMELINE_NOTE_MAX_LENGTH);
    expect(validateTimelineEventInput({ ...valid, title, note }).ok).toBe(true);
    expect(validateTimelineEventInput({ ...valid, title: `${title}あ` }).ok).toBe(false);
    expect(validateTimelineEventInput({ ...valid, note: `${note}あ` }).ok).toBe(false);
  });

  test.each([
    ["null", null],
    ["配列", []],
    ["文字列", "x"],
  ])("本文が%sなら断る", (_label, body) => {
    expect(validateTimelineEventInput(body)).toEqual({
      ok: false,
      error: "入力が不正です",
    });
  });
});

describe("validateTimelineEventInput(直すとき)", () => {
  test("送った項目だけを確かめて返す", () => {
    expect(validateTimelineEventInput({ title: "名前だけ直す" }, { partial: true })).toEqual({
      ok: true,
      value: { title: "名前だけ直す" },
    });
  });

  test("送った項目が不正なら断る", () => {
    expect(validateTimelineEventInput({ kind: "launch" }, { partial: true })).toEqual({
      ok: false,
      error: "種類が不正です",
    });
  });

  test("メモを null にして消せる", () => {
    expect(validateTimelineEventInput({ note: null }, { partial: true })).toEqual({
      ok: true,
      value: { note: null },
    });
  });

  test("直す項目が1つも無ければ断る", () => {
    expect(validateTimelineEventInput({ unknown: 1 }, { partial: true })).toEqual({
      ok: false,
      error: "直す項目がありません",
    });
  });
});
