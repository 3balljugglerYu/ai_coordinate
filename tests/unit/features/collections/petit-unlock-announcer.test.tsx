/**
 * PetitUnlockAnnouncer の preview 経路テスト。
 * announcement のヒーロー画像 path を公開 URL へ変換し、本文・配色とともに
 * 各モーダルへ受け渡すことを検証する(UnlockModals はモックして props を捕捉)。
 */

import { render, screen } from "@testing-library/react";
import type { CollectionUnlockAnnouncement } from "@/features/collections/lib/collection-unlock-announcement";

const initialSpy = jest.fn();
const dripSpy = jest.fn();

jest.mock("@/features/collections/components/UnlockModals", () => ({
  InitialUnlockModal: (props: unknown) => {
    initialSpy(props);
    return <div data-testid="initial-modal" />;
  },
  UnlockDripModal: (props: unknown) => {
    dripSpy(props);
    return <div data-testid="drip-modal" />;
  },
}));

import { PetitUnlockAnnouncer } from "@/features/collections/components/PetitUnlockAnnouncer";

const SUPABASE_URL = "https://proj.supabase.co";

function makeAnnouncement(
  overrides: Partial<CollectionUnlockAnnouncement> = {},
): CollectionUnlockAnnouncement {
  return {
    categoryKey: "petit",
    categoryDisplayName: "ぷち神",
    unlockedCount: 2,
    totalCount: 6,
    unlockedPresets: [
      { id: "p1", title: "A", thumbnailUrl: "https://x/a.png" },
      { id: "p2", title: "B", thumbnailUrl: "https://x/b.png" },
    ],
    prerequisiteKey: "god",
    prerequisiteAckCount: 0,
    heroImagePath: "heroes/petit/a.png",
    initialBody: "初回文",
    dripBody: "段階文",
    accentColor: "#123456",
    accentHoverColor: "#654321",
    titleColor: "#abcdef",
    softColor: "#fedcba",
    ...overrides,
  };
}

describe("PetitUnlockAnnouncer (preview)", () => {
  const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = original;
  });

  test("initial: hero path を公開URL化し本文・配色を渡す", () => {
    render(
      <PetitUnlockAnnouncer
        announcements={[makeAnnouncement()]}
        previewMode="initial"
      />,
    );
    expect(screen.getByTestId("initial-modal")).toBeInTheDocument();
    const props = initialSpy.mock.calls[0][0];
    expect(props.title).toBe("ぷち神");
    expect(props.heroImageUrl).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/generated-images/heroes/petit/a.png`,
    );
    expect(props.body).toBe("初回文");
    expect(props.colors).toEqual({
      accent: "#123456",
      accentHover: "#654321",
      title: "#abcdef",
      soft: "#fedcba",
    });
  });

  test("drip: 本文と配色を UnlockDripModal に渡す", () => {
    render(
      <PetitUnlockAnnouncer
        announcements={[makeAnnouncement()]}
        previewMode="drip"
      />,
    );
    expect(screen.getByTestId("drip-modal")).toBeInTheDocument();
    const props = dripSpy.mock.calls[0][0];
    expect(props.body).toBe("段階文");
    expect(props.colors.accent).toBe("#123456");
  });

  test("hero path が null なら heroImageUrl は null(固定画像にフォールバック委譲)", () => {
    render(
      <PetitUnlockAnnouncer
        announcements={[makeAnnouncement({ heroImagePath: null })]}
        previewMode="initial"
      />,
    );
    const props = initialSpy.mock.calls[0][0];
    expect(props.heroImageUrl).toBeNull();
  });
});
