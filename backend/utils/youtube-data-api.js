const { google } = require('googleapis');

/**
 * YouTube Data API v3サービス
 */
class YouTubeDataService {
  constructor() {
    this.youtube = google.youtube({
      version: 'v3',
      auth: process.env.YOUTUBE_API_KEY
    });
  }

  /**
   * YouTube動画の詳細情報を取得
   * @param {string} videoId - YouTube動画ID
   * @returns {Promise<Object>} 動画情報
   */
  async getVideoDetails(videoId) {
    try {
      if (!process.env.YOUTUBE_API_KEY) {
        throw new Error('YouTube API key not configured');
      }

      const response = await this.youtube.videos.list({
        part: ['snippet', 'contentDetails', 'statistics'],
        id: [videoId]
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error('Video not found or not accessible');
      }

      const video = response.data.items[0];
      
      return {
        id: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        channelTitle: video.snippet.channelTitle,
        publishedAt: video.snippet.publishedAt,
        duration: video.contentDetails.duration,
        viewCount: video.statistics.viewCount,
        likeCount: video.statistics.likeCount,
        commentCount: video.statistics.commentCount,
        thumbnails: video.snippet.thumbnails,
        tags: video.snippet.tags || [],
        categoryId: video.snippet.categoryId,
        defaultLanguage: video.snippet.defaultLanguage,
        defaultAudioLanguage: video.snippet.defaultAudioLanguage
      };
    } catch (error) {
      console.error('YouTube Data API error:', error.message);
      
      if (error.response && error.response.data) {
        const apiError = error.response.data.error;
        if (apiError.code === 403) {
          throw new Error('YouTube API quota exceeded or access denied');
        } else if (apiError.code === 404) {
          throw new Error('Video not found');
        }
      }
      
      throw new Error(`Failed to fetch video details: ${error.message}`);
    }
  }

  /**
   * 動画の詳細情報から要約用のテキストを生成
   * @param {Object} videoDetails - 動画詳細情報
   * @returns {string} 要約用テキスト
   */
  generateSummaryText(videoDetails) {
    const parts = [];
    
    // タイトル
    if (videoDetails.title) {
      parts.push(`タイトル: ${videoDetails.title}`);
    }
    
    // チャンネル名
    if (videoDetails.channelTitle) {
      parts.push(`チャンネル: ${videoDetails.channelTitle}`);
    }
    
    // 説明文（最初の1000文字）
    if (videoDetails.description) {
      const description = videoDetails.description.substring(0, 1000);
      parts.push(`説明: ${description}`);
    }
    
    // タグ
    if (videoDetails.tags && videoDetails.tags.length > 0) {
      parts.push(`タグ: ${videoDetails.tags.slice(0, 10).join(', ')}`);
    }
    
    // 統計情報
    if (videoDetails.viewCount) {
      parts.push(`再生回数: ${parseInt(videoDetails.viewCount).toLocaleString()}回`);
    }
    
    return parts.join('\n\n');
  }

  /**
   * 動画の統計情報を日本語で取得
   * @param {Object} videoDetails - 動画詳細情報
   * @returns {string} 統計情報テキスト
   */
  getVideoStatistics(videoDetails) {
    const stats = [];
    
    if (videoDetails.viewCount) {
      stats.push(`👁️ ${parseInt(videoDetails.viewCount).toLocaleString()}回再生`);
    }
    
    if (videoDetails.likeCount) {
      stats.push(`👍 ${parseInt(videoDetails.likeCount).toLocaleString()}いいね`);
    }
    
    if (videoDetails.commentCount) {
      stats.push(`💬 ${parseInt(videoDetails.commentCount).toLocaleString()}コメント`);
    }
    
    if (videoDetails.duration) {
      const duration = this.parseDuration(videoDetails.duration);
      stats.push(`⏱️ ${duration}`);
    }
    
    return stats.join(' | ');
  }

  /**
   * ISO 8601時間形式をわかりやすい形式に変換
   * @param {string} duration - ISO 8601形式の時間（例：PT4M13S）
   * @returns {string} わかりやすい時間形式
   */
  parseDuration(duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return duration;
    
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;
    
    if (hours > 0) {
      return `${hours}時間${minutes}分${seconds}秒`;
    } else if (minutes > 0) {
      return `${minutes}分${seconds}秒`;
    } else {
      return `${seconds}秒`;
    }
  }

  /**
   * YouTube URLから動画IDを抽出（既存の関数を活用）
   * @param {string} url - YouTube URL
   * @returns {string|null} 動画ID
   */
  extractVideoId(url) {
    const { extractVideoId } = require('./youtube-helper');
    return extractVideoId(url);
  }

  /**
   * YouTube APIを使用した包括的な動画情報取得
   * @param {string} url - YouTube URL
   * @returns {Promise<Object>} 動画情報と要約用テキスト
   */
  async getComprehensiveVideoInfo(url) {
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL: Unable to extract video ID');
    }

    const videoDetails = await this.getVideoDetails(videoId);
    const summaryText = this.generateSummaryText(videoDetails);
    const statistics = this.getVideoStatistics(videoDetails);

    return {
      videoId,
      videoDetails,
      summaryText,
      statistics,
      hasDescription: !!(videoDetails.description && videoDetails.description.trim().length > 0)
    };
  }
}

module.exports = new YouTubeDataService();