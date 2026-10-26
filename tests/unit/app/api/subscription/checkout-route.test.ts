/** @jest-environment node */

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/features/subscription/lib/server-api", () => ({
  fetchUserSubscription: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  env: {
    STRIPE_SECRET_KEY: "sk_test_dummy",
  },
  getSiteUrl: jest.fn(() => "http://localhost:3000"),
}));

jest.mock("@/features/subscription/lib/stripe-customer", () => ({
  getOrCreateStripeCustomer: jest.fn(),
}));

jest.mock("@/features/subscription/lib/stripe-utils", () => ({
  createStripeClient: jest.fn(),
  resolveSubscriptionPriceId: jest.fn(),
}));

jest.mock("@/features/monetization/lib/record-monetization-event", () => ({
  recordMonetizationEvent: jest.fn(async () => true),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/subscription/checkout/route";
import { getUser } from "@/lib/auth";
import { fetchUserSubscription } from "@/features/subscription/lib/server-api";
import { createStripeClient, resolveSubscriptionPriceId } from "@/features/subscription/lib/stripe-utils";
import { getOrCreateStripeCustomer } from "@/features/subscription/lib/stripe-customer";
import { recordMonetizationEvent } from "@/features/monetization/lib/record-monetization-event";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockFetchUserSubscription =
  fetchUserSubscription as jest.MockedFunction<typeof fetchUserSubscription>;
const mockCreateStripeClient =
  createStripeClient as jest.MockedFunction<typeof createStripeClient>;

function createRequest() {
  return new NextRequest("http://localhost/api/subscription/checkout", {
    method: "POST",
    body: JSON.stringify({
      planId: "light",
      billingInterval: "month",
    }),
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("POST /api/subscription/checkout", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("past_due の既存 subscription は新規 checkout を拒否する", async () => {
    mockGetUser.mockResolvedValue({
      id: "user_123",
      email: "user@example.com",
    } as never);
    mockFetchUserSubscription.mockResolvedValue({
      user_id: "user_123",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      plan: "light",
      status: "past_due",
      billing_interval: "month",
      current_period_start: null,
      current_period_end: null,
      scheduled_plan: null,
      scheduled_billing_interval: null,
      scheduled_change_at: null,
      last_percoin_grant_at: null,
      next_percoin_grant_at: null,
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
    });

    const response = await POST(createRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.errorCode).toBe("SUBSCRIPTION_ALREADY_ACTIVE");
    expect(typeof body.error).toBe("string");
    expect(mockCreateStripeClient).not.toHaveBeenCalled();
  });

  test("支払い画面を作ったら、支払いを始めた記録(checkout_start)を支払い画面の ID つきで書く", async () => {
    mockGetUser.mockResolvedValue({ id: "user_123", email: "user@example.com" } as never);
    mockFetchUserSubscription.mockResolvedValue(null as never);
    (getOrCreateStripeCustomer as jest.Mock).mockResolvedValue("cus_123");
    (resolveSubscriptionPriceId as jest.Mock).mockResolvedValue("price_123");
    const create = jest.fn(async () => ({ id: "cs_test_123", url: "https://checkout.stripe.com/c/cs_test_123" }));
    mockCreateStripeClient.mockReturnValue({ checkout: { sessions: { create } } } as never);

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(recordMonetizationEvent).toHaveBeenCalledWith({
      userId: "user_123",
      eventType: "checkout_start",
      product: "subscription:light:month",
      stripeSessionId: "cs_test_123",
    });
  });
});
