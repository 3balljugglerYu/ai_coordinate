/** @jest-environment node */

jest.mock("@/lib/env", () => ({
  getInspireSubmissionAllowedUserIds: jest.fn(),
  getAdminUserIds: jest.fn(() => []),
}));

import { isInspireSubmitterAllowed } from "@/lib/auth";
import { getInspireSubmissionAllowedUserIds } from "@/lib/env";

describe("isInspireSubmitterAllowed", () => {
  const mockGetAllowedIds =
    getInspireSubmissionAllowedUserIds as jest.MockedFunction<
      typeof getInspireSubmissionAllowedUserIds
    >;

  beforeEach(() => {
    mockGetAllowedIds.mockReset();
  });

  test("env 空のとき全許可（fail-open / ADR-010）", () => {
    mockGetAllowedIds.mockReturnValue([]);
    expect(
      isInspireSubmitterAllowed("11111111-1111-1111-1111-111111111111")
    ).toBe(true);
  });

  test("allowlist に含まれる userId は許可", () => {
    mockGetAllowedIds.mockReturnValue([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);
    expect(
      isInspireSubmitterAllowed("11111111-1111-1111-1111-111111111111")
    ).toBe(true);
    expect(
      isInspireSubmitterAllowed("22222222-2222-2222-2222-222222222222")
    ).toBe(true);
  });

  test("allowlist に含まれない userId は拒否", () => {
    mockGetAllowedIds.mockReturnValue([
      "11111111-1111-1111-1111-111111111111",
    ]);
    expect(
      isInspireSubmitterAllowed("99999999-9999-9999-9999-999999999999")
    ).toBe(false);
  });
});
