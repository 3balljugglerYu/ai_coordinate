import { render, screen } from "@testing-library/react";
import { GuestGenerationTrialCta } from "@/features/generation/components/GuestGenerationTrialCta";

describe("GuestGenerationTrialCta", () => {
  test("お試し生成カードとログイン導線を表示する", () => {
    render(
      <GuestGenerationTrialCta
        title="Try without signing in"
        description="Results are not saved."
        actionLabel="Sign in / Sign up"
        testId="guest-generation-trial-cta"
      />
    );

    expect(
      screen.getByTestId("guest-generation-trial-cta")
    ).toBeInTheDocument();
    expect(screen.getByText("Try without signing in")).toBeInTheDocument();
    expect(screen.getByText("Results are not saved.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Sign in / Sign up" })
    ).toHaveAttribute("href", "/login");
  });
});
