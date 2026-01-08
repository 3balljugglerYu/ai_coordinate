#!/bin/bash

# デイリー投稿特典機能のテストスクリプト（シェルスクリプト版）
# 
# 使用方法:
#   chmod +x scripts/test-daily-post-bonus.sh
#   ./scripts/test-daily-post-bonus.sh
#
# または
#   bash scripts/test-daily-post-bonus.sh

set -e

echo "=========================================="
echo "デイリー投稿特典機能のテストスクリプト"
echo "=========================================="
echo ""

# 環境変数の確認
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then
  echo "❌ エラー: 環境変数が設定されていません"
  echo "NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください"
  echo ""
  echo "使用方法:"
  echo "  export NEXT_PUBLIC_SUPABASE_URL='your-supabase-url'"
  echo "  export NEXT_PUBLIC_SUPABASE_ANON_KEY='your-supabase-anon-key'"
  echo "  ./scripts/test-daily-post-bonus.sh"
  exit 1
fi

# .env.localファイルから環境変数を読み込む（存在する場合）
if [ -f .env.local ]; then
  echo "📝 .env.localファイルから環境変数を読み込みます..."
  export $(cat .env.local | grep -v '^#' | xargs)
fi

echo "✅ 環境変数の読み込み完了"
echo ""

# Node.jsテストスクリプトの実行
if [ -f "scripts/test-daily-post-bonus.mjs" ]; then
  echo "🔍 Node.jsテストスクリプトを実行します..."
  echo ""
  node scripts/test-daily-post-bonus.mjs
else
  echo "⚠️  scripts/test-daily-post-bonus.mjs が見つかりません"
  echo "SQLテストスクリプトのみが利用可能です"
fi

echo ""
echo "=========================================="
echo "SQLテストスクリプトの実行方法:"
echo "=========================================="
echo ""
echo "Supabase MCPツールまたはSupabase CLIを使用して、"
echo "scripts/test-daily-post-bonus.sql を実行してください。"
echo ""
echo "例（Supabase CLI）:"
echo "  supabase db execute --file scripts/test-daily-post-bonus.sql"
echo ""

