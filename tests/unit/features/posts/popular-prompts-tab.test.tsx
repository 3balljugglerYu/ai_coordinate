import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { SortTabs } from "@/features/posts/components/SortTabs";
import {
  PopularPromptsAvailabilityProvider,
  PopularPromptsAvailabilityUpgrade,
  usePopularPromptsAvailable,
} from "@/features/posts/components/PopularPromptsAvailabilityProvider";
import { NewPromptBadge } from "@/features/posts/components/NewPromptBadge";

const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_POPULAR_PROMPTS_ENABLED;

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) {
    delete process.env.NEXT_PUBLIC_POPULAR_PROMPTS_ENABLED;
  } else {
    process.env.NEXT_PUBLIC_POPULAR_PROMPTS_ENABLED = ORIGINAL_FLAG;
  }
});

function renderTabs(children?: React.ReactNode) {
  return render(
    <PopularPromptsAvailabilityProvider>
      <SortTabs value="newest" onChange={jest.fn()} />
      {children}
    </PopularPromptsAvailabilityProvider>
  );
}

describe("SortTabs の中間タブ差し替え", () => {
  /*
    ⭐ タブは「追加」ではなく「差し替え」。足すだけにすると、week が残っている
    全公開前のあいだ運営に 4 タブが並び、モバイル幅で折り返す。
  */
  test("可否falseなら中間タブはオススメ(week)_タブは3つ", () => {
    delete process.env.NEXT_PUBLIC_POPULAR_PROMPTS_ENABLED;

    renderTabs();

    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByText("recommended")).toBeInTheDocument();
    expect(screen.queryByText("popularPrompts")).not.toBeInTheDocument();
  });

  test("公開フラグONなら中間タブは人気_タブは3つのまま", () => {
    process.env.NEXT_PUBLIC_POPULAR_PROMPTS_ENABLED = "true";

    renderTabs();

    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByText("popularPrompts")).toBeInTheDocument();
    // ⭐ 4タブにならない（オススメは消える）
    expect(screen.queryByText("recommended")).not.toBeInTheDocument();
  });

  test("昇格すると中間タブが人気へ入れ替わる_4タブにはならない", () => {
    // 段階公開中は false から始まり、Loader が遅れて true へ昇格させる
    delete process.env.NEXT_PUBLIC_POPULAR_PROMPTS_ENABLED;

    renderTabs(<PopularPromptsAvailabilityUpgrade />);

    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByText("popularPrompts")).toBeInTheDocument();
    expect(screen.queryByText("recommended")).not.toBeInTheDocument();
  });

  test("新着とフォローは可否に関わらず残る", () => {
    process.env.NEXT_PUBLIC_POPULAR_PROMPTS_ENABLED = "true";

    renderTabs();

    expect(screen.getByText("newest")).toBeInTheDocument();
    expect(screen.getByText("following")).toBeInTheDocument();
  });
});

describe("PopularPromptsAvailabilityProvider", () => {
  function Probe() {
    return <span data-testid="available">{String(usePopularPromptsAvailable())}</span>;
  }

  test("Providerの外で参照してもクラッシュせずfalseに倒れる", () => {
    // LocaleShell への追加を忘れた場合の落ち方。閉じる側に倒れるだけで壊れない
    delete process.env.NEXT_PUBLIC_POPULAR_PROMPTS_ENABLED;

    render(<Probe />);

    expect(screen.getByTestId("available")).toHaveTextContent("false");
  });

  test("初期値は公開フラグ", () => {
    process.env.NEXT_PUBLIC_POPULAR_PROMPTS_ENABLED = "true";

    render(
      <PopularPromptsAvailabilityProvider>
        <Probe />
      </PopularPromptsAvailabilityProvider>
    );

    expect(screen.getByTestId("available")).toHaveTextContent("true");
  });

  test("Upgradeはfalseからtrueへ昇格させる（表示は持たない）", () => {
    delete process.env.NEXT_PUBLIC_POPULAR_PROMPTS_ENABLED;

    const { container } = render(
      <PopularPromptsAvailabilityProvider>
        <Probe />
        <PopularPromptsAvailabilityUpgrade />
      </PopularPromptsAvailabilityProvider>
    );

    expect(screen.getByTestId("available")).toHaveTextContent("true");
    // Upgrade 自体は何も描かない
    expect(container.querySelectorAll("span")).toHaveLength(1);
  });
});

describe("NewPromptBadge", () => {
  test("プリセットのNEWバッジとは別の文言キーを使う", () => {
    render(<NewPromptBadge />);

    // styleNewBadge ではないこと（14日窓のプリセット用と混同しない）
    expect(screen.getByText("popularPromptsNewBadge")).toBeInTheDocument();
    expect(screen.queryByText("styleNewBadge")).not.toBeInTheDocument();
  });
});
