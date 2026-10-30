/**
 * @jest-environment jsdom
 *
 * 見本を上げる前に縮める流れ(prepareCatalogReferenceImage)。縮め方の計算は prepare-reference-image.test.ts で確かめる。
 *
 * ここで守ること:
 *  - 決まりの内なら、絵を描き直さずにそのまま返す
 *  - 縮めるときは白で塗ってから描き(透明が黒にならないように)、JPEG にして .jpg の名前で返す
 *  - 品質 0.85 で 3.5MB を超えたら 0.7 で作り直す。それでも超えたら大きすぎるとして断る
 *  - 読めない画像・小さすぎる画像は、理由をつけて断る
 */

import {
  prepareCatalogReferenceImage,
  ReferenceImageError,
  REFERENCE_UPLOAD_MAX_BYTES,
} from "@/features/catalog-references/lib/prepare-reference-image";

let nextSize = { width: 0, height: 0 };
let failLoad = false;

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  set src(_value: string) {
    setTimeout(() => {
      if (failLoad) {
        this.onerror?.();
        return;
      }
      this.naturalWidth = nextSize.width;
      this.naturalHeight = nextSize.height;
      this.onload?.();
    }, 0);
  }
}

const calls: string[] = [];
const context: { fillStyle: string; fillRect: jest.Mock; drawImage: jest.Mock } = {
  fillStyle: "",
  fillRect: jest.fn(() => {
    calls.push(`fill:${context.fillStyle}`);
  }),
  drawImage: jest.fn(() => {
    calls.push("draw");
  }),
};
const blobSizes: number[] = [];
const toBlob = jest.fn<void, [(blob: Blob | null) => void, string?, number?]>((callback) => {
  const size = blobSizes.shift() ?? 10;
  callback(new Blob([new Uint8Array(size)], { type: "image/jpeg" }));
});

beforeEach(() => {
  nextSize = { width: 0, height: 0 };
  failLoad = false;
  calls.length = 0;
  blobSizes.length = 0;
  jest.clearAllMocks();
  global.Image = FakeImage as unknown as typeof Image;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: jest.fn(() => "blob:x") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: jest.fn() });
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
  HTMLCanvasElement.prototype.toBlob = toBlob as unknown as HTMLCanvasElement["toBlob"];
});

function file(type: string, name = "ref.png") {
  return new File(["x"], name, { type });
}

test("決まりの内なら、描き直さずにそのまま返す", async () => {
  nextSize = { width: 1200, height: 1600 };
  const original = file("image/png");

  await expect(prepareCatalogReferenceImage(original)).resolves.toBe(original);
  expect(toBlob).not.toHaveBeenCalled();
});

test("縮めるときは白で塗ってから描き、品質 0.85 の JPEG を .jpg の名前で返す", async () => {
  nextSize = { width: 1200, height: 1600 };

  const result = await prepareCatalogReferenceImage(file("image/gif", "ref.gif"));

  expect(calls).toEqual(["fill:#ffffff", "draw"]);
  expect(toBlob).toHaveBeenCalledTimes(1);
  expect(toBlob.mock.calls[0].slice(1)).toEqual(["image/jpeg", 0.85]);
  expect(result.name).toBe("ref.jpg");
  expect(result.type).toBe("image/jpeg");
});

test("0.85 で上限を超えたら 0.7 で作り直し、収まった方を返す", async () => {
  nextSize = { width: 1200, height: 1600 };
  blobSizes.push(REFERENCE_UPLOAD_MAX_BYTES + 1, 1000);

  const result = await prepareCatalogReferenceImage(file("image/gif"));

  expect(toBlob.mock.calls.map((call) => call[2])).toEqual([0.85, 0.7]);
  expect(result.size).toBe(1000);
});

test("0.7 でも上限を超えたら、大きすぎるとして断る", async () => {
  nextSize = { width: 1200, height: 1600 };
  blobSizes.push(REFERENCE_UPLOAD_MAX_BYTES + 1, REFERENCE_UPLOAD_MAX_BYTES + 1);

  await expect(prepareCatalogReferenceImage(file("image/gif"))).rejects.toMatchObject({ problem: "too_large" });
});

test.each([
  ["読めない画像", () => { failLoad = true; }, "load_failed"],
  ["小さすぎる画像", () => { nextSize = { width: 700, height: 900 }; }, "too_small"],
])("%s は、理由をつけて断る(描き直さない)", async (_label, arrange, problem) => {
  arrange();

  const result = prepareCatalogReferenceImage(file("image/png"));

  await expect(result).rejects.toBeInstanceOf(ReferenceImageError);
  await expect(result).rejects.toMatchObject({ problem });
  expect(toBlob).not.toHaveBeenCalled();
});
