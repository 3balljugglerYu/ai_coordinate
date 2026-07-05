/** @jest-environment jsdom */

/**
 * PostCard の viewable インプレッション計測(可視50%×1秒)の回帰テスト。
 * (docs/planning/post-impressions-implementation-plan.md EARS-01, ADR-003)
 *
 * - inView(50%)が1秒継続したときだけ queuePostImpression が呼ばれる
 * - 1秒未満で画面外に出たらキャンセル(高速スクロールは数えない)
 * - trackImpressions=false / フラグOFF では計測しない(マウントでは数えない)
 */

import { act, render } from "@testing-library/react";
import type { Post } from "@/features/posts/types";

const queueSpy = jest.fn();
let mockInView = false;
const useInViewSpy = jest.fn();

jest.mock("react-intersection-observer", () => ({
  useInView: (options: unknown) => {
    useInViewSpy(options);
    return { ref: jest.fn(), inView: mockInView };
  },
}));

jest.mock("@/features/posts/lib/impressions-client", () => ({
  queuePostImpression: (...args: unknown[]) => queueSpy(...args),
}));

jest.mock("@/lib/env", () => ({
  isPostImpressionsEnabled: jest.fn(() => true),
}));

jest.mock("next-intl", () => ({
  useLocale: () => "ja",
  useTranslations: () => (key: string) => key,
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { src: string; alt: string }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={props.src} alt={props.alt} />;
  },
}));

jest.mock("@/features/posts/components/PostCardLikeButton", () => ({
  PostCardLikeButton: () => <div data-testid="like-button" />,
}));

jest.mock("@/features/moderation/components/PostModerationMenu", () => ({
  PostModerationMenu: () => <div data-testid="moderation-menu" />,
}));

import { PostCard } from "@/features/posts/components/PostCard";
import { isPostImpressionsEnabled } from "@/lib/env";

const mockFlag = isPostImpressionsEnabled as jest.MockedFunction<
  typeof isPostImpressionsEnabled
>;

const POST_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makePost(): Post {
  return {
    id: POST_ID,
    user_id: "user-1",
    image_url: "https://example.com/image.png",
    storage_path: "user-1/image.png",
    prompt: "",
    is_posted: true,
    view_count: 10,
    impression_count: 20,
  } as Post;
}

describe("PostCard の viewable 計測", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockFlag.mockReturnValue(true);
    mockInView = false;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("inViewが1秒継続したら queuePostImpression が1回呼ばれる", () => {
    mockInView = true;
    render(<PostCard post={makePost()} trackImpressions />);

    // マウント直後(1秒未満)では数えない
    act(() => {
      jest.advanceTimersByTime(999);
    });
    expect(queueSpy).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(queueSpy).toHaveBeenCalledTimes(1);
    expect(queueSpy).toHaveBeenCalledWith(POST_ID);
  });

  it("1秒未満で画面外に出たらキャンセルされる(高速スクロール)", () => {
    mockInView = true;
    const { rerender } = render(<PostCard post={makePost()} trackImpressions />);

    act(() => {
      jest.advanceTimersByTime(500);
    });
    // 画面外へ(inView=false で再レンダー) → クリーンアップでタイマー破棄
    mockInView = false;
    rerender(<PostCard post={makePost()} trackImpressions />);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(queueSpy).not.toHaveBeenCalled();
  });

  it("trackImpressions=false では計測しない(useInView も skip)", () => {
    mockInView = true;
    render(<PostCard post={makePost()} />);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(queueSpy).not.toHaveBeenCalled();
    expect(useInViewSpy).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
  });

  it("フラグOFFでは trackImpressions=true でも計測しない", () => {
    mockFlag.mockReturnValue(false);
    mockInView = true;
    render(<PostCard post={makePost()} trackImpressions />);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(queueSpy).not.toHaveBeenCalled();
  });
});
