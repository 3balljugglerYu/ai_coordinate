/** @jest-environment node */

import type {
  ActivePopupBanner,
  PopupBannerHistoryEntry,
  PopupBannerViewRecord,
} from "@/features/popup-banners/lib/schema";
import {
  buildPopupBannerHistoryEntry,
  buildPopupBannerHistoryMap,
  parsePopupBannerHistory,
  selectNextPopupBanner,
} from "@/features/popup-banners/lib/popup-banner-display-logic";

function createBanner(
  id: string,
  displayOrder: number,
  overrides: Partial<ActivePopupBanner> = {}
): ActivePopupBanner {
  return {
    id,
    imageUrl: `https://cdn.example/${id}.webp`,
    linkUrl: null,
    alt: `banner-${id}`,
    showOnceOnly: false,
    displayOrder,
    ...overrides,
  };
}

describe("popup-banner-display-logic", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-26T00:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("buildPopupBannerHistoryMap_DBレコードをbannerIdキー履歴へ変換する", () => {
    // Spec: PBDL-001
    const records: PopupBannerViewRecord[] = [
      {
        popup_banner_id: "banner-a",
        action_type: "click",
        permanently_dismissed: false,
        reshow_after: "2026-03-29T00:00:00.000Z",
        updated_at: "2026-03-26T00:00:00.000Z",
      },
      {
        popup_banner_id: "banner-b",
        action_type: "dismiss_forever",
        permanently_dismissed: true,
        reshow_after: null,
        updated_at: "2026-03-25T10:00:00.000Z",
      },
    ];

    expect(buildPopupBannerHistoryMap(records)).toEqual({
      "banner-a": {
        actionType: "click",
        permanentlyDismissed: false,
        reshowAfter: "2026-03-29T00:00:00.000Z",
        updatedAt: "2026-03-26T00:00:00.000Z",
      },
      "banner-b": {
        actionType: "dismiss_forever",
        permanentlyDismissed: true,
        reshowAfter: null,
        updatedAt: "2026-03-25T10:00:00.000Z",
      },
    });
  });

  test("parsePopupBannerHistory_不正JSONは空履歴を返す", () => {
    // Spec: PBDL-002
    expect(parsePopupBannerHistory("{bad-json")).toEqual({});
  });

  test("parsePopupBannerHistory_未対応actionTypeはimpressionへ正規化する", () => {
    // Spec: PBDL-003
    const serialized = JSON.stringify({
      "banner-a": {
        actionType: "unexpected",
        permanentlyDismissed: 1,
        reshowAfter: "2026-03-30T00:00:00.000Z",
        updatedAt: "2026-03-26T00:00:00.000Z",
      },
    });

    expect(parsePopupBannerHistory(serialized)).toEqual({
      "banner-a": {
        actionType: "impression",
        permanentlyDismissed: true,
        reshowAfter: "2026-03-30T00:00:00.000Z",
        updatedAt: "2026-03-26T00:00:00.000Z",
      },
    });
  });

  test("buildPopupBannerHistoryEntry_clickは3日後再表示を設定する", () => {
    // Spec: PBDL-004
    expect(buildPopupBannerHistoryEntry("click")).toEqual({
      actionType: "click",
      permanentlyDismissed: false,
      reshowAfter: "2026-03-29T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z",
    });
  });

  test("buildPopupBannerHistoryEntry_closeは7日後再表示を設定する", () => {
    // Spec: PBDL-004
    expect(buildPopupBannerHistoryEntry("close")).toEqual({
      actionType: "close",
      permanentlyDismissed: false,
      reshowAfter: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z",
    });
  });

  test("buildPopupBannerHistoryEntry_dismiss_foreverは永久非表示を設定する", () => {
    // Spec: PBDL-005
    expect(buildPopupBannerHistoryEntry("dismiss_forever")).toEqual({
      actionType: "dismiss_forever",
      permanentlyDismissed: true,
      reshowAfter: null,
      updatedAt: "2026-03-26T00:00:00.000Z",
    });
  });

  test("buildPopupBannerHistoryEntry_impressionは再表示待ちを持たない", () => {
    // Spec: PBDL-005
    expect(buildPopupBannerHistoryEntry("impression")).toEqual({
      actionType: "impression",
      permanentlyDismissed: false,
      reshowAfter: null,
      updatedAt: "2026-03-26T00:00:00.000Z",
    });
  });

  test("selectNextPopupBanner_未表示がある場合_displayOrder最小の未表示を返す", () => {
    // Spec: PBDL-006
    const banners = [
      createBanner("banner-ready", 1),
      createBanner("banner-unseen-high", 5),
      createBanner("banner-unseen-low", 2),
    ];
    const history: Record<string, PopupBannerHistoryEntry> = {
      "banner-ready": {
        actionType: "close",
        permanentlyDismissed: false,
        reshowAfter: "2026-03-20T00:00:00.000Z",
        updatedAt: "2026-03-19T00:00:00.000Z",
      },
    };

    expect(selectNextPopupBanner(banners, history)).toEqual(
      createBanner("banner-unseen-low", 2)
    );
  });

  test("selectNextPopupBanner_未表示がない場合_再表示可能かつdisplayOrder最小を返す", () => {
    // Spec: PBDL-007
    const banners = [
      createBanner("banner-late", 9),
      createBanner("banner-soon", 3),
      createBanner("banner-hidden", 1),
    ];
    const history: Record<string, PopupBannerHistoryEntry> = {
      "banner-late": {
        actionType: "click",
        permanentlyDismissed: false,
        reshowAfter: "2026-03-25T23:00:00.000Z",
        updatedAt: "2026-03-22T00:00:00.000Z",
      },
      "banner-soon": {
        actionType: "close",
        permanentlyDismissed: false,
        reshowAfter: "2026-03-24T00:00:00.000Z",
        updatedAt: "2026-03-17T00:00:00.000Z",
      },
      "banner-hidden": {
        actionType: "close",
        permanentlyDismissed: false,
        reshowAfter: "2026-03-28T00:00:00.000Z",
        updatedAt: "2026-03-21T00:00:00.000Z",
      },
    };

    expect(selectNextPopupBanner(banners, history)).toEqual(
      createBanner("banner-soon", 3)
    );
  });

  test("selectNextPopupBanner_再表示不可の履歴しかない場合_nullを返す", () => {
    // Spec: PBDL-008
    const banners = [
      createBanner("banner-impression", 1),
      createBanner("banner-dismissed", 2),
      createBanner("banner-waiting", 3),
    ];
    const history: Record<string, PopupBannerHistoryEntry> = {
      "banner-impression": {
        actionType: "impression",
        permanentlyDismissed: false,
        reshowAfter: null,
        updatedAt: "2026-03-26T00:00:00.000Z",
      },
      "banner-dismissed": {
        actionType: "dismiss_forever",
        permanentlyDismissed: true,
        reshowAfter: null,
        updatedAt: "2026-03-25T00:00:00.000Z",
      },
      "banner-waiting": {
        actionType: "close",
        permanentlyDismissed: false,
        reshowAfter: "2026-03-27T00:00:00.000Z",
        updatedAt: "2026-03-20T00:00:00.000Z",
      },
    };

    expect(selectNextPopupBanner(banners, history)).toBeNull();
  });
});
