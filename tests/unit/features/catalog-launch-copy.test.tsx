/** @jest-environment jsdom */

/**
 * カタログ刷新の一般公開に向けた、表記と初回チュートリアル(2026-10-01 ユーザー決定)。
 *
 * - One-Tap Style → Persta ORIGINAL、Free Style → CREATE と呼ぶ
 * - 初回チュートリアルは出さない(刷新後の入口 /styles は先頭のカテゴリが変わるため)
 *
 * どちらも刷新(公開前は運営だけ。NEXT_PUBLIC_USER_STYLES_ENABLED で全員)に連動する。
 * ここでは公開フラグで切り替え、公開前は今の表記・今の動きのままであることも確かめる。
 */

const mockPathname = jest.fn(() => "/ja/style");
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// 名前空間ごとに区別できるラベルを返す(どのキーを出しているかを見るため)。
// 翻訳関数は名前空間ごとに同じものを返す(effect の依存で測り直しが止まらなくなるため)
const mockTranslators = new Map<string, (key: string) => string>();
jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    let translate = mockTranslators.get(namespace);
    if (!translate) {
      translate = (key: string) => `${namespace}.${key}`;
      mockTranslators.set(namespace, translate);
    }
    return translate;
  },
}));

jest.mock("@/features/collections/components/CountUpNumber", () => ({
  CountUpNumber: ({ value }: { value: number }) => <span>{value}</span>,
}));
jest.mock("@/features/challenges/components/RewardBurst", () => ({
  RewardBurst: () => null,
}));

const mockGetCurrentUser = jest.fn();
jest.mock("@/features/auth/lib/auth-client", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));
jest.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { updateUser: jest.fn() } }),
}));
jest.mock("@/features/tutorial/components/TutorialStartModal", () => ({
  TutorialStartModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="tutorial-start-modal" /> : null,
}));

import { act, render, screen, waitFor } from "@testing-library/react";
import { GenerationModeTabs } from "@/components/GenerationModeTabs";
import { StylePageHeading } from "@/features/style/components/StylePageHeading";
import { PostBonusModal } from "@/features/posts/components/PostBonusModal";
import { TutorialTourProvider } from "@/features/tutorial/components/TutorialTourProvider";
import { TUTORIAL_STORAGE_KEYS } from "@/features/tutorial/types";

const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_USER_STYLES_ENABLED;

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_USER_STYLES_ENABLED;
  mockPathname.mockReturnValue("/ja/style");
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterAll(() => {
  process.env.NEXT_PUBLIC_USER_STYLES_ENABLED = ORIGINAL_FLAG;
});

function publish() {
  process.env.NEXT_PUBLIC_USER_STYLES_ENABLED = "true";
}

describe("表記: One-Tap Style → Persta ORIGINAL、Free Style → CREATE", () => {
  test("公開前: /style の見出しとタブは今の名前のまま", async () => {
    await act(async () => {
      render(
        <>
          <StylePageHeading />
          <GenerationModeTabs />
        </>,
      );
    });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "style.pageTitle",
    );
    expect(screen.getAllByText("style.pageTitle").length).toBeGreaterThan(0);
    expect(screen.getAllByText("free.tabLabel").length).toBeGreaterThan(0);
  });

  test("公開後: /style の見出しとタブを新しい名前にする", async () => {
    publish();

    await act(async () => {
      render(
        <>
          <StylePageHeading />
          <GenerationModeTabs />
        </>,
      );
    });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "style.pageTitleRevamp",
    );
    expect(screen.getAllByText("free.tabLabelRevamp").length).toBeGreaterThan(0);
    expect(screen.queryByText("free.tabLabel")).toBeNull();
  });

  /*
    投稿ボーナスは LocaleShell で Provider より外(PostProgressHost)からも描かれる。
    Provider の外でも、公開後は新しい名前になること。
  */
  test.each([
    ["one_tap_style", "posts.postBonusMissionOneTap"],
    ["free", "posts.postBonusMissionFree"],
  ])("投稿ボーナス(%s): 公開後は新しい名前、公開前は今の名前", (type, key) => {
    const renderModal = () =>
      render(
        <PostBonusModal
          open
          onOpenChange={() => {}}
          amount={20}
          generationType={type}
          promptUsageRewardAmount={0}
        />,
      );

    const { unmount } = renderModal();
    expect(screen.getByText(key)).toBeTruthy();
    unmount();

    publish();
    renderModal();
    expect(screen.getByText(`${key}Revamp`)).toBeTruthy();
  });
});

describe("初回チュートリアル", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/ja");
    mockGetCurrentUser.mockResolvedValue({ user_metadata: {} });
  });

  test("公開前: まだ終えていない人には、ホームで開始のモーダルを出す(今のまま)", async () => {
    render(<TutorialTourProvider />);

    expect(await screen.findByTestId("tutorial-start-modal")).toBeTruthy();
  });

  test("公開後: 開始のモーダルを出さず、刷新前に始めたツアーの続きも捨てる", async () => {
    publish();
    window.sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS, "true");

    render(<TutorialTourProvider />);

    await waitFor(() =>
      expect(
        window.sessionStorage.getItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS),
      ).toBeNull(),
    );
    // 判定(ログイン中の人の取得)が終わったあとも出ない
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId("tutorial-start-modal")).toBeNull();
  });
});
