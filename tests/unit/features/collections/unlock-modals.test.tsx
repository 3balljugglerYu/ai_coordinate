/**
 * 解放お知らせモーダル(InitialUnlockModal / UnlockDripModal)の
 * フォールバック・カスタム表示・配色(CSS変数)・操作の回帰テスト。
 *
 * admin 未設定(props 省略)なら現行ハードコード(画像/文言/紫基調)にフォールバックし、
 * 設定ありなら props の画像/本文/色が反映されることを検証する。
 * next/image・next/link は表示確認のためパススルーでモックする。
 */

import { fireEvent, render, screen } from "@testing-library/react";

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { src: string; alt: string }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={props.src} alt={props.alt} />;
  },
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    onClick,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

import {
  InitialUnlockModal,
  UnlockDripModal,
} from "@/features/collections/components/UnlockModals";

const DEFAULT_HERO = "/collections/petit-unlock-hero.png";

function panelStyle(): string {
  // 配色 CSS 変数を持つパネル要素の style 文字列を返す。
  const el = document.querySelector('[style*="--ann-accent"]');
  return el?.getAttribute("style") ?? "";
}

describe("InitialUnlockModal", () => {
  test("未設定: 標準の見出し/本文/ヒーロー画像/紫基調にフォールバック", () => {
    render(<InitialUnlockModal title="ぷち神" onClose={() => {}} />);

    expect(screen.getByText("ぷち神が解放されました！")).toBeInTheDocument();
    expect(
      screen.getByText(/コンプリート報酬の新しいスタイルが登場/),
    ).toBeInTheDocument();
    expect(screen.getByAltText("ぷち神")).toHaveAttribute("src", DEFAULT_HERO);
    // 既定の配色(accent/#C670FF, soft/#F3E0FF)が CSS 変数に入る。
    const style = panelStyle();
    expect(style).toContain("--ann-accent: #C670FF");
    expect(style).toContain("--ann-soft: #F3E0FF");
  });

  test("設定あり: 画像/本文/配色が props の値で反映される", () => {
    render(
      <InitialUnlockModal
        title="ぷち神"
        onClose={() => {}}
        heroImageUrl="https://example.com/hero.png"
        body="カスタム初回文"
        colors={{
          accent: "#123456",
          accentHover: "#654321",
          title: "#abcdef",
          soft: "#fedcba",
        }}
      />,
    );

    expect(screen.getByAltText("ぷち神")).toHaveAttribute(
      "src",
      "https://example.com/hero.png",
    );
    expect(screen.getByText("カスタム初回文")).toBeInTheDocument();
    const style = panelStyle();
    expect(style).toContain("--ann-accent: #123456");
    expect(style).toContain("--ann-accent-hover: #654321");
    expect(style).toContain("--ann-soft: #fedcba");
  });

  test("null の props は既定値にフォールバックする", () => {
    render(
      <InitialUnlockModal
        title="ぷち神"
        onClose={() => {}}
        heroImageUrl={null}
        body={null}
        colors={{ accent: null, accentHover: null, title: null, soft: null }}
      />,
    );
    expect(screen.getByAltText("ぷち神")).toHaveAttribute("src", DEFAULT_HERO);
    expect(
      screen.getByText(/コンプリート報酬の新しいスタイルが登場/),
    ).toBeInTheDocument();
    expect(panelStyle()).toContain("--ann-accent: #C670FF");
  });

  test("閉じる/あとで/オーバーレイ/つくりに行く で onClose が呼ばれる", () => {
    const onClose = jest.fn();
    render(<InitialUnlockModal title="ぷち神" onClose={onClose} />);

    fireEvent.click(screen.getByLabelText("閉じる"));
    fireEvent.click(screen.getByText("あとで"));
    fireEvent.click(screen.getByText("つくりに行く"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe("UnlockDripModal", () => {
  const newlyUnlocked = [
    { id: "p1", title: "スタイルA", thumbnailUrl: "https://example.com/a.png" },
    { id: "p2", title: "スタイルB", thumbnailUrl: "https://example.com/b.png" },
  ];

  test("未設定: 解放数の見出しと標準文、サムネを表示", () => {
    render(
      <UnlockDripModal
        title="ぷち神"
        newlyUnlocked={newlyUnlocked}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("新たに2体 解放！")).toBeInTheDocument();
    expect(screen.getByText("ぷち神の続きが登場しました。")).toBeInTheDocument();
    expect(screen.getByAltText("スタイルA")).toHaveAttribute(
      "src",
      "https://example.com/a.png",
    );
    expect(screen.getByAltText("スタイルB")).toBeInTheDocument();
  });

  test("設定あり: 本文と配色が props で反映される", () => {
    render(
      <UnlockDripModal
        title="ぷち神"
        newlyUnlocked={newlyUnlocked}
        onClose={() => {}}
        body="カスタム段階文"
        colors={{
          accent: "#111111",
          accentHover: "#222222",
          title: "#333333",
          soft: "#444444",
        }}
      />,
    );
    expect(screen.getByText("カスタム段階文")).toBeInTheDocument();
    expect(panelStyle()).toContain("--ann-accent: #111111");
  });

  test("閉じるで onClose が呼ばれる", () => {
    const onClose = jest.fn();
    render(
      <UnlockDripModal
        title="ぷち神"
        newlyUnlocked={newlyUnlocked}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByLabelText("閉じる"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
