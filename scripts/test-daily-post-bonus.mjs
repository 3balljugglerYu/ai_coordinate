#!/usr/bin/env node

/**
 * デイリー投稿特典機能のテストスクリプト（Node.js版）
 * 
 * 使用方法:
 *   node scripts/test-daily-post-bonus.mjs
 * 
 * 環境変数:
 *   NEXT_PUBLIC_SUPABASE_URL - SupabaseプロジェクトURL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY - Supabase匿名キー
 *   TEST_USER_ID - テスト用ユーザーID（オプション）
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ エラー: 環境変数が設定されていません');
  console.error('NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// テスト結果を記録
const testResults = [];

function recordTest(testName, passed, message, details = null) {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  testResults.push({ testName, passed, status, message, details });
  console.log(`${status}: ${testName}`);
  if (message) console.log(`   ${message}`);
  if (details) console.log(`   詳細: ${JSON.stringify(details, null, 2)}`);
}

// ============================================================================
// テスト1: データベース構造の確認
// ============================================================================

async function testDatabaseStructure() {
  console.log('\n=== テスト1: データベース構造の確認 ===\n');

  // テスト1-1: profilesテーブルのカラム確認（直接クエリで確認）
  const { data: directData, error: directError } = await supabase
    .from('profiles')
    .select('last_daily_post_bonus_at')
    .limit(1);

  recordTest(
    'Test 1-1: profilesテーブルのlast_daily_post_bonus_atカラム',
    !directError,
    directError 
      ? `エラー: ${directError.message} (カラムが存在しない可能性があります)` 
      : '✅ カラムが存在します（クエリが成功しました）',
    directError ? null : { column: 'last_daily_post_bonus_at', query_success: true }
  );

  // テスト1-2: RPC関数の存在確認（RPC呼び出しで確認）
  // 注意: 実際のユーザーIDと投稿IDが不要なテスト用の呼び出し
  // エラーメッセージから関数の存在を確認
  const testUserId = '00000000-0000-0000-0000-000000000000';
  const testGenerationId = '00000000-0000-0000-0000-000000000000';
  
  const { data: rpcTestData, error: rpcTestError } = await supabase.rpc(
    'grant_daily_post_bonus',
    {
      p_user_id: testUserId,
      p_generation_id: testGenerationId,
    }
  );

  // RPC関数が存在する場合は、エラーメッセージが異なる
  const functionExists = rpcTestError === null || 
    (rpcTestError.message && !rpcTestError.message.includes('function') && !rpcTestError.message.includes('does not exist'));

  recordTest(
    'Test 1-2: RPC関数grant_daily_post_bonusの存在確認',
    functionExists,
    rpcTestError 
      ? (rpcTestError.message.includes('function') || rpcTestError.message.includes('does not exist')
          ? `❌ RPC関数が見つかりません: ${rpcTestError.message}`
          : `✅ RPC関数が存在します（テスト用パラメータでのエラーは想定内）`)
      : '✅ RPC関数が存在します',
    { error: rpcTestError?.message || null, data: rpcTestData }
  );
}

// ============================================================================
// テスト2: RPC関数の動作テスト（実際のユーザーIDと投稿IDが必要）
// ============================================================================

async function testRPCFunction(userId, generationId) {
  console.log('\n=== テスト2: RPC関数の動作テスト ===\n');

  if (!userId || !generationId) {
    console.log('⚠️  スキップ: テスト用のユーザーIDと投稿IDが必要です');
    console.log('   環境変数TEST_USER_IDとTEST_GENERATION_IDを設定するか、');
    console.log('   手動でテストを実行してください\n');
    return;
  }

  // テスト2-1: べき等性テスト
  console.log('Test 2-1: べき等性テスト（同じ投稿IDで複数回呼び出し）');

  // 初回呼び出し
  const { data: firstCall, error: firstError } = await supabase.rpc(
    'grant_daily_post_bonus',
    {
      p_user_id: userId,
      p_generation_id: generationId,
    }
  );

  recordTest(
    'Test 2-1a: 初回RPC呼び出し',
    !firstError && typeof firstCall === 'number',
    firstError ? `エラー: ${firstError.message}` : `戻り値: ${firstCall}`,
    { result: firstCall, error: firstError?.message }
  );

  // 2回目呼び出し（べき等性チェック）
  const { data: secondCall, error: secondError } = await supabase.rpc(
    'grant_daily_post_bonus',
    {
      p_user_id: userId,
      p_generation_id: generationId,
    }
  );

  recordTest(
    'Test 2-1b: 2回目RPC呼び出し（べき等性）',
    !secondError && secondCall === 0,
    secondError
      ? `エラー: ${secondError.message}`
      : `戻り値: ${secondCall} (0であるべき)`,
    { result: secondCall, error: secondError?.message }
  );

  // テスト2-2: データ整合性の確認
  console.log('\nTest 2-2: データ整合性の確認');

  // credit_transactionsテーブルの確認
  const { data: transactions, error: txError } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('related_generation_id', generationId)
    .eq('transaction_type', 'daily_post');

  recordTest(
    'Test 2-2a: credit_transactionsテーブルの記録',
    !txError && transactions && transactions.length === 1,
    txError
      ? `エラー: ${txError.message}`
      : `${transactions?.length || 0}件の記録が存在します`,
    transactions?.[0]
  );

  // notificationsテーブルの確認
  const { data: notifications, error: notifError } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', userId)
    .eq('entity_id', generationId)
    .eq('type', 'bonus');

  recordTest(
    'Test 2-2b: notificationsテーブルの通知レコード',
    !notifError && notifications && notifications.length === 1,
    notifError
      ? `エラー: ${notifError.message}`
      : `${notifications?.length || 0}件の通知が存在します`,
    notifications?.[0]
  );

  // user_creditsテーブルの確認
  const { data: credits, error: creditsError } = await supabase
    .from('user_credits')
    .select('balance')
    .eq('user_id', userId)
    .single();

  recordTest(
    'Test 2-2c: user_creditsテーブルの残高',
    !creditsError && credits && credits.balance >= 50,
    creditsError
      ? `エラー: ${creditsError.message}`
      : `残高: ${credits?.balance || 0}ペルコイン`,
    { balance: credits?.balance }
  );

  // profilesテーブルの確認
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('last_daily_post_bonus_at')
    .eq('user_id', userId)
    .single();

  recordTest(
    'Test 2-2d: profilesテーブルのlast_daily_post_bonus_at',
    !profileError && profile && profile.last_daily_post_bonus_at !== null,
    profileError
      ? `エラー: ${profileError.message}`
      : `最終受取日時: ${profile?.last_daily_post_bonus_at || 'NULL'}`,
    { last_daily_post_bonus_at: profile?.last_daily_post_bonus_at }
  );
}

// ============================================================================
// メイン実行
// ============================================================================

async function main() {
  console.log('========================================');
  console.log('デイリー投稿特典機能のテストスクリプト');
  console.log('========================================\n');

  // テスト1: データベース構造の確認
  await testDatabaseStructure();

  // テスト2: RPC関数の動作テスト
  const testUserId = process.env.TEST_USER_ID;
  const testGenerationId = process.env.TEST_GENERATION_ID;
  await testRPCFunction(testUserId, testGenerationId);

  // テスト結果のサマリー
  console.log('\n========================================');
  console.log('テスト結果サマリー');
  console.log('========================================\n');

  const passedTests = testResults.filter((t) => t.passed).length;
  const totalTests = testResults.length;

  testResults.forEach(({ testName, status, message }) => {
    console.log(`${status}: ${testName}`);
  });

  console.log(`\n合計: ${passedTests}/${totalTests} テストが成功しました`);

  if (passedTests === totalTests) {
    console.log('✅ すべてのテストが成功しました！\n');
    process.exit(0);
  } else {
    console.log('❌ 一部のテストが失敗しました\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ テスト実行エラー:', error);
  process.exit(1);
});

