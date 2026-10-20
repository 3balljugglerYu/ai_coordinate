import {
  DRAFTS_STORAGE_KEY,
  DRAFT_LIMIT,
  type DraftContent,
  draftLabel,
  isEmptyDraftContent,
  readDrafts,
  removeDraft,
  saveDraft,
} from "@/features/personal-notices/lib/local-drafts";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    raw: () => data.get(DRAFTS_STORAGE_KEY),
  };
}

const content = (overrides: Partial<DraftContent> = {}): DraftContent => ({
  memo: "ハロウィン セレクション賞",
  title: "セレクション賞に選ばれました",
  body: "受付番号 {受付番号}",
  codePrefix: "SEL",
  recipientsText: "https://www.persta.ai/posts/abc",
  ...overrides,
});

const at = (iso: string) => new Date(iso);

describe("saveDraft / readDrafts", () => {
  test("残した下書きを読み戻せる(中身と時刻)", () => {
    const storage = memoryStorage();
    expect(saveDraft("d1", content(), at("2026-10-20T01:00:00Z"), storage)).toBe(true);
    expect(readDrafts(storage)).toEqual([
      { id: "d1", ...content(), updatedAt: "2026-10-20T01:00:00.000Z" },
    ]);
  });

  test("同じ id は書き換え、増えない", () => {
    const storage = memoryStorage();
    saveDraft("d1", content(), at("2026-10-20T01:00:00Z"), storage);
    saveDraft("d1", content({ title: "書き直した" }), at("2026-10-20T01:05:00Z"), storage);
    const drafts = readDrafts(storage);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].title).toBe("書き直した");
  });

  test("賞ごとに複数持てて、新しい順に並ぶ", () => {
    const storage = memoryStorage();
    saveDraft("old", content({ memo: "マスター賞" }), at("2026-10-20T01:00:00Z"), storage);
    saveDraft("new", content({ memo: "コイン賞" }), at("2026-10-20T02:00:00Z"), storage);
    saveDraft("old", content({ memo: "マスター賞(直し)" }), at("2026-10-20T03:00:00Z"), storage);
    expect(readDrafts(storage).map((d) => d.id)).toEqual(["old", "new"]);
  });

  test(`上限(${DRAFT_LIMIT}件)を超えたら、いちばん古いものから落とす`, () => {
    const storage = memoryStorage();
    for (let i = 0; i < DRAFT_LIMIT + 1; i++) {
      const minute = String(i).padStart(2, "0");
      saveDraft(`d${i}`, content(), at(`2026-10-20T01:${minute}:00Z`), storage);
    }
    const ids = readDrafts(storage).map((d) => d.id);
    expect(ids).toHaveLength(DRAFT_LIMIT);
    expect(ids).not.toContain("d0");
    expect(ids[0]).toBe(`d${DRAFT_LIMIT}`);
  });

  test("中身が空になったら残さず、その下書きを消す", () => {
    const storage = memoryStorage();
    saveDraft("d1", content(), at("2026-10-20T01:00:00Z"), storage);
    saveDraft("d2", content(), at("2026-10-20T01:01:00Z"), storage);
    const empty = content({ memo: " ", title: "", body: "\n", recipientsText: "" });
    expect(saveDraft("d1", empty, at("2026-10-20T01:02:00Z"), storage)).toBe(true);
    expect(readDrafts(storage).map((d) => d.id)).toEqual(["d2"]);
  });

  test("頭の英字だけでは「空」とみなす(書きかけの文が無い)", () => {
    expect(isEmptyDraftContent(content({ memo: "", title: "", body: "", recipientsText: "" }))).toBe(
      true,
    );
    expect(isEmptyDraftContent(content({ memo: "", title: "", body: "", recipientsText: "x" }))).toBe(
      false,
    );
  });

  test("壊れた中身・形の違う行は読み飛ばす(画面は止めない)", () => {
    expect(readDrafts(memoryStorage({ [DRAFTS_STORAGE_KEY]: "{not json" }))).toEqual([]);
    expect(readDrafts(memoryStorage({ [DRAFTS_STORAGE_KEY]: '{"a":1}' }))).toEqual([]);
    const mixed = JSON.stringify([
      { id: "ok", ...content(), updatedAt: "2026-10-20T01:00:00.000Z" },
      { id: "bad-date", ...content(), updatedAt: "きのう" },
      { id: "", ...content(), updatedAt: "2026-10-20T01:00:00.000Z" },
      { id: "no-body", memo: "", title: "", codePrefix: "", recipientsText: "", updatedAt: "2026-10-20T01:00:00.000Z" },
      null,
    ]);
    expect(readDrafts(memoryStorage({ [DRAFTS_STORAGE_KEY]: mixed })).map((d) => d.id)).toEqual([
      "ok",
    ]);
  });

  test("⭐書き込めない(上限・拒否)ときは false を返し、例外を投げない", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };
    expect(saveDraft("d1", content(), at("2026-10-20T01:00:00Z"), storage)).toBe(false);
    expect(removeDraft("d1", storage)).toBe(false);
  });

  test("読めない(拒否)ときは空として扱う", () => {
    const storage = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => {},
    };
    expect(readDrafts(storage)).toEqual([]);
  });

  test("保存先が無いとき(サーバー側など)は残せない", () => {
    expect(saveDraft("d1", content(), at("2026-10-20T01:00:00Z"), null)).toBe(false);
    expect(readDrafts(null)).toEqual([]);
  });
});

describe("removeDraft", () => {
  test("指定した下書きだけを消す", () => {
    const storage = memoryStorage();
    saveDraft("d1", content(), at("2026-10-20T01:00:00Z"), storage);
    saveDraft("d2", content(), at("2026-10-20T01:01:00Z"), storage);
    expect(removeDraft("d1", storage)).toBe(true);
    expect(readDrafts(storage).map((d) => d.id)).toEqual(["d2"]);
  });
});

describe("draftLabel", () => {
  test("メモ → 題名 → 本文の1行目 → 決まった文の順", () => {
    expect(draftLabel({ memo: " メモ ", title: "題名", body: "本文" })).toBe("メモ");
    expect(draftLabel({ memo: "", title: "題名", body: "本文" })).toBe("題名");
    expect(draftLabel({ memo: "", title: "", body: "\n  1行目  \n2行目" })).toBe("1行目");
    expect(draftLabel({ memo: " ", title: "", body: " \n " })).toBe("（メモ・題名・本文なし）");
  });

  test("本文の1行目は30文字で切る(絵文字も1文字と数える)", () => {
    const long = "🎃".repeat(31);
    expect(draftLabel({ memo: "", title: "", body: long })).toBe(`${"🎃".repeat(30)}…`);
  });
});
