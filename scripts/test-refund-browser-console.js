/**
 * 返金処理のテスト用スクリプト（ブラウザのコンソールで実行）
 * 
 * 使用方法:
 * 1. ブラウザでアプリにログイン
 * 2. 開発者ツール（F12）を開く
 * 3. コンソールタブでこのスクリプトをコピー&ペーストして実行
 */

// 方法1: 無効なBase64データを送信（バリデーションを通過させるため、有効なBase64形式にする）
async function testRefundWithInvalidBase64() {
  console.log('🧪 返金処理のテストを開始します...');
  
  // 有効なBase64形式だが、実際には無効な画像データ
  // 最小限のPNGヘッダーを含むが、不完全なデータ
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
      console.error('レスポンス:', data);
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

// 方法2: 存在しない画像URLを使用（sourceImageStockIdを使用）
async function testRefundWithInvalidStockId() {
  console.log('🧪 返金処理のテストを開始します（存在しないストック画像IDを使用）...');
  
  // 存在しないUUIDを生成
  const invalidStockId = '00000000-0000-0000-0000-000000000000';
  
  try {
    const response = await fetch('/api/generate-async', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'test prompt for refund',
        sourceImageStockId: invalidStockId,
        model: 'gemini-2.5-flash-image',
        generationType: 'coordinate',
        backgroundChange: false,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('❌ エラー:', data.error);
      console.error('レスポンス:', data);
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

// 実行方法を選択
console.log('返金処理のテスト方法を選択してください:');
console.log('1. testRefundWithInvalidBase64() - 無効なBase64データを使用');
console.log('2. testRefundWithInvalidStockId() - 存在しないストック画像IDを使用');
console.log('');
console.log('例: testRefundWithInvalidBase64() を実行する場合:');
console.log('   testRefundWithInvalidBase64();');
