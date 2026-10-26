/**
 * 「集計から除く一覧」と「出来事の印」の入力の確認(純関数)。
 *
 * 長さと種類は DB の CHECK でも守っている
 * (supabase/migrations/20261025233400_add_growth_overview_tables_and_rpcs.sql)。
 * ここで先に確かめるのは、DB のエラーをそのまま画面に出さず、
 * どこが悪いかを日本語で返すため。値は DB の CHECK とそろえること。
 *
 * 文字数は、個人あてのお知らせと同じ countChars(コードポイント)で数える。
 * DB の char_length と同じ数え方で、String#length だと絵文字を2文字と数えて DB より厳しくなる。
 */

import { countChars } from "@/features/personal-notices/lib/constants";

export { countChars };

export const EXCLUSION_REASON_MAX_LENGTH = 200;
export const TIMELINE_TITLE_MAX_LENGTH = 60;
export const TIMELINE_NOTE_MAX_LENGTH = 500;

/**
 * 出来事の種類。API の確認と画面の選択肢は、この一覧から作る。
 * ⚠️ DB の CHECK(admin_timeline_events_kind_check)は手で書いた一覧なので、
 * ここに足すときは、CHECK を直すマイグレーションも一緒に出すこと。
 */
export const TIMELINE_EVENT_KINDS = [
  "campaign",
  "ad",
  "pricing",
  "release",
  "notice",
  "other",
] as const;

export type TimelineEventKind = (typeof TIMELINE_EVENT_KINDS)[number];

export const TIMELINE_EVENT_KIND_LABELS: Record<TimelineEventKind, string> = {
  campaign: "企画",
  ad: "広告",
  pricing: "値段",
  release: "リリース",
  notice: "お知らせ",
  other: "そのほか",
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function isTimelineEventKind(value: unknown): value is TimelineEventKind {
  return (
    typeof value === "string" &&
    (TIMELINE_EVENT_KINDS as readonly string[]).includes(value)
  );
}

/** 除く理由。前後の空白を落としてから、1〜200文字か確かめる。 */
export function validateExclusionReason(value: unknown): ValidationResult<string> {
  if (typeof value !== "string") {
    return { ok: false, error: "理由を入力してください" };
  }
  const reason = value.trim();
  if (reason.length === 0) {
    return { ok: false, error: "理由を入力してください" };
  }
  if (countChars(reason) > EXCLUSION_REASON_MAX_LENGTH) {
    return {
      ok: false,
      error: `理由は${EXCLUSION_REASON_MAX_LENGTH}文字以内で入力してください`,
    };
  }
  return { ok: true, value: reason };
}

/** 出来事の日付として受け付ける年の範囲(0000年など、DB が断る値を先に断る)。 */
export const TIMELINE_MIN_YEAR = 2000;
export const TIMELINE_MAX_YEAR = 2100;

/** YYYY-MM-DD で、実在する日付か(年は 2000〜2100)。 */
export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const year = Number(value.slice(0, 4));
  if (year < TIMELINE_MIN_YEAR || year > TIMELINE_MAX_YEAR) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export interface TimelineEventInput {
  eventDate: string;
  kind: TimelineEventKind;
  title: string;
  note: string | null;
}

/**
 * 出来事の印の入力。作るときは全部の項目が要る。
 * 直すとき(partial: true)は、送られた項目だけを確かめて返す。
 */
export function validateTimelineEventInput(
  body: unknown,
  options: { partial: true },
): ValidationResult<Partial<TimelineEventInput>>;
export function validateTimelineEventInput(
  body: unknown,
  options?: { partial?: false },
): ValidationResult<TimelineEventInput>;
export function validateTimelineEventInput(
  body: unknown,
  options: { partial?: boolean } = {},
): ValidationResult<Partial<TimelineEventInput>> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "入力が不正です" };
  }
  const input = body as Record<string, unknown>;
  const partial = options.partial === true;
  const result: Partial<TimelineEventInput> = {};

  if (!partial || "eventDate" in input) {
    if (!isValidIsoDate(input.eventDate)) {
      return { ok: false, error: "日付を YYYY-MM-DD で入力してください" };
    }
    result.eventDate = input.eventDate;
  }

  if (!partial || "kind" in input) {
    if (!isTimelineEventKind(input.kind)) {
      return { ok: false, error: "種類が不正です" };
    }
    result.kind = input.kind;
  }

  if (!partial || "title" in input) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (title.length === 0) {
      return { ok: false, error: "名前を入力してください" };
    }
    if (countChars(title) > TIMELINE_TITLE_MAX_LENGTH) {
      return {
        ok: false,
        error: `名前は${TIMELINE_TITLE_MAX_LENGTH}文字以内で入力してください`,
      };
    }
    result.title = title;
  }

  if (!partial || "note" in input) {
    const rawNote = input.note;
    if (rawNote == null || rawNote === "") {
      result.note = null;
    } else if (typeof rawNote !== "string") {
      return { ok: false, error: "メモが不正です" };
    } else {
      const note = rawNote.trim();
      if (countChars(note) > TIMELINE_NOTE_MAX_LENGTH) {
        return {
          ok: false,
          error: `メモは${TIMELINE_NOTE_MAX_LENGTH}文字以内で入力してください`,
        };
      }
      result.note = note.length > 0 ? note : null;
    }
  }

  if (partial && Object.keys(result).length === 0) {
    return { ok: false, error: "直す項目がありません" };
  }

  return { ok: true, value: result };
}
