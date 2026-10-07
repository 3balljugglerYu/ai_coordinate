/** @jest-environment node */

/**
 * スマホの生成画面のページ(/generate/post/[id]・/generate/style/[presetId])。
 * ⭐ 開けるかの判定は、シートを開く側・生成の受付と同じ。ここが緩むと、直接 URL で
 * 使えないプロンプト・未開放のスタイルの画面が開いてしまう。
 */

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`);
  }
}
class NotFoundSignal extends Error {}

jest.mock("next/navigation", () => ({
  redirect: jest.fn((url: string) => {
    throw new RedirectSignal(url);
  }),
  notFound: jest.fn(() => {
    throw new NotFoundSignal();
  }),
}));
jest.mock("next/server", () => ({ connection: jest.fn(async () => undefined) }));
jest.mock("@/lib/auth", () => ({ getUser: jest.fn() }));
jest.mock("@/lib/env", () => ({ isAdminViewer: jest.fn(() => false) }));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn(async () => ({})) }));
jest.mock("@/features/my-page/lib/server-api", () => ({
  getUserProfileServer: jest.fn(async () => ({ subscription_plan: "light" })),
}));
jest.mock("@/features/style-presets/lib/get-public-style-presets", () => ({
  getPublishedStylePreset: jest.fn(),
}));
jest.mock("@/features/collections/lib/resolve-preset-unlock-state", () => ({
  resolvePresetUnlockState: jest.fn(),
}));
jest.mock("@/features/generation/components/PromptLockedGenerationScreen", () => ({
  PromptLockedGenerationScreen: () => null,
}));
jest.mock("@/features/style/components/StyleGenerationScreen", () => ({
  StyleGenerationScreen: () => null,
}));

import PromptLockedGeneratePage from "@/app/generate/post/[id]/page";
import StyleGeneratePage from "@/app/generate/style/[presetId]/page";
import { getUser } from "@/lib/auth";
import { isAdminViewer } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublishedStylePreset } from "@/features/style-presets/lib/get-public-style-presets";
import { resolvePresetUnlockState } from "@/features/collections/lib/resolve-preset-unlock-state";

const mockUser = getUser as jest.Mock;
const mockAdmin = createAdminClient as jest.Mock;
const mockPreset = getPublishedStylePreset as jest.Mock;
const mockUnlock = resolvePresetUnlockState as jest.Mock;
const mockIsAdmin = isAdminViewer as jest.Mock;

type Element = { props: Record<string, unknown> };

beforeEach(() => {
  jest.clearAllMocks();
  mockIsAdmin.mockReturnValue(false);
});

function stubDerived({ available = true, visibility = "public" } = {}) {
  const rpc = jest.fn(() => ({
    select: () => ({
      maybeSingle: async () => ({
        data: { is_available: available, root_post_id: "root-1" },
        error: null,
      }),
    }),
  }));
  mockAdmin.mockReturnValue({
    rpc,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { prompt_visibility: visibility } }) }) }),
    }),
  });
  return rpc;
}

describe("/generate/post/[id]", () => {
  const call = () => PromptLockedGeneratePage({ params: Promise.resolve({ id: "post-9" }) });

  test("使える原作なら、root の ID・公開設定・プランを渡す", async () => {
    mockUser.mockResolvedValue({ id: "u1" });
    const rpc = stubDerived();
    const element = (await call()) as Element;
    expect(rpc).toHaveBeenCalledWith("validate_derived_prompt_source", {
      p_source_post_id: "post-9",
      p_requester_id: "u1",
    });
    expect(element.props).toEqual({
      sourcePostId: "root-1",
      subscriptionPlan: "light",
      promptVisibility: "public",
    });
  });

  test("非公開プロンプトは private で渡す", async () => {
    mockUser.mockResolvedValue({ id: "u1" });
    stubDerived({ visibility: "private" });
    expect(((await call()) as Element).props.promptVisibility).toBe("private");
  });

  test("未ログインはログインへ(戻り先付き)", async () => {
    mockUser.mockResolvedValue(null);
    await expect(call()).rejects.toMatchObject({
      url: "/login?redirect=%2Fgenerate%2Fpost%2Fpost-9",
    });
  });

  test("使えない原作(未フォロー・ブロックなど)は 404", async () => {
    mockUser.mockResolvedValue({ id: "u1" });
    stubDerived({ available: false });
    await expect(call()).rejects.toBeInstanceOf(NotFoundSignal);
  });
});

describe("/generate/style/[presetId]", () => {
  const call = () => StyleGeneratePage({ params: Promise.resolve({ presetId: "preset-1" }) });
  const preset = (category: Record<string, unknown> = {}) => ({
    id: "preset-1",
    slug: "paris",
    category: { allowGuestGeneration: false, unlockPrerequisiteKey: null, sequentialUnlock: false, ...category },
  });

  test("ログイン中: プランを渡し、ポーズ指定は運営だけ", async () => {
    mockUser.mockResolvedValue({ id: "u1" });
    mockIsAdmin.mockReturnValue(true);
    mockPreset.mockResolvedValue(preset());
    const element = (await call()) as Element;
    expect(mockPreset).toHaveBeenCalledWith("preset-1", { includeAdminOnly: true });
    expect(element.props).toMatchObject({ subscriptionPlan: "light", canUseFreePose: true, isGuest: false });
  });

  test("未ログイン: ログインなしで生成できるカテゴリだけ開く", async () => {
    mockUser.mockResolvedValue(null);
    mockPreset.mockResolvedValue(preset({ allowGuestGeneration: true }));
    expect(((await call()) as Element).props).toMatchObject({ isGuest: true, subscriptionPlan: "free" });
  });

  test.each([
    ["ゲスト不可のカテゴリ", { allowGuestGeneration: false }],
    ["段階解放のカテゴリ", { allowGuestGeneration: true, sequentialUnlock: true }],
  ])("未ログイン: %sはログインへ", async (_label, category) => {
    mockUser.mockResolvedValue(null);
    mockPreset.mockResolvedValue(preset(category));
    await expect(call()).rejects.toMatchObject({
      url: "/login?redirect=%2Fgenerate%2Fstyle%2Fpreset-1",
    });
  });

  test("段階解放で未開放なら、スタイル紹介ページへ", async () => {
    mockUser.mockResolvedValue({ id: "u1" });
    mockPreset.mockResolvedValue(preset({ unlockPrerequisiteKey: "godly" }));
    mockUnlock.mockResolvedValue({ status: "locked" });
    await expect(call()).rejects.toMatchObject({ url: "/styles/paris" });
  });

  test("段階解放で開放済みなら開く", async () => {
    mockUser.mockResolvedValue({ id: "u1" });
    mockPreset.mockResolvedValue(preset({ unlockPrerequisiteKey: "godly" }));
    mockUnlock.mockResolvedValue({ status: "unlocked" });
    expect(((await call()) as Element).props).toMatchObject({ isGuest: false });
  });

  test("公開されていないスタイルは 404", async () => {
    mockUser.mockResolvedValue({ id: "u1" });
    mockPreset.mockResolvedValue(null);
    await expect(call()).rejects.toBeInstanceOf(NotFoundSignal);
  });
});
