/** @jest-environment node */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyAllowedEnvFile,
  parseAllowedEnv,
  SUPABASE_ADMIN_ENV_KEYS,
} from "@/scripts/lib/allowed-env";

const ALLOWED = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

describe("SUPABASE_ADMIN_ENV_KEYS", () => {
  /*
    ⭐ CLAUDE.md が .env.local から読んでよいと定めた Supabase の鍵のうち、
    登録に要る2つだけ。ここに Stripe や OpenAI の鍵を足すと、スクリプトが
    それらを読み込むようになる。増やすときは規約を確かめてからテストごと変える。
  */
  test("登録スクリプトが .env.local から読むのは Supabase の URL と service role key だけ", () => {
    expect([...SUPABASE_ADMIN_ENV_KEYS]).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
  });
});

describe("parseAllowedEnv", () => {
  /*
    ⭐ .env.local には Stripe や OpenAI の鍵も並んでいる。許可したキー以外は、
    名前が似ていても値ごと持ち帰らない。
  */
  test("許可したキーだけを拾い、ほかのキーや名前の似たキーは持ち帰らない", () => {
    const content = [
      "NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co",
      "OPENAI_API_KEY=sk-other-service",
      "SUPABASE_SERVICE_ROLE_KEY=service-role",
      "SUPABASE_SERVICE_ROLE_KEY_OLD=previous-key",
      "LOCAL_SUPABASE_SERVICE_ROLE_KEY=local-key",
      "STRIPE_SECRET_KEY=sk_live_other_service",
    ].join("\n");

    expect(parseAllowedEnv(content, ALLOWED)).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
    });
  });

  /*
    ⭐ 同じキーが2回あれば後の値を使う。Next.js(@next/env → dotenv)と同じ規則に
    しておかないと、アプリとスクリプトが別のデータベースを向いてしまう。
  */
  test("同じキーが2回あれば、Next.js と同じく後の値を使う", () => {
    const content = [
      "NEXT_PUBLIC_SUPABASE_URL=https://first.supabase.co",
      "NEXT_PUBLIC_SUPABASE_URL=https://second.supabase.co",
    ].join("\n");

    expect(parseAllowedEnv(content, ALLOWED)).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://second.supabase.co",
    });
  });

  test("コメントアウトした行は、後ろにあっても値を上書きしない", () => {
    const content = [
      "NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co",
      "# NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321",
      "  # SUPABASE_SERVICE_ROLE_KEY=local-key",
    ].join("\n");

    expect(parseAllowedEnv(content, ALLOWED)).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    });
  });

  test("export・二重引用符・一重引用符と、空行を扱う", () => {
    const content = [
      "",
      'export NEXT_PUBLIC_SUPABASE_URL="https://quoted.supabase.co"',
      "",
      "SUPABASE_SERVICE_ROLE_KEY='single-quoted'  ",
    ].join("\n");

    expect(parseAllowedEnv(content, ALLOWED)).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://quoted.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "single-quoted",
    });
  });

  test("値の中の = はそのまま残す", () => {
    const content = [
      "NEXT_PUBLIC_SUPABASE_URL=https://a.supabase.co/?x=1",
      "SUPABASE_SERVICE_ROLE_KEY=abc.def==",
    ].join("\n");

    expect(parseAllowedEnv(content, ALLOWED)).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://a.supabase.co/?x=1",
      SUPABASE_SERVICE_ROLE_KEY: "abc.def==",
    });
  });

  test("行末コメントと CR は、引用符の有無にかかわらず値に含めない", () => {
    const content =
      "NEXT_PUBLIC_SUPABASE_URL=https://a.supabase.co # 本番\r\n" +
      'SUPABASE_SERVICE_ROLE_KEY="quoted-value" # 本番の鍵\r\n';

    expect(parseAllowedEnv(content, ALLOWED)).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://a.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "quoted-value",
    });
  });
});

describe("applyAllowedEnvFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "allowed-env-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("ファイルの許可キーだけを env に入れ、入れたキー名を返す", () => {
    const file = path.join(dir, ".env.local");
    fs.writeFileSync(
      file,
      "NEXT_PUBLIC_SUPABASE_URL=https://a.supabase.co\nOTHER_SERVICE_KEY=x\n"
    );
    const env: Record<string, string | undefined> = {};

    expect(applyAllowedEnvFile(file, ALLOWED, env)).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
    ]);
    expect(env).toEqual({ NEXT_PUBLIC_SUPABASE_URL: "https://a.supabase.co" });
  });

  test("ファイルが無ければ何もしない(CI やクラウドには .env.local が無い)", () => {
    const env: Record<string, string | undefined> = {};

    expect(applyAllowedEnvFile(path.join(dir, "missing"), ALLOWED, env)).toEqual(
      []
    );
    expect(env).toEqual({});
  });

  test("すでに設定されている値は上書きしない(実行環境の指定を優先する)", () => {
    const file = path.join(dir, ".env.local");
    fs.writeFileSync(
      file,
      "NEXT_PUBLIC_SUPABASE_URL=https://from-file.supabase.co\n" +
        "SUPABASE_SERVICE_ROLE_KEY=from-file\n"
    );
    const env: Record<string, string | undefined> = {
      NEXT_PUBLIC_SUPABASE_URL: "https://from-env.supabase.co",
    };

    expect(applyAllowedEnvFile(file, ALLOWED, env)).toEqual([
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
    expect(env).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://from-env.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "from-file",
    });
  });
});
