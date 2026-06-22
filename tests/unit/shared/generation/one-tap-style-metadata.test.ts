/** @jest-environment node */

import { getOneTapStylePresetMetadata } from "@/shared/generation/one-tap-style-metadata";

const baseOneTapStyle = {
  id: "preset-1",
  title: "nanoblock",
  thumbnailImageUrl: "https://example.com/t.webp",
  thumbnailWidth: 1024,
  thumbnailHeight: 1024,
  hasBackgroundPrompt: false,
  billingMode: "free",
  outputAspectRatioMode: "1:1",
};

function record(oneTapStyle: Record<string, unknown>) {
  return {
    generation_type: "one_tap_style",
    generation_metadata: { oneTapStyle },
  };
}

describe("getOneTapStylePresetMetadata", () => {
  test("one_tap_style 以外は null", () => {
    expect(
      getOneTapStylePresetMetadata({
        generation_type: "coordinate",
        generation_metadata: { oneTapStyle: baseOneTapStyle },
      }),
    ).toBeNull();
  });

  test("基本フィールドを変換し、provider 未設定なら null", () => {
    const meta = getOneTapStylePresetMetadata(record(baseOneTapStyle));
    expect(meta).not.toBeNull();
    expect(meta?.id).toBe("preset-1");
    expect(meta?.title).toBe("nanoblock");
    expect(meta?.providerUserId).toBeNull();
    expect(meta?.providerNickname).toBeNull();
    expect(meta?.providerAvatarUrl).toBeNull();
  });

  test("provider 情報があれば surface する", () => {
    const meta = getOneTapStylePresetMetadata(
      record({
        ...baseOneTapStyle,
        providerUserId: "mario-id",
        providerNickname: "mario335599",
        providerAvatarUrl: "https://example.com/m.png",
      }),
    );
    expect(meta?.providerUserId).toBe("mario-id");
    expect(meta?.providerNickname).toBe("mario335599");
    expect(meta?.providerAvatarUrl).toBe("https://example.com/m.png");
  });

  test("provider が文字列以外なら null に正規化する", () => {
    const meta = getOneTapStylePresetMetadata(
      record({
        ...baseOneTapStyle,
        providerUserId: 123,
        providerNickname: null,
      }),
    );
    expect(meta?.providerUserId).toBeNull();
    expect(meta?.providerNickname).toBeNull();
    expect(meta?.providerAvatarUrl).toBeNull();
  });

  test("必須フィールド欠落は null", () => {
    const { id: _omit, ...withoutId } = baseOneTapStyle;
    void _omit;
    expect(getOneTapStylePresetMetadata(record(withoutId))).toBeNull();
  });
});
