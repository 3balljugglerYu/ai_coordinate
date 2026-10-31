/**
 * @jest-environment jsdom
 *
 * 見本を使える人に最初の1回だけ出す「先行公開」の案内(CatalogReferenceIntro)。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md §10(第2案)
 *
 * ここで守ること:
 *  - 一度も同意したことが無く、まだ見ていない人にだけ出す(見た印は本人ごと)
 *  - 閉じても「ためしてみる」でも、本人の見た印を残す。「ためしてみる」は「イラストから」のタブへ移る
 *  - ほかのタブで見たら、このタブでも閉じる
 */

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CatalogReferenceIntro } from "@/features/catalog-references/components/CatalogReferenceIntro";

const USER_ID = "user-1";
const INTRO_SEEN_KEY = `persta:catalog-reference-intro-seen-v1:${USER_ID}`;
const introSheet = () => screen.queryByTestId("catalog-reference-intro-sheet");

afterEach(() => {
  window.localStorage.clear();
});

function renderIntro(props: Partial<React.ComponentProps<typeof CatalogReferenceIntro>> = {}) {
  const onTry = jest.fn();
  render(<CatalogReferenceIntro userId={USER_ID} consentedBefore={false} onTry={onTry} {...props} />);
  return { onTry };
}

test("一度も同意したことが無く、まだ見ていない人に出す。「ためしてみる」で本人の印を残し、「イラストから」へ移る", async () => {
  const { onTry } = renderIntro();

  expect(introSheet()).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "catalogReferenceIntroTry" }));

  await waitFor(() => expect(introSheet()).toBeNull());
  expect(window.localStorage.getItem(INTRO_SEEN_KEY)).toBe("1");
  expect(onTry).toHaveBeenCalledTimes(1);
});

test("閉じるボタンで閉じても本人の印を残す(タブは移らない)", async () => {
  const { onTry } = renderIntro();

  fireEvent.click(screen.getByRole("button", { name: "catalogReferenceSheetClose" }));

  await waitFor(() => expect(introSheet()).toBeNull());
  expect(window.localStorage.getItem(INTRO_SEEN_KEY)).toBe("1");
  expect(onTry).not.toHaveBeenCalled();
});

test("見た印は本人ごと(同じ端末のほかの人の印では出しやめない)", () => {
  window.localStorage.setItem("persta:catalog-reference-intro-seen-v1:someone-else", "1");
  renderIntro();

  expect(introSheet()).toBeTruthy();
});

test("一度見た人には出さない", () => {
  window.localStorage.setItem(INTRO_SEEN_KEY, "1");
  renderIntro();

  expect(introSheet()).toBeNull();
});

test("ほかのタブで見たら、このタブでも閉じる", async () => {
  renderIntro();
  expect(introSheet()).toBeTruthy();

  act(() => {
    window.localStorage.setItem(INTRO_SEEN_KEY, "1");
    window.dispatchEvent(new StorageEvent("storage", { key: INTRO_SEEN_KEY, newValue: "1" }));
  });

  await waitFor(() => expect(introSheet()).toBeNull());
});

test("一度でも同意した人には出さない(作り直しで同意が無効になっていても)", () => {
  renderIntro({ consentedBefore: true });

  expect(introSheet()).toBeNull();
});
