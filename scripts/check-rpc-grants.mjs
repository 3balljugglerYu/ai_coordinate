#!/usr/bin/env node
/**
 * SECURITY DEFINER の RPC が未ログイン(anon)から実行できる状態になっていないか検査する。
 *
 * ## なぜ必要か
 *
 * Supabase は public スキーマの関数に対し、既定権限で anon と authenticated へ
 * EXECUTE を自動付与する。つまり **CREATE FUNCTION した瞬間に穴が空く**。
 * `ALTER DEFAULT PRIVILEGES` で閉じようとしても、supabase_admin 由来の既定は
 * `permission denied to change default privileges` で変更できない（検証済み）。
 *
 * 2026-08-31 に、この経路で未ログインから残高の増減・アカウント停止・
 * メールからの user_id 特定ができる状態になっていた（#582 / #583 / #584）。
 * 警告コメントを書いた本人が直後に同じ穴を空けており、規約では防げていない。
 *
 * そこで「防止」ではなく「検知」に寄せる。マイグレーション適用後にこれを回す。
 *
 * ## 使い方
 *
 *   node scripts/check-rpc-grants.mjs            # supabase db query --linked を使う
 *   node scripts/check-rpc-grants.mjs --db-url postgres://...
 *
 * 差分があれば終了コード 1。
 */

import { execFileSync } from "node:child_process";

/**
 * 未ログインから呼ばれる**必要がある**関数だけを列挙する。
 *
 * ⭐ 「関数内で弾けるから開けておく」は理由にならない。弾けることと、
 * 開けておく必要があることは別。ログインが前提の機能はここに入れない。
 */
const ALLOWLIST = new Set([
  // 未ログインでも見えるプロフィールの数値
  "get_follow_counts",
  "get_user_like_count",
  "get_user_view_count",
  // 未ログインでも見えるミッションの付与額
  "get_post_bonus_amounts",
  "get_prompt_use_bonus_amount",
  // 未ログインの閲覧もカウントする仕様
  "increment_view_count",
]);

const SQL = `
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and has_function_privilege('anon', p.oid, 'EXECUTE')
  and p.prorettype <> 'trigger'::regtype::oid
order by 1
`;

function runQuery() {
  const dbUrlIndex = process.argv.indexOf("--db-url");
  const args =
    dbUrlIndex !== -1
      ? ["db", "query", "--db-url", process.argv[dbUrlIndex + 1], SQL]
      : ["db", "query", "--linked", SQL];

  const stdout = execFileSync("supabase", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  // CLI は前後に人間向けの行を混ぜるので、JSON 部分だけを取り出す
  const match = stdout.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`クエリ結果を解釈できませんでした:\n${stdout}`);
  }
  return JSON.parse(match[0]).rows.map((row) => row.proname);
}

function main() {
  const actual = runQuery();

  const unexpected = actual.filter((name) => !ALLOWLIST.has(name));
  const missing = [...ALLOWLIST].filter((name) => !actual.includes(name));

  console.log(`anon から実行できる SECURITY DEFINER 関数: ${actual.length}本`);

  if (unexpected.length > 0) {
    console.error(
      `\n❌ 許可リストに無い関数が ${unexpected.length}本 anon から実行できます:`
    );
    for (const name of unexpected) console.error(`   - ${name}`);
    console.error(
      "\n   新しい関数を追加したなら、migration に以下を書き足してください:\n" +
        "     REVOKE ALL ON FUNCTION public.<name>(<args>) FROM PUBLIC;\n" +
        "     REVOKE ALL ON FUNCTION public.<name>(<args>) FROM anon;\n" +
        "     GRANT EXECUTE ON FUNCTION public.<name>(<args>) TO service_role;\n" +
        "   ログイン中のユーザーから呼ぶなら authenticated にも GRANT します。"
    );
  }

  if (missing.length > 0) {
    /*
      許可リストにあるのに実行できない = 未ログインの画面が壊れている可能性。
      閉じ過ぎも異常として扱う（気づかないまま機能が死ぬのを防ぐ）。
    */
    console.error(
      `\n⚠️ 許可リストにあるが anon から実行できない関数が ${missing.length}本あります:`
    );
    for (const name of missing) console.error(`   - ${name}`);
  }

  if (unexpected.length > 0 || missing.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log("✅ 許可リストと一致しています");
}

main();
