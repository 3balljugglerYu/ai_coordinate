/** @jest-environment node */

import { createClient } from "@/lib/supabase/client";
import { deleteMyImage } from "@/features/my-page/lib/api";

jest.mock("@/lib/supabase/client", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/features/generation/lib/prompt-visibility", () => ({
  redactSensitivePrompt: (value: unknown) => value,
  redactSensitivePrompts: (value: unknown) => value,
}));

const createClientMock = createClient as jest.MockedFunction<typeof createClient>;

function buildDeleteClient(image: {
  storage_path: string;
  pre_generation_storage_path: string | null;
  user_id: string;
}) {
  const remove = jest.fn().mockResolvedValue({ error: null });
  const deleteEqUser = jest.fn().mockResolvedValue({ error: null });
  const deleteEqId = jest.fn(() => ({ eq: deleteEqUser }));
  const deleteFn = jest.fn(() => ({ eq: deleteEqId }));
  const single = jest.fn().mockResolvedValue({ data: image, error: null });
  const selectEq = jest.fn(() => ({ single }));
  const select = jest.fn(() => ({ eq: selectEq }));
  const from = jest.fn(() => ({
    select,
    delete: deleteFn,
  }));

  return {
    client: {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
        }),
      },
      from,
      storage: {
        from: jest.fn(() => ({ remove })),
      },
    },
    remove,
    select,
    deleteEqId,
    deleteEqUser,
  };
}

describe("deleteMyImage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("生成画像本体とBefore画像のStorageパスをまとめて削除する", async () => {
    const mock = buildDeleteClient({
      storage_path: "user-1/generated/img-1.webp",
      pre_generation_storage_path: "user-1/pre-generation/img-1_display.webp",
      user_id: "user-1",
    });
    createClientMock.mockReturnValue(mock.client as never);

    await deleteMyImage("img-1");

    expect(mock.select).toHaveBeenCalledWith(
      "storage_path, user_id, pre_generation_storage_path"
    );
    expect(mock.remove).toHaveBeenCalledWith([
      "user-1/generated/img-1.webp",
      "user-1/pre-generation/img-1_display.webp",
    ]);
    expect(mock.deleteEqId).toHaveBeenCalledWith("id", "img-1");
    expect(mock.deleteEqUser).toHaveBeenCalledWith("user_id", "user-1");
  });
});
