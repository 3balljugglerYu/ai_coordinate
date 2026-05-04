/** @jest-environment node */

const createClientMock = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: () => createClientMock(),
}));

import { postImageServer } from "@/features/generation/lib/server-database";

type UpdateArg = Record<string, unknown>;

function buildSupabaseMock(returnedRow: Record<string, unknown>) {
  const single = jest.fn().mockResolvedValue({ data: returnedRow, error: null });
  const select = jest.fn(() => ({ single }));
  const eq = jest.fn(() => ({ select }));
  const update = jest.fn((arg: UpdateArg) => {
    capturedUpdate.push(arg);
    return { eq };
  });
  const from = jest.fn(() => ({ update }));

  const capturedUpdate: UpdateArg[] = [];

  return {
    client: { from },
    capturedUpdate,
    update,
    eq,
    single,
  };
}

describe("postImageServer", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("showBeforeImage 未指定時は show_before_image を update に含めない", async () => {
    const mock = buildSupabaseMock({
      id: "img-1",
      is_posted: true,
      caption: "hello",
    });
    createClientMock.mockReturnValue(mock.client);

    await postImageServer("img-1", "hello");

    expect(mock.capturedUpdate).toHaveLength(1);
    const updates = mock.capturedUpdate[0];
    expect(updates).toMatchObject({
      is_posted: true,
      caption: "hello",
    });
    expect(updates).not.toHaveProperty("show_before_image");
  });

  test("showBeforeImage=true で show_before_image=true を update に含める", async () => {
    const mock = buildSupabaseMock({
      id: "img-1",
      is_posted: true,
      caption: null,
    });
    createClientMock.mockReturnValue(mock.client);

    await postImageServer("img-1", undefined, true);

    expect(mock.capturedUpdate[0]).toMatchObject({
      show_before_image: true,
    });
  });

  test("showBeforeImage=false で show_before_image=false を update に含める", async () => {
    const mock = buildSupabaseMock({
      id: "img-1",
      is_posted: true,
      caption: null,
    });
    createClientMock.mockReturnValue(mock.client);

    await postImageServer("img-1", undefined, false);

    expect(mock.capturedUpdate[0]).toMatchObject({
      show_before_image: false,
    });
  });

  test("DB エラー時は例外を投げる", async () => {
    const single = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });
    const select = jest.fn(() => ({ single }));
    const eq = jest.fn(() => ({ select }));
    const update = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ update }));
    createClientMock.mockReturnValue({ from });

    await expect(postImageServer("img-1", "x")).rejects.toThrow(
      /画像の投稿に失敗しました/,
    );
  });
});
