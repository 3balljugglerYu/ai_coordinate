import { withHonorific } from "@/shared/notifications/honorific";

describe("withHonorific", () => {
  test("名前に「さん」を付ける(前後の空白は落とす)", () => {
    expect(withHonorific("りる🐣")).toBe("りる🐣さん");
    expect(withHonorific(" Miki ")).toBe("Mikiさん");
    expect(withHonorific("ユーザー")).toBe("ユーザーさん");
  });

  test.each(["田中さん", "山田さま", "山田様", "みきちゃん", "たろうくん", "佐藤氏", "鈴木殿"])(
    "もう敬称が付いている「%s」には重ねない",
    (name) => {
      expect(withHonorific(name)).toBe(name);
    },
  );
});
