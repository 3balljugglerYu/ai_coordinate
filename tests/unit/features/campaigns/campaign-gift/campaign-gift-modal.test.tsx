/**
 * 企画の贈り物の画面。5回タップで開け、ログインしている人だけ受け取りを1回呼ぶ。
 * 動きを減らす設定にして、待ち時間なしで確かめる。
 */

import { act, fireEvent, render, screen } from "@testing-library/react";

const mockTrack = jest.fn();
jest.mock("@/features/campaigns/lib/campaign-events", () => ({
  CAMPAIGN_EVENTS: {
    giftOpen: "campaign_gift_open",
    giftClaim: "campaign_gift_claim",
    giftLogin: "campaign_gift_login",
    giftWorks: "campaign_gift_works",
  },
  trackCampaignEvent: (name: string) => mockTrack(name),
}));

import { CampaignGiftModal } from "@/features/campaigns/campaign-gift/components/CampaignGiftModal";
import type { CampaignGiftClaimResult } from "@/features/campaigns/campaign-gift/campaign-gift";

// 5回のタップを1回ずつ待つので、テスト全体を流して重いときは5秒を超えることがある
jest.setTimeout(20_000);

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: query.includes("reduce"), addEventListener() {}, removeEventListener() {} }),
  });
});

function renderModal(overrides: Partial<React.ComponentProps<typeof CampaignGiftModal>> = {}) {
  const onClaim = jest.fn(async (): Promise<CampaignGiftClaimResult> => ({ status: "granted", amount: 200, expireAt: "2026-10-31T14:59:00.000Z" }));
  const onClose = jest.fn();
  const onClaimed = jest.fn();
  render(
    <CampaignGiftModal
      open
      onClose={onClose}
      signedIn
      amount={200}
      expireLabel="10月31日 23:59"
      expireShortLabel="10/31"
      onClaim={onClaim}
      onClaimed={onClaimed}
      loginHref="/login?next=%2Fja"
      worksHref="/campaigns/halloween-best-shot#hbs-works"
      {...overrides}
    />,
  );
  return { onClaim: (overrides.onClaim as jest.Mock | undefined) ?? onClaim, onClose, onClaimed };
}

async function tap(times: number) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /プレゼント/ }));
    });
  }
}

test("開ける前は、中身(ペルコイン)を書かない", () => {
  renderModal();
  expect(screen.getByText("🎃ハロウィン ギフト🦇")).toBeInTheDocument();
  expect(screen.getByText("公式からの贈り物！")).toBeInTheDocument();
  expect(screen.getByText("タップして開けてね（あと5回）")).toBeInTheDocument();
  expect(document.body.textContent).not.toContain("ペルコイン");
});

test("4回では受け取らず、5回目で受け取りを1回だけ呼び、額と期限を出す", async () => {
  const { onClaim, onClaimed } = renderModal();
  await tap(4);
  expect(onClaim).not.toHaveBeenCalled();
  expect(screen.getByText("タップして開けてね（あと1回）")).toBeInTheDocument();
  await tap(1);
  expect(onClaim).toHaveBeenCalledTimes(1);
  expect(onClaimed).toHaveBeenCalledTimes(1);
  expect(await screen.findByText(/^10\/31までの限定ペルコインGET！🪙\s+気に入ったカタログを生成して応援しよう‼️$/)).toBeInTheDocument();
  expect(screen.getByText("ハロウィン限定・10月31日 23:59 まで")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "対象作品を見る" })).toHaveAttribute("href", "/campaigns/halloween-best-shot#hbs-works");
  // 開けたあとにタップしても、もう呼ばない
  await tap(1);
  expect(onClaim).toHaveBeenCalledTimes(1);
});

test("ログインしていない人は、受け取りを呼ばず、5回目のあと「ログインして受け取る」を出す", async () => {
  const { onClaim } = renderModal({ signedIn: false });
  await tap(5);
  expect(onClaim).not.toHaveBeenCalled();
  expect(await screen.findByRole("link", { name: "ログインして受け取る" })).toHaveAttribute("href", "/login?next=%2Fja");
  expect(screen.getByText(/^ログインして、10\/31までの限定ペルコインをGET！🪙\s+気に入ったカタログを生成して応援しよう‼️$/)).toBeInTheDocument();
});

test("もう受け取っていたら、その旨を出す(コインは出さない)", async () => {
  const onClaim = jest.fn(async (): Promise<CampaignGiftClaimResult> => ({ status: "already_claimed" }));
  const { onClaimed } = renderModal({ onClaim });
  await tap(5);
  expect(await screen.findByText(/この贈り物は、もう受け取っています。/)).toBeInTheDocument();
  expect(onClaimed).not.toHaveBeenCalled();
  expect(screen.queryByText(/限定ペルコインGET！/)).toBeNull();
});

test("受け付けが終わっていたら、その旨を出す", async () => {
  renderModal({ onClaim: jest.fn(async (): Promise<CampaignGiftClaimResult> => ({ status: "closed" })) });
  await tap(5);
  expect(await screen.findByText("この贈り物の受け付けは、終わりました。")).toBeInTheDocument();
});

test("受け取れなかったら、もう一度受け取れる", async () => {
  const onClaim = jest
    .fn<Promise<CampaignGiftClaimResult>, []>()
    .mockResolvedValueOnce({ status: "error" })
    .mockResolvedValueOnce({ status: "granted", amount: 200, expireAt: "2026-10-31T14:59:00.000Z" });
  renderModal({ onClaim });
  await tap(5);
  const retry = await screen.findByRole("button", { name: "もう一度受け取る" });
  await act(async () => {
    fireEvent.click(retry);
  });
  expect(onClaim).toHaveBeenCalledTimes(2);
  expect(await screen.findByText(/10\/31までの限定ペルコインGET！/)).toBeInTheDocument();
});

test("受け取りが投げても、画面は落ちずに、もう一度受け取れるにする", async () => {
  renderModal({
    onClaim: jest.fn(async () => {
      throw new Error("network");
    }),
  });
  await tap(5);
  expect(await screen.findByRole("button", { name: "もう一度受け取る" })).toBeInTheDocument();
});

test("「あとで」で閉じ、閉じたことを覚える", async () => {
  const { onClose } = renderModal();
  fireEvent.click(screen.getByRole("button", { name: "あとで" }));
  expect(onClose).toHaveBeenCalledWith(true);
});

test("受け取れなかったまま閉じたら、閉じたことを覚えない(次にもう一度出る)", async () => {
  const { onClose } = renderModal({ onClaim: jest.fn(async (): Promise<CampaignGiftClaimResult> => ({ status: "error" })) });
  await tap(5);
  await screen.findByRole("button", { name: "もう一度受け取る" });
  // 右上の × と、下の「閉じる」は同じ動き。下のほうを押す
  fireEvent.click(screen.getAllByRole("button", { name: "閉じる" }).at(-1)!);
  expect(onClose).toHaveBeenCalledWith(false);
});

test("受け取ったあとに閉じたら、閉じたことを覚える", async () => {
  const { onClose } = renderModal();
  await tap(5);
  await screen.findByText(/10\/31までの限定ペルコインGET！/);
  // 右上の × と、下の「閉じる」は同じ動き。下のほうを押す
  fireEvent.click(screen.getAllByRole("button", { name: "閉じる" }).at(-1)!);
  expect(onClose).toHaveBeenCalledWith(true);
});

test("サーバーでログインが切れていたら、「ログインし直して受け取る」を出す(覚えない)", async () => {
  const { onClose } = renderModal({ onClaim: jest.fn(async (): Promise<CampaignGiftClaimResult> => ({ status: "auth_required" })) });
  await tap(5);
  const link = await screen.findByRole("link", { name: "ログインし直して受け取る" });
  expect(link).toHaveAttribute("href", "/login?next=%2Fja");
  fireEvent.click(link);
  expect(onClose).toHaveBeenCalledWith(false);
});

test("「開けた」は5回目のタップで1回だけ数える(もう一度受け取るでは数えない)", async () => {
  mockTrack.mockClear();
  const onClaim = jest
    .fn<Promise<CampaignGiftClaimResult>, []>()
    .mockResolvedValueOnce({ status: "error" })
    .mockResolvedValueOnce({ status: "granted", amount: 200, expireAt: "2026-10-31T14:59:00.000Z" });
  renderModal({ onClaim });
  await tap(5);
  await act(async () => {
    fireEvent.click(await screen.findByRole("button", { name: "もう一度受け取る" }));
  });
  await screen.findByText(/10\/31までの限定ペルコインGET！/);
  expect(mockTrack.mock.calls.filter((c) => c[0] === "campaign_gift_open")).toHaveLength(1);
  expect(mockTrack.mock.calls.filter((c) => c[0] === "campaign_gift_claim")).toHaveLength(1);
});

test("受け取りの途中は閉じない", async () => {
  let resolveClaim: (value: CampaignGiftClaimResult) => void = () => {};
  const onClaim = jest.fn(() => new Promise<CampaignGiftClaimResult>((resolve) => (resolveClaim = resolve)));
  const { onClose } = renderModal({ onClaim });
  await tap(5);
  fireEvent.click(screen.getAllByRole("button", { name: "閉じる" }).at(-1)!);
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => {
    resolveClaim({ status: "granted", amount: 200, expireAt: "2026-10-31T14:59:00.000Z" });
  });
  expect(await screen.findByText(/10\/31までの限定ペルコインGET！/)).toBeInTheDocument();
});

