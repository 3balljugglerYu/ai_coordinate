/**
 * @jest-environment jsdom
 *
 * 投稿の画面(PostModal)で、見本(参照画像)を使った作品の審査に出す流れ。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 6)
 *
 * ここで守ること:
 *  - 審査が済んでいないために投稿を断られたら(POSTS_REVIEW_PENDING)、理由と「審査に出す」を出す
 *  - 「審査に出す」は、その作品を POST /api/catalog-references/review に送り、出せたらそう出す
 *  - 出せなければ、API の理由を出して、もう一度押せるようにする
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

test("出せなければ、API の理由を出して、もう一度押せるようにする", async () => {
  mockPostImage.mockRejectedValue(postError("POSTS_REVIEW_PENDING", "承認されるまで投稿できません"));
  fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "この作品はもう審査に出しています" }) });
  renderModal();
  await submitPost();

  fireEvent.click(await screen.findByRole("button", { name: "catalogReviewSubmit" }));

  expect(await screen.findByText("この作品はもう審査に出しています")).toBeTruthy();
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "catalogReviewSubmit" }) as HTMLButtonElement).disabled).toBe(false),
  );
});

test("ほかの理由で断られたときは「審査に出す」を出さない", async () => {
  mockPostImage.mockRejectedValue(new Error("投稿に失敗しました"));
  renderModal();

  await submitPost();

  expect(await screen.findByText("投稿に失敗しました")).toBeTruthy();
  expect(screen.queryByTestId("catalog-review-submit")).toBeNull();
});
