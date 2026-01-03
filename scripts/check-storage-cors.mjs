/**
 * SupabaseストレージのCORS設定を確認するスクリプト
 * 
 * 使用方法:
 * node scripts/check-storage-cors.mjs [画像URL]
 * 
 * 例:
 * node scripts/check-storage-cors.mjs "https://hnrccaxrvhtbuihfvitc.supabase.co/storage/v1/object/public/generated-images/..."
 */

const imageUrl = process.argv[2];

if (!imageUrl) {
  console.error('❌ 画像URLを指定してください');
  console.log('使用方法: node scripts/check-storage-cors.mjs [画像URL]');
  process.exit(1);
}

async function checkCORS(url) {
  try {
    console.log(`🔍 CORS設定を確認中: ${url}\n`);

    // OPTIONSリクエストでCORSプリフライトを確認
    console.log('1. OPTIONSリクエスト（プリフライト）を送信...');
    const optionsResponse = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'GET',
      },
    });

    console.log(`   ステータス: ${optionsResponse.status}`);
    console.log(`   CORSヘッダー:`);
    console.log(`   - Access-Control-Allow-Origin: ${optionsResponse.headers.get('Access-Control-Allow-Origin') || '❌ なし'}`);
    console.log(`   - Access-Control-Allow-Methods: ${optionsResponse.headers.get('Access-Control-Allow-Methods') || '❌ なし'}`);
    console.log(`   - Access-Control-Allow-Headers: ${optionsResponse.headers.get('Access-Control-Allow-Headers') || '❌ なし'}`);
    console.log(`   - Access-Control-Expose-Headers: ${optionsResponse.headers.get('Access-Control-Expose-Headers') || '❌ なし'}\n`);

    // GETリクエストで実際の画像取得を確認
    console.log('2. GETリクエスト（実際の画像取得）を送信...');
    const getResponse = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Origin': 'https://example.com',
      },
    });

    console.log(`   ステータス: ${getResponse.status}`);
    console.log(`   Content-Type: ${getResponse.headers.get('Content-Type') || '❌ なし'}`);
    console.log(`   Content-Length: ${getResponse.headers.get('Content-Length') || '❌ なし'}`);
    
    if (getResponse.ok) {
      const blob = await getResponse.blob();
      console.log(`   ✅ 画像の取得に成功 (サイズ: ${blob.size} bytes, タイプ: ${blob.type})`);
    } else {
      console.log(`   ❌ 画像の取得に失敗: ${getResponse.statusText}`);
    }

    // CORS設定の評価
    console.log('\n📊 CORS設定の評価:');
    const allowOrigin = optionsResponse.headers.get('Access-Control-Allow-Origin');
    const allowMethods = optionsResponse.headers.get('Access-Control-Allow-Methods');
    
    if (allowOrigin && (allowOrigin === '*' || allowOrigin.includes('http'))) {
      console.log('   ✅ Access-Control-Allow-Origin が設定されています');
    } else {
      console.log('   ⚠️  Access-Control-Allow-Origin が設定されていません');
      console.log('   ⚠️  Web Share API Level 2 (files) を使用するにはCORS設定が必要です');
    }

    if (allowMethods && allowMethods.includes('GET')) {
      console.log('   ✅ GETメソッドが許可されています');
    } else {
      console.log('   ⚠️  GETメソッドが許可されていない可能性があります');
    }

    if (getResponse.ok) {
      console.log('\n✅ 結論: CORS設定は正常に機能しているようです');
      console.log('   Web Share API Level 2 (files) を使用する準備ができています');
    } else {
      console.log('\n❌ 結論: CORS設定に問題がある可能性があります');
      console.log('   SupabaseダッシュボードでストレージのCORS設定を確認してください');
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    console.error('\n考えられる原因:');
    console.error('1. 画像URLが正しくない');
    console.error('2. ネットワーク接続の問題');
    console.error('3. CORS設定が正しくない');
    console.error('4. 認証が必要な画像の場合、認証情報が必要');
    process.exit(1);
  }
}

checkCORS(imageUrl);

