/**
 * 投稿インプレッション送信バッファの回帰テスト。
 * (docs/planning/post-impressions-implementation-plan.md EARS-01/05, ADR-002/003)
 *
 * - queue → デバウンス(1.5s)後に1回のバッチ fetch にまとまる
 * - sessionStorage(post-impressions-sent-v1)で「前回送信から30分」を抑止
 * - 表示形式(grid/feed)は混ざらないようリクエストを分ける
 * - 離脱 flush は sendBeacon を優先
 * - フラグOFFでは何もしない
 *
 * 30分の抑止はここが本体。DB 側は固定枠(floor(epoch/1800))で緩いため、
 * クライアントが送ってしまうと枠をまたいだ瞬間に加算されてしまう。
 *
 * モジュールスコープの状態(バッファ/タイマー/リスナー登録)を持つため、
 * jest.resetModules + require で各テスト独立のモジュールインスタンスを使う
 * (React 非依存モジュールなので resetModules の副作用はない)。
 */

jest.mock("@/lib/env", () => ({
  isPostImpressionsEnabled: jest.fn(() => true),
}));

import { isPostImpressionsEnabled } from "@/lib/env";

const mockFlag = isPostImpressionsEnabled as jest.MockedFunction<
  typeof isPostImpressionsEnabled
>;

type Mod = typeof import("@/features/posts/lib/impressions-client");

const SESSION_KEY = "post-impressions-sent-v1";
const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WINDOW_MS = 30 * 60 * 1000;

function loadModule(): Mod {
  let mod: Mod;
  jest.isolateModules(() => {
    // jest.isolateModules 内での同期ロードには require が必要(dynamic import は非同期で不可)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("@/features/posts/lib/impressions-client") as Mod;
  });
  return mod!;
}

function parseBody(call: [string, RequestInit]) {
  return JSON.parse(call[1].body as string) as {
    image_ids: string[];
    view_mode?: string;
  };
}

describe("impressions-client", () => {
  let fetchMock: jest.Mock;
  let beaconMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    mockFlag.mockReturnValue(true);
    window.sessionStorage.clear();
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    beaconMock = jest.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", {
      value: beaconMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("queue後、デバウンスで1回のバッチfetchにまとまり、sessionStorageに記録される", () => {
    const { queuePostImpression } = loadModule();
    queuePostImpression(ID_A, "grid");
    queuePostImpression(ID_B, "grid");

    expect(fetchMock).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1500);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/posts/impressions/batch");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      image_ids: [ID_A, ID_B],
      view_mode: "grid",
    });
    expect((init as RequestInit).keepalive).toBe(true);

    // 記録は「ID → 最終送信時刻」。時刻を持たないと30分の判定ができない
    const sent = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? "{}");
    expect(Object.keys(sent).sort()).toEqual([ID_A, ID_B].sort());
    expect(typeof sent[ID_A]).toBe("number");
  });

  it("表示形式が混ざるとリクエストを分ける(grid と feed を同じ body に入れない)", () => {
    const { queuePostImpression } = loadModule();
    queuePostImpression(ID_A, "grid");
    queuePostImpression(ID_B, "feed");

    jest.advanceTimersByTime(1500);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map((call) =>
      parseBody(call as [string, RequestInit])
    );
    expect(bodies).toEqual(
      expect.arrayContaining([
        { image_ids: [ID_A], view_mode: "grid" },
        { image_ids: [ID_B], view_mode: "feed" },
      ])
    );
  });

  it("30分未満の再queueは送信されない", () => {
    const { queuePostImpression } = loadModule();
    queuePostImpression(ID_A, "grid");
    jest.advanceTimersByTime(1500);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // あと1msで窓が開ける、というところまで進めても送らない
    jest.advanceTimersByTime(WINDOW_MS - 1500 - 1);
    queuePostImpression(ID_A, "grid");
    jest.advanceTimersByTime(3000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("30分経過後の再queueは送信される(数字が動くのはここ)", () => {
    const { queuePostImpression } = loadModule();
    queuePostImpression(ID_A, "grid");
    jest.advanceTimersByTime(1500);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(WINDOW_MS);
    queuePostImpression(ID_A, "grid");
    jest.advanceTimersByTime(1500);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(parseBody(fetchMock.mock.calls[1] as [string, RequestInit])).toEqual({
      image_ids: [ID_A],
      view_mode: "grid",
    });
  });

  it("sessionStorageに30分以内の記録があればqueueされない(BFCache/StrictMode吸収)", () => {
    window.sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ [ID_A]: Date.now() })
    );
    const { queuePostImpression } = loadModule();
    queuePostImpression(ID_A, "feed");
    jest.advanceTimersByTime(3000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("旧形式(IDの配列)の記録は捨てて送信する(デプロイをまたいだセッション)", () => {
    // 送信時刻を持たないため窓の判定ができない。DB dedup に任せて1回多く送る
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify([ID_A]));
    const { queuePostImpression } = loadModule();
    queuePostImpression(ID_A, "feed");
    jest.advanceTimersByTime(1500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("期限切れの記録は保存時に捨てる(長時間セッションで肥大化させない)", () => {
    const { queuePostImpression } = loadModule();
    queuePostImpression(ID_A, "grid");
    jest.advanceTimersByTime(1500);

    jest.advanceTimersByTime(WINDOW_MS);
    queuePostImpression(ID_B, "grid");

    const sent = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? "{}");
    expect(Object.keys(sent)).toEqual([ID_B]);

    // このテストのモジュールインスタンスが登録した visibilitychange リスナーは
    // window に残り続ける(jsdom の window はファイル内で共有)。バッファを空に
    // しておかないと、後続テストの離脱 flush に ID_B が混ざる。
    jest.advanceTimersByTime(1500);
  });

  it("flushPostImpressions(true) は sendBeacon を優先して即時送信する", () => {
    const { queuePostImpression, flushPostImpressions } = loadModule();
    queuePostImpression(ID_A, "grid");
    flushPostImpressions(true);

    expect(beaconMock).toHaveBeenCalledTimes(1);
    expect(beaconMock.mock.calls[0][0]).toBe("/api/posts/impressions/batch");
    expect(fetchMock).not.toHaveBeenCalled();

    // 既に送信済みのためデバウンスタイマー経過後も再送しない
    jest.advanceTimersByTime(3000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("visibilitychange(hidden) で未送信分が beacon flush される(EARS-05)", () => {
    const { queuePostImpression } = loadModule();
    queuePostImpression(ID_A, "grid");

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    window.dispatchEvent(new Event("visibilitychange"));

    expect(beaconMock).toHaveBeenCalledTimes(1);
  });

  it("sessionStorageアクセスが例外を投げる環境でもクラッシュせず送信できる", () => {
    // Cookie無効設定等では window.sessionStorage への「プロパティアクセス自体」が
    // SecurityError を投げる。dedupは諦めて(DBのUNIQUEに委ねて)送信は継続する。
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError: access denied");
      },
    });
    try {
      const { queuePostImpression } = loadModule();
      expect(() => queuePostImpression(ID_A, "feed")).not.toThrow();
      jest.advanceTimersByTime(1500);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(
        JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string),
      ).toEqual({ image_ids: [ID_A], view_mode: "feed" });
    } finally {
      if (original) {
        Object.defineProperty(window, "sessionStorage", original);
      } else {
        // jsdom のバージョンによっては sessionStorage が Window.prototype 側に
        // 定義されており descriptor が取れない。その場合は自前の override を
        // 削除してプロトタイプ参照に戻す(throwする getter を残さない)。
        delete (window as { sessionStorage?: unknown }).sessionStorage;
      }
    }
  });

  it("フラグOFFでは何もしない", () => {
    mockFlag.mockReturnValue(false);
    const { queuePostImpression } = loadModule();
    queuePostImpression(ID_A, "grid");
    jest.advanceTimersByTime(3000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
});
