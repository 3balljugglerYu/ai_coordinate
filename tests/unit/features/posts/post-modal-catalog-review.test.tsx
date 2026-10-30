/**
 * @jest-environment jsdom
 *
 * 投稿の画面(PostModal)で、見本(参照画像)を使った作品の審査に出す流れ。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 6)
 *
 * ここで守ること:
 *  - 審査が済んでいないために投稿を断られたら(POSTS_REVIEW_PENDING)、理由と「審査に出す」を出す
 *  - 「審査に出す」は、その作品を POST /api/catalog-references/review に送り、出せたらそう出す
 *  - 押し直しても変わらない断り(確認中・公開できる・作り直しが必要・見本が使えない)は、言語ごとの文言を出してボタンを消す
 *  - それ以外の失敗は、決まった文言を出して、もう一度押せるようにする
 *  - ほかの理由で断られたときは「審査に出す」を出さない
 */

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
jest.mock("@/features/notifications/components/UnreadNotificationProvider", () => ({
  useUnreadNotificationCount: () => ({ refreshUnreadCount: jest.fn(async () => {}) }),
}));
jest.mock("@/features/posts/components/HashtagHighlightTextarea", () => ({
  HashtagHighlightTextarea: () => <textarea aria-label="caption" />,
}));
jest.mock("@/features/posts/components/HashtagSuggestionChips", () => ({
  HashtagSuggestionChips: () => null,
}));
jest.mock("@/features/posts/components/PromptVisibilityField", () => ({
  PromptVisibilityField: () => null,
}));
jest.mock("@/features/posts/lib/post-progress-store", () => ({
  abortPostProgress: jest.fn(),
  finishPostProgress: jest.fn(),
  startPostProgress: jest.fn(),
}));
const mockPostImage = jest.fn();
jest.mock("@/features/posts/lib/api", () => ({
  postImageAPI: (...args: unknown[]) => mockPostImage(...args),
  fetchBeforeSourceUrl: jest.fn(async () => null),
}));

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PostModal } from "@/features/posts/components/PostModal";

const IMAGE_ID = "11111111-1111-4111-8111-111111111111";
const fetchMock = jest.fn();

function postError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

function renderModal() {
  render(<PostModal open onOpenChange={jest.fn()} imageId={IMAGE_ID} beforeImageUrl={null} />);
}

async function submitPost() {
  const form = document.querySelector("form");
  if (!form) throw new Error("form が無い");
  fireEvent.submit(form);
}

test("審査が済んでいないために断られたら、理由と「審査に出す」を出す", async () => {
  mockPostImage.mockRejectedValue(postError("POSTS_REVIEW_PENDING", "承認されるまで投稿できません"));
  renderModal();

  await submitPost();

  expect(await screen.findByText("承認されるまで投稿できません")).toBeTruthy();
  expect(screen.getByRole("button", { name: "catalogReviewSubmit" })).toBeTruthy();
});

test("「審査に出す」は、その作品を審査に送り、出せたらそう出す", async () => {
  mockPostImage.mockRejectedValue(postError("POSTS_REVIEW_PENDING", "承認されるまで投稿できません"));
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: "pending" }) });
  renderModal();
  await submitPost();

  fireEvent.click(await screen.findByRole("button", { name: "catalogReviewSubmit" }));

  expect(await screen.findByText("catalogReviewSubmitted")).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/catalog-references/review",
    expect.objectContaining({ method: "POST", body: JSON.stringify({ imageId: IMAGE_ID }) }),
  );
  expect(screen.queryByRole("button", { name: "catalogReviewSubmit" })).toBeNull();
  expect(screen.queryByText("承認されるまで投稿できません")).toBeNull();
});

test.each([
  ["確認中", "CATALOG_REVIEW_ALREADY_SUBMITTED", "catalogReviewAlreadySubmitted"],
  ["公開できる", "CATALOG_REVIEW_ALREADY_APPROVED", "catalogReviewAlreadyApproved"],
  ["作り直しが必要", "CATALOG_REVIEW_REJECTED", "catalogReviewRejected"],
  ["見本が使えない", "CATALOG_REVIEW_REFERENCE_UNAVAILABLE", "catalogReviewReferenceUnavailable"],
])("押し直しても変わらない断り(%s)は、言語ごとの文言を出してボタンを消す", async (_label, errorCode, key) => {
  mockPostImage.mockRejectedValue(postError("POSTS_REVIEW_PENDING", "承認されるまで投稿できません"));
  fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "日本語の理由", errorCode }) });
  renderModal();
  await submitPost();

  fireEvent.click(await screen.findByRole("button", { name: "catalogReviewSubmit" }));

  expect(await screen.findByText(key)).toBeTruthy();
  expect(screen.queryByText("日本語の理由")).toBeNull();
  expect(screen.queryByRole("button", { name: "catalogReviewSubmit" })).toBeNull();
});

test.each([
  ["API が失敗した", () => fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "日本語の理由", errorCode: "CATALOG_REVIEW_SUBMIT_FAILED" }) })],
  ["通信が切れた", () => fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))],
])("それ以外の失敗(%s)は、決まった文言を出して、もう一度押せるようにする", async (_label, arrange) => {
  mockPostImage.mockRejectedValue(postError("POSTS_REVIEW_PENDING", "承認されるまで投稿できません"));
  arrange();
  renderModal();
  await submitPost();

  fireEvent.click(await screen.findByRole("button", { name: "catalogReviewSubmit" }));

  expect(await screen.findByText("catalogReviewSubmitFailed")).toBeTruthy();
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "catalogReviewSubmit" }) as HTMLButtonElement).disabled).toBe(false),
  );
});

test("審査の枠は、次に断られた理由に合わせて出し直す(ほかの理由なら消す)", async () => {
  mockPostImage.mockRejectedValueOnce(postError("POSTS_REVIEW_PENDING", "承認されるまで投稿できません"));
  renderModal();
  await submitPost();
  expect(await screen.findByTestId("catalog-review-submit")).toBeTruthy();

  mockPostImage.mockRejectedValueOnce(new Error("投稿に失敗しました"));
  await submitPost();

  expect(await screen.findByText("投稿に失敗しました")).toBeTruthy();
  expect(screen.queryByTestId("catalog-review-submit")).toBeNull();
});

test("ほかの理由で断られたときは「審査に出す」を出さない", async () => {
  mockPostImage.mockRejectedValue(new Error("投稿に失敗しました"));
  renderModal();

  await submitPost();

  expect(await screen.findByText("投稿に失敗しました")).toBeTruthy();
  expect(screen.queryByTestId("catalog-review-submit")).toBeNull();
});

test("投稿し直して同じ理由で断られたら、審査の枠を一から出し直す(前の失敗の文言を残さない)", async () => {
  mockPostImage.mockRejectedValue(postError("POSTS_REVIEW_PENDING", "承認されるまで投稿できません"));
  fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
  renderModal();
  await submitPost();
  fireEvent.click(await screen.findByRole("button", { name: "catalogReviewSubmit" }));
  expect(await screen.findByText("catalogReviewSubmitFailed")).toBeTruthy();

  await submitPost();

  await waitFor(() => expect(screen.queryByText("catalogReviewSubmitFailed")).toBeNull());
  expect(screen.getByRole("button", { name: "catalogReviewSubmit" })).toBeTruthy();
});
