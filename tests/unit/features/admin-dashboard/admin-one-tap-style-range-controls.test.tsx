import { fireEvent, render, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { AdminOneTapStyleRangeControls } from "@/features/admin-dashboard/components/AdminOneTapStyleRangeControls";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

describe("AdminOneTapStyleRangeControls", () => {
  const useRouterMock = useRouter as jest.MockedFunction<typeof useRouter>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("custom を押しただけでは遷移せず、適用時にだけ custom URL へ遷移する", () => {
    const pushMock = jest.fn();
    useRouterMock.mockReturnValue({
      push: pushMock,
    } as unknown as ReturnType<typeof useRouter>);

    render(
      <AdminOneTapStyleRangeControls
        currentRange="30d"
        currentStyleRange="30d"
        currentStyleFrom={null}
        currentStyleTo={null}
        currentStyleFromLabel="-"
        currentStyleToLabel="-"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "custom" }));
    expect(pushMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("開始日時"), {
      target: { value: "2026-04-12T12:00" },
    });
    fireEvent.change(screen.getByLabelText("終了日時"), {
      target: { value: "2026-04-15T12:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "カスタム期間を適用" }));

    expect(pushMock).toHaveBeenCalledTimes(1);

    const pushedUrl = pushMock.mock.calls[0]?.[0];
    expect(typeof pushedUrl).toBe("string");

    const params = new URL(pushedUrl as string, "https://example.com").searchParams;
    expect(params.get("range")).toBe("30d");
    expect(params.get("tab")).toBe("one-tap-style");
    expect(params.get("styleRange")).toBe("custom");
    expect(params.get("styleFrom")).toBe(
      new Date("2026-04-12T12:00").toISOString()
    );
    expect(params.get("styleTo")).toBe(
      new Date("2026-04-15T12:00").toISOString()
    );
  });

  test("通常 range は選択時に即座に遷移する", () => {
    const pushMock = jest.fn();
    useRouterMock.mockReturnValue({
      push: pushMock,
    } as unknown as ReturnType<typeof useRouter>);

    render(
      <AdminOneTapStyleRangeControls
        currentRange="30d"
        currentStyleRange="custom"
        currentStyleFrom="2026-04-12T03:00:00.000Z"
        currentStyleTo="2026-04-15T03:00:00.000Z"
        currentStyleFromLabel="2026/04/12 12:00"
        currentStyleToLabel="2026/04/15 12:00"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "7d" }));

    expect(pushMock).toHaveBeenCalledWith(
      "/admin?range=30d&tab=one-tap-style&styleRange=7d"
    );
  });
});
