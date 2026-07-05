/**
 * 投稿インプレッション送信バッファの回帰テスト。
 * (docs/planning/post-impressions-implementation-plan.md EARS-01/05, ADR-002/003)
 *
 * - queue → デバウンス(1.5s)後に1回のバッチ fetch にまとまる
 * - sessionStorage(post-impressions-sent-v1)でセッション内の二重送信を抑止
 * - 離脱 flush は sendBeacon を優先
 * - フラグOFFでは何もしない
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

function loadModule(): Mod {
  let mod: Mod;
  jest.isolateModules(() => {
    mod = require("@/features/posts/lib/impressions-client") as Mod;
  });
  return mod!;
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
    queuePostImpression(ID_A);
    queuePostImpression(ID_B);

    expect(fetchMock).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1500);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/posts/impressions/batch");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      image_ids: [ID_A, ID_B],
    });
    expect((init as RequestInit).keepalive).toBe(true);

    const sent = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? "[]");
    expect(sent).toEqual([ID_A, ID_B]);
  });

  it("同一IDの再queueは送信されない(セッション内dedup)", () => {
    const { queuePostImpression } = loadModule();
    queuePostImpression(ID_A);
    jest.advanceTimersByTime(1500);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 送信済みIDを再queueしても新たな送信は発生しない
    queuePostImpression(ID_A);
    jest.advanceTimersByTime(3000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sessionStorageに既送信のIDはqueueされない(BFCache/StrictMode吸収)", () => {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify([ID_A]));
    const { queuePostImpression } = loadModule();
    queuePostImpression(ID_A);
    jest.advanceTimersByTime(3000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flushPostImpressions(true) は sendBeacon を優先して即時送信する", () => {
    const { queuePostImpression, flushPostImpressions } = loadModule();
    queuePostImpression(ID_A);
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
    queuePostImpression(ID_A);

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    window.dispatchEvent(new Event("visibilitychange"));

    expect(beaconMock).toHaveBeenCalledTimes(1);
  });

  it("フラグOFFでは何もしない", () => {
    mockFlag.mockReturnValue(false);
    const { queuePostImpression } = loadModule();
    queuePostImpression(ID_A);
    jest.advanceTimersByTime(3000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
});
