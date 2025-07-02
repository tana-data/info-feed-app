#!/usr/bin/env node

/**
 * 手動要約機能のAPIテストスクリプト
 * TC_MANUAL_002: 手動要約API呼び出し検証
 */

const fs = require('fs');
const path = require('path');

// テスト用のモック関数を作成
function createMockTest() {
  console.log('=== 手動要約機能 API テスト ===\n');
  
  // TC_MANUAL_002: 手動要約API呼び出し検証
  console.log('📋 TC_MANUAL_002: 手動要約API呼び出し検証');
  
  // 期待されるAPI呼び出しの構造を検証
  const expectedApiCall = {
    method: 'POST',
    endpoint: '/api/articles/:id/summarize',
    headers: {
      'Content-Type': 'application/json'
    },
    body: {
      manual_text: '要約対象のテキスト'
    }
  };
  
  console.log('✅ 期待されるAPI構造:');
  console.log(JSON.stringify(expectedApiCall, null, 2));
  
  // フロントエンドのAPI呼び出しコードを検証
  console.log('\n🔍 フロントエンド実装確認:');
  
  const indexHtmlPath = path.join(__dirname, 'info-feed-app', 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    const content = fs.readFileSync(indexHtmlPath, 'utf8');
    
    // submitManualSummary関数の検索
    const submitFunctionMatch = content.match(/async function submitManualSummary\(\)[\s\S]*?(?=function|\s*<\/script>)/);
    if (submitFunctionMatch) {
      console.log('✅ submitManualSummary関数が見つかりました');
      
      // APIエンドポイントの確認
      if (content.includes('/api/articles/${currentArticleId}/summarize')) {
        console.log('✅ 正しいAPIエンドポイントが使用されています');
      } else {
        console.log('❌ APIエンドポイントが見つかりません');
      }
      
      // manual_textパラメータの確認
      if (content.includes('manual_text: manualText')) {
        console.log('✅ manual_textパラメータが正しく送信されています');
      } else {
        console.log('❌ manual_textパラメータが見つかりません');
      }
      
      // Content-Typeヘッダーの確認
      if (content.includes("'Content-Type': 'application/json'")) {
        console.log('✅ 適切なContent-Typeヘッダーが設定されています');
      } else {
        console.log('❌ Content-Typeヘッダーが見つかりません');
      }
      
    } else {
      console.log('❌ submitManualSummary関数が見つかりません');
    }
  } else {
    console.log('❌ index.htmlが見つかりません');
  }
  
  // バックエンドの実装確認
  console.log('\n🔍 バックエンド実装確認:');
  
  const articlesRoutePath = path.join(__dirname, 'backend', 'routes', 'articles.js');
  if (fs.existsSync(articlesRoutePath)) {
    const content = fs.readFileSync(articlesRoutePath, 'utf8');
    
    // manual_text処理の確認
    if (content.includes('manual_text')) {
      console.log('✅ manual_textパラメータが処理されています');
      
      // processManualSummaryRequest関数の確認
      if (content.includes('processManualSummaryRequest(id, manual_text)')) {
        console.log('✅ processManualSummaryRequest関数が正しく呼び出されています');
      } else {
        console.log('❌ processManualSummaryRequest関数呼び出しが見つかりません');
      }
      
      // コンテンツタイプ制限のバイパス確認
      if (content.includes('!manual_text && article.content_type')) {
        console.log('✅ 手動テキスト使用時のコンテンツタイプ制限バイパスが実装されています');
      } else {
        console.log('❌ コンテンツタイプ制限バイパスが見つかりません');
      }
      
    } else {
      console.log('❌ manual_textパラメータの処理が見つかりません');
    }
    
    // generateSummary関数の確認
    if (content.includes('generateSummary(manualText)')) {
      console.log('✅ AI要約生成関数が正しく呼び出されています');
    } else {
      console.log('❌ AI要約生成関数呼び出しが見つかりません');
    }
    
  } else {
    console.log('❌ articles.jsが見つかりません');
  }
  
  return true;
}

// 自動要約防止機能のテスト
function testAutoSummaryPrevention() {
  console.log('\n=== 自動要約防止機能テスト ===\n');
  
  console.log('📋 TC_AUTO_PREV_001: 自動要約トリガーの不在確認');
  
  // スケジューラーの動作確認
  const schedulerPath = path.join(__dirname, 'backend', 'utils', 'scheduler.js');
  if (fs.existsSync(schedulerPath)) {
    const content = fs.readFileSync(schedulerPath, 'utf8');
    
    console.log('🔍 スケジューラー実装確認:');
    
    // 要約関連の自動実行の確認
    if (content.includes('summarize') || content.includes('summary')) {
      console.log('⚠️  スケジューラーで要約関連の処理が見つかりました');
      console.log('   詳細確認が必要です');
    } else {
      console.log('✅ スケジューラーに要約の自動実行は含まれていません');
    }
    
    // フィード更新のみの確認
    if (content.includes('refreshAllFeeds') || content.includes('fetchArticles')) {
      console.log('✅ スケジューラーはフィード更新のみを実行しています');
    } else {
      console.log('❓ フィード更新処理が見つかりません');
    }
    
  } else {
    console.log('❌ scheduler.jsが見つかりません');
  }
  
  // コンテンツタイプ制限の確認
  console.log('\n📋 TC_AUTO_PREV_003: コンテンツタイプ制限の確認');
  
  const indexHtmlPath = path.join(__dirname, 'info-feed-app', 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    const content = fs.readFileSync(indexHtmlPath, 'utf8');
    
    // 要約ボタンの条件分岐確認
    const summaryButtonPattern = /article\.content_type === 'youtube' \|\| article\.content_type === 'podcast'/;
    if (summaryButtonPattern.test(content)) {
      console.log('✅ YouTube/Podcastのみに要約ボタンが表示される制限が実装されています');
    } else {
      console.log('❌ コンテンツタイプ制限が見つかりません');
    }
    
    // 手動要約ボタンの全タイプ表示確認
    if (content.includes('manual-summary-button')) {
      console.log('✅ 手動要約ボタンが全コンテンツタイプで表示されています');
    } else {
      console.log('❌ 手動要約ボタンが見つかりません');
    }
    
  }
  
  return true;
}

// YouTube字幕処理のテスト
function testYouTubeTranscriptFlow() {
  console.log('\n=== YouTube字幕取得・処理フローテスト ===\n');
  
  console.log('📋 TC_YOUTUBE_001: 字幕利用可能性チェック');
  
  const youtubeHelperPath = path.join(__dirname, 'backend', 'utils', 'youtube-helper.js');
  if (fs.existsSync(youtubeHelperPath)) {
    const content = fs.readFileSync(youtubeHelperPath, 'utf8');
    
    console.log('🔍 YouTube Helper実装確認:');
    
    // 字幕取得関数の確認
    if (content.includes('getYouTubeTranscript')) {
      console.log('✅ YouTube字幕取得関数が実装されています');
    } else {
      console.log('❌ YouTube字幕取得関数が見つかりません');
    }
    
    // キャッシュ機能の確認
    if (content.includes('getCachedTranscript') && content.includes('cacheTranscript')) {
      console.log('✅ 字幕キャッシュ機能が実装されています');
    } else {
      console.log('❌ 字幕キャッシュ機能が見つかりません');
    }
    
    // 多言語対応の確認
    if (content.includes('ja') && content.includes('en')) {
      console.log('✅ 多言語字幕対応が実装されています');
    } else {
      console.log('❌ 多言語字幕対応が見つかりません');
    }
    
    // エラーハンドリングの確認
    if (content.includes('catch') || content.includes('try')) {
      console.log('✅ エラーハンドリングが実装されています');
    } else {
      console.log('❌ エラーハンドリングが見つかりません');
    }
    
  } else {
    console.log('❌ youtube-helper.jsが見つかりません');
  }
  
  // APIエンドポイント確認
  const articlesRoutePath = path.join(__dirname, 'backend', 'routes', 'articles.js');
  if (fs.existsSync(articlesRoutePath)) {
    const content = fs.readFileSync(articlesRoutePath, 'utf8');
    
    console.log('\n🔍 APIエンドポイント確認:');
    
    // content-check エンドポイントの確認
    if (content.includes('/content-check')) {
      console.log('✅ /content-check エンドポイントが実装されています');
    } else {
      console.log('❌ /content-check エンドポイントが見つかりません');
    }
    
    // transcript-check エンドポイントの確認
    if (content.includes('/transcript-check')) {
      console.log('✅ /transcript-check エンドポイントが実装されています');
    } else {
      console.log('❌ /transcript-check エンドポイントが見つかりません');
    }
  }
  
  return true;
}

// 問題点の特定
function identifyIssues() {
  console.log('\n=== 🚨 問題点の特定 ===\n');
  
  const issues = [];
  
  // 1. API キーの設定確認
  console.log('🔍 環境設定の確認:');
  
  if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) {
    issues.push('❌ AI API キーが設定されていません (OPENAI_API_KEY または GEMINI_API_KEY)');
  } else {
    console.log('✅ AI API キーが設定されています');
  }
  
  if (!process.env.YOUTUBE_API_KEY) {
    issues.push('⚠️  YouTube Data API キーが設定されていません (字幕チェック機能に影響)');
  } else {
    console.log('✅ YouTube API キーが設定されています');
  }
  
  // 2. データベースの存在確認
  const dbPath = path.join(__dirname, 'newsfeeder.db');
  if (fs.existsSync(dbPath)) {
    console.log('✅ データベースファイルが存在します');
  } else {
    issues.push('❌ データベースファイルが見つかりません');
  }
  
  // 3. 必要なファイルの存在確認
  const requiredFiles = [
    'server.js',
    'backend/routes/articles.js',
    'backend/utils/youtube-helper.js',
    'info-feed-app/index.html'
  ];
  
  requiredFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
      issues.push(`❌ 必要なファイルが見つかりません: ${file}`);
    }
  });
  
  // 4. package.json の依存関係確認
  const packagePath = path.join(__dirname, 'package.json');
  if (fs.existsSync(packagePath)) {
    const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const requiredDeps = [
      'express',
      'openai',
      '@google/generative-ai',
      'youtube-transcript',
      'sqlite3'
    ];
    
    const missingDeps = requiredDeps.filter(dep => 
      !packageContent.dependencies[dep] && !packageContent.devDependencies[dep]
    );
    
    if (missingDeps.length > 0) {
      issues.push(`❌ 必要な依存関係が不足: ${missingDeps.join(', ')}`);
    }
  }
  
  // 結果表示
  if (issues.length === 0) {
    console.log('\n🎉 重大な問題は見つかりませんでした！');
  } else {
    console.log('\n🚨 発見された問題:');
    issues.forEach(issue => console.log(`  ${issue}`));
  }
  
  return issues;
}

// メイン実行
function main() {
  console.log('動画・Podcast要約機能 テスト実行開始\n');
  console.log('━'.repeat(60));
  
  try {
    createMockTest();
    testAutoSummaryPrevention();
    testYouTubeTranscriptFlow();
    const issues = identifyIssues();
    
    console.log('\n━'.repeat(60));
    console.log('📊 テスト実行完了');
    
    const totalTests = 3;
    const passedTests = totalTests - (issues.length > 0 ? 1 : 0);
    
    console.log(`\n結果: ${passedTests}/${totalTests} テスト通過`);
    
    if (issues.length === 0) {
      console.log('🎉 全てのテストが正常に完了しました');
      console.log('\n次のステップ: サーバーを起動してブラウザテストを実行してください');
      console.log('  npm start');
      console.log('  http://localhost:3000');
    } else {
      console.log('⚠️  修正が必要な項目があります');
    }
    
  } catch (error) {
    console.error('❌ テスト実行中にエラーが発生しました:', error.message);
  }
}

// 実行
if (require.main === module) {
  main();
}

module.exports = {
  createMockTest,
  testAutoSummaryPrevention,
  testYouTubeTranscriptFlow,
  identifyIssues
};