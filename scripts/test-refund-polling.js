/**
 * 返金処理のテスト用スクリプト（ポーリング機能付き）
 * 
 * 使用方法:
 * 1. ブラウザでアプリにログイン
 * 2. 開発者ツール（F12）を開く
 * 3. コンソールタブでこのスクリプトをコピー&ペーストして実行
 */

// 返金処理のテスト（ポーリング機能付き）
async function testRefundWithPolling() {
  console.log('🧪 返金処理のテストを開始します...');
  
  // まず、現在のペルコイン残高を確認
  let initialBalance = 0;
  try {
    const balanceResponse = await fetch('/api/credits/balance');
    const balanceData = await balanceResponse.json();
    initialBalance = balanceData.balance;
    console.log('💰 現在のペルコイン残高:', initialBalance);
    
    if (initialBalance < 20) {
      console.error('❌ ペルコイン残高が不足しています。');
      console.log('💡 以下のSQLで残高を設定してください:');
      console.log('   UPDATE user_credits SET balance = 20 WHERE user_id = \'your-user-id\';');
      return;
    }
    
    console.log('✅ ペルコイン残高が十分です。テストを続行します...');
  } catch (error) {
    console.error('❌ 残高確認エラー:', error);
    return;
  }
  
  // 有効なBase64形式だが、実際には無効な画像データ（1x1ピクセルのPNG）
  const invalidBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  
  let jobId = null;
  
  try {
    const response = await fetch('/api/generate-async', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'test prompt for refund',
        sourceImageBase64: `data:image/png;base64,${invalidBase64}`,
        sourceImageMimeType: 'image/png',
        model: 'gemini-2.5-flash-image',
        generationType: 'coordinate',
        backgroundChange: false,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('❌ エラー:', data.error);
      return;
    }
    
    jobId = data.jobId;
    console.log('✅ ジョブID:', jobId);
    console.log('⏳ ジョブのステータスをポーリングします...');
    
    // ポーリング開始（5秒ごとに確認、最大60秒）
    let pollCount = 0;
    const maxPolls = 12; // 12回 × 5秒 = 60秒
    
    const pollInterval = setInterval(async () => {
      pollCount++;
      
      try {
        const statusResponse = await fetch(`/api/generation-status?id=${jobId}`);
        const status = await statusResponse.json();
        
        console.log(`[${pollCount}/${maxPolls}] 📊 ジョブステータス:`, status.status);
        
        if (status.status === 'failed') {
          clearInterval(pollInterval);
          console.log('✅ ジョブが失敗しました。返金処理が実行されている可能性があります。');
          console.log('📝 エラーメッセージ:', status.errorMessage);
          
          // 残高を再確認
          const balanceResponse2 = await fetch('/api/credits/balance');
          const balanceData2 = await balanceResponse2.json();
          const finalBalance = balanceData2.balance;
          
          console.log('💰 初期残高:', initialBalance);
          console.log('💰 現在の残高:', finalBalance);
          
          if (finalBalance >= initialBalance) {
            console.log('✅ 残高が返金されている可能性があります！');
            console.log('   減算されたペルコイン:', initialBalance - 20);
            console.log('   返金後の残高:', finalBalance);
          } else {
            console.log('⚠️  残高が返金されていない可能性があります。');
            console.log('   減算されたペルコイン:', initialBalance - finalBalance);
          }
          
          console.log('');
          console.log('📝 詳細確認方法:');
          console.log('   1. Supabaseダッシュボード → Edge Functions → image-gen-worker → Logs');
          console.log('   2. [Percoin Refund]というプレフィックスが付いたログを確認');
          console.log('   3. credit_transactionsテーブルでtransaction_type="refund"を確認');
          console.log('   4. ジョブID:', jobId);
        } else if (status.status === 'succeeded') {
          clearInterval(pollInterval);
          console.log('⚠️  ジョブが成功しました。返金処理は実行されません。');
          console.log('   画像生成が成功したため、ペルコインは減算されたままです。');
        } else if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          console.log('⏰ タイムアウト: 60秒経過しました。');
          console.log('   ジョブがまだ処理中の可能性があります。');
          console.log('   手動で確認してください:');
          console.log('   - Supabaseダッシュボード → Edge Functions → image-gen-worker → Logs');
          console.log('   - ジョブID:', jobId);
        }
      } catch (error) {
        console.error('❌ ステータス確認エラー:', error);
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
        }
      }
    }, 5000); // 5秒ごとにポーリング
    
  } catch (error) {
    console.error('❌ リクエストエラー:', error);
  }
}

// 実行
testRefundWithPolling();
