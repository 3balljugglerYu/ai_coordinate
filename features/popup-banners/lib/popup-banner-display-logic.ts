import type {
  ActivePopupBanner,
  PopupBannerActionType,
  PopupBannerHistoryEntry,
  PopupBannerHistoryMap,
  PopupBannerViewRecord,
} from "./schema";

export const POPUP_BANNER_HISTORY_STORAGE_KEY = "popup-banner-history-v1";

export function buildPopupBannerHistoryMap(
  records: PopupBannerViewRecord[]
): PopupBannerHistoryMap {
  return records.reduce<PopupBannerHistoryMap>((accumulator, record) => {
    accumulator[record.popup_banner_id] = {
      actionType: record.action_type,
      permanentlyDismissed: record.permanently_dismissed,
      reshowAfter: record.reshow_after,
      updatedAt: record.updated_at,
    };
    return accumulator;
  }, {});
}

export function parsePopupBannerHistory(
  value: string | null | undefined
): PopupBannerHistoryMap {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as Record<string, PopupBannerHistoryEntry>;
    return Object.entries(parsed).reduce<PopupBannerHistoryMap>(
      (accumulator, [bannerId, entry]) => {
        if (!entry || typeof entry !== "object") {
          return accumulator;
        }

        accumulator[bannerId] = {
          actionType: normalizeActionType(entry.actionType),
          permanentlyDismissed: Boolean(entry.permanentlyDismissed),
          reshowAfter: typeof entry.reshowAfter === "string" ? entry.reshowAfter : null,
          updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : null,
        };
        return accumulator;
      },
      {}
    );
  } catch {
    return {};
  }
}

export function serializePopupBannerHistory(history: PopupBannerHistoryMap) {
  return JSON.stringify(history);
}

export function buildPopupBannerHistoryEntry(
  actionType: PopupBannerActionType
): PopupBannerHistoryEntry {
  const now = new Date().toISOString();
  if (actionType === "click") {
    return {
      actionType,
      permanentlyDismissed: false,
      reshowAfter: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: now,
    };
  }

  if (actionType === "close") {
    return {
      actionType,
      permanentlyDismissed: false,
      reshowAfter: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: now,
    };
  }

  return {
    actionType,
    permanentlyDismissed: actionType === "dismiss_forever",
    reshowAfter: null,
    updatedAt: now,
  };
}

export function selectNextPopupBanner(
  banners: ActivePopupBanner[],
  history: PopupBannerHistoryMap,
  now = new Date()
): ActivePopupBanner | null {
  const unseen: ActivePopupBanner[] = [];
  const readyToReshow: ActivePopupBanner[] = [];

  for (const banner of banners) {
    const record = history[banner.id];

    if (!record) {
      unseen.push(banner);
      continue;
    }

    if (record.permanentlyDismissed) {
      continue;
    }

    if (record.actionType === "impression") {
      continue;
    }

    if (!record.reshowAfter) {
      continue;
    }

    if (new Date(record.reshowAfter) <= now) {
      readyToReshow.push(banner);
    }
  }

  const sortByPriority = (left: ActivePopupBanner, right: ActivePopupBanner) =>
    left.displayOrder - right.displayOrder;

  if (unseen.length > 0) {
    return unseen.sort(sortByPriority)[0] ?? null;
  }

  if (readyToReshow.length > 0) {
    return readyToReshow.sort(sortByPriority)[0] ?? null;
  }

  return null;
}

function normalizeActionType(
  value: PopupBannerActionType | string | undefined
): PopupBannerActionType {
  if (
    value === "impression" ||
    value === "click" ||
    value === "close" ||
    value === "dismiss_forever"
  ) {
    return value;
  }

  return "impression";
}
