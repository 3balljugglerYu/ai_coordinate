/**
 * 返金処理のテスト用スクリプト（ペルコイン残高を設定してから実行）
 * 
 * 使用方法:
 * 1. ブラウザでアプリにログイン
 * 2. 開発者ツール（F12）を開く
 * 3. コンソールタブでこのスクリプトをコピー&ペーストして実行
 */

// 返金処理のテスト（ペルコイン残高を確認してから実行）
async function testRefundWithBalance() {
  console.log('🧪 返金処理のテストを開始します...');
  
  // まず、現在のペルコイン残高を確認
  try {
    const balanceResponse = await fetch('/api/credits/balance');
    const balanceData = await balanceResponse.json();
    
    console.log('💰 現在のペルコイン残高:', balanceData.balance);
    
    if (balanceData.balance < 20) {
      console.error('❌ ペルコイン残高が不足しています。');
      console.log('💡 以下のSQLで残高を設定してください:');
      console.log('   UPDATE user_credits SET balance = 20 WHERE user_id = \'your-user-id\';');
      console.log('');
      console.log('または、ブラウザのコンソールで以下を実行してください:');
      console.log('   fetch(\'/api/credits/add\', { method: \'POST\', headers: { \'Content-Type\': \'application/json\' }, body: JSON.stringify({ amount: 20 }) });');
      return;
    }
    
    console.log('✅ ペルコイン残高が十分です。テストを続行します...');
  } catch (error) {
    console.error('❌ 残高確認エラー:', error);
    return;
  }
  
  // 有効なBase64形式だが、実際には無効な画像データ（1x1ピクセルのPNG）
  const invalidBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  
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
      console.error('ステータスコード:', response.status);
      console.error('レスポンス:', data);
      
      // エラーの詳細を確認
      if (response.status === 400) {
        if (data.error.includes('ペルコイン残高が不足')) {
          console.log('💡 ペルコイン残高が不足しています。');
          console.log('   以下のSQLで残高を設定してください:');
          console.log('   UPDATE user_credits SET balance = 20 WHERE user_id = \'your-user-id\';');
        } else {
          console.log('💡 400エラーの原因:');
          console.log('   - バリデーションエラーの可能性があります');
          console.log('   - エラーメッセージ:', data.error);
        }
      }
      return;
    }
    
    console.log('✅ ジョブID:', data.jobId);
    console.log('⏳ 15秒後に返金処理を確認してください...');
    
    // 15秒後に確認
    setTimeout(async () => {
      try {
        const statusResponse = await fetch(`/api/generation-status?id=${data.jobId}`);
        const status = await statusResponse.json();
        console.log('📊 ジョブステータス:', status);
        
        if (status.status === 'failed') {
          console.log('✅ ジョブが失敗しました。返金処理が実行されている可能性があります。');
          console.log('📝 確認方法:');
          console.log('   1. Supabaseダッシュボード → Edge Functions → image-gen-worker → Logs');
          console.log('   2. [Percoin Refund]というプレフィックスが付いたログを確認');
          console.log('   3. credit_transactionsテーブルでtransaction_type="refund"を確認');
          
          // 残高を再確認
          const balanceResponse2 = await fetch('/api/credits/balance');
          const balanceData2 = await balanceResponse2.json();
          console.log('💰 現在のペルコイン残高:', balanceData2.balance);
          
          if (balanceData2.balance > 0) {
            console.log('✅ 残高が返金されている可能性があります！');
          }
        } else {
          console.log('⚠️  ジョブがまだ処理中です。もう少し待ってから確認してください。');
        }
      } catch (error) {
        console.error('❌ ステータス確認エラー:', error);
      }
    }, 15000);
  } catch (error) {
    console.error('❌ リクエストエラー:', error);
  }
}

// 実行
testRefundWithBalance();
