/** @jest-environment node */

import { createClient } from "@/lib/supabase/client";
import { deleteMyImage } from "@/features/my-page/lib/api";
import { GENERATED_IMAGE_STORAGE_PATH_COLUMNS } from "@/features/generation/lib/generated-image-storage-paths";

jest.mock("@/lib/supabase/client", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/features/generation/lib/prompt-visibility", () => ({
  redactSensitivePrompt: (value: unknown) => value,
  redactSensitivePrompts: (value: unknown) => value,
}));

const createClientMock = createClient as jest.MockedFunction<typeof createClient>;

interface DeleteTargetImage {
  storage_path: string | null;
  storage_path_display?: string | null;
  storage_path_thumb?: string | null;
  pre_generation_storage_path: string | null;
  user_id: string;
}

function buildDeleteClient(
  image: DeleteTargetImage,
  overrides: { deleteError?: { message: string } } = {},
) {
  const remove = jest.fn().mockResolvedValue({ error: null });
  const deleteEqUser = jest
    .fn()
    .mockResolvedValue({ error: overrides.deleteError ?? null });
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

  test("原本・表示用・サムネ・Before の4ファイルをまとめて削除する", () => {
    // 修正前は表示用(_display)とサムネ(_thumb)を消しておらず、
    // 削除ごとに実体が残り続けていた(表示用は平均137kB)。
    const mock = buildDeleteClient({
      storage_path: "user-1/img-1.png",
      storage_path_display: "user-1/img-1_display.webp",
      storage_path_thumb: "user-1/img-1_thumb.webp",
      pre_generation_storage_path: "user-1/pre-generation/img-1_display.webp",
      user_id: "user-1",
    });
    createClientMock.mockReturnValue(mock.client as never);

    return deleteMyImage("img-1").then(() => {
      expect(mock.select).toHaveBeenCalledWith(
        `user_id, ${GENERATED_IMAGE_STORAGE_PATH_COLUMNS}`,
      );
      expect(mock.remove).toHaveBeenCalledWith([
        "user-1/img-1.png",
        "user-1/img-1_display.webp",
        "user-1/img-1_thumb.webp",
        "user-1/pre-generation/img-1_display.webp",
      ]);
      expect(mock.deleteEqId).toHaveBeenCalledWith("id", "img-1");
      expect(mock.deleteEqUser).toHaveBeenCalledWith("user_id", "user-1");
    });
  });

  test("DB 削除が失敗したら Storage は消さない(壊れた画像を作らない)", async () => {
    // Storage を先に消すと「行はあるが実体が無い」= 表示が壊れた画像になる。
    // DB を真実とし、Storage は後追いにする。
    const mock = buildDeleteClient(
      {
        storage_path: "user-1/img-1.png",
        storage_path_display: "user-1/img-1_display.webp",
        storage_path_thumb: null,
        pre_generation_storage_path: null,
        user_id: "user-1",
      },
      { deleteError: { message: "permission denied" } },
    );
    createClientMock.mockReturnValue(mock.client as never);

    await expect(deleteMyImage("img-1")).rejects.toThrow(/permission denied/);
    expect(mock.remove).not.toHaveBeenCalled();
  });

  test("同じパスが複数列に入っていても1回だけ remove する", async () => {
    // ゲストのワードローブ引き継ぎ(save-wardrobe-image)は3列すべてに同じパスを入れる。
    const sharedPath = "user-1/wardrobe-1.webp";
    const mock = buildDeleteClient({
      storage_path: sharedPath,
      storage_path_display: sharedPath,
      storage_path_thumb: sharedPath,
      pre_generation_storage_path: null,
      user_id: "user-1",
    });
    createClientMock.mockReturnValue(mock.client as never);

    await deleteMyImage("img-1");

    expect(mock.remove).toHaveBeenCalledWith([sharedPath]);
  });

  test("Storage パスが無い行では remove を呼ばない", async () => {
    const mock = buildDeleteClient({
      storage_path: null,
      storage_path_display: null,
      storage_path_thumb: null,
      pre_generation_storage_path: null,
      user_id: "user-1",
    });
    createClientMock.mockReturnValue(mock.client as never);

    await deleteMyImage("img-1");

    expect(mock.remove).not.toHaveBeenCalled();
  });
});
