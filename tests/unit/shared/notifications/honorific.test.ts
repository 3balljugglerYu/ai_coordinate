import { withHonorific, withHonorificInActorTitle } from "@/shared/notifications/honorific";

describe("withHonorific", () => {
  test("名前に「さん」を付ける(前後の空白は落とす)", () => {
    expect(withHonorific("りる🐣")).toBe("りる🐣さん");
    expect(withHonorific(" Miki ")).toBe("Mikiさん");
    expect(withHonorific("ユーザー")).toBe("ユーザーさん");
  });

  test.each([
    "田中さん",
    "山田さま",
    "山田様",
    "みきちゃん",
    "たろうくん",
    "たろう君",
    "ゆいたん",
    "佐藤氏",
    "鈴木殿",
    "山田先生",
    "タナカサン",
    "ミキチャン",
  ])("もう敬称が付いている「%s」には重ねない", (name) => {
    expect(withHonorific(name)).toBe(name);
  });

  test.each(["みきちゃん🐣", "田中さん。", "ゆいちゃん❤️", "たろうくん！！", "みきちゃん👩🏻‍🎨"])(
    "敬称のうしろに絵文字・記号が続く「%s」にも重ねない",
    (name) => {
      expect(withHonorific(name)).toBe(name);
    },
  );
});

describe("withHonorificInActorTitle", () => {
  test("「〇〇があなた…」の名前に付ける", () => {
    expect(withHonorificInActorTitle("りる🐣があなたの投稿にいいねしました"))
      .toBe("りる🐣さんがあなたの投稿にいいねしました");
  });

  test("⭐名前に「が」「があなた」が入っていても、名前の途中で切らない", () => {
    expect(withHonorificInActorTitle("ながのがあなたをフォローしました"))
      .toBe("ながのさんがあなたをフォローしました");
    expect(withHonorificInActorTitle("君があなたがあなたの投稿にいいねしました"))
      .toBe("君があなたさんがあなたの投稿にいいねしました");
  });

  test("形が違えば null", () => {
    expect(withHonorificInActorTitle("あなたのプロンプトが初めて利用されました")).toBeNull();
    expect(withHonorificInActorTitle("新しいコメント")).toBeNull();
    expect(withHonorificInActorTitle(null)).toBeNull();
  });
});
