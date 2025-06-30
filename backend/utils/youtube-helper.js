require('dotenv').config();
const { YoutubeTranscript } = require('youtube-transcript');

/**
 * YouTube URLを正規化して標準形式に変換
 * @param {string} url - YouTube URL
 * @returns {string} 正規化されたURL
 */
function normalizeYouTubeUrl(url) {
  if (!url) return null;
  
  // YouTube動画IDを抽出する正規表現パターン
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/
  ];
  
  let videoId = null;
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      videoId = match[1];
      break;
    }
  }
  
  if (!videoId) {
    throw new Error('Invalid YouTube URL: Unable to extract video ID');
  }
  
  // 標準形式のURLを返す
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * YouTube動画IDを抽出
 * @param {string} url - YouTube URL
 * @returns {string|null} 動画ID
 */
function extractVideoId(url) {
  try {
    const normalizedUrl = normalizeYouTubeUrl(url);
    const match = normalizedUrl.match(/v=([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  } catch (error) {
    return null;
  }
}

/**
 * 字幕取得（複数の方法を試行、キャッシュ機能付き）
 * @param {string} url - YouTube URL
 * @returns {Promise<string>} 字幕テキスト
 */
async function getYouTubeTranscript(url) {
  const errors = [];
  
  try {
    // まずURL正規化とビデオID取得
    const normalizedUrl = normalizeYouTubeUrl(url);
    const videoId = extractVideoId(normalizedUrl);
    
    console.log(`Normalized URL: ${normalizedUrl}, Video ID: ${videoId}`);
    
    // キャッシュから取得を試行
    if (videoId) {
      const cachedTranscript = await getCachedTranscript(videoId);
      if (cachedTranscript) {
        console.log(`Using cached transcript, length: ${cachedTranscript.length} characters`);
        return cachedTranscript;
      }
    }
    
    // 方法1: 正規化されたURLで直接取得（英語で試行）
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(normalizedUrl, { lang: 'en' });
      const text = transcript.map(item => item.text).join(' ');
      
      if (text && text.trim().length > 0) {
        console.log(`Transcript length: ${text.length} characters (method 1, lang: en)`);
        // キャッシュに保存
        if (videoId) {
          await cacheTranscript(videoId, text);
        }
        return text;
      }
    } catch (error) {
      errors.push(`Method 1 failed: ${error.message}`);
      console.log(`Transcript method 1 failed: ${error.message}`);
    }
    
    // 方法2: 動画IDで直接取得（英語で試行）
    if (videoId) {
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
        const text = transcript.map(item => item.text).join(' ');
        
        if (text && text.trim().length > 0) {
          console.log(`Transcript length: ${text.length} characters (method 2, lang: en)`);
          // キャッシュに保存
          await cacheTranscript(videoId, text);
          return text;
        }
      } catch (error) {
        errors.push(`Method 2 failed: ${error.message}`);
        console.log(`Transcript method 2 failed: ${error.message}`);
      }
    }
    
    // 方法3: 異なる言語で試行（エラーログから利用可能な'en'を優先）
    const languages = ['en', 'ja', 'en-US'];
    for (const lang of languages) {
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(normalizedUrl, {
          lang: lang
        });
        const text = transcript.map(item => item.text).join(' ');
        
        if (text && text.trim().length > 0) {
          console.log(`Transcript found in ${lang}, length: ${text.length} characters`);
          // キャッシュに保存
          if (videoId) {
            await cacheTranscript(videoId, text);
          }
          return text;
        }
      } catch (error) {
        errors.push(`Language ${lang} failed: ${error.message}`);
        console.log(`Transcript method 3 (${lang}) failed: ${error.message}`);
      }
    }
    
    throw new Error(`No transcript available. Tried multiple methods: ${errors.join('; ')}`);
    
  } catch (error) {
    console.error('All transcript methods failed:', error.message);
    throw error;
  }
}

/**
 * 字幕の有無を事前チェック
 * @param {string} url - YouTube URL
 * @returns {Promise<boolean>} 字幕が利用可能かどうか
 */
async function checkTranscriptAvailability(url) {
  try {
    const text = await getYouTubeTranscript(url);
    return text && text.trim().length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * YouTube URLが有効かチェック
 * @param {string} url - チェックするURL
 * @returns {boolean} 有効なYouTube URLかどうか
 */
function isValidYouTubeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  const patterns = [
    /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/,
    /youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}/,
    /youtu\.be\/[a-zA-Z0-9_-]{11}/,
    /youtube\.com\/shorts\/[a-zA-Z0-9_-]{11}/
  ];
  
  return patterns.some(pattern => pattern.test(url));
}

/**
 * エラーメッセージを分析してユーザーフレンドリーなメッセージに変換
 * @param {Error} error - エラーオブジェクト
 * @returns {string} ユーザーフレンドリーなエラーメッセージ
 */
function getTranscriptErrorMessage(error) {
  const message = error.message.toLowerCase();
  
  if (message.includes('no transcript') || message.includes('transcript not available')) {
    return 'この動画には字幕が提供されていません。\n\n代替手段:\n1. 「手動要約」ボタンで動画の内容を手入力して要約\n2. 字幕付きの動画をお試しください';
  }
  
  if (message.includes('字幕、説明文、音声のいずれからも')) {
    return 'YouTubeから自動でコンテンツを取得できませんでした。\n\n解決方法:\n1. 「手動要約」ボタンをクリック\n2. 動画の内容や要点を手入力\n3. AI要約を実行\n\n※現在、多くの動画では説明文からの自動要約が利用可能です';
  }
  
  if (message.includes('impossible to retrieve') || message.includes('video id')) {
    return '動画URLの解析に失敗しました。有効なYouTube URLか確認してください。';
  }
  
  if (message.includes('private') || message.includes('unavailable')) {
    return 'この動画は非公開またはアクセスできません。';
  }
  
  if (message.includes('timeout') || message.includes('network')) {
    return 'ネットワークエラーが発生しました。しばらくしてから再試行してください。';
  }
  
  return '字幕の取得に失敗しました。「手動要約」ボタンで動画内容を入力して要約することができます。';
}

/**
 * キャッシュから字幕を取得
 * @param {string} videoId - YouTube動画ID
 * @returns {Promise<string|null>} キャッシュされた字幕テキスト
 */
async function getCachedTranscript(videoId) {
  const db = require('../models/database');
  
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT transcript_text FROM transcript_cache WHERE video_id = ?',
      [videoId],
      (err, row) => {
        if (err) {
          console.error('Cache retrieval error:', err);
          resolve(null);
        } else if (row) {
          // アクセス時刻を更新
          db.run(
            'UPDATE transcript_cache SET accessed_at = CURRENT_TIMESTAMP WHERE video_id = ?',
            [videoId]
          );
          resolve(row.transcript_text);
        } else {
          resolve(null);
        }
      }
    );
  });
}

/**
 * 字幕をキャッシュに保存
 * @param {string} videoId - YouTube動画ID
 * @param {string} transcriptText - 字幕テキスト
 */
async function cacheTranscript(videoId, transcriptText) {
  const db = require('../models/database');
  
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR REPLACE INTO transcript_cache (video_id, transcript_text, created_at, accessed_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [videoId, transcriptText],
      (err) => {
        if (err) {
          console.error('Cache storage error:', err);
        } else {
          console.log(`Cached transcript for video ID: ${videoId}`);
        }
        resolve();
      }
    );
  });
}

/**
 * 古いキャッシュを削除（定期メンテナンス用）
 * @param {number} daysOld - 削除する日数（デフォルト30日）
 */
async function cleanupOldCache(daysOld = 30) {
  const db = require('../models/database');
  
  return new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM transcript_cache WHERE accessed_at < datetime("now", "-" || ? || " days")',
      [daysOld],
      function(err) {
        if (err) {
          console.error('Cache cleanup error:', err);
          reject(err);
        } else {
          console.log(`Cleaned up ${this.changes} old cache entries`);
          resolve(this.changes);
        }
      }
    );
  });
}

/**
 * YouTube Data APIまたはytdl-coreを使用して動画の説明文を取得
 * @param {string} url - YouTube URL
 * @returns {Promise<string>} 動画の説明文
 */
async function getYouTubeDescription(url) {
  try {
    // 方法1: YouTube Data API（優先）
    if (process.env.YOUTUBE_API_KEY) {
      console.log('🔑 YouTube Data APIで説明文を取得中...');
      const youtubeDataService = require('./youtube-data-api');
      const videoInfo = await youtubeDataService.getComprehensiveVideoInfo(url);
      
      if (videoInfo.hasDescription) {
        console.log(`✅ YouTube Data API成功: ${videoInfo.summaryText.length}文字`);
        return videoInfo.summaryText;
      }
    }
  } catch (error) {
    console.log(`YouTube Data API failed: ${error.message}`);
  }

  try {
    // 方法2: @distube/ytdl-coreで説明文を取得（フォールバック）
    console.log('📹 @distube/ytdl-coreで説明文を取得中...');
    const ytdl = require('@distube/ytdl-core');
    const info = await ytdl.getBasicInfo(url);
    
    const description = info.videoDetails.description;
    if (description && description.trim().length > 50) {
      const summaryText = `タイトル: ${info.videoDetails.title}\n\nチャンネル: ${info.videoDetails.author.name}\n\n説明文: ${description}`;
      console.log(`✅ ytdl-core成功: ${summaryText.length}文字`);
      return summaryText;
    } else {
      throw new Error('動画の説明文が短すぎるか存在しません');
    }
  } catch (error) {
    console.error('YouTube description fetch error:', error.message);
    throw new Error(`動画の説明文取得に失敗しました: ${error.message}`);
  }
}

/**
 * 複数の方法でYouTube動画からテキストを取得（音声フォールバック対応）
 * @param {string} url - YouTube URL
 * @returns {Promise<Object>} テキストと取得方法の情報
 */
async function getYouTubeContent(url) {
  const methods = [];
  let content = null;
  let method = null;
  
  // 方法1: 字幕を試行
  try {
    content = await getYouTubeTranscript(url);
    method = 'transcript';
    methods.push({ method: 'transcript', success: true });
  } catch (error) {
    methods.push({ method: 'transcript', success: false, error: error.message });
    
    // 方法2: 音声ダウンロード→文字起こし（優先）
    try {
      console.log('🎙️ 音声処理を試行中（高精度要約のため）...');
      content = await getYouTubeAudioTranscription(url);
      method = 'audio';
      methods.push({ method: 'audio', success: true });
    } catch (audioError) {
      methods.push({ method: 'audio', success: false, error: audioError.message });
      
      // 方法3: YouTube Data APIで説明文を取得（フォールバック）
      try {
        console.log('⚠️ 音声処理失敗、説明文にフォールバック...');
        content = await getYouTubeDescription(url);
        method = 'description';
        methods.push({ method: 'description', success: true });
      } catch (descError) {
        methods.push({ method: 'description', success: false, error: descError.message });
      }
    }
  }
  
  if (!content) {
    throw new Error('字幕、説明文、音声のいずれからもコンテンツを取得できませんでした。手動要約をお試しください。');
  }
  
  return {
    content,
    method,
    methods,
    length: content.length
  };
}

/**
 * YouTube動画の音声ダウンロード→文字起こし
 * @param {string} url - YouTube URL
 * @returns {Promise<string>} 文字起こしテキスト
 */
async function getYouTubeAudioTranscription(url) {
  try {
    console.log(`🎬 Starting audio transcription for: ${url}`);
    
    const YouTubeAudioHelper = require('./youtube-audio-helper');
    const audioHelper = new YouTubeAudioHelper();
    
    const transcription = await audioHelper.processYouTubeAudio(url);
    
    if (!transcription || transcription.trim().length === 0) {
      throw new Error('音声から文字起こしを取得できませんでした');
    }
    
    console.log(`✅ Audio transcription completed: ${transcription.length} characters`);
    return transcription;
    
  } catch (error) {
    console.error('❌ Audio transcription failed:', error.message);
    throw new Error(`音声文字起こしに失敗しました: ${error.message}`);
  }
}

/**
 * YouTube動画のメタデータを取得
 * @param {string} url - YouTube URL
 * @returns {Promise<Object>} 動画のメタデータ
 */
async function getYouTubeMetadata(url) {
  try {
    const youtubeDataService = require('./youtube-data-api');
    return await youtubeDataService.getComprehensiveVideoInfo(url);
  } catch (error) {
    console.error('YouTube metadata fetch error:', error.message);
    return null;
  }
}

module.exports = {
  normalizeYouTubeUrl,
  extractVideoId,
  getYouTubeTranscript,
  getYouTubeDescription,
  getYouTubeContent,
  getYouTubeAudioTranscription,
  getYouTubeMetadata,
  checkTranscriptAvailability,
  isValidYouTubeUrl,
  getTranscriptErrorMessage,
  getCachedTranscript,
  cacheTranscript,
  cleanupOldCache
};