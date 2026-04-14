/** @jest-environment node */

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/features/subscription/lib/change-service", () => ({
  resumeSubscriptionCancellation: jest.fn(),
  getSubscriptionChangeErrorCode: jest.fn(),
  getSubscriptionChangeErrorStatus: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/subscription/resume/route";
import { getUser } from "@/lib/auth";
import {
  getSubscriptionChangeErrorCode,
  getSubscriptionChangeErrorStatus,
  resumeSubscriptionCancellation,
} from "@/features/subscription/lib/change-service";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockResume =
  resumeSubscriptionCancellation as jest.MockedFunction<
    typeof resumeSubscriptionCancellation
  >;
const mockErrorCode =
  getSubscriptionChangeErrorCode as jest.MockedFunction<
    typeof getSubscriptionChangeErrorCode
  >;
const mockErrorStatus =
  getSubscriptionChangeErrorStatus as jest.MockedFunction<
    typeof getSubscriptionChangeErrorStatus
  >;

function createRequest() {
  return new NextRequest("http://localhost/api/subscription/resume", {
    method: "POST",
  });
}

describe("POST /api/subscription/resume", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("ログインしていない場合は 401", async () => {
    mockGetUser.mockResolvedValue(null);

    const response = await POST(createRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.errorCode).toBe("SUBSCRIPTION_AUTH_REQUIRED");
    expect(mockResume).not.toHaveBeenCalled();
  });

  test("解約予約があれば再開して 200", async () => {
    mockGetUser.mockResolvedValue({
      id: "user_123",
      email: "user@example.com",
    } as never);
    mockResume.mockResolvedValue({ resumed: true });

    const response = await POST(createRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ resumed: true });
    expect(mockResume).toHaveBeenCalledWith({ userId: "user_123" });
  });

  test("解約予約が無ければ 409 と PENDING_CANCELLATION_NOT_FOUND を返す", async () => {
    mockGetUser.mockResolvedValue({
      id: "user_123",
      email: "user@example.com",
    } as never);
    mockResume.mockRejectedValue(new Error("nope"));
    mockErrorCode.mockReturnValue("PENDING_CANCELLATION_NOT_FOUND");
    mockErrorStatus.mockReturnValue(409);

    const response = await POST(createRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.errorCode).toBe("PENDING_CANCELLATION_NOT_FOUND");
    expect(typeof body.error).toBe("string");
  });
});
