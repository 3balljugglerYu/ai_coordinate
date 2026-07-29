/** @jest-environment node */

/**
 * 生成一覧・イベントギャラリーが author secret を通すことのテスト。
 *
 * これらの経路は当初 generated_images.prompt を直接表示しており、
 * 新 Next.js が prompt_text を空にした結果「プロンプト情報がありません」と
 * 出る障害になった。Phase 0C で legacy 列を空化すると同じことが全件で起きる。
 *
 * ここでは各関数が secret 側の値を返すことを固定し、経路が戻ってしまったら
 * 落ちるようにする（ADR-001）。
 */

const secretRows: Array<{ image_id: string; prompt: string }> = [];

/** author secret の一括取得だけを差し替える最小のクライアント。 */
function createSecretClient() {
  return {
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: secretRows, error: null }),
      }),
    }),
  };
}

/** generated_images 側の応答を差し替えるための可変ハンドル。 */
const imageRows: { data: unknown; error: unknown } = { data: [], error: null };

/**
 * PostgREST のビルダーは呼び出し順が経路ごとに違うため、
 * どのメソッドを呼んでも自分自身を返し、await で結果を返す thenable にする。
 */
function createImageQueryBuilder() {
  const builder: Record<string, unknown> = {};
  const passthrough = () => builder;
  for (const method of [
    "select",
    "eq",
    "neq",
    "in",
    "is",
    "not",
    "gt",
    "gte",
    "lt",
    "lte",
    "order",
    "range",
    "limit",
  ]) {
    builder[method] = passthrough;
  }
  builder.then = (
    resolve: (value: typeof imageRows) => unknown
  ): unknown => resolve(imageRows);
  return builder;
}

const browserFrom = jest.fn(() => createImageQueryBuilder());

jest.mock("@/lib/supabase/client", () => ({
  createClient: jest.fn(() => {
    // 秘密テーブルと画像テーブルで返すビルダーを変える
    return {
      from: (table: string) =>
        table === "generated_image_prompt_secrets"
          ? createSecretClient().from()
          : browserFrom(),
    };
  }),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(() => createSecretClient()),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    from: (table: string) =>
      table === "generated_image_prompt_secrets"
        ? createSecretClient().from()
        : browserFrom(),
  })),
}));

jest.mock("react", () => {
  const actual = jest.requireActual("react");
  return { ...actual, cache: <T,>(fn: T) => fn };
});

jest.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_EVENT_USER_ID: "event-user" },
}));

import {
  getGeneratedImages,
  getGeneratedImagesBySourceImage,
} from "@/features/generation/lib/database";
import { getGeneratedImagesServer } from "@/features/generation/lib/server-database";
import { getEventImages } from "@/features/event/lib/database";

function setImages(rows: unknown[]) {
  imageRows.data = rows;
  imageRows.error = null;
}

function setSecrets(rows: Array<{ image_id: string; prompt: string }>) {
  secretRows.length = 0;
  secretRows.push(...rows);
}

beforeEach(() => {
  browserFrom.mockClear();
  setImages([]);
  setSecrets([]);
});

/** 障害当時の状態: legacy 列が空で secret にだけ本文がある行。 */
const ROW_WITH_EMPTY_LEGACY = {
  id: "img-1",
  prompt: "",
  generation_type: "coordinate" as const,
};

const SECRET_FOR_ROW = [{ image_id: "img-1", prompt: "ネコをイヌにして" }];

describe("生成一覧が author secret を通す", () => {
  it("getGeneratedImages は secret の本文を返す", async () => {
    setImages([ROW_WITH_EMPTY_LEGACY]);
    setSecrets(SECRET_FOR_ROW);

    const result = await getGeneratedImages("user-1");

    expect(result[0].prompt).toBe("ネコをイヌにして");
  });

  it("getGeneratedImagesBySourceImage は secret の本文を返す", async () => {
    setImages([ROW_WITH_EMPTY_LEGACY]);
    setSecrets(SECRET_FOR_ROW);

    const result = await getGeneratedImagesBySourceImage("stock-1", null);

    expect(result[0].prompt).toBe("ネコをイヌにして");
  });

  it("getGeneratedImagesServer は secret の本文を返す", async () => {
    setImages([ROW_WITH_EMPTY_LEGACY]);
    setSecrets(SECRET_FOR_ROW);

    const result = await getGeneratedImagesServer("user-1");

    expect(result[0].prompt).toBe("ネコをイヌにして");
  });

  it("getEventImages は secret の本文を返す", async () => {
    setImages([ROW_WITH_EMPTY_LEGACY]);
    setSecrets(SECRET_FOR_ROW);

    const result = await getEventImages();

    expect(result[0].prompt).toBe("ネコをイヌにして");
  });
});

describe("開示できない種別の扱い", () => {
  it("One-Tap Style は secret が無くても legacy 列へ落とさない", async () => {
    // 運営が組み立てたプリセット全文。生成した本人にも開示しない。
    setImages([
      {
        id: "img-2",
        prompt: "CRITICAL INSTRUCTION: ...",
        generation_type: "one_tap_style",
      },
    ]);

    const result = await getGeneratedImages("user-1");

    expect(result[0].prompt).toBe("");
  });
});

describe("移行前の行", () => {
  it("secret が無ければ legacy 列を返す", async () => {
    // backfill 前の既存行。Phase 0C までは legacy 列に値がある。
    setImages([
      { id: "img-3", prompt: "むかしの入力", generation_type: "coordinate" },
    ]);

    const result = await getGeneratedImages("user-1");

    expect(result[0].prompt).toBe("むかしの入力");
  });
});
