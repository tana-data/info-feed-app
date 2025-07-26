const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { sendError, sendSuccess, handleDatabaseError } = require('../utils/response-helpers');

router.get('/', (req, res) => {
  const { unread_only = 'true', limit = 10, offset = 0 } = req.query;
  
  let query = `
    SELECT 
      a.*,
      f.title as feed_title,
      f.url as feed_url
    FROM articles a
    JOIN feeds f ON a.feed_id = f.id
    WHERE f.is_active = 1
  `;
  
  const params = [];
  
  if (unread_only === 'true') {
    query += ' AND a.read_status = 0';
  }
  
  query += ' ORDER BY a.pub_date DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return handleDatabaseError(res, err, 'fetch articles');
    }
    
    const groupedArticles = {};
    rows.forEach(article => {
      const category = article.content_type || 'article';
      if (!groupedArticles[category]) {
        groupedArticles[category] = [];
      }
      groupedArticles[category].push(article);
    });
    
    res.json({
      articles: rows,
      grouped: groupedArticles,
      total: rows.length
    });
  });
});

router.patch('/:id/read', (req, res) => {
  const { id } = req.params;
  const { read_status = true } = req.body;
  
  db.run(
    'UPDATE articles SET read_status = ? WHERE id = ?',
    [read_status ? 1 : 0, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Article not found' });
      }
      
      res.json({ 
        message: 'Article read status updated',
        read_status: read_status
      });
    }
  );
});

router.post('/:id/summarize', async (req, res) => {
  const { id } = req.params;
  const { manual_text, audio_summary, youtube_summary } = req.body; // 手動テキスト、音声要約、またはYouTube要約フラグ
  
  db.get(`
    SELECT 
      a.*,
      f.url as feed_url,
      f.title as feed_title
    FROM articles a
    JOIN feeds f ON a.feed_id = f.id
    WHERE a.id = ?
  `, [id], async (err, article) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // 手動テキストが提供された場合は任意のコンテンツタイプで要約可能
    // 音声要約の場合はPodcastのみ許可
    // YouTube要約の場合はYouTubeのみ許可
    if (!manual_text && !audio_summary && !youtube_summary && article.content_type !== 'youtube' && article.content_type !== 'podcast') {
      return res.status(400).json({ error: 'Summarization only available for YouTube and Podcast content, or with manual text input' });
    }
    
    if (audio_summary && article.content_type !== 'podcast') {
      return res.status(400).json({ error: 'Audio summarization only available for Podcast content' });
    }
    
    if (youtube_summary && article.content_type !== 'youtube') {
      return res.status(400).json({ error: 'YouTube summarization only available for YouTube content' });
    }
    
    db.run(
      'INSERT INTO summary_requests (article_id, status) VALUES (?, ?)',
      [id, 'pending'],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        // 手動テキスト、音声要約、またはYouTube要約の処理分岐
        if (manual_text) {
          processManualSummaryRequest(id, manual_text);
        } else if (audio_summary) {
          processSummaryRequest(id, article); // Podcastの音声要約を処理
        } else if (youtube_summary) {
          processSummaryRequest(id, article); // YouTubeの動画要約を処理
        } else {
          processSummaryRequest(id, article); // 従来の自動要約を処理
        }
        
        res.json({
          success: true,
          message: audio_summary ? 'Audio summary request created' : 
                   youtube_summary ? 'YouTube summary request created' : 
                   'Summary request created',
          request_id: this.lastID
        });
      }
    );
  });
});

router.get('/:id/summary', (req, res) => {
  const { id } = req.params;
  
  db.get(
    `SELECT 
       a.summary_status,
       a.summary_text,
       sr.status as request_status,
       sr.error_message,
       sr.created_at as request_created,
       sr.completed_at as request_completed
     FROM articles a
     LEFT JOIN summary_requests sr ON a.id = sr.article_id
     WHERE a.id = ?
     ORDER BY sr.created_at DESC
     LIMIT 1`,
    [id],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (!row) {
        return res.status(404).json({ error: 'Article not found' });
      }
      
      res.json(row);
    }
  );
});

router.get('/:id/transcript-check', async (req, res) => {
  const { id } = req.params;
  
  try {
    const article = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM articles WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    if (article.content_type !== 'youtube') {
      return res.json({ 
        available: false, 
        reason: 'Not a YouTube video' 
      });
    }
    
    const { checkTranscriptAvailability, isValidYouTubeUrl } = require('../utils/youtube-helper');
    
    if (!isValidYouTubeUrl(article.link)) {
      return res.json({ 
        available: false, 
        reason: 'Invalid YouTube URL' 
      });
    }
    
    const available = await checkTranscriptAvailability(article.link);
    
    res.json({ 
      available,
      reason: available ? 'Transcript available' : 'No transcript found'
    });
    
  } catch (error) {
    console.error('Transcript check error:', error);
    res.status(500).json({ 
      error: 'Failed to check transcript availability',
      details: error.message 
    });
  }
});

router.get('/:id/content-check', async (req, res) => {
  const { id } = req.params;
  
  try {
    const article = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM articles WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    if (article.content_type !== 'youtube') {
      return res.json({ 
        available: false, 
        reason: 'Not a YouTube video',
        methods: []
      });
    }
    
    const { checkTranscriptAvailability, getYouTubeMetadata, isValidYouTubeUrl } = require('../utils/youtube-helper');
    
    if (!isValidYouTubeUrl(article.link)) {
      return res.json({ 
        available: false, 
        reason: 'Invalid YouTube URL',
        methods: []
      });
    }
    
    const availableMethods = [];
    let hasContent = false;
    
    // 字幕チェック
    try {
      const transcriptAvailable = await checkTranscriptAvailability(article.link);
      if (transcriptAvailable) {
        availableMethods.push('transcript');
        hasContent = true;
      }
    } catch (error) {
      console.log('Transcript check failed:', error.message);
    }
    
    // YouTube Data API で説明文チェック
    try {
      const metadata = await getYouTubeMetadata(article.link);
      if (metadata && metadata.hasDescription) {
        availableMethods.push('description');
        hasContent = true;
      }
    } catch (error) {
      console.log('Description check failed:', error.message);
    }
    
    res.json({ 
      available: hasContent,
      methods: availableMethods,
      reason: hasContent 
        ? `Content available via: ${availableMethods.join(', ')}`
        : 'No content available for summarization'
    });
    
  } catch (error) {
    console.error('Content check error:', error);
    res.status(500).json({ 
      error: 'Failed to check content availability',
      details: error.message 
    });
  }
});

router.get('/api-diagnosis', async (req, res) => {
  try {
    const whisperService = require('../utils/whisper-service');
    const diagnosis = await whisperService.diagnoseOpenAIConnection();
    
    res.json({
      service: 'OpenAI Basic API',
      diagnosis: diagnosis,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('API diagnosis error:', error);
    res.status(500).json({ 
      error: 'Failed to run API diagnosis',
      details: error.message 
    });
  }
});

router.get('/whisper-diagnosis', async (req, res) => {
  try {
    const whisperService = require('../utils/whisper-service');
    const diagnosis = await whisperService.diagnoseWhisperAPIConnection();
    
    res.json({
      service: 'OpenAI Whisper API',
      diagnosis: diagnosis,
      timestamp: new Date().toISOString(),
      recommendations: generateWhisperDiagnosisRecommendations(diagnosis)
    });
    
  } catch (error) {
    console.error('Whisper API diagnosis error:', error);
    res.status(500).json({ 
      error: 'Failed to run Whisper API diagnosis',
      details: error.message 
    });
  }
});

router.get('/network-diagnosis', async (req, res) => {
  try {
    const whisperService = require('../utils/whisper-service');
    const diagnosis = await whisperService.diagnoseNetworkLayered();
    
    res.json({
      service: 'Network Layered Diagnosis',
      diagnosis: diagnosis,
      timestamp: new Date().toISOString(),
      summary: generateNetworkDiagnosisSummary(diagnosis)
    });
    
  } catch (error) {
    console.error('Network diagnosis error:', error);
    res.status(500).json({ 
      error: 'Failed to run network diagnosis',
      details: error.message 
    });
  }
});

function generateNetworkDiagnosisSummary(diagnosis) {
  const summary = {
    overallStatus: 'unknown',
    criticalIssues: 0,
    warnings: 0,
    passedTests: 0,
    failedTests: 0,
    environment: diagnosis.environment.isWSL ? 'WSL2' : diagnosis.environment.platform,
    nextSteps: []
  };

  // テスト結果のカウント
  const tests = ['dns', 'tcp', 'https', 'openaiApi', 'whisperApi'];
  tests.forEach(test => {
    if (diagnosis[test]?.success) {
      summary.passedTests++;
    } else {
      summary.failedTests++;
    }
  });

  // 重要度に基づく分類
  diagnosis.recommendations.forEach(rec => {
    if (rec.priority === 'critical') {
      summary.criticalIssues++;
    } else if (rec.priority === 'high' || rec.priority === 'medium') {
      summary.warnings++;
    }
  });

  // 全体的なステータス判定
  if (summary.criticalIssues > 0) {
    summary.overallStatus = 'critical';
  } else if (summary.failedTests > 0 || summary.warnings > 0) {
    summary.overallStatus = 'warning';
  } else if (summary.passedTests === tests.length) {
    summary.overallStatus = 'healthy';
  }

  // 次のステップ提案
  if (!diagnosis.dns.success) {
    summary.nextSteps.push('Fix DNS resolution issues first');
  } else if (!diagnosis.tcp.success) {
    summary.nextSteps.push('Resolve firewall/network connectivity issues');
  } else if (!diagnosis.https.success) {
    summary.nextSteps.push('Check proxy and TLS/SSL configuration');
  } else if (!diagnosis.openaiApi.success) {
    summary.nextSteps.push('Verify OpenAI API key and configuration');
  } else if (!diagnosis.whisperApi.success) {
    summary.nextSteps.push('Test with smaller audio files or check upload capabilities');
  } else {
    summary.nextSteps.push('Network appears healthy - issue may be transient');
  }

  // WSL2特有の推奨事項
  if (diagnosis.environment.isWSL && summary.overallStatus !== 'healthy') {
    summary.nextSteps.push('Consider WSL2-specific network troubleshooting');
  }

  return summary;
}

router.post('/whisper-test', async (req, res) => {
  try {
    const { test_audio_url } = req.body;
    
    if (!test_audio_url) {
      return res.status(400).json({ 
        error: 'test_audio_url is required',
        example: 'POST /api/articles/whisper-test with body: {"test_audio_url": "https://example.com/audio.mp3"}'
      });
    }
    
    const whisperService = require('../utils/whisper-service');
    
    // まず診断を実行
    const diagnosis = await whisperService.diagnoseWhisperAPIConnection();
    
    if (!diagnosis.canUploadFiles) {
      return res.status(400).json({
        error: 'Whisper API is not available for file uploads',
        diagnosis: diagnosis,
        timestamp: new Date().toISOString()
      });
    }
    
    // 実際の音声ファイルでテスト
    console.log(`Testing Whisper API with audio URL: ${test_audio_url}`);
    const startTime = Date.now();
    
    const transcription = await whisperService.transcribeFromUrl(test_audio_url, {
      language: 'ja',
      temperature: 0.1
    });
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    res.json({
      success: true,
      transcription: transcription,
      processing_time_ms: processingTime,
      processing_time_seconds: Math.round(processingTime / 1000),
      test_url: test_audio_url,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Whisper test error:', error);
    res.status(500).json({ 
      error: 'Whisper API test failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/whisper-chunk-test', async (req, res) => {
  try {
    const whisperService = require('../utils/whisper-service');
    
    console.log('Starting small chunk upload test...');
    const startTime = Date.now();
    
    const canUpload = await whisperService.testSmallChunkUpload();
    
    const endTime = Date.now();
    const testTime = endTime - startTime;
    
    res.json({
      success: canUpload,
      canUploadLargeFiles: canUpload,
      test_time_ms: testTime,
      test_time_seconds: Math.round(testTime / 1000),
      recommendation: canUpload 
        ? 'Large file uploads should work'
        : 'Large file uploads likely to fail - check network configuration',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Chunk test error:', error);
    res.status(500).json({ 
      error: 'Chunk upload test failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/basic-network-test', async (req, res) => {
  try {
    const whisperService = require('../utils/whisper-service');
    
    console.log('Running basic network connectivity tests...');
    const tests = await whisperService.runBasicNetworkTests();
    
    res.json({
      service: 'Basic Network Connectivity Tests',
      tests: tests,
      summary: {
        ping: tests.ping.success,
        dns: tests.nslookup.success, 
        https: tests.curl.success,
        allPassed: tests.ping.success && tests.nslookup.success && tests.curl.success
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Basic network test error:', error);
    res.status(500).json({ 
      error: 'Basic network test failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/fix-connection', async (req, res) => {
  try {
    const whisperService = require('../utils/whisper-service');
    
    console.log('Attempting automatic connection fixes...');
    const fixes = await whisperService.attemptConnectionFixes();
    
    res.json({
      service: 'Connection Issue Auto-Fix',
      fixes: fixes,
      summary: {
        attempted: fixes.attempted.length,
        successful: fixes.successful.length,
        failed: fixes.failed.length,
        hasRecommendations: fixes.recommendations.length > 0
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Connection fix error:', error);
    res.status(500).json({ 
      error: 'Connection fix attempt failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

function generateWhisperDiagnosisRecommendations(diagnosis) {
  const recommendations = [];
  
  if (!diagnosis.hasApiKey) {
    recommendations.push({
      issue: 'API key not configured',
      solution: 'Set OPENAI_API_KEY environment variable',
      priority: 'high'
    });
  }
  
  if (!diagnosis.apiKeyValid) {
    recommendations.push({
      issue: 'Invalid API key',
      solution: 'Verify OpenAI API key format (should start with sk-)',
      priority: 'high'
    });
  }
  
  if (!diagnosis.networkReachable) {
    recommendations.push({
      issue: 'Network connectivity issue',
      solution: 'Check internet connection and firewall settings',
      priority: 'high'
    });
  }
  
  if (!diagnosis.whisperEndpointReachable) {
    recommendations.push({
      issue: 'Whisper API endpoint unreachable',
      solution: 'Check OpenAI service status and network routing to api.openai.com',
      priority: 'high'
    });
  }
  
  if (!diagnosis.canUploadFiles) {
    recommendations.push({
      issue: 'File upload to Whisper API failed',
      solution: 'Check network upload capabilities and file size limits',
      priority: 'high'
    });
  }
  
  if (diagnosis.details?.whisperError) {
    const error = diagnosis.details.whisperError;
    recommendations.push({
      issue: `Whisper API error: ${error.message}`,
      solution: `Check OpenAI API status and quota limits. Status: ${error.status}`,
      priority: 'medium'
    });
  }
  
  if (recommendations.length === 0) {
    recommendations.push({
      issue: 'No issues detected',
      solution: 'Whisper API is ready for use',
      priority: 'info'
    });
  }
  
  return recommendations;
}

async function processSummaryRequest(articleId, article) {
  try {
    console.log(`🎯 Starting summary processing for article ID: ${articleId}`);
    console.log(`📝 Article title: "${article.title}"`);
    console.log(`📂 Content type: ${article.content_type}`);
    
    db.run('UPDATE summary_requests SET status = ? WHERE article_id = ?', ['processing', articleId]);
    
    let summaryText = '';
    
    if (article.content_type === 'youtube') {
      summaryText = await processYouTubeSummary(article.link);
    } else if (article.content_type === 'podcast') {
      // Podcastの場合はRSS feed URLを使用し、特定の記事情報を渡す
      const feedUrl = article.feed_url || article.link;
      summaryText = await processPodcastSummary(feedUrl, article);
    }
    
    // 要約内容の詳細ログ出力
    const summaryLength = summaryText ? summaryText.length : 0;
    const summaryPreview = summaryText ? summaryText.substring(0, 100) : '';
    console.log(`✅ Summary generated for article ID ${articleId}: ${summaryLength} characters`);
    console.log(`📄 Summary preview (first 100 chars): "${summaryPreview}"`);
    console.log(`🎯 要約完了 (記事ID: ${articleId}): "${summaryPreview}..."`);
    
    db.run(
      'UPDATE articles SET summary_status = ?, summary_text = ? WHERE id = ?',
      ['completed', summaryText, articleId],
      function(err) {
        if (err) {
          console.error('❌ Failed to update article summary:', err.message);
        } else {
          console.log(`💾 Article ${articleId} summary saved to database (${summaryLength} chars)`);
          console.log(`📄 コマンドライン要約表示 (記事${articleId}): "${summaryPreview}..."`);
        }
      }
    );
    
    db.run(
      'UPDATE summary_requests SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE article_id = ?',
      ['completed', articleId],
      function(err) {
        if (err) {
          console.error('❌ Failed to update summary request status:', err.message);
        } else {
          console.log(`✅ Summary request completed for article ${articleId}`);
        }
      }
    );
    
  } catch (error) {
    console.error('Summary processing error:', error);
    
    db.run(
      'UPDATE articles SET summary_status = ? WHERE id = ?',
      ['failed', articleId]
    );
    
    db.run(
      'UPDATE summary_requests SET status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE article_id = ?',
      ['failed', error.message, articleId]
    );
  }
}

async function processManualSummaryRequest(articleId, manualText) {
  try {
    console.log(`Processing manual summary request for article ${articleId}`);
    
    db.run('UPDATE summary_requests SET status = ? WHERE article_id = ?', ['processing', articleId]);
    
    if (!manualText || manualText.trim().length === 0) {
      throw new Error('Manual text is empty');
    }
    
    const summaryText = await generateSummary(manualText);
    
    db.run(
      'UPDATE articles SET summary_status = ?, summary_text = ? WHERE id = ?',
      ['completed', summaryText, articleId]
    );
    
    db.run(
      'UPDATE summary_requests SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE article_id = ?',
      ['completed', articleId]
    );
    
  } catch (error) {
    console.error('Manual summary processing error:', error);
    
    db.run(
      'UPDATE articles SET summary_status = ? WHERE id = ?',
      ['failed', articleId]
    );
    
    db.run(
      'UPDATE summary_requests SET status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE article_id = ?',
      ['failed', error.message, articleId]
    );
  }
}

async function processYouTubeSummary(url) {
  const { getYouTubeContent, getTranscriptErrorMessage } = require('../utils/youtube-helper');
  
  console.log(`🎬 Starting YouTube summary processing for: ${url}`);
  
  try {
    console.log('📡 Step 1: Getting YouTube content...');
    const result = await getYouTubeContent(url);
    
    console.log(`✅ Content extraction successful:`, {
      method: result.method,
      content_length: result.length,
      methods_attempted: result.methods || 'unknown'
    });
    
    if (!result.content || result.content.trim().length === 0) {
      console.error('❌ No content extracted despite successful getYouTubeContent call');
      throw new Error('No content was extracted from the video');
    }
    
    console.log(`📝 Step 2: Generating summary via ${result.method}, content length: ${result.length} characters`);
    
    // メソッド情報を追加してサマリーを生成（詳細要約）
    const summary = await generateSummary(result.content, { detailed: true });
    
    console.log(`✅ Summary generation successful: ${summary.length} characters`);
    
    let methodInfo;
    switch (result.method) {
      case 'transcript':
        methodInfo = '（字幕から要約）';
        break;
      case 'description':
        methodInfo = '（動画説明から要約）';
        break;
      case 'audio':
        methodInfo = '（音声から要約）';
        break;
      default:
        methodInfo = '（要約）';
    }
    
    const finalSummary = `${summary}\n\n${methodInfo}`;
    console.log(`🎯 YouTube summary processing completed successfully`);
    
    return finalSummary;
  } catch (error) {
    console.error('❌ YouTube summary processing failed:', {
      error_message: error.message,
      error_stack: error.stack,
      url: url
    });
    
    // 音声処理が成功している場合は、その旨をエラーメッセージに含める
    if (error.message.includes('Audio transcription completed') || 
        error.message.includes('音声から文字起こし') ||
        error.message.includes('✅ Content extracted via: audio')) {
      console.log('🔧 Audio processing succeeded but other part failed');
      throw new Error('音声処理は成功しましたが、要約生成中にエラーが発生しました。再度お試しください。');
    }
    
    console.log('🔍 Converting to user-friendly error message...');
    const userFriendlyMessage = getTranscriptErrorMessage(error);
    console.log(`📨 Final error message: ${userFriendlyMessage}`);
    
    throw new Error(userFriendlyMessage);
  }
}

async function processPodcastSummary(url, specificArticle = null) {
  const podcastHelper = require('../utils/podcast-helper');
  
  try {
    console.log(`Processing podcast summary for URL: ${url}`);
    if (specificArticle) {
      console.log(`Looking for specific episode: "${specificArticle.title}"`);
    }
    
    // まずURLからPodcast情報を抽出
    let audioInfo = null;
    let audioUrl = null;
    
    // RSS URLかどうかを判定
    if (podcastHelper.isRssUrl(url)) {
      console.log('Detected RSS URL, extracting audio from RSS feed');
      
      if (specificArticle) {
        // 特定の記事を検索
        audioInfo = await podcastHelper.findSpecificEpisodeInRssUrl(url, specificArticle);
      } else {
        // 従来の最新エピソード取得
        audioInfo = await podcastHelper.extractAudioFromRssUrl(url);
      }
      
      audioUrl = audioInfo.audioUrl;
    } else if (podcastHelper.isPodcastPageUrl(url)) {
      console.log('Detected podcast page URL, attempting to extract audio from RSS feed');
      audioInfo = await podcastHelper.extractAudioFromPodcastPage(url);
      audioUrl = audioInfo.audioUrl;
    } else if (podcastHelper.isAudioUrl(url)) {
      // 直接音声URLの場合
      audioUrl = url;
      audioInfo = {
        title: 'Podcast音声',
        description: '',
        duration: null,
        publishDate: null,
        hasAudio: true,
        audioUrl: url
      };
    } else {
      throw new Error('有効なRSS URL、Podcast URLまたは音声URLが見つかりませんでした。');
    }
    
    if (!audioUrl || !audioInfo.hasAudio) {
      // 音声ファイルが見つからない場合は説明文のみで要約を試行
      if (audioInfo && audioInfo.description && audioInfo.description.trim().length > 100) {
        console.log('No audio found, attempting summary from description text');
        const descriptionSummary = await generateSummary(audioInfo.description, { detailed: true });
        return `${descriptionSummary}\n\n（記事説明文から要約）`;
      }
      throw new Error('音声ファイルが見つかりませんでした。');
    }
    
    try {
      // 音声を転写
      const transcription = await podcastHelper.transcribePodcastAudio(audioUrl);
      
      if (!transcription || transcription.trim().length === 0) {
        throw new Error('音声から文字起こしを取得できませんでした');
      }
      
      console.log(`Podcast transcription completed: ${transcription.length} characters`);
      console.log(`🎙️  Transcription preview (first 25 chars): "${transcription.substring(0, 25)}"`);
      
      if (specificArticle) {
        console.log(`🎯 Processing transcription for specific article: "${specificArticle.title}"`);
      }
      
      // 要約用テキストを生成
      audioInfo = audioInfo || {
        title: 'Podcast音声',
        description: '',
        duration: null,
        publishDate: null
      };
      
      const summaryText = podcastHelper.generateSummaryText(audioInfo, transcription);
      
      // AIで要約生成（詳細要約）
      console.log(`🤖 Generating summary from ${summaryText.length} characters of transcription text`);
      const summary = await generateSummary(summaryText, { detailed: true });
      console.log(`📝 Summary generated: ${summary.length} characters`);
      console.log(`📄 Summary preview (first 25 chars): "${summary.substring(0, 25)}"`);
      
      const finalResult = `${summary}\n\n（音声から要約）`;
      console.log(`🎉 Final result: ${finalResult.length} characters total`);
      
      return finalResult;
      
    } catch (audioError) {
      console.error('Audio transcription failed:', audioError.message);
      
      // 音声処理に失敗した場合、説明文からの要約を試行
      if (audioInfo && audioInfo.description && audioInfo.description.trim().length > 100) {
        console.log('Audio processing failed, falling back to description text');
        const descriptionSummary = await generateSummary(audioInfo.description, { detailed: true });
        return `${descriptionSummary}\n\n（音声処理に失敗したため、記事説明文から要約）`;
      }
      
      // フォールバックできない場合は元のエラーを投げる
      throw audioError;
    }
    
  } catch (error) {
    console.error('Podcast summary processing failed:', error.message);
    const userFriendlyMessage = podcastHelper.getErrorMessage(error);
    throw new Error(userFriendlyMessage);
  }
}

async function generateSummary(text, options = {}) {
  const aiProvider = process.env.AI_PROVIDER || 'openai';
  const isDetailedSummary = options.detailed || false;
  
  if (aiProvider === 'gemini') {
    return await generateGeminiSummary(text, isDetailedSummary);
  } else {
    return await generateOpenAISummary(text, isDetailedSummary);
  }
}

async function generateGeminiSummary(text, isDetailedSummary = false) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const apiUsageTracker = require('../utils/api-usage-tracker');
  
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }
  
  if (!text || text.trim().length === 0) {
    throw new Error('No text provided for summarization');
  }
  
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  
  let prompt, textLength;
  
  if (isDetailedSummary) {
    // 詳細要約（音声要約用）
    textLength = 15000;
    prompt = `以下のテキストを日本語で詳細に要約してください。最低500文字、理想的には1000文字程度の詳細な要約を作成してください。

要約の構成：
1. 内容の概要（200文字程度）
2. 主要なポイントや議論（600-800文字程度）
3. 結論や重要な示唆（200文字程度）

全体的に、読者が元の内容を詳しく理解できるような包括的で詳細な要約にしてください。

テキスト:
${text.substring(0, textLength)}`;
  } else {
    // 通常要約（既存）
    textLength = 8000;
    prompt = `以下のテキストを日本語で要約してください。重要なポイントを3-5つの箇条書きでまとめ、各ポイントは1-2文で簡潔に説明してください。

テキスト:
${text.substring(0, textLength)}`;
  }

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const summaryText = response.text();
    
    if (!summaryText || summaryText.trim().length === 0) {
      throw new Error('Gemini API returned empty response');
    }
    
    // API利用量を記録
    const usage = await result.response.usageMetadata;
    if (usage) {
      await apiUsageTracker.trackGeminiUsage('gemini-1.5-flash', usage);
    }
    
    return summaryText;
  } catch (error) {
    throw new Error(`Gemini API error: ${error.message}`);
  }
}

async function generateOpenAISummary(text, isDetailedSummary = false) {
  const OpenAI = require('openai');
  const apiUsageTracker = require('../utils/api-usage-tracker');
  
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }
  
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  
  let systemContent, maxTokens, textLength;
  
  if (isDetailedSummary) {
    // 詳細要約（音声要約用）
    textLength = 15000;
    maxTokens = 1500;
    systemContent = '以下のテキストを日本語で詳細に要約してください。最低500文字、理想的には1000文字程度の詳細な要約を作成してください。要約の構成は、1) 内容の概要（200文字程度）、2) 主要なポイントや議論（600-800文字程度）、3) 結論や重要な示唆（200文字程度）としてください。読者が元の内容を詳しく理解できるような包括的で詳細な要約にしてください。';
  } else {
    // 通常要約（既存）
    textLength = 8000;
    maxTokens = 500;
    systemContent = '以下のテキストを日本語で要約してください。重要なポイントを3-5つの箇条書きでまとめ、各ポイントは1-2文で簡潔に説明してください。';
  }
  
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: systemContent
      },
      {
        role: 'user',
        content: text.substring(0, textLength)
      }
    ],
    max_tokens: maxTokens,
    temperature: 0.7,
  });
  
  // API利用量を記録
  await apiUsageTracker.trackOpenAIUsage('gpt-3.5-turbo', response);
  
  return response.choices[0].message.content;
}

module.exports = router;