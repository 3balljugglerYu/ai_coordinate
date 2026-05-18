/** @jest-environment node */

jest.mock("@/lib/auth");
jest.mock("@/lib/supabase/server");
jest.mock("@/lib/api/route-locale");

import { DELETE } from "@/app/api/my-page/images/route";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getRouteLocale } from "@/lib/api/route-locale";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockCreateClient = createClient as jest.MockedFunction<
  typeof createClient
>;
const mockGetRouteLocale = getRouteLocale as jest.MockedFunction<
  typeof getRouteLocale
>;

interface FakeRow {
  id: string;
  is_posted: boolean;
  storage_path: string | null;
  pre_generation_storage_path: string | null;
}

function buildSupabase(opts: {
  rows: FakeRow[];
  fetchError?: { message: string } | null;
  deleteError?: { message: string } | null;
  storageError?: { message: string } | null;
}) {
  const storageRemove = jest
    .fn()
    .mockResolvedValue({ error: opts.storageError ?? null });
  const storageFrom = jest.fn().mockReturnValue({ remove: storageRemove });

  // fetch builder: from("generated_images").select(...).eq("user_id", ...).in("id", ids)
  const fetchIn = jest
    .fn()
    .mockResolvedValue({ data: opts.rows, error: opts.fetchError ?? null });
  const fetchEqUser = jest.fn().mockReturnValue({ in: fetchIn });
  const fetchSelect = jest.fn().mockReturnValue({ eq: fetchEqUser });

  // delete builder: from("generated_images").delete().in("id", ids).eq("user_id", ...)
  const deleteEq = jest
    .fn()
    .mockResolvedValue({ error: opts.deleteError ?? null });
  const deleteIn = jest.fn().mockReturnValue({ eq: deleteEq });
  const deleteBuilder = jest.fn().mockReturnValue({ in: deleteIn });

  const fromMock = jest.fn().mockImplementation((table: string) => {
    if (table !== "generated_images") {
      throw new Error(`Unexpected table: ${table}`);
    }
    return {
      select: fetchSelect,
      delete: deleteBuilder,
    };
  });

  return {
    supabase: {
      from: fromMock,
      storage: { from: storageFrom },
    },
    storageRemove,
    storageFrom,
    deleteBuilder,
    deleteIn,
    deleteEq,
    fetchSelect,
    fetchIn,
  };
}

function createRequest(body: unknown) {
  const request = new Request("http://localhost/api/my-page/images", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return Object.assign(request, {
    nextUrl: new URL(request.url),
    cookies: { get: () => undefined },
  }) as never;
}

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";
const UUID_C = "33333333-3333-3333-3333-333333333333";

describe("DELETE /api/my-page/images (bulk delete)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRouteLocale.mockReturnValue("ja");
    mockGetUser.mockResolvedValue({
      id: "user-1",
      email: "user-1@example.com",
    } as never);
  });

  test("未投稿のみ含む場合_DB を先に削除し続けて Storage 本体/Before を削除する", async () => {
    const callOrder: string[] = [];
    const { supabase, storageRemove, deleteIn, deleteEq } = buildSupabase({
      rows: [
        {
          id: UUID_A,
          is_posted: false,
          storage_path: "user-1/a.png",
          pre_generation_storage_path: "user-1/a-before.png",
        },
        {
          id: UUID_B,
          is_posted: false,
          storage_path: "user-1/b.png",
          pre_generation_storage_path: null,
        },
      ],
    });
    deleteEq.mockImplementation(async (...args: unknown[]) => {
      callOrder.push("db_delete");
      return { error: null, args };
    });
    storageRemove.mockImplementation(async (...args: unknown[]) => {
      callOrder.push("storage_remove");
      return { error: null, args };
    });
    mockCreateClient.mockResolvedValue(supabase as never);

    const res = await DELETE(createRequest({ imageIds: [UUID_A, UUID_B] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ deleted: [UUID_A, UUID_B], failed: [] });

    // 削除順は DB → Storage（壊れた DB レコードを残さないため）
    expect(callOrder).toEqual(["db_delete", "storage_remove"]);

    // Storage は本体 + Before を含めて remove される
    expect(storageRemove).toHaveBeenCalledWith([
      "user-1/a.png",
      "user-1/a-before.png",
      "user-1/b.png",
    ]);

    // DB 削除は eligible な ID のみで実行され、本人 user_id で絞られている
    expect(deleteIn).toHaveBeenCalledWith("id", [UUID_A, UUID_B]);
    expect(deleteEq).toHaveBeenCalledWith("user_id", "user-1");
  });

  test("投稿済みが混在する場合_投稿済みは failed に、未投稿のみ削除される", async () => {
    const { supabase, deleteIn } = buildSupabase({
      rows: [
        {
          id: UUID_A,
          is_posted: false,
          storage_path: "user-1/a.png",
          pre_generation_storage_path: null,
        },
        {
          id: UUID_B,
          is_posted: true, // 投稿済み → failed
          storage_path: "user-1/b.png",
          pre_generation_storage_path: null,
        },
      ],
    });
    mockCreateClient.mockResolvedValue(supabase as never);

    const res = await DELETE(
      createRequest({ imageIds: [UUID_A, UUID_B] }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toEqual([UUID_A]);
    expect(body.failed).toEqual([UUID_B]);
    expect(deleteIn).toHaveBeenCalledWith("id", [UUID_A]);
  });

  test("DB から見つからない ID は failed として返る", async () => {
    const { supabase } = buildSupabase({
      rows: [
        {
          id: UUID_A,
          is_posted: false,
          storage_path: "user-1/a.png",
          pre_generation_storage_path: null,
        },
      ],
    });
    mockCreateClient.mockResolvedValue(supabase as never);

    const res = await DELETE(
      createRequest({ imageIds: [UUID_A, UUID_C] }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toEqual([UUID_A]);
    expect(body.failed).toEqual([UUID_C]);
  });

  test("未ログインなら 401", async () => {
    mockGetUser.mockResolvedValue(null as never);

    const res = await DELETE(createRequest({ imageIds: [UUID_A] }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.errorCode).toBe("MY_PAGE_AUTH_REQUIRED");
  });

  test("imageIds が空配列なら 400", async () => {
    const res = await DELETE(createRequest({ imageIds: [] }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.errorCode).toBe("MY_PAGE_BULK_DELETE_INVALID_INPUT");
  });

  test("imageIds が 51 件なら 400（上限 50）", async () => {
    const ids = Array.from(
      { length: 51 },
      (_, i) =>
        `${i.toString(16).padStart(8, "0")}-1111-1111-1111-111111111111`,
    );
    const res = await DELETE(createRequest({ imageIds: ids }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.errorCode).toBe("MY_PAGE_BULK_DELETE_INVALID_INPUT");
  });

  test("imageIds に UUID 以外が含まれていても弾かれる（UUID のみ抽出して処理）", async () => {
    const { supabase, deleteIn } = buildSupabase({
      rows: [
        {
          id: UUID_A,
          is_posted: false,
          storage_path: "user-1/a.png",
          pre_generation_storage_path: null,
        },
      ],
    });
    mockCreateClient.mockResolvedValue(supabase as never);

    const res = await DELETE(
      createRequest({ imageIds: [UUID_A, "not-a-uuid"] }),
    );
    const body = await res.json();

    // UUID 以外は入力段階で捨てられ、UUID_A のみが正規対象として処理される
    expect(res.status).toBe(200);
    expect(body.deleted).toEqual([UUID_A]);
    expect(body.failed).toEqual([]);
    expect(deleteIn).toHaveBeenCalledWith("id", [UUID_A]);
  });

  test("Storage 削除エラーは握り潰されて 200 を返す（DB 削除済み・孤立ファイルが残るのみ）", async () => {
    const { supabase, deleteIn } = buildSupabase({
      rows: [
        {
          id: UUID_A,
          is_posted: false,
          storage_path: "user-1/a.png",
          pre_generation_storage_path: null,
        },
      ],
      storageError: { message: "storage down" },
    });
    mockCreateClient.mockResolvedValue(supabase as never);

    const res = await DELETE(createRequest({ imageIds: [UUID_A] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toEqual([UUID_A]);
    expect(deleteIn).toHaveBeenCalledWith("id", [UUID_A]);
  });

  test("imageIds が配列でない場合_400 を返す", async () => {
    const res = await DELETE(createRequest({ imageIds: "not-an-array" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.errorCode).toBe("MY_PAGE_BULK_DELETE_INVALID_INPUT");
  });

  test("body の JSON parse に失敗した場合_400 を返す", async () => {
    const request = new Request("http://localhost/api/my-page/images", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const reqWithExtra = Object.assign(request, {
      nextUrl: new URL(request.url),
      cookies: { get: () => undefined },
    }) as never;

    const res = await DELETE(reqWithExtra);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.errorCode).toBe("MY_PAGE_BULK_DELETE_INVALID_INPUT");
  });

  test("DB 取得エラー時_500 で MY_PAGE_BULK_DELETE_FAILED を返す", async () => {
    const { supabase } = buildSupabase({
      rows: [],
      fetchError: { message: "db unreachable" },
    });
    mockCreateClient.mockResolvedValue(supabase as never);

    const res = await DELETE(createRequest({ imageIds: [UUID_A] }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.errorCode).toBe("MY_PAGE_BULK_DELETE_FAILED");
  });

  test("全 ID が DB に存在しない場合_200 で全 ID が failed に積まれ DB 削除は呼ばれない", async () => {
    const { supabase, deleteBuilder } = buildSupabase({ rows: [] });
    mockCreateClient.mockResolvedValue(supabase as never);

    const res = await DELETE(
      createRequest({ imageIds: [UUID_A, UUID_B] }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toEqual([]);
    expect(body.failed).toEqual([UUID_A, UUID_B]);
    expect(deleteBuilder).not.toHaveBeenCalled();
  });

  test("Supabase が data:null を返す場合も _rows ?? [] フォールバックで全 ID が failed に積まれる", async () => {
    // PostgREST は通常 [] を返すが、防御的フォールバック (`rows ?? []`) を担保するため
    // 明示的に data:null のケースもテストする。
    const fetchIn = jest.fn().mockResolvedValue({ data: null, error: null });
    const fetchEqUser = jest.fn().mockReturnValue({ in: fetchIn });
    const fetchSelect = jest.fn().mockReturnValue({ eq: fetchEqUser });
    const deleteBuilder = jest.fn();
    const supabase = {
      from: jest.fn().mockReturnValue({
        select: fetchSelect,
        delete: deleteBuilder,
      }),
      storage: { from: jest.fn() },
    };
    mockCreateClient.mockResolvedValue(supabase as never);

    const res = await DELETE(createRequest({ imageIds: [UUID_A] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toEqual([]);
    expect(body.failed).toEqual([UUID_A]);
    expect(deleteBuilder).not.toHaveBeenCalled();
  });

  test("DB 削除エラー時_500 で MY_PAGE_BULK_DELETE_DB_FAILED を返し Storage 削除は呼ばれない", async () => {
    const { supabase, storageRemove } = buildSupabase({
      rows: [
        {
          id: UUID_A,
          is_posted: false,
          storage_path: "user-1/a.png",
          pre_generation_storage_path: null,
        },
      ],
      deleteError: { message: "db down" },
    });
    mockCreateClient.mockResolvedValue(supabase as never);

    const res = await DELETE(createRequest({ imageIds: [UUID_A] }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.errorCode).toBe("MY_PAGE_BULK_DELETE_DB_FAILED");
    // DB 削除失敗時は Storage に手を付けない（順序を逆転させた本来の意図）
    expect(storageRemove).not.toHaveBeenCalled();
  });
});
