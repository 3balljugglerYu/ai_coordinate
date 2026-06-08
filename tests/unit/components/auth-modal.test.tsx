import { render, screen } from "@testing-library/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useToast } from "@/components/ui/use-toast";
import { jaMessages } from "@/messages/ja";

jest.mock("next-intl", () => {
  return {
    useTranslations: (namespace?: string) => {
      const table =
        namespace && namespace in jaMessages
          ? (jaMessages as unknown as Record<string, Record<string, string>>)[namespace]
          : {};

      return (key: string) => table[key] ?? key;
    },
  };
});

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

jest.mock("@/features/auth/lib/auth-client", () => ({
  signIn: jest.fn(),
  signUp: jest.fn(),
  signInWithOAuth: jest.fn(),
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: jest.fn(),
}));

describe("AuthModal unit tests", () => {
  const useRouterMock = useRouter as jest.MockedFunction<typeof useRouter>;
  const useSearchParamsMock = useSearchParams as jest.MockedFunction<
    typeof useSearchParams
  >;
  const useToastMock = useToast as jest.MockedFunction<typeof useToast>;

  beforeEach(() => {
    jest.clearAllMocks();

    useRouterMock.mockReturnValue({
      push: jest.fn(),
      refresh: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>);
    useSearchParamsMock.mockReturnValue({
      get: () => null,
    } as unknown as ReturnType<typeof useSearchParams>);
    (useToastMock as jest.Mock).mockReturnValue({ toast: jest.fn() });
  });

  test("open=false の場合_何も描画しない", () => {
    const { container } = render(
      <AuthModal open={false} onClose={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("title/description 指定時_モーダル見出しを出しフォーム側の見出しは隠す", () => {
    // 保存導線: モーダルが独自ヘッダーを持つため hideHeading=true が渡り、
    // フォーム側の「新規登録」見出しは重複回避で出さない。
    render(
      <AuthModal
        open
        onClose={() => {}}
        mode="signup"
        title="このイラストを保存する"
        description="ログインすると、生成したイラストがあなたのアカウントに保存され、いつでも見返せます。"
        hideModeSwitch
      />
    );

    // モーダルヘッダーのタイトル/説明は表示される
    expect(
      screen.getByRole("heading", { name: "このイラストを保存する" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/生成したイラストがあなたのアカウントに保存され/)
    ).toBeInTheDocument();

    // フォーム自身の見出しは隠れる(2段重複の解消)
    expect(
      screen.queryByRole("heading", { name: "新規登録" })
    ).not.toBeInTheDocument();

    // フォーム本体は描画される
    expect(screen.getByLabelText("メールアドレス")).toBeInTheDocument();
  });

  test("title/description 未指定時_フォーム側の見出しを表示する", () => {
    // いいね/コメント等の導線: モーダルヘッダーが無いので
    // フォーム自身の見出しを表示する(hideHeading=false)。
    render(<AuthModal open onClose={() => {}} mode="signup" />);

    expect(
      screen.getByRole("heading", { name: "新規登録" })
    ).toBeInTheDocument();
  });
});
