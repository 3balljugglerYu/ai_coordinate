/** @jest-environment node */

jest.mock("@/lib/supabase/admin");

import { createAdminClient } from "@/lib/supabase/admin";
import { reorderPopupBanners } from "@/features/popup-banners/lib/popup-banner-repository";

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;

describe("popup-banner-repository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("reorderPopupBanners_UUID配列をatomic reorder RPCへ委譲する", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

    mockCreateAdminClient.mockReturnValue({ rpc } as never);

    await reorderPopupBanners([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);

    expect(rpc).toHaveBeenCalledWith("reorder_popup_banners", {
      p_order: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
    });
  });
});
