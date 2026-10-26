/**
 * 企画の贈り物の画面の動き(動きを減らす設定でない人)。
 * 5回目で、ふくらむ → 光る → コインがあふれ出て落ちて消える → 数が 0 から額まで増える、まで通す。
 */

import { act, fireEvent, render, screen } from "@testing-library/react";

jest.mock("@/features/campaigns/lib/campaign-events", () => ({
  CAMPAIGN_EVENTS: { giftOpen: "campaign_gift_open", giftClaim: "campaign_gift_claim" },
  trackCampaignEvent: jest.fn(),
}));

import { CampaignGiftModal } from "@/features/campaigns/campaign-gift/components/CampaignGiftModal";
import type { CampaignGiftClaimResult } from "@/features/campaigns/campaign-gift/campaign-gift";

jest.setTimeout(20_000);

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  });
});

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function renderModal(signedIn = true) {
  const onClaim = jest.fn(async (): Promise<CampaignGiftClaimResult> => ({ status: "granted", amount: 200, expireAt: "2026-10-31T14:59:00.000Z" }));
  const onClose = jest.fn();
  const view = render(
    <CampaignGiftModal
      open
      onClose={onClose}
      signedIn={signedIn}
      amount={200}
      expireLabel="10月31日 23:59"
      expireShortLabel="10/31"
      onClaim={onClaim}
      loginHref="/login"
      worksHref="/campaigns/halloween-best-shot#hbs-works"
    />,
  );
  return { ...view, onClaim, onClose };
}

async function tapFive() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /プレゼント/ }));
    });
  }
}

async function runFor(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

test("タップのたびに大きくなり、ゆれの動きを付け直す", async () => {
  renderModal();
  const gift = screen.getByRole("button", { name: /プレゼント/ });
  await act(async () => {
    fireEvent.click(gift);
  });
  expect(gift.style.getPropertyValue("--s")).toBe("1.15");
  expect(gift.className).toMatch(/hit/);
  await act(async () => {
    fireEvent.click(gift);
  });
  expect(gift.style.getPropertyValue("--s")).toBe("1.3");
});

test("5回目で、ふくらんでから光り、コインがあふれ出て落ちて消え、数が200まで増える", async () => {
  renderModal();
  await tapFive();
  // ふくらんでいる間(受け取りの返事を待つ)
  expect(screen.getByText("開けています…")).toBeInTheDocument();
  await runFor(600);
  // コインは画面全体に重ねた所(body の直下)に出る
  const fx = document.body.querySelector("img[src='/percoin.png']")?.parentElement;
  expect(fx).not.toBeNull();
  expect(fx?.querySelectorAll("img").length).toBeGreaterThanOrEqual(32);
  await runFor(300);
  expect(fx?.querySelectorAll("img").length).toBeGreaterThanOrEqual(50);
  // 受け取った画面と、数が増えきったところ
  await runFor(2000);
  expect(screen.getByText(/^10\/31までの限定ペルコインGET！🪙\s+気に入ったカタログを生成して応援しよう‼️$/)).toBeInTheDocument();
  expect(screen.getByText("200")).toBeInTheDocument();
  // コインは落ちきって消える
  await runFor(3000);
  expect(fx?.querySelectorAll("img").length).toBe(0);
});

test("ログインしていない人も、同じ動きのあとに額を出す", async () => {
  const { onClaim } = renderModal(false);
  await tapFive();
  // 待ちのあとに次の動きが予約されるので、少しずつ進める
  for (let i = 0; i < 8; i++) await runFor(500);
  expect(onClaim).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "ログインして受け取る" })).toBeInTheDocument();
  expect(screen.getByText("200")).toBeInTheDocument();
});

test("動きの途中で閉じても(消えても)落ちない", async () => {
  const { unmount } = renderModal();
  await tapFive();
  await runFor(700);
  expect(() => unmount()).not.toThrow();
  await runFor(3000);
});
