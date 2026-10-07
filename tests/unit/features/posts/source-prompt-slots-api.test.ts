/** @jest-environment jsdom */
import { fetchSourceNameInput } from "@/features/posts/lib/source-prompt-slots-api";

const mockFetch = jest.fn();
beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as never;
});

describe("fetchSourceNameInput", () => {
  test("見出しなどを受け取る", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ nameInput: { label: "名前", required: false } }) });
    await expect(fetchSourceNameInput("p1")).resolves.toEqual({ label: "名前", required: false });
    expect(mockFetch).toHaveBeenCalledWith("/api/posts/p1/prompt-slots");
  });

  test("取れないとき・欄が無いときは null", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    await expect(fetchSourceNameInput("p1")).resolves.toBeNull();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ nameInput: null }) });
    await expect(fetchSourceNameInput("p1")).resolves.toBeNull();
  });
});
