const RSSParser = require('rss-parser');
const whisperService = require('./whisper-service');

/**
 * Podcastコンテンツ処理ヘルパー
 */
class PodcastHelper {
  constructor() {
    this.parser = new RSSParser({
      customFields: {
        item: [
          ['enclosure', 'enclosure'],
          ['itunes:duration', 'duration'],
          ['itunes:summary', 'summary'],
          ['itunes:subtitle', 'subtitle']
        ]
      }
    });
  }

  /**
   * RSS URLかどうかを判定
   * @param {string} url - チェックするURL
   * @returns {boolean} RSS URLかどうか
   */
  isRssUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    // RSS URLの一般的なパターン
    const rssPatterns = [
      '/rss',
      '/feed', 
      'rss.xml',
      'feed.xml',
      'podcast/rss',
      'feeds.',
      'anchor.fm/s/'
    ];
    
    return rssPatterns.some(pattern => url.includes(pattern));
  }

  /**
   * RSS URLから特定のエピソードを検索して音声情報を抽出
   * @param {string} rssUrl - RSS Feed URL
   * @param {Object} targetArticle - 検索対象の記事情報（タイトル等）
   * @returns {Promise<Object>} 音声情報
   */
  async findSpecificEpisodeInRssUrl(rssUrl, targetArticle) {
    try {
      console.log(`Searching for specific episode in RSS URL: ${rssUrl}`);
      console.log(`Target article title: "${targetArticle.title}"`);
      
      const feed = await this.parser.parseURL(rssUrl);
      
      if (!feed.items || feed.items.length === 0) {
        throw new Error('RSS feedにエピソードが見つかりません');
      }
      
      console.log(`RSS feed contains ${feed.items.length} episodes`);
      
      // タイトルでマッチするエピソードを検索
      let matchedEpisode = null;
      let matchType = 'none';
      
      for (let i = 0; i < feed.items.length; i++) {
        const episode = feed.items[i];
        
        // 完全一致チェック
        if (episode.title === targetArticle.title) {
          matchedEpisode = episode;
          matchType = 'exact';
          console.log(`✅ Found exact title match at position ${i}: "${episode.title}"`);
          break;
        }
        
        // 部分一致チェック（記事タイトルの主要部分を含む）
        const cleanTargetTitle = this.cleanTitle(targetArticle.title);
        const cleanEpisodeTitle = this.cleanTitle(episode.title);
        
        if (cleanEpisodeTitle.includes(cleanTargetTitle) || cleanTargetTitle.includes(cleanEpisodeTitle)) {
          if (!matchedEpisode) { // 最初の部分一致を保持
            matchedEpisode = episode;
            matchType = 'partial';
            console.log(`📝 Found partial title match at position ${i}: "${episode.title}"`);
          }
        }
      }
      
      if (!matchedEpisode) {
        console.log('⚠️  No matching episode found, falling back to latest episode');
        matchedEpisode = feed.items[0];
        matchType = 'fallback';
      }
      
      console.log(`🎯 Selected episode (${matchType} match): "${matchedEpisode.title}"`);
      
      const audioInfo = this.extractAudioFromArticle(matchedEpisode);
      audioInfo.matchType = matchType;
      audioInfo.originalTitle = targetArticle.title;
      
      return audioInfo;
      
    } catch (error) {
      console.error('Specific episode search failed:', error.message);
      // フォールバックとして最新エピソード取得を試行
      console.log('Falling back to latest episode extraction...');
      return await this.extractAudioFromRssUrl(rssUrl);
    }
  }

  /**
   * RSS URLから直接音声情報を抽出（最新エピソード）
   * @param {string} rssUrl - RSS Feed URL
   * @returns {Promise<Object>} 音声情報
   */
  async extractAudioFromRssUrl(rssUrl) {
    try {
      console.log(`Extracting audio from RSS URL: ${rssUrl}`);
      
      const feed = await this.parser.parseURL(rssUrl);
      
      if (!feed.items || feed.items.length === 0) {
        throw new Error('RSS feedにエピソードが見つかりません');
      }
      
      // 最新エピソードを取得
      const latestEpisode = feed.items[0];
      
      console.log(`Found latest episode: ${latestEpisode.title}`);
      console.log(`RSS feed contains ${feed.items.length} episodes`);
      
      const audioInfo = this.extractAudioFromArticle(latestEpisode);
      
      if (!audioInfo.hasAudio) {
        // 最新エピソードに音声がない場合、他のエピソードをチェック
        console.log('Latest episode has no audio, checking other episodes...');
        
        for (let i = 1; i < Math.min(5, feed.items.length); i++) {
          const episode = feed.items[i];
          const episodeAudio = this.extractAudioFromArticle(episode);
          
          if (episodeAudio.hasAudio) {
            console.log(`Found audio in episode ${i + 1}: ${episode.title}`);
            return episodeAudio;
          }
        }
        
        throw new Error('このRSS feedの最新5エピソードに音声ファイルが見つかりません');
      }
      
      return audioInfo;
      
    } catch (error) {
      console.error('RSS audio extraction error:', error.message);
      throw new Error(`RSSからの音声抽出に失敗しました: ${error.message}`);
    }
  }

  /**
   * PodcastページURLかどうかを判定
   * @param {string} url - チェックするURL
   * @returns {boolean} PodcastページURLかどうか
   */
  isPodcastPageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    const podcastDomains = [
      'podcasters.spotify.com',
      'open.spotify.com/episode',
      'open.spotify.com/show',
      'anchor.fm',
      'podcasts.apple.com',
      'podcasts.google.com',
      'soundcloud.com'
    ];
    
    return podcastDomains.some(domain => url.includes(domain));
  }

  /**
   * Podcastページから音声情報を抽出
   * @param {string} pageUrl - PodcastページURL
   * @returns {Promise<Object>} 音声情報
   */
  async extractAudioFromPodcastPage(pageUrl) {
    try {
      console.log(`Extracting audio from podcast page: ${pageUrl}`);
      
      // Spotify Podcastsの場合
      if (pageUrl.includes('podcasters.spotify.com')) {
        return await this.extractFromSpotifyPodcast(pageUrl);
      }
      
      // 他のプラットフォームの場合は後で実装
      throw new Error('Unsupported podcast platform');
      
    } catch (error) {
      console.error('Podcast page extraction error:', error.message);
      throw new Error(`Podcastページからの音声抽出に失敗しました: ${error.message}`);
    }
  }

  /**
   * Spotify Podcastから音声情報を抽出
   * @param {string} spotifyUrl - Spotify Podcast URL
   * @returns {Promise<Object>} 音声情報
   */
  async extractFromSpotifyPodcast(spotifyUrl) {
    try {
      // Spotify Podcast URLからshow IDとepisode IDを抽出
      const urlMatch = spotifyUrl.match(/\/pod\/show\/([^\/]+)(?:\/episodes\/([^\/\?]+))?/);
      
      if (!urlMatch) {
        throw new Error('Invalid Spotify podcast URL format');
      }
      
      const showId = urlMatch[1];
      const episodeId = urlMatch[2];
      
      console.log(`Spotify show: ${showId}, episode: ${episodeId}`);
      
      // SpotifyのRSS feed URLを構築（一般的なパターン）
      const rssUrl = `https://anchor.fm/s/${showId}/podcast/rss`;
      
      console.log(`Attempting to fetch RSS feed: ${rssUrl}`);
      
      try {
        const feed = await this.parser.parseURL(rssUrl);
        
        if (!feed.items || feed.items.length === 0) {
          throw new Error('No episodes found in RSS feed');
        }
        
        // episode IDが指定されている場合はそのエピソードを検索
        let targetEpisode = null;
        
        if (episodeId) {
          targetEpisode = feed.items.find(item => {
            return item.guid && (item.guid.includes(episodeId) || 
                                item.link && item.link.includes(episodeId) ||
                                item.title && item.title.toLowerCase().includes(episodeId.replace(/-/g, ' ')));
          });
        }
        
        // 見つからない場合は最新エピソードを使用
        if (!targetEpisode) {
          targetEpisode = feed.items[0];
          console.log('Episode not found by ID, using latest episode');
        }
        
        return this.extractAudioFromArticle(targetEpisode);
        
      } catch (rssError) {
        console.error('RSS feed fetch failed:', rssError.message);
        // RSSフィードが取得できない場合のフォールバック
        throw new Error('このPodcastのRSSフィードにアクセスできません。直接音声ファイルURLを使用してください。');
      }
      
    } catch (error) {
      console.error('Spotify podcast extraction error:', error.message);
      throw error;
    }
  }

  /**
   * RSS記事からPodcast音声URLを抽出
   * @param {string} rssUrl - RSS Feed URL
   * @param {string} articleGuid - 記事のGUID
   * @returns {Promise<Object>} 音声情報
   */
  async extractAudioFromRSS(rssUrl, articleGuid) {
    try {
      const feed = await this.parser.parseURL(rssUrl);
      
      // GUIDで該当する記事を検索
      const article = feed.items.find(item => 
        item.guid === articleGuid || 
        item.id === articleGuid ||
        item.link === articleGuid
      );
      
      if (!article) {
        throw new Error('Article not found in RSS feed');
      }
      
      return this.extractAudioFromArticle(article);
    } catch (error) {
      console.error('RSS audio extraction error:', error.message);
      throw new Error(`Failed to extract audio from RSS: ${error.message}`);
    }
  }

  /**
   * RSS記事項目から音声情報を抽出
   * @param {Object} article - RSS記事項目
   * @returns {Object} 音声情報
   */
  extractAudioFromArticle(article) {
    const audioInfo = {
      hasAudio: false,
      audioUrl: null,
      audioType: null,
      audioLength: null,
      duration: null,
      title: article.title || 'Podcastエピソード',
      description: article.contentSnippet || article.summary || article.subtitle || '',
      publishDate: article.pubDate || article.isoDate
    };

    // enclosureタグから音声ファイルを検索
    if (article.enclosure) {
      const enclosure = Array.isArray(article.enclosure) ? article.enclosure[0] : article.enclosure;
      
      if (enclosure && enclosure.url) {
        console.log(`Found enclosure URL: ${enclosure.url}`);
        
        // enclosure URLが音声ファイルかチェック
        if (this.isAudioUrl(enclosure.url) || enclosure.type && enclosure.type.startsWith('audio/')) {
          audioInfo.hasAudio = true;
          audioInfo.audioUrl = enclosure.url;
          audioInfo.audioType = enclosure.type || this.getMimeTypeFromUrl(enclosure.url);
          audioInfo.audioLength = enclosure.length || null;
          
          console.log(`Audio file detected: ${audioInfo.audioUrl}, type: ${audioInfo.audioType}, size: ${audioInfo.audioLength} bytes`);
        }
      }
    }
    
    // 音声が見つからない場合のデバッグ情報
    if (!audioInfo.hasAudio) {
      console.log('No audio enclosure found in article:', {
        title: article.title,
        hasEnclosure: !!article.enclosure,
        enclosureUrl: article.enclosure ? article.enclosure.url : 'none'
      });
    }

    // iTunes形式の継続時間
    if (article.duration) {
      audioInfo.duration = this.parseDuration(article.duration);
    }

    // 説明文の拡張
    if (article.summary && article.summary !== audioInfo.description) {
      audioInfo.description = article.summary;
    }

    return audioInfo;
  }

  /**
   * URLが音声ファイルかチェック
   * @param {string} url - チェックするURL
   * @returns {boolean} 音声ファイルかどうか
   */
  isAudioUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    const audioExtensions = ['.mp3', '.mp4', '.m4a', '.wav', '.aac', '.ogg', '.flac'];
    const audioMimeTypes = [
      'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/aac', 
      'audio/ogg', 'audio/flac', 'application/octet-stream'
    ];
    
    // 直接音声ファイルURLやCDN URLのパターン
    const audioUrlPatterns = [
      'cloudfront.net', // AWS CloudFront
      'd3ctxlq1ktw2nl.cloudfront.net', // Anchor.fm
      'anchor.fm/s/',
      '.mp3',
      '.m4a',
      'audio/'
    ];
    
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();
      const fullUrl = url.toLowerCase();
      
      // 拡張子チェック
      const hasAudioExtension = audioExtensions.some(ext => pathname.endsWith(ext));
      
      // URLパターンチェック
      const hasAudioPattern = audioUrlPatterns.some(pattern => fullUrl.includes(pattern));
      
      // MIMEタイプチェック（URLパラメータにある場合）
      const params = urlObj.searchParams;
      const mimeType = params.get('mimetype') || params.get('type');
      const hasAudioMimeType = mimeType && audioMimeTypes.some(type => 
        mimeType.toLowerCase().includes(type)
      );
      
      return hasAudioExtension || hasAudioPattern || hasAudioMimeType;
    } catch (error) {
      return false;
    }
  }

  /**
   * URLからMIMEタイプを推定
   * @param {string} url - URL
   * @returns {string} MIMEタイプ
   */
  getMimeTypeFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const ext = urlObj.pathname.split('.').pop().toLowerCase();
      
      const mimeMap = {
        'mp3': 'audio/mpeg',
        'mp4': 'audio/mp4',
        'm4a': 'audio/mp4',
        'wav': 'audio/wav',
        'aac': 'audio/aac',
        'ogg': 'audio/ogg',
        'flac': 'audio/flac'
      };
      
      return mimeMap[ext] || 'audio/mpeg';
    } catch (error) {
      return 'audio/mpeg';
    }
  }

  /**
   * 継続時間を解析（HH:MM:SS or MM:SS or 秒数）
   * @param {string} duration - 継続時間文字列
   * @returns {string} 標準化された継続時間
   */
  parseDuration(duration) {
    if (!duration) return null;
    
    const durationStr = duration.toString().trim();
    
    // 既に秒数の場合
    if (/^\d+$/.test(durationStr)) {
      const seconds = parseInt(durationStr);
      return this.formatDuration(seconds);
    }
    
    // HH:MM:SS or MM:SS 形式
    const timeParts = durationStr.split(':').map(part => parseInt(part) || 0);
    
    if (timeParts.length === 3) {
      // HH:MM:SS
      const [hours, minutes, seconds] = timeParts;
      return `${hours}時間${minutes}分${seconds}秒`;
    } else if (timeParts.length === 2) {
      // MM:SS
      const [minutes, seconds] = timeParts;
      return `${minutes}分${seconds}秒`;
    }
    
    return durationStr;
  }

  /**
   * 秒数を時分秒フォーマットに変換
   * @param {number} totalSeconds - 秒数
   * @returns {string} フォーマットされた時間
   */
  formatDuration(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}時間${minutes}分${seconds}秒`;
    } else {
      return `${minutes}分${seconds}秒`;
    }
  }

  /**
   * Podcast音声を転写
   * @param {string} audioUrl - 音声ファイルURL
   * @param {Object} options - オプション
   * @returns {Promise<string>} 転写されたテキスト
   */
  async transcribePodcastAudio(audioUrl, options = {}) {
    try {
      console.log(`Starting podcast transcription: ${audioUrl}`);
      
      // URLパターンチェックを拡張
      if (!this.isAudioUrl(audioUrl) && !whisperService.isSupportedAudioFormat(audioUrl)) {
        throw new Error('Unsupported audio format');
      }
      
      const transcription = await whisperService.transcribeFromUrl(audioUrl, {
        language: options.language || 'ja',
        model: options.model || 'whisper-1',
        temperature: options.temperature || 0.1
      });
      
      if (!transcription || transcription.trim().length === 0) {
        throw new Error('音声から文字起こしが取得できませんでした。');
      }
      
      console.log(`Podcast transcription completed: ${transcription.length} characters`);
      return transcription;
    } catch (error) {
      console.error('Podcast transcription error:', error.message);
      throw new Error(whisperService.getErrorMessage(error));
    }
  }

  /**
   * Podcast記事から要約用テキストを生成
   * @param {Object} audioInfo - 音声情報
   * @param {string} transcription - 転写テキスト
   * @returns {string} 要約用テキスト
   */
  generateSummaryText(audioInfo, transcription) {
    const parts = [];
    
    // タイトル
    if (audioInfo.title) {
      parts.push(`タイトル: ${audioInfo.title}`);
    }
    
    // 継続時間
    if (audioInfo.duration) {
      parts.push(`継続時間: ${audioInfo.duration}`);
    }
    
    // 公開日
    if (audioInfo.publishDate) {
      const date = new Date(audioInfo.publishDate);
      parts.push(`公開日: ${date.toLocaleDateString('ja-JP')}`);
    }
    
    // 説明文
    if (audioInfo.description && audioInfo.description.trim().length > 0) {
      parts.push(`説明: ${audioInfo.description}`);
    }
    
    // 転写テキスト
    if (transcription && transcription.trim().length > 0) {
      parts.push(`内容:\n${transcription}`);
    }
    
    return parts.join('\n\n');
  }

  /**
   * エラーメッセージを日本語のユーザーフレンドリーなメッセージに変換
   * @param {Error} error - エラーオブジェクト
   * @returns {string} ユーザーフレンドリーなエラーメッセージ
   */
  getErrorMessage(error) {
    const message = error.message.toLowerCase();
    const originalMessage = error.message;
    
    if (message.includes('article not found')) {
      return 'Podcast記事が見つかりませんでした。';
    }
    
    if (message.includes('no audio') || message.includes('audio not found') || message.includes('音声ファイルが見つかりません')) {
      return 'この記事には音声ファイルが含まれていません。';
    }
    
    // 新しい分割エラーハンドリング
    if (message.includes('音声ファイルを約20MBに分割しましたが、音声認識処理中にエラーが発生しました')) {
      // 分割は成功したが音声認識で失敗した場合は、そのままのメッセージを返す
      return originalMessage;
    }
    
    // Whisper API関連のエラー処理を追加
    if (message.includes('audio file too large') || message.includes('file too large')) {
      const sizeMatch = originalMessage.match(/(\d+\.?\d*)\s*mb/i);
      const size = sizeMatch ? sizeMatch[1] : '';
      return `音声ファイルが大きすぎます（${size}MB、最大25MB）。短い音声ファイルをお試しください。`;
    }
    
    if (message.toLowerCase().includes('connection error') || 
        message.toLowerCase().includes('network error') ||
        message.toLowerCase().includes('timeout') ||
        message.toLowerCase().includes('connect timeout')) {
      return '音声認識サービスへの接続に失敗しました。ネットワーク接続やOpenAI APIキーの設定を確認してください。';
    }
    
    if (message.includes('whisper api error') || message.includes('failed to transcribe')) {
      return '音声認識に失敗しました。音声ファイルの形式や品質を確認してください。';
    }
    
    if (message.includes('quota') || message.includes('exceeded') || message.includes('rate limit')) {
      return 'OpenAI APIの利用制限に達しました。しばらくしてから再試行してください。';
    }
    
    if (message.includes('download') || message.includes('network') || message.includes('timeout')) {
      return '音声ファイルのダウンロードに失敗しました。ネットワーク接続を確認してください。';
    }
    
    if (message.includes('unsupported audio format')) {
      return 'サポートされていない音声形式です。MP3、M4A、WAVファイルをお試しください。';
    }
    
    if (message.includes('unsupported podcast platform')) {
      return 'サポートされていないPodcastプラットフォームです。SpotifyのPodcast URLまたは直接音声ファイルURLを使用してください。';
    }
    
    if (message.includes('rss') || message.includes('feed')) {
      return 'RSS Feedの読み込みに失敗しました。直接音声ファイルURLを使用してください。';
    }
    
    if (message.includes('invalid spotify podcast url')) {
      return 'Spotify Podcast URLの形式が正しくありません。';
    }
    
    if (message.includes('empty transcription')) {
      return '音声から文字起こしを取得できませんでした。音声の品質を確認してください。';
    }
    
    // 元のエラーメッセージに日本語のメッセージが含まれている場合はそのまま返す
    if (/[あ-ん]|[ア-ン]|[一-龯]/.test(originalMessage)) {
      return originalMessage;
    }
    
    return 'Podcast処理中にエラーが発生しました。';
  }

  /**
   * タイトルをクリーニングして比較しやすくする
   * @param {string} title - 元のタイトル
   * @returns {string} クリーニング済みタイトル
   */
  cleanTitle(title) {
    if (!title) return '';
    
    return title
      .toLowerCase()
      .replace(/[\[\]【】()（）〈〉]/g, '') // 括弧類を除去
      .replace(/[|｜]/g, '') // パイプ文字を除去
      .replace(/\s+/g, ' ') // 連続する空白を単一空白に
      .replace(/[#＃]\d+[-\-]\d+/g, '') // エピソード番号パターン除去（例：#23-4）
      .replace(/\s*[-\-]\s*/g, ' ') // ハイフンを空白に
      .trim();
  }
}

module.exports = new PodcastHelper();