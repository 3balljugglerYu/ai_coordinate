import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthForm } from "@/features/auth/components/AuthForm";
import { signIn, signInWithOAuth, signUp } from "@/features/auth/lib/auth-client";
import { useToast } from "@/components/ui/use-toast";

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

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function submitForm(container: HTMLElement) {
  const form = container.querySelector("form");
  if (!form) {
    throw new Error("form element not found");
  }
  fireEvent.submit(form);
}

function fillSignUpInputs(params: {
  email: string;
  password: string;
  confirmPassword?: string;
}) {
  fireEvent.change(screen.getByLabelText("メールアドレス"), {
    target: { value: params.email },
  });
  fireEvent.change(screen.getByLabelText("パスワード"), {
    target: { value: params.password },
  });
  fireEvent.change(screen.getByLabelText("パスワード（確認）"), {
    target: { value: params.confirmPassword ?? params.password },
  });
}

function fillSignInInputs(params: { email: string; password: string }) {
  fireEvent.change(screen.getByLabelText("メールアドレス"), {
    target: { value: params.email },
  });
  fireEvent.change(screen.getByLabelText("パスワード"), {
    target: { value: params.password },
  });
}

describe("AuthForm unit tests from EARS specs", () => {
  const validEmail = "user@example.com";
  const validPassword = "Aa1!aaaa";

  const useRouterMock = useRouter as jest.MockedFunction<typeof useRouter>;
  const useSearchParamsMock = useSearchParams as jest.MockedFunction<
    typeof useSearchParams
  >;
  const signUpMock = signUp as jest.MockedFunction<typeof signUp>;
  const signInMock = signIn as jest.MockedFunction<typeof signIn>;
  const signInWithOAuthMock = signInWithOAuth as jest.MockedFunction<
    typeof signInWithOAuth
  >;
  const useToastMock = useToast as jest.MockedFunction<typeof useToast>;

  let pushMock: jest.Mock;
  let refreshMock: jest.Mock;
  let toastMock: jest.Mock;
  let referralCode: string | null;

  beforeEach(() => {
    jest.clearAllMocks();

    pushMock = jest.fn();
    refreshMock = jest.fn();
    toastMock = jest.fn();
    referralCode = null;

    useRouterMock.mockReturnValue({
      push: pushMock,
      refresh: refreshMock,
    } as unknown as ReturnType<typeof useRouter>);
    useSearchParamsMock.mockReturnValue({
      get: (key: string) => (key === "ref" ? referralCode : null),
    } as unknown as ReturnType<typeof useSearchParams>);
    useToastMock.mockReturnValue({
      toast: toastMock,
    });

    signUpMock.mockResolvedValue({} as Awaited<ReturnType<typeof signUp>>);
    signInMock.mockResolvedValue({} as Awaited<ReturnType<typeof signIn>>);
    signInWithOAuthMock.mockResolvedValue(
      {} as Awaited<ReturnType<typeof signInWithOAuth>>
    );
  });

  describe("AUTH-001 handleSubmit", () => {
    test("handleSubmit_有効な新規登録入力の場合_確認トースト表示後にloginへ遷移する", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const { container } = render(<AuthForm mode="signup" />);
      fillSignUpInputs({ email: validEmail, password: validPassword });

      // ============================================================
      // Act
      // ============================================================
      submitForm(container);

      // ============================================================
      // Assert
      // ============================================================
      await waitFor(() => {
        expect(signUpMock).toHaveBeenCalledWith(validEmail, validPassword, undefined);
      });
      expect(toastMock).toHaveBeenCalledTimes(1);
      expect(toastMock.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          title: "確認メールを送信しました。",
        })
      );
      expect(pushMock).toHaveBeenCalledWith("/login");
    });

    test("handleSubmit_ref付き新規登録の場合_signUpへ紹介コードを渡す", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      referralCode = "REF-CODE-001";
      const { container } = render(<AuthForm mode="signup" />);
      fillSignUpInputs({ email: validEmail, password: validPassword });

      // ============================================================
      // Act
      // ============================================================
      submitForm(container);

      // ============================================================
      // Assert
      // ============================================================
      await waitFor(() => {
        expect(signUpMock).toHaveBeenCalledWith(
          validEmail,
          validPassword,
          "REF-CODE-001"
        );
      });
      expect(pushMock).toHaveBeenCalledWith("/login");
    });

    test("handleSubmit_列挙対策でsignup成功解決される場合_汎用成功応答を維持する", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      signUpMock.mockResolvedValueOnce(undefined as Awaited<ReturnType<typeof signUp>>);
      const { container } = render(<AuthForm mode="signup" />);
      fillSignUpInputs({ email: validEmail, password: validPassword });

      // ============================================================
      // Act
      // ============================================================
      submitForm(container);

      // ============================================================
      // Assert
      // ============================================================
      await waitFor(() => {
        expect(signUpMock).toHaveBeenCalledTimes(1);
      });
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "確認メールを送信しました。",
        })
      );
      expect(pushMock).toHaveBeenCalledWith("/login");
    });
  });

  describe("AUTH-002 handleSubmit", () => {
    test("handleSubmit_認証情報未入力の場合_バリデーションエラーを表示して認証呼び出しを行わない", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const { container } = render(<AuthForm mode="signup" />);

      // ============================================================
      // Act
      // ============================================================
      submitForm(container);

      // ============================================================
      // Assert
      // ============================================================
      expect(await screen.findByText("メールアドレスとパスワードを入力してください")).toBeInTheDocument();
      expect(signUpMock).not.toHaveBeenCalled();
      expect(signInMock).not.toHaveBeenCalled();
    });

    test("handleSubmit_パスワード8文字未満の場合_最小文字数エラーを表示して認証呼び出しを行わない", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const { container } = render(<AuthForm mode="signup" />);
      fillSignUpInputs({
        email: validEmail,
        password: "Aa1!a",
      });

      // ============================================================
      // Act
      // ============================================================
      submitForm(container);

      // ============================================================
      // Assert
      // ============================================================
      expect(
        await screen.findAllByText("パスワードは8文字以上で入力してください")
      ).toHaveLength(2);
      expect(signUpMock).not.toHaveBeenCalled();
    });
  });

  describe("AUTH-003 handleSubmit", () => {
    test("handleSubmit_signupで複雑性不足のパスワードの場合_複雑性エラーを設定する", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const { container } = render(<AuthForm mode="signup" />);
      fillSignUpInputs({
        email: validEmail,
        password: "aaaaaaaa",
      });

      // ============================================================
      // Act
      // ============================================================
      submitForm(container);

      // ============================================================
      // Assert
      // ============================================================
      expect(
        await screen.findByText(
          "パスワードは英大文字・英小文字・数字・記号をそれぞれ1文字以上含めてください"
        )
      ).toBeInTheDocument();
      expect(signUpMock).not.toHaveBeenCalled();
    });

    test("handleSubmit_signupで確認パスワード不一致の場合_不一致エラーを設定する", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const { container } = render(<AuthForm mode="signup" />);
      fillSignUpInputs({
        email: validEmail,
        password: validPassword,
        confirmPassword: "Aa1!aaab",
      });

      // ============================================================
      // Act
      // ============================================================
      submitForm(container);

      // ============================================================
      // Assert
      // ============================================================
      expect(await screen.findAllByText("パスワードが一致しません")).toHaveLength(2);
      expect(signUpMock).not.toHaveBeenCalled();
    });
  });

  describe("AUTH-004 handleSubmit", () => {
    test("handleSubmit_有効signinかつonSuccessありの場合_遅延後にonSuccessを呼ぶ", async () => {
      jest.useFakeTimers();
      try {
        // ============================================================
        // Arrange
        // ============================================================
        const onSuccess = jest.fn();
        const { container } = render(<AuthForm mode="signin" onSuccess={onSuccess} />);
        fillSignInInputs({ email: validEmail, password: validPassword });

        // ============================================================
        // Act
        // ============================================================
        submitForm(container);
        await waitFor(() => {
          expect(signInMock).toHaveBeenCalledWith(validEmail, validPassword);
        });
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });

        // ============================================================
        // Assert
        // ============================================================
        await waitFor(() => {
          expect(onSuccess).toHaveBeenCalledTimes(1);
        });
        expect(pushMock).not.toHaveBeenCalled();
        expect(refreshMock).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("AUTH-005 handleSubmit", () => {
    test("handleSubmit_有効signinでonSuccessなしの場合_遷移してrefreshする", async () => {
      jest.useFakeTimers();
      try {
        // ============================================================
        // Arrange
        // ============================================================
        const { container } = render(
          <AuthForm mode="signin" redirectTo="/dashboard" />
        );
        fillSignInInputs({ email: validEmail, password: validPassword });

        // ============================================================
        // Act
        // ============================================================
        submitForm(container);
        await waitFor(() => {
          expect(signInMock).toHaveBeenCalledWith(validEmail, validPassword);
        });
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });

        // ============================================================
        // Assert
        // ============================================================
        await waitFor(() => {
          expect(pushMock).toHaveBeenCalledWith("/dashboard");
        });
        expect(refreshMock).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });

    test("handleSubmit_有効signinでredirectTo未指定の場合_rootへ遷移する", async () => {
      jest.useFakeTimers();
      try {
        // ============================================================
        // Arrange
        // ============================================================
        const { container } = render(<AuthForm mode="signin" />);
        fillSignInInputs({ email: validEmail, password: validPassword });

        // ============================================================
        // Act
        // ============================================================
        submitForm(container);
        await waitFor(() => {
          expect(signInMock).toHaveBeenCalledWith(validEmail, validPassword);
        });
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });

        // ============================================================
        // Assert
        // ============================================================
        await waitFor(() => {
          expect(pushMock).toHaveBeenCalledWith("/");
        });
        expect(refreshMock).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("AUTH-006 handleSubmit", () => {
    test("handleSubmit_認証クライアントエラーの場合_errorを設定してローディング停止する", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      signInMock.mockRejectedValueOnce(new Error("ログイン失敗"));
      const { container } = render(<AuthForm mode="signin" />);
      fillSignInInputs({ email: validEmail, password: validPassword });

      // ============================================================
      // Act
      // ============================================================
      submitForm(container);

      // ============================================================
      // Assert
      // ============================================================
      expect(await screen.findByText("ログイン失敗")).toBeInTheDocument();
      expect(screen.queryByText("ログイン中...")).not.toBeInTheDocument();
    });

    test("handleSubmit_Error以外がthrowされた場合_フォールバックエラーを設定してローディング停止する", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      signUpMock.mockRejectedValueOnce("boom");
      const { container } = render(<AuthForm mode="signup" />);
      fillSignUpInputs({ email: validEmail, password: validPassword });

      // ============================================================
      // Act
      // ============================================================
      submitForm(container);

      // ============================================================
      // Assert
      // ============================================================
      expect(await screen.findByText("エラーが発生しました")).toBeInTheDocument();
      expect(screen.queryByText("アカウントを作成中...")).not.toBeInTheDocument();
    });
  });

  describe("AUTH-007 handleOAuthSignIn", () => {
    test("handleOAuthSignIn_Google選択時_解決済みredirectと紹介コードでOAuthを呼ぶ", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      referralCode = "REF-OAUTH-001";
      render(<AuthForm mode="signin" redirectTo="/my-page" />);

      // ============================================================
      // Act
      // ============================================================
      fireEvent.click(screen.getByRole("button", { name: "Googleで続ける" }));

      // ============================================================
      // Assert
      // ============================================================
      await waitFor(() => {
        expect(signInWithOAuthMock).toHaveBeenCalledWith(
          "google",
          "/my-page",
          "REF-OAUTH-001"
        );
      });
      expect(screen.getByRole("button", { name: "Googleで続ける" })).toBeDisabled();
      expect(screen.getByText("ログイン中...")).toBeInTheDocument();
    });
  });

  describe("AUTH-008 handleOAuthSignIn", () => {
    test("handleOAuthSignIn_OAuthエラー時_errorを設定してローディング停止する", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      signInWithOAuthMock.mockRejectedValueOnce(new Error("OAuthエラー"));
      render(<AuthForm mode="signin" />);

      // ============================================================
      // Act
      // ============================================================
      fireEvent.click(screen.getByRole("button", { name: "Googleで続ける" }));

      // ============================================================
      // Assert
      // ============================================================
      expect(await screen.findByText("OAuthエラー")).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Googleで続ける" })).not.toBeDisabled();
      });
    });

    test("handleOAuthSignIn_Error以外がthrowされた場合_OAuthフォールバックエラーを設定する", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      signInWithOAuthMock.mockRejectedValueOnce("oauth-failed");
      render(<AuthForm mode="signin" />);

      // ============================================================
      // Act
      // ============================================================
      fireEvent.click(screen.getByRole("button", { name: "Googleで続ける" }));

      // ============================================================
      // Assert
      // ============================================================
      expect(await screen.findByText("OAuth認証に失敗しました")).toBeInTheDocument();
    });
  });

  describe("AUTH-009 modeResetEffect", () => {
    test("modeResetEffect_初回マウント時_クリーンな状態を維持する", () => {
      // ============================================================
      // Arrange / Act
      // ============================================================
      render(<AuthForm mode="signin" />);

      // ============================================================
      // Assert
      // ============================================================
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByText("ログイン中...")).not.toBeInTheDocument();
    });

    test("modeResetEffect_mode変更時_ローディングとエラーをリセットする", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      signInMock.mockRejectedValueOnce(new Error("ログイン失敗"));
      const { container, rerender } = render(<AuthForm mode="signin" />);
      fillSignInInputs({ email: validEmail, password: validPassword });
      submitForm(container);
      expect(await screen.findByText("ログイン失敗")).toBeInTheDocument();

      const signInDeferred = createDeferred<Awaited<ReturnType<typeof signIn>>>();
      signInMock.mockImplementationOnce(() => signInDeferred.promise);
      submitForm(container);
      expect(screen.getByText("ログイン中...")).toBeInTheDocument();

      // ============================================================
      // Act
      // ============================================================
      rerender(<AuthForm mode="signup" />);

      // ============================================================
      // Assert
      // ============================================================
      await waitFor(() => {
        expect(screen.queryByText("ログイン失敗")).not.toBeInTheDocument();
      });
      expect(screen.queryByText("ログイン中...")).not.toBeInTheDocument();

      signInDeferred.resolve({} as Awaited<ReturnType<typeof signIn>>);
    });
  });

  describe("AUTH-010 renderAuthForm", () => {
    test("renderAuthForm_signupモードの場合_signup専用項目を描画する", () => {
      // ============================================================
      // Arrange / Act
      // ============================================================
      render(<AuthForm mode="signup" />);
      fireEvent.change(screen.getByLabelText("パスワード"), {
        target: { value: "a" },
      });

      // ============================================================
      // Assert
      // ============================================================
      expect(screen.getByLabelText("パスワード（確認）")).toBeInTheDocument();
      expect(screen.getByText("8文字以上")).toBeInTheDocument();
    });

    test("renderAuthForm_signinモードの場合_パスワード再設定案内を描画する", () => {
      // ============================================================
      // Arrange / Act
      // ============================================================
      render(<AuthForm mode="signin" />);

      // ============================================================
      // Assert
      // ============================================================
      expect(screen.queryByLabelText("パスワード（確認）")).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "こちら", hidden: false })
      ).toHaveAttribute("href", "/reset-password");
    });

    test("renderAuthForm_ローディングまたは検証エラー時_送信を無効化する", () => {
      // ============================================================
      // Arrange
      // ============================================================
      render(<AuthForm mode="signup" />);
      const submitButton = screen.getByRole("button", { name: "アカウントを作成" });

      // ============================================================
      // Act
      // ============================================================
      fillSignUpInputs({
        email: validEmail,
        password: "aaaaaaaa",
      });

      // ============================================================
      // Assert
      // ============================================================
      expect(submitButton).toBeDisabled();
    });

    test("renderAuthForm_ローディング状態の場合_OAuth操作を無効化してオーバーレイを表示する", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const oauthDeferred = createDeferred<Awaited<ReturnType<typeof signInWithOAuth>>>();
      signInWithOAuthMock.mockImplementationOnce(() => oauthDeferred.promise);
      render(<AuthForm mode="signin" />);

      // ============================================================
      // Act
      // ============================================================
      fireEvent.click(screen.getByRole("button", { name: "Googleで続ける" }));

      // ============================================================
      // Assert
      // ============================================================
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Googleで続ける" })).toBeDisabled();
      });
      expect(screen.getByText("ログイン中...")).toBeInTheDocument();

      oauthDeferred.resolve({} as Awaited<ReturnType<typeof signInWithOAuth>>);
    });
  });

  describe("AUTH-011 togglePasswordVisibility", () => {
    test("togglePasswordVisibility_パスワード切替クリック時_password入力typeを切り替える", () => {
      // ============================================================
      // Arrange
      // ============================================================
      render(<AuthForm mode="signup" />);
      const passwordInput = screen.getByLabelText("パスワード") as HTMLInputElement;
      const toggleButtons = screen.getAllByRole("button", {
        name: "パスワードを表示",
      });

      // ============================================================
      // Act
      // ============================================================
      fireEvent.click(toggleButtons[0]);

      // ============================================================
      // Assert
      // ============================================================
      expect(passwordInput.type).toBe("text");
      expect(
        screen.getByRole("button", { name: "パスワードを非表示" })
      ).toBeInTheDocument();
    });

    test("togglePasswordVisibility_signupで確認パスワード切替クリック時_confirm入力typeを切り替える", () => {
      // ============================================================
      // Arrange
      // ============================================================
      render(<AuthForm mode="signup" />);
      const confirmPasswordInput = screen.getByLabelText(
        "パスワード（確認）"
      ) as HTMLInputElement;
      const toggleButtons = screen.getAllByRole("button", {
        name: "パスワードを表示",
      });

      // ============================================================
      // Act
      // ============================================================
      fireEvent.click(toggleButtons[1]);

      // ============================================================
      // Assert
      // ============================================================
      expect(confirmPasswordInput.type).toBe("text");
      expect(
        screen.getByRole("button", { name: "パスワードを非表示" })
      ).toBeInTheDocument();
    });

    test("togglePasswordVisibility_ローディング時_可視状態を変更しない", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const signInDeferred = createDeferred<Awaited<ReturnType<typeof signIn>>>();
      signInMock.mockImplementationOnce(() => signInDeferred.promise);
      const { container } = render(<AuthForm mode="signin" />);
      fillSignInInputs({ email: validEmail, password: validPassword });
      submitForm(container);

      const passwordInput = screen.getByLabelText("パスワード") as HTMLInputElement;
      const toggleButton = screen.getByRole("button", {
        name: "パスワードを表示",
      });

      // ============================================================
      // Act
      // ============================================================
      fireEvent.click(toggleButton);

      // ============================================================
      // Assert
      // ============================================================
      expect(toggleButton).toBeDisabled();
      expect(passwordInput.type).toBe("password");

      signInDeferred.resolve({} as Awaited<ReturnType<typeof signIn>>);
    });
  });
});
