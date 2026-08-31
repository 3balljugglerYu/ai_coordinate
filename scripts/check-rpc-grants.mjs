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
 * そのロールから呼ばれる**必要がある**関数だけを列挙する。
 *
 * ⭐ 「関数内で弾けるから開けておく」は理由にならない。弾けることと、
 * 開けておく必要があることは別。
 *
 * ⭐ 名前ではなく**シグネチャ**で持つ。同名の別オーバーロードが増えても
 * 許可済みの名前に紛れて見逃さないため（RPC は署名ごとに別の API 面）。
 */
/**
 * そのロールから呼ばれる**必要がある**関数だけを列挙する。
 *
 * ⭐ 「関数内で弾けるから開けておく」は理由にならない。弾けることと、
 * 開けておく必要があることは別。
 *
 * ⭐ 名前ではなく**シグネチャ**で持つ。同名の別オーバーロードが増えても
 * 許可済みの名前に紛れて見逃さないため（RPC は署名ごとに別の API 面）。
 */
const REQUIRED = {
  anon: new Set([
    // 未ログインでも見えるプロフィールの数値
    "public.get_follow_counts(p_user_id uuid)",
    "public.get_user_like_count(p_user_id uuid, p_include_non_visible boolean)",
    "public.get_user_view_count(p_user_id uuid, p_include_non_visible boolean)",
    // 未ログインでも見えるミッションの付与額
    "public.get_post_bonus_amounts()",
    "public.get_prompt_use_bonus_amount()",
    // 未ログインの閲覧もカウントする仕様
    "public.increment_view_count(image_id_param uuid)",
  ]),
  authenticated: new Set([
    "public.get_follow_counts(p_user_id uuid)",
    "public.get_user_like_count(p_user_id uuid, p_include_non_visible boolean)",
    "public.get_user_view_count(p_user_id uuid, p_include_non_visible boolean)",
    "public.get_post_bonus_amounts()",
    "public.get_prompt_use_bonus_amount()",
    "public.increment_view_count(image_id_param uuid)",
    "public.get_user_generated_count(p_user_id uuid)",
    "public.apply_percoin_transaction(p_user_id uuid, p_amount integer, p_mode text, p_metadata jsonb, p_stripe_payment_intent_id text, p_related_generation_id uuid)",
    "public.get_expiring_this_month_count(p_user_id uuid)",
    "public.get_free_percoin_batches_expiring(p_user_id uuid)",
    "public.cancel_account_deletion(p_user_id uuid)",
    "public.check_and_grant_referral_bonus_on_first_login_with_reason(p_user_id uuid, p_referral_code text)",
    "public.generate_referral_code(p_user_id uuid)",
    "public.grant_streak_bonus(p_user_id uuid)",
    "public.create_collection_completion_post(p_completion_id uuid, p_caption text, p_image_url text, p_storage_path text, p_storage_path_display text, p_storage_path_thumb text)",
    "public.delete_comment_thread(p_comment_id uuid)",
    "public.grant_tour_bonus(p_user_id uuid)",
    "public.insert_source_image_stock(p_user_id uuid, p_image_url text, p_storage_path text, p_name text)",
    // セッションクライアント経由で呼ぶことを確認済み
    "public.get_collection_progress()",
    "public.create_post_moderation_appeal(p_decision_id uuid, p_body text)",
    // 台紙生成 route がセッションクライアントで呼ぶ。関数内で auth.uid() を
    // 必須にし、p_allow_admin_only は admin_users で検証している
    "public.reserve_collection_completion(p_category_key text, p_allow_admin_only boolean)",
    // 関数内で admin_users による本人確認あり（監査済み）
    "public.get_creator_looks_secret_for_admin(p_template_id uuid)",
  ]),
};

/**
 * まだ監査していない既存の露出。**許可した訳ではない。**
 *
 * ⭐ REQUIRED に混ぜてはいけない。混ぜると、後でこれらを閉じたときに
 * 「不足」と判定されて失敗し、**閉じる修正が再び開く方向へ誘導される**
 * （レビュー指摘）。増加の検知にだけ使い、不足は見ない。
 *
 * ここが 0 になるまで減らすのが目標。
 */
const KNOWN_UNAUDITED_BASELINE = {
  anon: new Set([]),
  // 現在は 0 本。増えたら「監査していない露出がある」ことを意味する。
  authenticated: new Set([]),
};

const SQL = `
select
  n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and p.prorettype <> 'trigger'::regtype::oid
  and (
    has_function_privilege('anon', p.oid, 'EXECUTE')
    or has_function_privilege('authenticated', p.oid, 'EXECUTE')
  )
order by 1
`;

function runQuery() {
  const dbUrlIndex = process.argv.indexOf("--db-url");
  /*
    ⭐ --output json --agent yes を必ず付ける。
    supabase CLI は「人が実行した」と判定すると table 形式で出すため、
    付けないと手で回したときだけ parse error で落ちる（レビュー指摘）。
  */
  const target =
    dbUrlIndex !== -1
      ? ["--db-url", process.argv[dbUrlIndex + 1]]
      : ["--linked"];
  const args = ["db", "query", "--output", "json", "--agent", "yes", ...target, SQL];

  const stdout = execFileSync("supabase", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  // CLI は前後に人間向けの行を混ぜるので、JSON 部分だけを取り出す
  const match = stdout.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`クエリ結果を解釈できませんでした:\n${stdout}`);
  }
  return JSON.parse(match[0]).rows;
}

function main() {
  const rows = runQuery();
  let failed = false;

  for (const role of ["anon", "authenticated"]) {
    const actual = rows.filter((row) => row[role]).map((row) => row.signature);
    const required = REQUIRED[role];
    const baseline = KNOWN_UNAUDITED_BASELINE[role];

    // 許可でも既知でもないもの = 新しく開いた穴
    const unexpected = actual.filter(
      (sig) => !required.has(sig) && !baseline.has(sig)
    );
    // 不足は required にだけ適用する（baseline は閉じてよいので見ない）
    const missing = [...required].filter((sig) => !actual.includes(sig));
    const debt = actual.filter((sig) => baseline.has(sig));

    console.log(
      `${role}: 実行可 ${actual.length}本（必要 ${required.size} / 未監査 ${debt.length}）`
    );

    if (unexpected.length > 0) {
      failed = true;
      console.error(
        `\n❌ 許可リストにも既知リストにも無い関数が ${unexpected.length}本 ${role} から実行できます:`
      );
      for (const sig of unexpected) console.error(`   - ${sig}`);
    }

    if (missing.length > 0) {
      /*
        必要なのに実行できない = その画面が壊れている可能性。
        閉じ過ぎも異常として扱う（気づかないまま機能が死ぬのを防ぐ）。
      */
      failed = true;
      console.error(
        `\n⚠️ 必要なのに ${role} から実行できない関数が ${missing.length}本あります:`
      );
      for (const sig of missing) console.error(`   - ${sig}`);
    }

    if (debt.length > 0) {
      // 失敗にはしないが、残っていることを毎回見えるようにする
      console.warn(
        `\n📋 未監査のまま ${role} に開いている関数が ${debt.length}本あります（要調査）:`
      );
      for (const sig of debt) console.warn(`   - ${sig}`);
    }
  }

  if (failed) {
    console.error(
      "\n   新しい関数を追加したなら、migration に以下を書き足してください:\n" +
        "     REVOKE ALL ON FUNCTION public.<name>(<args>) FROM PUBLIC;\n" +
        "     REVOKE ALL ON FUNCTION public.<name>(<args>) FROM anon;\n" +
        "     REVOKE ALL ON FUNCTION public.<name>(<args>) FROM authenticated;\n" +
        "     GRANT EXECUTE ON FUNCTION public.<name>(<args>) TO service_role;\n" +
        "   ログイン中のユーザーから呼ぶなら authenticated にも GRANT し、\n" +
        "   このスクリプトの REQUIRED にもシグネチャを追記してください。"
    );
    process.exitCode = 1;
    return;
  }

  console.log("\n✅ 許可リストと一致しています");
}

main();
