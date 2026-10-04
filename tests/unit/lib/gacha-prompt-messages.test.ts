/**
 * ガチャプロンプトの文言(15言語)。
 *
 * ⭐ 一般公開(NEXT_PUBLIC_GACHA_PROMPT_ENABLED)の前に全言語を訳した(2026-10-04)。
 * 囲みの文字 {{GACHA}} は ICU の波括弧とぶつかるので文言に直接書かず、
 * コードから {open}/{close} で渡す(GachaPromptField)。
 */

import { locales } from "@/i18n/config";
import { getAllMessages } from "@/i18n/messages";
import {
  GACHA_CLOSE_TAG,
  GACHA_OPEN_TAG,
  validateGachaField,
} from "@/shared/generation/gacha-prompt";

const GACHA_KEYS = [
  "gachaToggleLabel",
  "gachaFieldLabel",
  "gachaHintRandom",
  "gachaHintPerCandidate",
  "gachaHintBody",
  "gachaInsertExample",
  "gachaReset",
  "gachaMissingBlock",
  "gachaTooFewCandidates",
  "gachaExample",
] as const;

describe("ガチャプロンプトの文言", () => {
  // ICU の波括弧は {open}/{close} の差し込みだけに使う(囲みの文字を直接書くと文言が壊れる)
  test.each(locales)("%s: 空でなく、波括弧は差し込みの {open}/{close} だけ", async (locale) => {
    const messages = await getAllMessages(locale);

    for (const key of GACHA_KEYS) {
      const text = messages.free[key];
      expect(text.trim()).not.toBe("");
      const withoutArgs = text.replace(/\{(open|close)\}/g, "");
      expect(withoutArgs).not.toMatch(/[{}]/);
    }
  });

  test.each(locales)("%s: 囲みが無いときの案内に、囲みの文字の差し込みがある", async (locale) => {
    const messages = await getAllMessages(locale);

    expect(messages.free.gachaMissingBlock).toContain("{open}");
    expect(messages.free.gachaMissingBlock).toContain("{close}");
  });

  // 「例を入れる」で入る候補が、そのまま送れる形(候補4つ)になっていること
  test.each(locales)("%s: 例を入れると候補が4つの送れる欄になる", async (locale) => {
    const messages = await getAllMessages(locale);
    const field = `${GACHA_OPEN_TAG}\n${messages.free.gachaExample}\n${GACHA_CLOSE_TAG}`;

    expect(validateGachaField(field)).toEqual({ ok: true, candidateCount: 4 });
  });

  test.each(locales.filter((locale) => locale !== "en"))(
    "%s: 英語のまま残っていない",
    async (locale) => {
      const [messages, english] = await Promise.all([
        getAllMessages(locale),
        getAllMessages("en"),
      ]);

      for (const key of GACHA_KEYS) {
        // 「Gacha」のように英語と同じ表記を選んだ言語もあるので、見出しの短い語は除く
        if (key === "gachaFieldLabel") continue;
        expect(messages.free[key]).not.toBe(english.free[key]);
      }
    },
  );
});

const SPLIT_KEYS = [
  "gachaSplitDescription",
  "gachaSplitButton",
  "gachaSplitPending",
  "gachaSplitInsufficient",
  "gachaSplitNotSplittable",
  "gachaSplitFailed",
  "gachaSplitConnectionLost",
  "gachaSplitProposalTitle",
  "gachaSplitProposalRemoved",
  "gachaSplitProposalField",
  "gachaSplitAccept",
  "gachaSplitCancel",
  "gachaSplitApplied",
  "gachaSplitUndo",
] as const;

describe("「ガチャに分ける」の文言", () => {
  test.each(locales)("%s: 空でなく、差し込みは {cost}/{count} だけ", async (locale) => {
    const messages = await getAllMessages(locale);

    for (const key of SPLIT_KEYS) {
      const text = messages.free[key];
      expect(text.trim()).not.toBe("");
      expect(text.replace(/\{(cost|count)\}/g, "")).not.toMatch(/[{}]/);
    }
    // 使うペルコインの数をボタンと説明に出す
    expect(messages.free.gachaSplitButton).toContain("{cost}");
    expect(messages.free.gachaSplitDescription).toContain("{cost}");
    expect(messages.free.gachaSplitProposalTitle).toContain("{count}");
    expect(messages.credits.transactionTypeGachaSplit.trim()).not.toBe("");
  });
});

