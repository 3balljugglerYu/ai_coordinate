/** @jest-environment node */

import { ensureWebPVariants } from "@/features/generation/lib/webp-storage";

function createSupabaseMock(image: Record<string, unknown> | null) {
  const maybeSingle = jest.fn().mockResolvedValue({ data: image, error: null });
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  const from = jest.fn(() => ({ select }));

  return {
    client: { from },
    from,
    select,
    eq,
    maybeSingle,
  };
}

describe("ensureWebPVariants", () => {
  test("thumb/displayの両方が既にある場合はskipする", async () => {
    // Spec: WEBP-001
    const supabase = createSupabaseMock({
      id: "image-1",
      user_id: "user-1",
      image_url: "https://example.com/original.png",
      storage_path: "user-1/original.png",
      storage_path_thumb: "user-1/original_thumb.webp",
      storage_path_display: "user-1/original_display.webp",
      is_posted: true,
    });
    const uploadVariants = jest.fn();
    const updateStoragePaths = jest.fn();
    const revalidateTagFn = jest.fn();

    const result = await ensureWebPVariants("image-1", {
      supabase: supabase.client as never,
      uploadVariants,
      updateStoragePaths,
      revalidateTagFn,
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "already-exists",
    });
    expect(uploadVariants).not.toHaveBeenCalled();
    expect(updateStoragePaths).not.toHaveBeenCalled();
    expect(revalidateTagFn).not.toHaveBeenCalled();
  });

  test("variantsが欠損している場合は生成して関連tagを再検証する", async () => {
    // Spec: WEBP-002
    const supabase = createSupabaseMock({
      id: "image-2",
      user_id: "user-2",
      image_url: "https://example.com/original.png",
      storage_path: "user-2/original.png",
      storage_path_thumb: null,
      storage_path_display: null,
      is_posted: true,
    });
    const uploadVariants = jest.fn().mockResolvedValue({
      thumbPath: "user-2/original_thumb.webp",
      displayPath: "user-2/original_display.webp",
    });
    const updateStoragePaths = jest.fn().mockResolvedValue(undefined);
    const revalidateTagFn = jest.fn();

    const result = await ensureWebPVariants("image-2", {
      supabase: supabase.client as never,
      uploadVariants,
      updateStoragePaths,
      revalidateTagFn,
    });

    expect(result).toEqual({
      status: "created",
      thumbPath: "user-2/original_thumb.webp",
      displayPath: "user-2/original_display.webp",
    });
    expect(uploadVariants).toHaveBeenCalledWith(
      "https://example.com/original.png",
      "user-2/original.png",
      3
    );
    expect(updateStoragePaths).toHaveBeenCalledWith(
      "image-2",
      "user-2/original_thumb.webp",
      "user-2/original_display.webp"
    );
    expect(revalidateTagFn).toHaveBeenCalledWith("my-page-user-2", "max");
    expect(revalidateTagFn).toHaveBeenCalledWith("coordinate-user-2", "max");
    expect(revalidateTagFn).toHaveBeenCalledWith("my-page-image-user-2-image-2", {
      expire: 0,
    });
    expect(revalidateTagFn).toHaveBeenCalledWith("user-profile-user-2", "max");
    expect(revalidateTagFn).toHaveBeenCalledWith("home-posts", "max");
    expect(revalidateTagFn).toHaveBeenCalledWith("home-posts-week", "max");
    expect(revalidateTagFn).toHaveBeenCalledWith("search-posts", "max");
    expect(revalidateTagFn).toHaveBeenCalledWith("post-detail-image-2", {
      expire: 0,
    });
  });

  test("未投稿画像ではhome系tagを再検証しない", async () => {
    // Spec: WEBP-003
    const supabase = createSupabaseMock({
      id: "image-4",
      user_id: "user-4",
      image_url: "https://example.com/original.png",
      storage_path: "user-4/original.png",
      storage_path_thumb: null,
      storage_path_display: null,
      is_posted: false,
    });
    const uploadVariants = jest.fn().mockResolvedValue({
      thumbPath: "user-4/original_thumb.webp",
      displayPath: "user-4/original_display.webp",
    });
    const updateStoragePaths = jest.fn().mockResolvedValue(undefined);
    const revalidateTagFn = jest.fn();

    await ensureWebPVariants("image-4", {
      supabase: supabase.client as never,
      uploadVariants,
      updateStoragePaths,
      revalidateTagFn,
    });

    expect(revalidateTagFn).toHaveBeenCalledWith("my-page-user-4", "max");
    expect(revalidateTagFn).toHaveBeenCalledWith("coordinate-user-4", "max");
    expect(revalidateTagFn).toHaveBeenCalledWith("my-page-image-user-4-image-4", {
      expire: 0,
    });
    expect(revalidateTagFn).not.toHaveBeenCalledWith("home-posts", "max");
    expect(revalidateTagFn).not.toHaveBeenCalledWith("home-posts-week", "max");
    expect(revalidateTagFn).not.toHaveBeenCalledWith("search-posts", "max");
  });

  test("thumbだけ欠損している場合もvariantsを再生成して更新する", async () => {
    // Spec: WEBP-004
    const supabase = createSupabaseMock({
      id: "image-5",
      user_id: "user-5",
      image_url: "https://example.com/original.png",
      storage_path: "user-5/original.png",
      storage_path_thumb: null,
      storage_path_display: "user-5/original_display.webp",
      is_posted: false,
    });
    const uploadVariants = jest.fn().mockResolvedValue({
      thumbPath: "user-5/original_thumb.webp",
      displayPath: "user-5/original_display.webp",
    });
    const updateStoragePaths = jest.fn().mockResolvedValue(undefined);
    const revalidateTagFn = jest.fn();

    const result = await ensureWebPVariants("image-5", {
      supabase: supabase.client as never,
      uploadVariants,
      updateStoragePaths,
      revalidateTagFn,
    });

    expect(result).toEqual({
      status: "created",
      thumbPath: "user-5/original_thumb.webp",
      displayPath: "user-5/original_display.webp",
    });
    expect(uploadVariants).toHaveBeenCalledWith(
      "https://example.com/original.png",
      "user-5/original.png",
      3
    );
    expect(updateStoragePaths).toHaveBeenCalledWith(
      "image-5",
      "user-5/original_thumb.webp",
      "user-5/original_display.webp"
    );
  });

  test("元画像情報が欠損している場合はskipする", async () => {
    // Spec: WEBP-005
    const supabase = createSupabaseMock({
      id: "image-3",
      user_id: "user-3",
      image_url: null,
      storage_path: null,
      storage_path_thumb: null,
      storage_path_display: null,
      is_posted: false,
    });
    const uploadVariants = jest.fn();
    const updateStoragePaths = jest.fn();
    const revalidateTagFn = jest.fn();

    const result = await ensureWebPVariants("image-3", {
      supabase: supabase.client as never,
      uploadVariants,
      updateStoragePaths,
      revalidateTagFn,
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "missing-source",
    });
    expect(uploadVariants).not.toHaveBeenCalled();
    expect(updateStoragePaths).not.toHaveBeenCalled();
    expect(revalidateTagFn).not.toHaveBeenCalled();
  });

  test("画像が存在しない場合はskipする", async () => {
    // Spec: WEBP-006
    const supabase = createSupabaseMock(null);
    const uploadVariants = jest.fn();
    const updateStoragePaths = jest.fn();
    const revalidateTagFn = jest.fn();

    const result = await ensureWebPVariants("missing-image", {
      supabase: supabase.client as never,
      uploadVariants,
      updateStoragePaths,
      revalidateTagFn,
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "image-not-found",
    });
    expect(uploadVariants).not.toHaveBeenCalled();
    expect(updateStoragePaths).not.toHaveBeenCalled();
    expect(revalidateTagFn).not.toHaveBeenCalled();
  });
});
