import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { PostDetailStatic } from "@/features/posts/components/PostDetailStatic";
import type { Post } from "@/features/posts/types";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  // next/image 固有の props (fill / priority など) は DOM に渡すと警告になるので落とす
  default: ({
    alt,
    src,
  }: {
    alt?: string;
    src?: string;
  }) => React.createElement("img", { alt, src }),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href }, children),
}));

const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const copyTextToClipboardMock = jest.fn().mockResolvedValue(undefined);
jest.mock("@/features/posts/lib/copy-to-clipboard", () => ({
  copyTextToClipboard: (...args: unknown[]) => copyTextToClipboardMock(...args),
}));

jest.mock("@/features/posts/lib/utils", () => ({
  getPostImageUrl: () => "https://cdn.example/post.png",
  getPostBeforeImageUrl: () => null,
}));

jest.mock("@/features/posts/components/PostDetailStatsContent", () => ({
  PostDetailStatsContent: () => <div data-testid="stats" />,
}));

jest.mock("@/features/posts/components/PostDetailStatsSkeleton", () => ({
  PostDetailStatsSkeleton: () => null,
}));

jest.mock("@/features/posts/components/PostMetaLine", () => ({
  PostMetaLine: () => null,
}));

jest.mock("@/features/posts/components/CollapsibleText", () => ({
  CollapsibleText: ({ text }: { text: string }) => <div>{text}</div>,
}));

jest.mock("@/features/posts/components/ImageFullscreen", () => ({
  ImageFullscreen: () => null,
}));

jest.mock("@/features/posts/components/EditPostModal", () => ({
  EditPostModal: () => null,
}));

jest.mock("@/features/posts/components/DeletePostDialog", () => ({
  DeletePostDialog: () => null,
}));

jest.mock("@/features/posts/components/PostModal", () => ({
  PostModal: () => null,
}));

jest.mock("@/features/moderation/components/PostModerationMenu", () => ({
  PostModerationMenu: () => null,
}));

jest.mock("@/features/style/components/OneTapStyleDetailCard", () => ({
  OneTapStyleDetailCard: () => null,
}));

jest.mock("@/features/subscription/components/SubscriptionBadge", () => ({
  SubscriptionBadge: () => null,
}));

// 参照カードの生成シートは vaul と生成フォーム一式を抱えるため差し替える
jest.mock(
  "@/features/generation/components/PromptLockedGenerationSheet",
  () => ({
    PromptLockedGenerationSheet: () => null,
  })
);

jest.mock("@/features/users/components/FollowButton", () => ({
  FollowButton: ({
    userId,
    onFollowChange,
  }: {
    userId: string;
    onFollowChange?: (isFollowing: boolean) => void;
  }) => (
    <button
      type="button"
      data-testid="follow-button"
      data-user-id={userId}
      onClick={() => onFollowChange?.(true)}
    />
  ),
}));

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;

/** 文言はキーをそのまま返す。表示の有無だけを検査する。 */
const passthroughTranslator = ((key: string) =>
  key) as unknown as ReturnType<typeof useTranslations>;


const AUTHOR_ID = "author-1";
const VIEWER_ID = "viewer-1";
const PROMPT = "秘密のプロンプト";

const useTranslationsMock2 = useTranslationsMock;

function createPost(overrides: Partial<Post> = {}): Post {
  return {
    id: "img-1",
    user_id: AUTHOR_ID,
    image_url: "https://cdn.example/post.png",
    storage_path: "path",
    prompt: PROMPT,
    is_posted: true,
    caption: null,
    generation_type: "coordinate",
    user: {
      id: AUTHOR_ID,
      nickname: "作者",
      avatar_url: null,
      subscription_plan: "free",
    },
    ...overrides,
  } as Post;
}

function renderStatic(post: Post, opts: { currentUserId?: string | null } = {}) {
  return render(
    <PostDetailStatic
      post={post}
      currentUserId={
        opts.currentUserId === undefined ? VIEWER_ID : opts.currentUserId
      }
      imageAspectRatio={null}
      postId={post.id ?? ""}
      initialLikeCount={0}
      initialCommentCount={0}
      initialViewCount={0}
      ownerId={post.user_id}
      imageUrl="https://cdn.example/post.png"
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useTranslationsMock2.mockReturnValue(passthroughTranslator);
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ isFollowing: false }),
  }) as never;
});

/**
 * 本番で使われるのは PostDetailStatic（CachedPostDetail → PostDetailContent →
 * PostDetailStatic）。双子だった PostDetail は使われていなかったので #628 で消した。
 * そのとき一緒に消えた 21 件のうち、実画面の正しさに効くものをこちらへ移す。
 */
describe("PostDetailStatic の表示名", () => {
  it("nickname があればそれを出す", async () => {
    await act(async () => {
      renderStatic(createPost());
    });
    expect(screen.getByText("作者")).toBeInTheDocument();
  });

  it("nickname が無ければ email のローカル部を出す", async () => {
    await act(async () => {
      renderStatic(
        createPost({
          user: { id: AUTHOR_ID, email: "someone@example.com" },
        } as Partial<Post>),
      );
    });
    // ⭐ ドメインは出さない（メールアドレスが露出しないこと）
    expect(screen.getByText("someone")).toBeInTheDocument();
    expect(screen.queryByText(/example\.com/)).not.toBeInTheDocument();
  });

  it("nickname も email も無ければ id の先頭8文字を出す", async () => {
    await act(async () => {
      renderStatic(
        createPost({ user: { id: "abcdefghijklmn" } } as Partial<Post>),
      );
    });
    expect(screen.getByText("abcdefgh")).toBeInTheDocument();
  });

  it("ユーザー情報が無ければ匿名扱いにする", async () => {
    await act(async () => {
      renderStatic(createPost({ user: null } as Partial<Post>));
    });
    expect(screen.getByText("anonymousUser")).toBeInTheDocument();
  });
});

describe("PostDetailStatic のプロンプト表示", () => {
  it("⭐他人の投稿を未フォローで見ると伏字になる", async () => {
    await act(async () => {
      renderStatic(createPost());
    });
    // 本文がそのまま出てはいけない
    expect(screen.queryByText(PROMPT)).not.toBeInTheDocument();
    expect(screen.getByText("*".repeat(PROMPT.length))).toBeInTheDocument();
  });

  it("本人の投稿なら平文で出る", async () => {
    await act(async () => {
      renderStatic(createPost(), { currentUserId: AUTHOR_ID });
    });
    expect(screen.getByText(PROMPT)).toBeInTheDocument();
  });
});

describe("PostDetailStatic のプロンプトのコピー", () => {
  it("⭐閲覧できない相手にはコピーさせず、フォローを促す", async () => {
    await act(async () => {
      renderStatic(createPost());
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    });

    expect(copyTextToClipboardMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "followRequiredTitle" }),
    );
  });

  it("本人ならコピーできる", async () => {
    await act(async () => {
      renderStatic(createPost(), { currentUserId: AUTHOR_ID });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    });

    expect(copyTextToClipboardMock).toHaveBeenCalledWith(PROMPT);
  });
});
