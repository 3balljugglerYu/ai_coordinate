#!/usr/bin/env node
/**
 * バナーテーブル適用確認スクリプト
 * 使用方法: node --env-file=.env.local scripts/verify-banners.mjs
 * または: node scripts/verify-banners.mjs (環境変数が既に設定されている場合)
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("❌ 環境変数が必要です: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  console.error("   node --env-file=.env.local scripts/verify-banners.mjs で実行してください");
  process.exit(1);
}

const supabase = createClient(url, key);

async function verify() {
  console.log("🔍 バナーテーブルの確認中...\n");

  const { data, error } = await supabase
    .from("banners")
    .select("id, image_url, link_url, alt, display_order, status, display_start_at, display_end_at")
    .order("display_order", { ascending: true });

  if (error) {
    console.error("❌ エラー:", error.message);
    console.error("   テーブルが存在しないか、RLS/権限の問題の可能性があります");
    process.exit(1);
  }

  console.log("✅ バナーテーブルは正常に適用されています\n");
  console.log(`📋 取得件数: ${data?.length ?? 0} 件\n`);

  if (data?.length) {
    const now = new Date();
    console.log("--- バナー一覧 ---");
    data.forEach((row, i) => {
      const startOk = !row.display_start_at || new Date(row.display_start_at) <= now;
      const endOk = !row.display_end_at || new Date(row.display_end_at) > now;
      const wouldShow = row.status === "published" && startOk && endOk;
      console.log(`${i + 1}. ${row.alt}`);
      console.log(`   画像: ${row.image_url} | リンク: ${row.link_url} | 順序: ${row.display_order} | 状態: ${row.status}`);
      if (row.display_start_at || row.display_end_at) {
        console.log(`   表示期間: ${row.display_start_at ?? "なし"} 〜 ${row.display_end_at ?? "なし"}`);
        console.log(`   ホーム表示: ${wouldShow ? "✅ 表示" : "❌ 非表示（期間外）"}`);
      }
    });
  }

  process.exit(0);
}

verify();
