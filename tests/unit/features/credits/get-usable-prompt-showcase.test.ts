/**
 * `/use-prompts` の「フォローすると使えるプロンプト」の取得テスト。
 *
 * 守りたいのは2点。
 *
 * 1. **可否判定を書き写していないこと**(ADR-006)。使えるかどうかは
 *    `validate_derived_prompt_sources` が正本で、requester には**原作者自身**を
 *    渡す。ここがズレると「ページには出るのに詳細では使えない」が起きる。
 * 2. **読めなければ空配列**(fail closed)。空の枠を見せるくらいなら出さない。
 */

const fromMock = jest.fn();
const rpcMock = jest.fn();

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: fromMock, rpc: rpcMock }),
}));

import { getUsablePromptShowcase } from "@/features/credits/lib/get-usable-prompt-showcase";

type Row = {
  id: string;
  user_id: string | null;
  storage_path_thumb: string | null;
  storage_path: string | null;
  image_url: string | null;
  pre_generation_storage_path: string | null;
  show_before_image: boolean | null;
};

function row(id: string, userId: string | null = `author-${id}`): Row {
  return {
    id,
    user_id: userId,
    storage_path_thumb: `thumb/${id}.webp`,
    storage_path: null,
    // 既定は Before あり(この関数を使うテストは Before の有無を論点にしない)
    pre_generation_storage_path: `before/${id}.webp`,
    show_before_image: true,
    image_url: null,
  };
}

/** generated_images の候補取得と profiles の2種類のクエリを仕分ける。 */
function mockTables({
  candidates,
  candidateError = null,
  profiles = [],
}: {
  candidates: Row[];
  candidateError?: { code: string } | null;
  profiles?: { user_id: string; nickname: string | null }[];
}) {
  fromMock.mockImplementation((table: string) => {
    if (table === "generated_images") {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "not", "order"]) {
        builder[method] = jest.fn(() => builder);
      }
      builder.limit = jest.fn(() =>
        Promise.resolve({
          data: candidateError ? null : candidates,
          error: candidateError,
        })
      );
      return builder;
    }
    if (table === "profiles") {
      const builder: Record<string, unknown> = {};
      builder.select = jest.fn(() => builder);
      builder.in = jest.fn(() =>
        Promise.resolve({ data: profiles, error: null })
      );
      return builder;
    }
    throw new Error(`unexpected table: ${table}`);
  });
}

function mockRpc({
  available,
  availabilityError = null,
  usage = {},
}: {
  available: string[];
  availabilityError?: { code: string } | null;
  usage?: Record<string, number>;
}) {
  rpcMock.mockImplementation((name: string, args: Record<string, unknown>) => {
    if (name === "validate_derived_prompt_sources") {
      if (availabilityError) {
        return Promise.resolve({ data: null, error: availabilityError });
      }
      const ids = args.p_source_post_ids as string[];
      return Promise.resolve({
        data: ids.map((id) => ({
          source_post_id: id,
          is_available: available.includes(id),
        })),
        error: null,
      });
    }
    if (name === "get_prompt_usage_counts") {
      const ids = args.p_origin_post_ids as string[];
      return Promise.resolve({
        data: ids.map((id) => ({
          origin_post_id: id,
          usage_count: usage[id] ?? 0,
        })),
        error: null,
      });
    }
    throw new Error(`unexpected rpc: ${name}`);
  });
}

const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  // サムネイル URL は storage_path から組み立てるので、公開 URL の元が要る
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
});

afterEach(() => {
  jest.restoreAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
});

describe("getUsablePromptShowcase", () => {
  test("利用可能と判定された原作だけを返す", async () => {
    mockTables({ candidates: [row("a"), row("b"), row("c")] });
    mockRpc({ available: ["a", "c"] });

    const result = await getUsablePromptShowcase();

    expect(result.map((item) => item.postId)).toEqual(["a", "c"]);
  });

  test("可否判定の requester には原作者自身の ID を渡す", async () => {
    mockTables({ candidates: [row("a", "author-1"), row("b", "author-2")] });
    mockRpc({ available: ["a", "b"] });

    await getUsablePromptShowcase();

    expect(rpcMock).toHaveBeenCalledWith("validate_derived_prompt_sources", {
      p_source_post_ids: ["a", "b"],
      // 添字で対応するので、順序が原作 ID と揃っていること
      p_requester_ids: ["author-1", "author-2"],
    });
  });

  test("最大6件までに絞る", async () => {
    const candidates = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) =>
      row(id)
    );
    mockTables({ candidates });
    mockRpc({ available: candidates.map((c) => c.id) });

    const result = await getUsablePromptShowcase();

    expect(result).toHaveLength(6);
  });

  test("利用回数は丸めて返し、下限未満は出さない", async () => {
    mockTables({ candidates: [row("a"), row("b")] });
    mockRpc({ available: ["a", "b"], usage: { a: 12, b: 2 } });

    const result = await getUsablePromptShowcase();

    // 表示は「◯回以上」なので必ず切り捨てる(12 → 10)
    expect(result[0].usageCount).toBe(10);
    // 少ない数字は「誰も使っていない」という逆の証明になるので出さない
    expect(result[1].usageCount).toBeNull();
  });

  test("作者名を解決し、無ければ既定名に倒す", async () => {
    mockTables({
      candidates: [row("a", "author-1"), row("b", "author-2")],
      profiles: [{ user_id: "author-1", nickname: "みきふく" }],
    });
    mockRpc({ available: ["a", "b"] });

    const result = await getUsablePromptShowcase();

    expect(result[0].authorName).toBe("みきふく");
    expect(result[1].authorName).toBe("匿名ユーザー");
  });

  test("候補の取得に失敗したら空配列（セクションごと出さない）", async () => {
    mockTables({ candidates: [], candidateError: { code: "PGRST301" } });
    mockRpc({ available: [] });

    await expect(getUsablePromptShowcase()).resolves.toEqual([]);
  });

  test("可否判定に失敗したら空配列（使えない物を並べない）", async () => {
    mockTables({ candidates: [row("a")] });
    mockRpc({ available: ["a"], availabilityError: { code: "PGRST202" } });

    await expect(getUsablePromptShowcase()).resolves.toEqual([]);
  });

  test("すべて利用不可なら空配列", async () => {
    mockTables({ candidates: [row("a"), row("b")] });
    mockRpc({ available: [] });

    await expect(getUsablePromptShowcase()).resolves.toEqual([]);
    // 1件も残らないときは、後続の問い合わせを投げない
    expect(rpcMock).not.toHaveBeenCalledWith(
      "get_prompt_usage_counts",
      expect.anything()
    );
  });

  test("サムネイルが解決できない行は落とす（壊れた画像枠を見せない）", async () => {
    const broken: Row = {
      ...row("a", "author-1"),
      storage_path_thumb: null,
    };
    mockTables({ candidates: [broken, row("b")] });
    mockRpc({ available: ["a", "b"] });

    const result = await getUsablePromptShowcase();

    expect(result.map((item) => item.postId)).toEqual(["b"]);
  });

  /**
   * ⭐ 並べる基準はページ本文の注意書きと対になっている
   * (「Free Style で投稿された作品のうち、Before / After が載っているものを
   * 新しい順に」)。ここが緩むと、書いてある基準と実際の並びが食い違う。
   *
   * 運営が見繕っているように見えると、投稿者は「勝手に使われている」と
   * 受け取る。根拠を書けるのは、条件が機械的であるうちだけ。
   */
  test("⭐Before が無い作品は落とす（After だけでは何が起きるか伝わらない）", async () => {
    const noBefore: Row = {
      ...row("a", "author-1"),
      pre_generation_storage_path: null,
    };
    mockTables({ candidates: [noBefore, row("b")] });
    mockRpc({ available: ["a", "b"] });

    const result = await getUsablePromptShowcase();

    expect(result.map((item) => item.postId)).toEqual(["b"]);
  });

  test("⭐Before を隠している作品も落とす（投稿者が出さないと決めたもの）", async () => {
    const hidden: Row = {
      ...row("a", "author-1"),
      show_before_image: false,
    };
    mockTables({ candidates: [hidden, row("b")] });
    mockRpc({ available: ["a", "b"] });

    const result = await getUsablePromptShowcase();

    expect(result.map((item) => item.postId)).toEqual(["b"]);
  });

  test("Before で落ちた行は可否判定 RPC にも渡さない（無駄に問い合わせない）", async () => {
    mockTables({
      candidates: [{ ...row("a", "author-1"), pre_generation_storage_path: null }, row("b")],
    });
    mockRpc({ available: ["b"] });

    await getUsablePromptShowcase();

    const validateCall = rpcMock.mock.calls.find(
      ([name]) => name === "validate_derived_prompt_sources"
    );
    expect(validateCall?.[1].p_source_post_ids).toEqual(["b"]);
  });

  test("候補が0件なら判定 RPC を呼ばない", async () => {
    mockTables({ candidates: [] });
    mockRpc({ available: [] });

    await expect(getUsablePromptShowcase()).resolves.toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
