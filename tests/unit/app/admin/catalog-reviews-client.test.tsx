/**
 * 運営の審査ページの部品(CatalogReviewsClient)。
 *
 * ここで守ること:
 *  - 審査待ちが無ければ、そう出す
 *  - 承認は、その作品の判定の API に approve を送り、一覧から消す
 *  - 作り直しは、理由の分類を選ばないと送らない。選んだら分類と説明を送る
 *  - 失敗したら一覧に残し、理由を出す。もう判定された・見つからない作品は消す
 *  - 「そのほか」は説明が無いと送らない
 *  - 作り直しにしたら、同じ見本のほかの作品にも印を出す
 *  - 申請の時刻は日本時間で出す。打ち切った数と同じだけ来たら、続きがあると出す
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  referenceId: "ref-1",
  referenceUnavailable: false,
  imageUnavailable: false,
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
  render(<CatalogReviewsClient initialItems={[]} limit={50} />);

  expect(screen.getByText("審査待ちの作品はありません。")).toBeTruthy();
});

test("承認は、その作品の判定の API に approve を送り、一覧から消す", async () => {
  respond(true, { status: "approved" });
  render(<CatalogReviewsClient initialItems={[ITEM]} limit={50} />);

  fireEvent.click(screen.getByRole("button", { name: "承認する" }));

  await waitFor(() => expect(screen.getByText("審査待ちの作品はありません。")).toBeTruthy());
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/admin/catalog-reviews/img-1/decision",
    expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "approve" }) }),
  );
});

test("作り直しは、理由の分類を選ばないと送らない", () => {
  render(<CatalogReviewsClient initialItems={[ITEM]} limit={50} />);

  fireEvent.click(screen.getByRole("button", { name: "作り直しにする" }));

  expect(fetchMock).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
});

test("作り直しは、選んだ分類と説明を送る", async () => {
  respond(true, { status: "rejected" });
  render(<CatalogReviewsClient initialItems={[ITEM]} limit={50} />);

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
  render(<CatalogReviewsClient initialItems={[ITEM]} limit={50} />);

  fireEvent.click(screen.getByRole("button", { name: "承認する" }));

  await waitFor(() =>
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: "この作品はもう判定されています" })),
  );
  expect(screen.getByText("はな")).toBeTruthy();
});

test("見本が使えなければ、そう出し、承認ボタンを押せない(作り直しは押せる)", () => {
  render(<CatalogReviewsClient initialItems={[{ ...ITEM, referenceUnavailable: true }]} limit={50} />);

  expect(screen.getByText("この作品の見本は使えません(作り直しになったか、元の作品や見本が消されています)")).toBeTruthy();
  expect((screen.getByRole("button", { name: "承認する" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "作り直しにする" }) as HTMLButtonElement).disabled).toBe(false);
});

test("「そのほか」は、説明が無いと送らない", () => {
  render(<CatalogReviewsClient initialItems={[ITEM]} limit={50} />);

  fireEvent.change(screen.getByLabelText("作り直しの理由"), { target: { value: "other" } });
  fireEvent.click(screen.getByRole("button", { name: "作り直しにする" }));

  expect(fetchMock).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
});

test("もう判定された作品は、一覧から消す", async () => {
  respond(false, { error: "この作品はもう判定されています", errorCode: "CATALOG_REVIEW_ALREADY_DECIDED" });
  render(<CatalogReviewsClient initialItems={[ITEM]} limit={50} />);

  fireEvent.click(screen.getByRole("button", { name: "承認する" }));

  await waitFor(() => expect(screen.getByText("審査待ちの作品はありません。")).toBeTruthy());
});

test("作り直しにしたら、同じ見本のほかの作品にも印を出す(ほかの見本の作品には出さない)", async () => {
  respond(true, { status: "rejected" });
  const sameReference = { ...ITEM, imageId: "img-2", nickname: "そら" };
  const otherReference = { ...ITEM, imageId: "img-3", nickname: "うみ", referenceId: "ref-2" };
  render(<CatalogReviewsClient initialItems={[ITEM, sameReference, otherReference]} limit={50} />);

  fireEvent.change(screen.getAllByLabelText("作り直しの理由")[0], { target: { value: "real_person" } });
  fireEvent.click(screen.getAllByRole("button", { name: "作り直しにする" })[0]);

  await waitFor(() => expect(screen.queryByText("はな")).toBeNull());
  const badge = "この作品の見本は使えません(作り直しになったか、元の作品や見本が消されています)";
  expect(within(screen.getByText("そら").parentElement as HTMLElement).getByText(badge)).toBeTruthy();
  expect(within(screen.getByText("うみ").parentElement as HTMLElement).queryByText(badge)).toBeNull();
});

test("申請の時刻は日本時間で出す", () => {
  render(<CatalogReviewsClient initialItems={[ITEM]} limit={50} />);

  // 2026-10-30T01:00:00Z は日本時間の 10:00(手元の時間帯や秒の有無に左右されないよう、全体で比べる)
  expect(screen.getByText("申請 2026/10/30 10:00")).toBeTruthy();
});

test("打ち切った数と同じだけ来たら、判定し終えたあとに続きがあると出す", async () => {
  respond(true, { status: "approved" });
  render(<CatalogReviewsClient initialItems={[ITEM]} limit={1} />);

  expect(screen.getByText(/最大1件を表示/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "承認する" }));

  await waitFor(() => expect(screen.getByText(/続きがあれば、ページを読み直すと出ます/)).toBeTruthy());
});

test("公開停止の作品には、承認できないと出し、承認ボタンを押せない(作り直しは押せる)", () => {
  render(<CatalogReviewsClient initialItems={[{ ...ITEM, imageUnavailable: true }]} limit={50} />);

  expect(screen.getByText("公開停止などのため承認できません(作り直しにはできます)")).toBeTruthy();
  expect((screen.getByRole("button", { name: "承認する" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "作り直しにする" }) as HTMLButtonElement).disabled).toBe(false);
});

test("開いたあとに公開停止になって承認を断られたら、そのカードに印を出して残す", async () => {
  respond(false, { error: "承認できません", errorCode: "CATALOG_REVIEW_IMAGE_UNAVAILABLE" });
  render(<CatalogReviewsClient initialItems={[ITEM]} limit={50} />);

  fireEvent.click(screen.getByRole("button", { name: "承認する" }));

  await waitFor(() =>
    expect(screen.getByText("公開停止などのため承認できません(作り直しにはできます)")).toBeTruthy(),
  );
  expect(screen.getByText("はな")).toBeTruthy();
});

test("見本が使えないために承認を断られたら、そのカードにだけ印を出して残す(理由が分からないので同じ見本のカードには広げない)", async () => {
  respond(false, { error: "承認できません", errorCode: "CATALOG_REVIEW_REFERENCE_UNAVAILABLE" });
  const sameReference = { ...ITEM, imageId: "img-2", nickname: "そら" };
  const otherReference = { ...ITEM, imageId: "img-3", nickname: "うみ", referenceId: "ref-2" };
  render(<CatalogReviewsClient initialItems={[ITEM, sameReference, otherReference]} limit={50} />);

  fireEvent.click(screen.getAllByRole("button", { name: "承認する" })[0]);

  const badge = "この作品の見本は使えません(作り直しになったか、元の作品や見本が消されています)";
  await waitFor(() => expect(within(screen.getByText("はな").parentElement as HTMLElement).getByText(badge)).toBeTruthy());
  expect(within(screen.getByText("そら").parentElement as HTMLElement).queryByText(badge)).toBeNull();
  // 断られたカードは承認を押せなくなり、作り直しは押せるまま
  expect((screen.getAllByRole("button", { name: "承認する" })[0] as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getAllByRole("button", { name: "作り直しにする" })[0] as HTMLButtonElement).disabled).toBe(false);
  expect(within(screen.getByText("うみ").parentElement as HTMLElement).queryByText(badge)).toBeNull();
});
