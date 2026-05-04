/** @jest-environment jsdom */

import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { PostDetail } from "@/features/posts/components/PostDetail";
import type { Post } from "@/features/posts/types";

const mockToast = jest.fn();
const mockGetPostImageUrl = jest.fn(() => "https://cdn.example/post.png");
const refreshMock = jest.fn();

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt} />
  ),
}));

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock("@/features/posts/lib/utils", () => ({
  getPostImageUrl: (...args: unknown[]) => mockGetPostImageUrl(...args),
  getPostBeforeImageUrl: () => null,
}));

jest.mock("@/features/posts/components/CollapsibleText", () => ({
  CollapsibleText: ({ text }: { text: string }) => (
    <span data-testid="collapsible-text">{text}</span>
  ),
}));

jest.mock("@/features/posts/components/ImageFullscreen", () => ({
  ImageFullscreen: ({
    isOpen,
  }: {
    isOpen: boolean;
  }) => <div data-testid={isOpen ? "fullscreen-open" : "fullscreen-closed"} />,
}));

jest.mock("@/features/posts/components/EditPostModal", () => ({
  EditPostModal: () => <div data-testid="edit-post-modal" />,
}));

jest.mock("@/features/posts/components/DeletePostDialog", () => ({
  DeletePostDialog: () => <div data-testid="delete-post-dialog" />,
}));

jest.mock("@/features/posts/components/PostModal", () => ({
  PostModal: ({ imageId }: { imageId: string }) => (
    <div data-testid="post-modal" data-image-id={imageId} />
  ),
}));

jest.mock("@/features/posts/components/PostActions", () => ({
  PostActions: ({
    initialCommentCount,
  }: {
    initialCommentCount: number;
  }) => (
    <div
      data-testid="post-actions"
      data-comment-count={String(initialCommentCount)}
    />
  ),
}));

jest.mock("@/features/posts/components/CommentInput", () => ({
  CommentInput: ({
    onCommentAdded,
  }: {
    onCommentAdded?: () => void;
  }) => (
    <button
      type="button"
      data-testid="comment-input-add"
      onClick={() => onCommentAdded?.()}
    >
      add-comment
    </button>
  ),
}));

jest.mock("@/features/posts/components/CommentList", () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual("react");
  return {
    CommentList: forwardRef(
      (
        { onCommentAdded }: { onCommentAdded?: () => void },
        ref: React.Ref<{ refresh: () => void }>,
      ) => {
        useImperativeHandle(ref, () => ({
          refresh: refreshMock,
        }));
        return (
          <button
            type="button"
            data-testid="comment-list-remove"
            onClick={() => onCommentAdded?.()}
          >
            remove-comment
          </button>
        );
      },
    ),
  };
});

jest.mock("@/features/users/components/FollowButton", () => ({
  FollowButton: ({ userId }: { userId: string }) => (
    <div data-testid="follow-button" data-user-id={userId} />
  ),
}));

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-menu">{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;
const useRouterMock = useRouter as jest.MockedFunction<typeof useRouter>;

const routerPushMock = jest.fn();

const messages: Record<string, Record<string, string>> = {
  posts: {
  anonymousUser: "Anonymous",
  postImageAlt: "Post image",
  noImage: "No image",
  prompt: "Prompt",
  copy: "Copy",
  copied: "Copied",
  followRequiredTitle: "Follow required",
  followRequiredDescription: "Follow the author to copy",
  copySuccessTitle: "Copied",
  copySuccessDescription: "Prompt copied",
  copyFailureTitle: "Copy failed",
  copyFailureDescription: "Could not copy",
  postSubmit: "Submit post",
  edit: "Edit",
  unpost: "Unpost",
  },
  style: {
    detailPresetLabel: "Generated with One-Tap Style",
    detailPresetCardAlt: "{name} style card",
    detailReuseConfirmTitle: "Use this outfit?",
    detailReuseConfirmDescription:
      "Selecting yes will open One-Tap Style with this card preselected.",
    detailReuseConfirmCancel: "Cancel",
    detailReuseConfirmAction: "Yes",
  },
};

function translate(
  namespace: string | undefined,
  key: string,
  values?: Record<string, string | number>
) {
  if (!namespace) return key;

  const template = messages[namespace]?.[key] ?? key;
  if (!values) {
    return template;
  }

  return Object.entries(values).reduce((message, [token, value]) => {
    return message.replace(`{${token}}`, String(value));
  }, template);
}

function createPost(overrides: Partial<Post> = {}): Post {
  return {
    id: "img-1",
    user_id: "owner-1",
    image_url: "https://img/full",
    storage_path: "path",
    prompt: "secret prompt text",
    is_posted: true,
    caption: null,
    like_count: 0,
    comment_count: 2,
    view_count: 0,
    user: {
      id: "owner-1",
      email: "author@example.com",
    },
    ...overrides,
  } as Post;
}

describe("PostDetail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostImageUrl.mockReturnValue("https://cdn.example/post.png");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ isFollowing: false }),
    });
    useRouterMock.mockReturnValue({
      push: routerPushMock,
      refresh: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>);
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
    useTranslationsMock.mockImplementation((namespace?: string) => {
      return ((
        key: string,
        values?: Record<string, string | number>
      ) => translate(namespace, key, values)) as ReturnType<typeof useTranslations>;
    });

    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 1200;
      naturalHeight = 800;
      src = "";
      complete = true;
    }
    global.Image = MockImage as unknown as typeof Image;
  });

  test("表示_emailがある場合_ローカル部を名前にする", async () => {
    // Spec: POSTDET-001
    const post = createPost({
      user: { id: "owner-1", email: "hello@world.jp" },
    });
    await act(async () => {
      render(<PostDetail post={post} currentUserId="viewer-1" />);
    });
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  test("表示_idのみの場合_先頭8文字を表示する", async () => {
    // Spec: POSTDET-002
    const post = createPost({
      user: { id: "abcdefghxyz", email: undefined },
    });
    await act(async () => {
      render(<PostDetail post={post} currentUserId="viewer-1" />);
    });
    expect(screen.getByText("abcdefgh")).toBeInTheDocument();
  });

  test("表示_ユーザー識別なしの場合_匿名表示する", async () => {
    // Spec: POSTDET-003
    const post = createPost({
      user: { id: "", email: undefined },
    });
    await act(async () => {
      render(<PostDetail post={post} currentUserId="viewer-1" />);
    });
    expect(screen.getByText("Anonymous")).toBeInTheDocument();
  });

  test("フォロー状態_オーナーまたはID欠落の場合_fetchをスキップする", async () => {
    // Spec: POSTDET-004
    const post = createPost();
    await act(async () => {
      render(<PostDetail post={post} currentUserId="owner-1" />);
    });
    expect(global.fetch).not.toHaveBeenCalled();
    cleanup();

    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;
    jest.clearAllMocks();
    await act(async () => {
      render(<PostDetail post={post} />);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    cleanup();

    const fetchSpyNoTarget = jest.fn();
    global.fetch = fetchSpyNoTarget;
    await act(async () => {
      render(
        <PostDetail
          post={createPost({ user: null, user_id: null })}
          currentUserId="viewer-x"
        />,
      );
    });
    expect(fetchSpyNoTarget).not.toHaveBeenCalled();
  });

  test("フォロー状態_200の場合_JSONでフォロー状態を設定する", async () => {
    // Spec: POSTDET-005
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ isFollowing: true }),
    });
    const post = createPost({ prompt: "p" });
    await act(async () => {
      render(<PostDetail post={post} currentUserId="viewer-1" />);
    });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/users/owner-1/follow-status",
      );
    });
    const collapsibles = screen.getAllByTestId("collapsible-text");
    const promptText = collapsibles[collapsibles.length - 1].textContent;
    expect(promptText).toBe("p");
  });

  test("フォロー状態_非OKまたは例外の場合_フォロー偽にする", async () => {
    // Spec: POSTDET-006
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });
    const post = createPost({ prompt: "hidden" });
    await act(async () => {
      render(<PostDetail post={post} currentUserId="viewer-1" />);
    });
    await waitFor(() => {
      expect(screen.getByText("*".repeat("hidden".length))).toBeInTheDocument();
    });

    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network"));
    await act(async () => {
      render(<PostDetail post={createPost({ prompt: "x" })} currentUserId="v2" />);
    });
    await waitFor(() => {
      expect(screen.getByText("*")).toBeInTheDocument();
    });
  });

  test("表示_プロンプト閲覧不可の間_マスク表示する", async () => {
    // Spec: POSTDET-007
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ isFollowing: false }),
    });
    const post = createPost({ prompt: "abc" });
    await act(async () => {
      render(<PostDetail post={post} currentUserId="viewer-1" />);
    });
    await waitFor(() => {
      expect(screen.getByText("***")).toBeInTheDocument();
    });
  });

  test("表示_プロンプト閲覧可の間_平文を表示する", async () => {
    // Spec: POSTDET-008
    const post = createPost({ prompt: "plain here" });
    await act(async () => {
      render(<PostDetail post={post} currentUserId="owner-1" />);
    });
    expect(screen.getByText("plain here")).toBeInTheDocument();
  });

  test("コピー_閲覧不可の場合_フォロー必須toast", async () => {
    // Spec: POSTDET-009
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ isFollowing: false }),
    });
    const post = createPost({ prompt: "secret" });
    await act(async () => {
      render(<PostDetail post={post} currentUserId="viewer-1" />);
    });
    await waitFor(() => screen.getByRole("button", { name: /Copy/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Copy/i }));
    });
    expect(mockToast).toHaveBeenCalledWith({
      title: "Follow required",
      description: "Follow the author to copy",
    });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  test("コピー_クリップボード成功の場合_成功toast", async () => {
    // Spec: POSTDET-010
    const post = createPost({ prompt: "copy me" });
    await act(async () => {
      render(<PostDetail post={post} currentUserId="owner-1" />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Copy/i }));
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("copy me");
    expect(mockToast).toHaveBeenCalledWith({
      title: "Copied",
      description: "Prompt copied",
    });
  });

  test("コピー_クリップボード失敗の場合_destructive toast", async () => {
    // Spec: POSTDET-011
    (navigator.clipboard.writeText as jest.Mock).mockRejectedValueOnce(
      new Error("denied"),
    );
    const post = createPost({ prompt: "x" });
    await act(async () => {
      render(<PostDetail post={post} currentUserId="owner-1" />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Copy/i }));
    });
    expect(mockToast).toHaveBeenCalledWith({
      title: "Copy failed",
      description: "Could not copy",
      variant: "destructive",
    });
  });

  test("表示_オーナーの場合_投稿状態に応じたメニュー", async () => {
    // Spec: POSTDET-012
    const unposted = createPost({ is_posted: false });
    await act(async () => {
      render(<PostDetail post={unposted} currentUserId="owner-1" />);
    });
    expect(screen.getByRole("button", { name: /Submit post/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /削除/i })).toBeInTheDocument();

    const posted = createPost({ is_posted: true });
    await act(async () => {
      render(<PostDetail post={posted} currentUserId="owner-1" />);
    });
    expect(screen.getByRole("button", { name: /Edit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Unpost/i })).toBeInTheDocument();
  });

  test("表示_オーナー以外でフォロー対象あり_FollowButtonを出す", async () => {
    // Spec: POSTDET-013
    const post = createPost();
    await act(async () => {
      render(<PostDetail post={post} currentUserId="viewer-1" />);
    });
    const fb = screen.getByTestId("follow-button");
    expect(fb).toHaveAttribute("data-user-id", "owner-1");
  });

  test("コメント_入力から追加_件数増とrefresh", async () => {
    // Spec: POSTDET-014
    const post = createPost({ comment_count: 2 });
    await act(async () => {
      render(<PostDetail post={post} currentUserId="viewer-1" />);
    });
    expect(screen.getByTestId("post-actions")).toHaveAttribute(
      "data-comment-count",
      "2",
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("comment-input-add"));
    });
    expect(refreshMock).toHaveBeenCalled();
    expect(screen.getByTestId("post-actions")).toHaveAttribute(
      "data-comment-count",
      "3",
    );
  });

  test("コメント_リストから通知_件数減", async () => {
    // Spec: POSTDET-015
    const post = createPost({ comment_count: 1 });
    await act(async () => {
      render(<PostDetail post={post} currentUserId="viewer-1" />);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("comment-list-remove"));
    });
    expect(screen.getByTestId("post-actions")).toHaveAttribute(
      "data-comment-count",
      "0",
    );
  });

  test("表示_未投稿かつidあり_PostModalをマウント", async () => {
    // Spec: POSTDET-016
    const post = createPost({ is_posted: false });
    await act(async () => {
      render(<PostDetail post={post} currentUserId="owner-1" />);
    });
    const modal = screen.getByTestId("post-modal");
    expect(modal).toHaveAttribute("data-image-id", "img-1");
  });

  test("表示_画像URLあり_クリックで全画面", async () => {
    // Spec: POSTDET-017
    const post = createPost();
    await act(async () => {
      render(<PostDetail post={post} currentUserId="owner-1" />);
    });
    expect(screen.getByTestId("fullscreen-closed")).toBeInTheDocument();
    const img = screen.getByRole("img", { name: /Post image/i });
    await act(async () => {
      fireEvent.click(img);
    });
    await waitFor(() => {
      expect(screen.getByTestId("fullscreen-open")).toBeInTheDocument();
    });
  });

  test("表示_one_tap_styleの場合_プロンプトセクションを出さない", async () => {
    const post = createPost({
      generation_type: "one_tap_style",
      prompt: "style secret prompt",
      generation_metadata: {
        oneTapStyle: {
          id: "preset-1",
          title: "PARIS CODE",
          thumbnailImageUrl: "https://example.com/style-card.webp",
          thumbnailWidth: 912,
          thumbnailHeight: 1173,
          hasBackgroundPrompt: true,
          billingMode: "free",
        },
      },
    });

    await act(async () => {
      render(<PostDetail post={post} currentUserId="owner-1" />);
    });

    expect(screen.queryByText("style secret prompt")).not.toBeInTheDocument();
    expect(screen.queryByText("Prompt")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copy/i })).not.toBeInTheDocument();
    expect(
      screen.getByText("Generated with One-Tap Style")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /PARIS CODE style card/i })
    ).toBeInTheDocument();
  });

  test("表示_one_tap_styleのカード確認後_style画面へ遷移する", async () => {
    const post = createPost({
      generation_type: "one_tap_style",
      prompt: "style secret prompt",
      generation_metadata: {
        oneTapStyle: {
          id: "preset-1",
          title: "PARIS CODE",
          thumbnailImageUrl: "https://example.com/style-card.webp",
          thumbnailWidth: 912,
          thumbnailHeight: 1173,
          hasBackgroundPrompt: true,
          billingMode: "free",
        },
      },
    });

    await act(async () => {
      render(<PostDetail post={post} currentUserId="owner-1" />);
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /PARIS CODE style card/i })
      );
    });

    expect(screen.getByText("Use this outfit?")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    });

    expect(routerPushMock).toHaveBeenCalledWith("/style?style=preset-1");
  });
});
