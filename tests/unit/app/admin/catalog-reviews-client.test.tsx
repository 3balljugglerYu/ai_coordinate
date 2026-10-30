/**
 * 運営の審査ページの部品(CatalogReviewsClient)。
 *
 * ここで守ること:
 *  - 審査待ちが無ければ、そう出す
 *  - 承認は、その作品の判定の API に approve を送り、一覧から消す
 *  - 作り直しは、理由の分類を選ばないと送らない。選んだら分類と説明を送る
 *  - 失敗したら一覧に残し、理由を出す
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CatalogReviewsClient } from "@/app/(app)/admin/catalog-reviews/CatalogReviewsClient";
import type { PendingCatalogReview } from "@/features/catalog-references/lib/review-admin-repository";

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

const ITEM: PendingCatalogReview = {
  imageId: "img-1",
  userId: "u1",
  nickname: "はな",
  submittedAt: "2026-10-30T01:00:00Z",
  afterUrl: "https://cdn/after.webp",
  beforeUrl: null,
  referenceUrl: "https://signed/ref",
  takes: ["outfit"],
  prompt: "猫耳",
  derived: false,
  referenceRejected: false,
};

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  mockToast.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function respond(ok: boolean, body: unknown) {
  fetchMock.mockResolvedValueOnce({ ok, json: async () => body } as Response);
}

test("審査待ちが無ければ、そう出す", () => {
  render(<CatalogReviewsClient initialItems={[]} />);

  expect(screen.getByText("審査待ちの作品はありません。")).toBeTruthy();
});

test("承認は、その作品の判定の API に approve を送り、一覧から消す", async () => {
  respond(true, { status: "approved" });
  render(<CatalogReviewsClient initialItems={[ITEM]} />);

  fireEvent.click(screen.getByRole("button", { name: "承認する" }));

  await waitFor(() => expect(screen.getByText("審査待ちの作品はありません。")).toBeTruthy());
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/admin/catalog-reviews/img-1/decision",
    expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "approve" }) }),
  );
});

test("作り直しは、理由の分類を選ばないと送らない", () => {
  render(<CatalogReviewsClient initialItems={[ITEM]} />);

  fireEvent.click(screen.getByRole("button", { name: "作り直しにする" }));

  expect(fetchMock).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
});

test("作り直しは、選んだ分類と説明を送る", async () => {
  respond(true, { status: "rejected" });
  render(<CatalogReviewsClient initialItems={[ITEM]} />);

  fireEvent.change(screen.getByLabelText("作り直しの理由"), { target: { value: "real_person" } });
  fireEvent.change(screen.getByPlaceholderText(/作者への説明/), { target: { value: " 実在の俳優 " } });
  fireEvent.click(screen.getByRole("button", { name: "作り直しにする" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({
    action: "reject",
    reasonCategory: "real_person",
    reason: "実在の俳優",
  });
});

test("失敗したら一覧に残し、理由を出す", async () => {
  respond(false, { error: "この作品はもう判定されています" });
  render(<CatalogReviewsClient initialItems={[ITEM]} />);

  fireEvent.click(screen.getByRole("button", { name: "承認する" }));

  await waitFor(() =>
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "この作品はもう判定されています" })),
  );
  expect(screen.getByText("はな")).toBeTruthy();
});

test("見本が作り直しで止まっていれば、そう出す", () => {
  render(<CatalogReviewsClient initialItems={[{ ...ITEM, referenceRejected: true }]} />);

  expect(screen.getByText("この見本は、ほかの作品の審査で作り直しになっています")).toBeTruthy();
});
