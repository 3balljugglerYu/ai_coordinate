import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LanguageSettingsMenu } from "@/components/LanguageSettingsMenu";

let mockDropdownOnValueChange: ((value: string) => void) | undefined;

jest.mock("next-intl", () => ({
  useLocale: jest.fn(),
  useTranslations: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
  useSearchParams: jest.fn(),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    variant = "default",
    ...props
  }: React.ComponentProps<"button"> & { variant?: string }) => (
    <button data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));

jest.mock("@/components/ui/dropdown-menu", () => {
  const React = require("react");
  const RadioGroupContext = React.createContext({
    value: "",
    onValueChange: (_value: string) => {},
  });

  return {
    DropdownMenu: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="menu-root">{children}</div>
    ),
    DropdownMenuTrigger: ({
      children,
      asChild,
    }: {
      children: React.ReactNode;
      asChild?: boolean;
    }) =>
      asChild ? (
        <>{children}</>
      ) : (
        <button type="button" data-testid="menu-trigger">
          {children}
        </button>
      ),
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="menu-content">{children}</div>
    ),
    DropdownMenuSub: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="dropdown-sub">{children}</div>
    ),
    DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => (
      <button type="button" data-testid="dropdown-trigger">
        {children}
      </button>
    ),
    DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="dropdown-content">{children}</div>
    ),
    DropdownMenuShortcut: ({ children }: { children: React.ReactNode }) => (
      <span data-testid="dropdown-shortcut">{children}</span>
    ),
    DropdownMenuRadioGroup: ({
      children,
      value,
      onValueChange,
    }: {
      children: React.ReactNode;
      value: string;
      onValueChange: (value: string) => void;
    }) => {
      mockDropdownOnValueChange = onValueChange;
      return (
        <RadioGroupContext.Provider value={{ value, onValueChange }}>
          <div data-testid="dropdown-radio-group">{children}</div>
        </RadioGroupContext.Provider>
      );
    },
    DropdownMenuRadioItem: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value: string;
    }) => {
      const context = React.useContext(RadioGroupContext);

      return (
        <button
          type="button"
          data-testid={`radio-${value}`}
          data-active={String(context.value === value)}
          onClick={() => context.onValueChange(value)}
        >
          {children}
        </button>
      );
    },
  };
});

const commonTranslations = {
  localeLabel: "言語設定",
  localeJa: "日本語",
  localeEn: "English",
} as const;

const useLocaleMock = useLocale as jest.MockedFunction<typeof useLocale>;
const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;
const useRouterMock = useRouter as jest.MockedFunction<typeof useRouter>;
const usePathnameMock = usePathname as jest.MockedFunction<typeof usePathname>;
const useSearchParamsMock = useSearchParams as jest.MockedFunction<
  typeof useSearchParams
>;

let currentLocale = "ja";
let currentPathname = "/ja/about";
let currentSearch = "";
let refreshMock: jest.Mock;
let assignMock: jest.Mock;
let originalLocation: Location;

function clearLocaleCookie() {
  document.cookie = "NEXT_LOCALE=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
}

function renderMenu(props?: Partial<React.ComponentProps<typeof LanguageSettingsMenu>>) {
  return render(
    <LanguageSettingsMenu
      variant={props?.variant ?? "dropdown"}
      onSelect={props?.onSelect}
    />
  );
}

beforeAll(() => {
  originalLocation = window.location;
  delete (window as Window & typeof globalThis & { location?: Location }).location;
  (window as Window & typeof globalThis & { location: Location }).location = {
    assign: jest.fn(),
    hash: "",
  } as unknown as Location;
});

afterAll(() => {
  (window as Window & typeof globalThis & { location: Location }).location =
    originalLocation;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDropdownOnValueChange = undefined;

  currentLocale = "ja";
  currentPathname = "/ja/about";
  currentSearch = "";
  refreshMock = jest.fn();
  assignMock = window.location.assign as unknown as jest.Mock;
  assignMock.mockReset();
  window.location.hash = "";
  clearLocaleCookie();

  useLocaleMock.mockImplementation(() => currentLocale);
  useTranslationsMock.mockImplementation(() => {
    return ((key: string) => commonTranslations[key as keyof typeof commonTranslations]) as ReturnType<
      typeof useTranslations
    >;
  });
  useRouterMock.mockReturnValue({
    refresh: refreshMock,
  } as unknown as ReturnType<typeof useRouter>);
  usePathnameMock.mockImplementation(() => currentPathname);
  useSearchParamsMock.mockImplementation(
    () =>
      ({
        toString: () => currentSearch,
      }) as unknown as ReturnType<typeof useSearchParams>
  );
});

describe("LanguageSettingsMenu unit tests from EARS specs", () => {
  describe("LSM-001 render", () => {
    test("render_dropdown指定の場合_言語設定ラベルとshortcutとradio項目を表示する", () => {
      renderMenu({ variant: "dropdown" });

      expect(screen.getByTestId("dropdown-trigger")).toHaveTextContent("言語設定");
      expect(screen.getByTestId("dropdown-shortcut")).toHaveTextContent("日本語");
      expect(screen.getByTestId("radio-ja")).toHaveTextContent("日本語");
      expect(screen.getByTestId("radio-en")).toHaveTextContent("English");
    });

    test("render_dropdown指定で未対応localeの場合_DEFAULT_LOCALEのshortcutにフォールバックする", () => {
      currentLocale = "fr";

      renderMenu({ variant: "dropdown" });

      expect(screen.getByTestId("dropdown-shortcut")).toHaveTextContent("日本語");
      expect(screen.getByTestId("radio-ja")).toHaveAttribute("data-active", "true");
    });
  });

  describe("LSM-002 render", () => {
    test("render_sidebar指定の場合_現在localeのトリガー行を表示する", () => {
      renderMenu({ variant: "sidebar" });

      expect(screen.getByRole("button", { name: "言語設定" })).toBeInTheDocument();
      expect(screen.getByText("日本語")).toBeInTheDocument();
      expect(screen.queryByRole("menu", { name: "言語設定" })).not.toBeInTheDocument();
    });

    test("render_sidebar指定でトリガー選択時_フライアウトと選択中localeを表示する", () => {
      currentLocale = "en";

      renderMenu({ variant: "sidebar" });
      fireEvent.click(screen.getByRole("button", { name: "言語設定" }));

      expect(screen.getByRole("menu", { name: "言語設定" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "日本語" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "English" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "言語設定" })).toHaveTextContent(
        "English"
      );
    });
  });

  describe("LSM-006 render", () => {
    test("render_header指定の場合_独立したトリガーとradio項目を表示する", () => {
      renderMenu({ variant: "header" });

      expect(screen.getByRole("button", { name: "言語設定" })).toBeInTheDocument();
      expect(screen.getByTestId("menu-content")).toBeInTheDocument();
      expect(screen.getByTestId("radio-ja")).toHaveTextContent("日本語");
      expect(screen.getByTestId("radio-en")).toHaveTextContent("English");
    });

    test("render_header指定で未対応localeの場合_DEFAULT_LOCALEにフォールバックする", () => {
      currentLocale = "fr";

      renderMenu({ variant: "header" });

      expect(screen.getByRole("button", { name: "言語設定" })).toHaveAttribute(
        "title",
        "日本語"
      );
      expect(screen.getByTestId("radio-ja")).toHaveAttribute("data-active", "true");
    });
  });

  describe("LSM-003 handleLocaleChange", () => {
    test("handleLocaleChange_未対応localeの場合_何もしない", async () => {
      const onSelect = jest.fn();
      renderMenu({ variant: "dropdown", onSelect });

      mockDropdownOnValueChange?.("fr");

      await waitFor(() => {
        expect(onSelect).not.toHaveBeenCalled();
        expect(assignMock).not.toHaveBeenCalled();
        expect(refreshMock).not.toHaveBeenCalled();
        expect(document.cookie).not.toContain("NEXT_LOCALE=");
      });
    });

    test("handleLocaleChange_同じlocaleの場合_何もしない", async () => {
      currentLocale = "ja";
      const onSelect = jest.fn();
      renderMenu({ variant: "sidebar", onSelect });

      fireEvent.click(screen.getByRole("button", { name: "言語設定" }));
      fireEvent.click(screen.getByRole("button", { name: "日本語" }));

      await waitFor(() => {
        expect(onSelect).not.toHaveBeenCalled();
        expect(assignMock).not.toHaveBeenCalled();
        expect(refreshMock).not.toHaveBeenCalled();
        expect(document.cookie).not.toContain("NEXT_LOCALE=");
      });
    });
  });

  describe("LSM-004 handleLocaleChange", () => {
    test("handleLocaleChange_公開パスで異なるlocaleの場合_cookie更新後searchとhash付きで遷移する", async () => {
      currentLocale = "ja";
      currentPathname = "/ja/about";
      currentSearch = "tab=pricing";
      window.location.hash = "#hero";
      const onSelect = jest.fn();

      renderMenu({ variant: "dropdown", onSelect });
      fireEvent.click(screen.getByTestId("radio-en"));

      await waitFor(() => {
        expect(document.cookie).toContain("NEXT_LOCALE=en");
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(assignMock).toHaveBeenCalledWith("/en/about?tab=pricing#hero");
        expect(refreshMock).not.toHaveBeenCalled();
      });
    });

    test("handleLocaleChange_公開パスでonSelectなしの場合_callbackなしで遷移する", async () => {
      currentLocale = "ja";
      currentPathname = "/ja/posts/example-post";

      renderMenu({ variant: "sidebar" });
      fireEvent.click(screen.getByRole("button", { name: "言語設定" }));
      fireEvent.click(screen.getByRole("button", { name: "English" }));

      await waitFor(() => {
        expect(document.cookie).toContain("NEXT_LOCALE=en");
        expect(assignMock).toHaveBeenCalledWith("/en/posts/example-post");
        expect(refreshMock).not.toHaveBeenCalled();
      });
    });
  });

  describe("LSM-005 handleLocaleChange", () => {
    test("handleLocaleChange_内部パスで異なるlocaleの場合_cookie更新後refreshする", async () => {
      currentLocale = "ja";
      currentPathname = "/my-page";
      const onSelect = jest.fn();

      renderMenu({ variant: "dropdown", onSelect });
      fireEvent.click(screen.getByTestId("radio-en"));

      await waitFor(() => {
        expect(document.cookie).toContain("NEXT_LOCALE=en");
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(refreshMock).toHaveBeenCalledTimes(1);
        expect(assignMock).not.toHaveBeenCalled();
      });
    });

    test("handleLocaleChange_内部パスでonSelectなしの場合_callbackなしでrefreshする", async () => {
      currentLocale = "ja";
      currentPathname = "/dashboard";

      renderMenu({ variant: "sidebar" });
      fireEvent.click(screen.getByRole("button", { name: "言語設定" }));
      fireEvent.click(screen.getByRole("button", { name: "English" }));

      await waitFor(() => {
        expect(document.cookie).toContain("NEXT_LOCALE=en");
        expect(refreshMock).toHaveBeenCalledTimes(1);
        expect(assignMock).not.toHaveBeenCalled();
      });
    });
  });
});
