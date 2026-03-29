import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { NotificationBadge } from "@/features/notifications/components/NotificationBadge";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("@/features/notifications/hooks/useNotifications", () => ({
  useNotifications: jest.fn(),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    variant = "default",
    size = "default",
    ...props
  }: React.ComponentProps<"button"> & {
    variant?: string;
    size?: string;
  }) => (
    <button data-size={size} data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));

const notificationTranslations = {
  badgeAria: "通知",
  badgeAriaWithCount: ({ count }: { count: number }) => `通知（未読${count}件）`,
} as const;

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;
const useNotificationsMock = useNotifications as jest.MockedFunction<
  typeof useNotifications
>;

type NotificationsHookValue = ReturnType<typeof useNotifications>;

function createNotificationsHookValue(
  overrides: Partial<NotificationsHookValue> = {}
): NotificationsHookValue {
  return {
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    markRead: jest.fn(),
    markAllRead: jest.fn().mockResolvedValue(undefined),
    loadMore: jest.fn(),
    handleNotificationClick: jest.fn(),
    refresh: jest.fn(),
    ...overrides,
  };
}

function mockNotifications(overrides: Partial<NotificationsHookValue> = {}) {
  const value = createNotificationsHookValue(overrides);
  useNotificationsMock.mockReturnValue(value);
  return value;
}

function renderBadge(
  props: Partial<React.ComponentProps<typeof NotificationBadge>> = {}
) {
  return render(
    <NotificationBadge onClick={props.onClick} className={props.className} />
  );
}

function createDeferredPromise<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("NotificationBadge unit tests from EARS specs", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    useTranslationsMock.mockImplementation((namespace?: string) => {
      if (namespace !== "notifications") {
        throw new Error(`Unexpected namespace: ${namespace}`);
      }

      return ((key: keyof typeof notificationTranslations, values?: Record<string, unknown>) => {
        const entry = notificationTranslations[key];
        return typeof entry === "function" ? entry(values as never) : entry;
      }) as unknown as ReturnType<typeof useTranslations>;
    });

    mockNotifications();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("NBADGE-001 render", () => {
    test("render_unreadCountが0の場合_既定ariaLabelを使いドットを表示しない", () => {
      // Spec: NBADGE-001
      mockNotifications({ unreadCount: 0 });

      renderBadge();

      const button = screen.getByRole("button", { name: "通知" });
      expect(button).toHaveAttribute("data-variant", "ghost");
      expect(button).toHaveAttribute("data-size", "sm");
      expect(button.querySelector("svg")).not.toBeNull();
      expect(button.querySelector("span")).toBeNull();
    });

    test("render_unreadCountが負数の場合_既定ariaLabelのままドットを表示しない", () => {
      // Spec: NBADGE-001
      mockNotifications({ unreadCount: -3 });

      renderBadge();

      const button = screen.getByRole("button", { name: "通知" });
      expect(button).toBeInTheDocument();
      expect(button.querySelector("span")).toBeNull();
    });
  });

  describe("NBADGE-002 render", () => {
    test("render_unreadCountが正数の場合_ドットと件数付きariaLabelを表示する", () => {
      // Spec: NBADGE-002
      mockNotifications({ unreadCount: 7 });

      renderBadge();

      const button = screen.getByRole("button", { name: "通知（未読7件）" });
      const indicator = button.querySelector("span");

      expect(indicator).not.toBeNull();
      expect(indicator).toHaveClass(
        "absolute",
        "-top-1",
        "-right-1",
        "h-3",
        "w-3",
        "rounded-full",
        "bg-red-500"
      );
    });

    test("render_unreadCountが1の場合_正の境界値でもドットを表示する", () => {
      // Spec: NBADGE-002
      mockNotifications({ unreadCount: 1 });

      renderBadge();

      const button = screen.getByRole("button", { name: "通知（未読1件）" });
      expect(button.querySelector("span")).not.toBeNull();
    });
  });

  describe("NBADGE-003 render", () => {
    test("render_customClassName指定時_基本ボタンクラスとマージする", () => {
      // Spec: NBADGE-003
      renderBadge({ className: "custom-token" });

      const button = screen.getByRole("button", { name: "通知" });
      expect(button).toHaveClass(
        "relative",
        "flex",
        "items-center",
        "justify-center",
        "p-2",
        "h-auto",
        "custom-token"
      );
    });

    test("render_空className指定時_基本ボタンクラスを保持する", () => {
      // Spec: NBADGE-003
      renderBadge({ className: "" });

      const button = screen.getByRole("button", { name: "通知" });
      expect(button).toHaveClass(
        "relative",
        "flex",
        "items-center",
        "justify-center",
        "p-2",
        "h-auto"
      );
      expect(button.className).not.toContain("undefined");
    });
  });

  describe("NBADGE-004 handleClick", () => {
    test("handleClick_未読通知ありの場合_markAllRead完了後にonClickを呼ぶ", async () => {
      // Spec: NBADGE-004
      const deferred = createDeferredPromise<void>();
      const order: string[] = [];
      const onClick = jest.fn(() => {
        order.push("onClick");
      });
      const markAllRead = jest.fn().mockImplementation(() => {
        order.push("markAllRead:start");
        return deferred.promise.then(() => {
          order.push("markAllRead:resolved");
        });
      });

      mockNotifications({ unreadCount: 2, markAllRead });
      renderBadge({ onClick });

      fireEvent.click(screen.getByRole("button", { name: "通知（未読2件）" }));

      expect(markAllRead).toHaveBeenCalledTimes(1);
      expect(onClick).not.toHaveBeenCalled();

      deferred.resolve();

      await waitFor(() => {
        expect(onClick).toHaveBeenCalledTimes(1);
      });

      expect(order).toEqual([
        "markAllRead:start",
        "markAllRead:resolved",
        "onClick",
      ]);
    });

    test("handleClick_未読通知ありでonClick未指定の場合_markAllReadだけ呼ぶ", async () => {
      // Spec: NBADGE-004
      const markAllRead = jest.fn().mockResolvedValue(undefined);

      mockNotifications({ unreadCount: 4, markAllRead });
      renderBadge();

      fireEvent.click(screen.getByRole("button", { name: "通知（未読4件）" }));
      fireEvent.click(screen.getByRole("button", { name: "通知（未読4件）" }));

      await waitFor(() => {
        expect(markAllRead).toHaveBeenCalledTimes(2);
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe("NBADGE-005 handleClick", () => {
    test("handleClick_未読通知なしの場合_markAllReadを呼ばずonClickを呼ぶ", () => {
      // Spec: NBADGE-005
      const onClick = jest.fn();
      const markAllRead = jest.fn().mockResolvedValue(undefined);

      // Fixed: use a negative unreadCount to prove the non-positive branch, not only the zero case.
      mockNotifications({ unreadCount: -1, markAllRead });
      renderBadge({ onClick });

      fireEvent.click(screen.getByRole("button", { name: "通知" }));

      expect(markAllRead).not.toHaveBeenCalled();
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    test("handleClick_未読通知なしでonClick未指定の場合_markAllReadを呼ばず完了する", () => {
      // Spec: NBADGE-005
      const markAllRead = jest.fn().mockResolvedValue(undefined);

      mockNotifications({ unreadCount: 0, markAllRead });
      renderBadge();

      expect(() => {
        fireEvent.click(screen.getByRole("button", { name: "通知" }));
      }).not.toThrow();
      expect(markAllRead).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe("NBADGE-006 handleClick", () => {
    test("handleClick_markAllRead失敗時_エラーログを出してonClickを呼ぶ", async () => {
      // Spec: NBADGE-006
      const error = new Error("network failed");
      const onClick = jest.fn();
      const markAllRead = jest.fn().mockRejectedValue(error);

      mockNotifications({ unreadCount: 3, markAllRead });
      renderBadge({ onClick });

      fireEvent.click(screen.getByRole("button", { name: "通知（未読3件）" }));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "Failed to mark all notifications as read:",
          error
        );
      });
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    test("handleClick_markAllRead失敗かつonClick未指定時_ログ後にrejectを伝播しない", async () => {
      // Spec: NBADGE-006
      const rejectedValue = "boom";
      const markAllRead = jest.fn().mockRejectedValue(rejectedValue);

      mockNotifications({ unreadCount: 5, markAllRead });
      renderBadge();

      expect(() => {
        fireEvent.click(screen.getByRole("button", { name: "通知（未読5件）" }));
        fireEvent.click(screen.getByRole("button", { name: "通知（未読5件）" }));
      }).not.toThrow();

      await waitFor(() => {
        expect(markAllRead).toHaveBeenCalledTimes(2);
        expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      });
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        "Failed to mark all notifications as read:",
        rejectedValue
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        "Failed to mark all notifications as read:",
        rejectedValue
      );
    });
  });
});
