/** @jest-environment node */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getGeneratedCollectionPresetIds } from "@/features/collections/lib/generated-preset-ids";

/** rpc() が {data,error} を返すだけのセッションクライアントスタブ。 */
function clientWithRpc(result: {
  data: Array<{ preset_id: string | null }> | null;
  error: unknown;
}) {
  const rpc = jest.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("getGeneratedCollectionPresetIds", () => {
  test("カテゴリが空なら RPC を呼ばず空配列", async () => {
    const { client, rpc } = clientWithRpc({ data: [], error: null });
    const result = await getGeneratedCollectionPresetIds(client, []);
    expect(result).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("RPCの preset_id を重複排除して返す", async () => {
    const { client, rpc } = clientWithRpc({
      data: [
        { preset_id: "p1" },
        { preset_id: "p2" },
        { preset_id: "p1" }, // 重複(DBがDISTINCTするが多重防御)
        { preset_id: null }, // null は無視
      ],
      error: null,
    });

    const result = await getGeneratedCollectionPresetIds(client, [
      "kotowaza_dictionary",
    ]);

    expect(rpc).toHaveBeenCalledWith("get_generated_preset_ids", {
      p_category_keys: ["kotowaza_dictionary"],
    });
    expect(result.sort()).toEqual(["p1", "p2"]);
  });

  test("RPCエラー時は空配列にフォールバックする", async () => {
    const { client } = clientWithRpc({ data: null, error: { message: "boom" } });
    const result = await getGeneratedCollectionPresetIds(client, ["k"]);
    expect(result).toEqual([]);
  });
});
