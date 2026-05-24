/**
 * @jest-environment jsdom
 */

const stableTranslate = (key: string) => key;
jest.mock("next-intl", () => ({
  useTranslations: () => stableTranslate,
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GeneratedImagesTab } from "@/features/generation/components/ImageSourcePicker/GeneratedImagesTab";

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  Object.defineProperty(globalThis, "fetch", {
    value: fetchMock,
    writable: true,
    configurable: true,
  });
});

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as unknown as Response;
}

describe("GeneratedImagesTab", () => {
  test("active=false の間は fetch しない", async () => {
    render(
      <GeneratedImagesTab active={false} onSelect={() => {}} />,
    );
    // microtask 後でも fetch されない
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("初期表示で API を叩いてタイルを並べる", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            kind: "generated",
            id: "g-1",
            imageUrl: "https://cdn.example/a.webp",
            storagePath: "u/a.webp",
            createdAt: "2026-01-01",
            generationType: "coordinate",
          },
          {
            kind: "generated",
            id: "g-2",
            imageUrl: "https://cdn.example/b.webp",
            storagePath: "u/b.webp",
            createdAt: "2026-01-02",
            generationType: "one_tap_style",
          },
        ],
        nextOffset: null,
      }),
    );
    render(
      <GeneratedImagesTab active onSelect={() => {}} />,
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/generation-history/picker?limit=50&offset=0",
        expect.objectContaining({ cache: "no-store" }),
      );
    });
    expect(
      await screen.findAllByRole("button", { name: "selectImageAria" }),
    ).toHaveLength(2);
  });

  test("空のとき empty state を表示する", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [], nextOffset: null }),
    );
    render(<GeneratedImagesTab active onSelect={() => {}} />);
    expect(
      await screen.findByText("emptyGeneratedTitle"),
    ).toBeInTheDocument();
  });

  test("エラー時に retry ボタンで再 fetch", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as unknown as Response);
    render(<GeneratedImagesTab active onSelect={() => {}} />);
    const retry = await screen.findByRole("button", { name: "retry" });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [], nextOffset: null }),
    );
    await user.click(retry);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  test("nextOffset があれば「もっと見る」で追加 fetch する", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            kind: "generated",
            id: "g-1",
            imageUrl: "https://cdn.example/a.webp",
            storagePath: "u/a.webp",
            createdAt: "2026-01-01",
            generationType: "coordinate",
          },
        ],
        nextOffset: 50,
      }),
    );
    render(<GeneratedImagesTab active onSelect={() => {}} />);
    const more = await screen.findByRole("button", { name: "loadMore" });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            kind: "generated",
            id: "g-2",
            imageUrl: "https://cdn.example/b.webp",
            storagePath: "u/b.webp",
            createdAt: "2026-01-02",
            generationType: "coordinate",
          },
        ],
        nextOffset: null,
      }),
    );
    await user.click(more);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/generation-history/picker?limit=50&offset=50",
        expect.objectContaining({ cache: "no-store" }),
      );
    });
    expect(
      await screen.findAllByRole("button", { name: "selectImageAria" }),
    ).toHaveLength(2);
  });

  test("タイルクリックで onSelect を呼ぶ", async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            kind: "generated",
            id: "g-1",
            imageUrl: "https://cdn.example/a.webp",
            storagePath: "u/a.webp",
            createdAt: "2026-01-01",
            generationType: "coordinate",
          },
        ],
        nextOffset: null,
      }),
    );
    render(<GeneratedImagesTab active onSelect={onSelect} />);
    const tile = await screen.findByRole("button", { name: "selectImageAria" });
    await user.click(tile);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "g-1", kind: "generated" }),
    );
  });
});
